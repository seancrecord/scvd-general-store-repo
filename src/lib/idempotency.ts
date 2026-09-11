import { KV_KEYS } from "@/lib/kv-keys";
import { isRecord } from "@/types";
import type { Env } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { jcsCanonicalize } from "@/lib/jcs";

/**
 * IDEMPOTENCY-KEY ENFORCEMENT — the infinite-loop wallet drain,
 * closed (PROBLEMS.md #16).
 *
 * The chain refuses to settle the SAME authorization twice, but a
 * non-deterministic agent stuck in a retry loop signs a FRESH
 * authorization each pass — 500 loops is 500 honest charges, and
 * "the store behaved correctly" is no comfort to the drained wallet.
 * Until now the store's answer was disclosure (idempotentHint: false,
 * "a second identical call is a second charge"); this makes it a
 * mechanism: send an Idempotency-Key header (HTTP) or
 * _meta['x402/idempotency-key'] (MCP) with a purchase, and a repeat
 * of the same key for the same item by the same payer inside 24 hours
 * gets the ORIGINAL result back, cached, with no settlement and no
 * charge — the loop spins harmlessly against a cache.
 *
 * THE KEY IS A SECRET, and the scoping says so: replays are looked up
 * by (surface, payer, hash-of-key), so honoring one requires knowing
 * the paying wallet AND its chosen key. That is standard
 * Idempotency-Key semantics (the key is generated and held by the
 * caller, high-entropy, never shared); we enforce a minimum length
 * and treat shorter keys as absent rather than guessably honoring
 * "retry-1". The cached body is the buyer's own purchase, returned
 * only under the same payer scope that bought it.
 *
 * The response cache is a convenience, not permission to charge. New keyed
 * purchases also claim a durable payment identity before settlement; a cache
 * miss or outage must still pass that admission. The claim outlives this
 * cache and never expires into permission to charge an unresolved purchase.
 * Before BUY-016 this file deliberately allowed races to charge normally;
 * that failed the advertised same-key guarantee and is no longer the rule.
 */

/** Below this, a key is guessable decoration, not a secret. */
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
/** One day: long enough to outlive any retry loop, short enough that
 * the cache never becomes a shadow order store. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;

/**
 * THE SUGGESTED KEY — replay protection for a client that never read
 * the docs.
 *
 * An agent cannot send an `Idempotency-Key` it does not know it should
 * send, so the 402 challenge now carries one it can simply echo. CV's
 * idea; it was unsafe until the cache read moved behind signature
 * verification (ledger #19), and it is safe now for a reason worth
 * stating exactly:
 *
 * THIS KEY IS NOT A SECRET AND IS NOT MEANT TO BE. It is a BUCKETING
 * FUNCTION, not an authentication mechanism. The KV lookup is
 * (surface, VERIFIED payer, hash(key)), so the payer is already baked
 * into the slot: two real buyers echoing the same public suggestion in
 * the same minute land in different slots and cannot see each other's
 * goods, and a stranger who computes the key gets a cache slot they
 * still cannot open without signing as that payer. Anyone can derive
 * it. That is fine, and the key is written to LOOK derivable —
 * readable, self-describing, obviously not entropy — because a key
 * that looks like a secret invites being treated as one.
 *
 * WHY IT IS TIME-BUCKETED rather than random. A random per-challenge
 * suggestion would be useless for the exact failure this exists to
 * stop: a looping agent re-fetches the 402 each pass, so a fresh
 * suggestion each pass means every loop is a fresh charge. To bind a
 * loop the value must be STABLE across it. Sixty seconds is sized to
 * the real retry timescale — naive loops fire again within seconds —
 * and narrow enough that a deliberate second purchase two minutes
 * later is not silently swallowed. Tune against real retry telemetry
 * when there is any; do not guess harder now.
 *
 * SUGGESTED, NEVER REQUIRED. A client that sends its own key keeps
 * using it; a client that sends none is charged normally, exactly as
 * before. An uncertain keyed admission refuses settlement until it can be read.
 */
export const SUGGESTED_KEY_BUCKET_SECONDS = 60;

/** The bucket a moment falls in. Exported so tests can straddle one. */
export function idempotencyBucket(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (SUGGESTED_KEY_BUCKET_SECONDS * 1000));
}

/** How much of the body digest the suggested key carries. */
export const SUGGESTED_KEY_BODY_TAG_LENGTH = 8;

/**
 * Deliberately readable and comfortably over the minimum length by
 * construction — the prefix alone is 15 characters, so no item id is
 * short enough to produce a key the store would then reject as
 * decoration.
 */
export function suggestedIdempotencyKey(
  itemId: string,
  nowMs: number = Date.now(),
  bodyDigest: string | null = null,
): string {
  const key = `scvd-suggested-${itemId}-${idempotencyBucket(nowMs)}`;
  /*
   * THE BODY RIDES IN THE SUGGESTION TOO (2026-09-11). The key is a
   * bucketing function, and until now it bucketed on item and minute
   * alone — so two purchases whose difference lived in the request
   * BODY were handed one suggestion and landed in one slot. The slot
   * itself is now body-scoped (idempotencyScope below), which closes
   * the wrong-goods replay on its own; the short digest here exists
   * so the current/previous-bucket grace compares the client's echo
   * against the value THIS request would be offered, and so a reader
   * of two challenges can see they are not for the same purchase.
   * Eight hex characters, not the whole hash: still a value that
   * reads as derivable, still comfortably under the maximum length.
   * A request with no body keeps the exact format shipped 2026-08-01.
   */
  return bodyDigest
    ? `${key}-${bodyDigest.slice(0, SUGGESTED_KEY_BODY_TAG_LENGTH)}`
    : key;
}

/**
 * THE SURFACE HAS TO INCLUDE THE ARGUMENTS, or the cache hands back
 * somebody else's answer.
 *
 * Until 2026-08-25 the idempotency slot was keyed on (path, payer,
 * key) and the suggested key was `scvd-suggested-<item>-<minute>`.
 * Neither carried the QUERY — and most of this shelf takes its whole
 * input from the query: tx_hash, url, wallet, digest, tag, mandate.
 *
 * So two genuinely different purchases in the same minute by the same
 * payer collided. Measured: `?tag=FIRST` then `?tag=SECOND` returned
 * ONE certificate, and the buyer who asked for SECOND was handed an
 * ed25519-signed artifact whose signed payload reads `tag: "FIRST"`.
 * `tag` is inside CERT_FIELDS, so the signature covers the wrong
 * value and verifies cleanly against it. On the parameterized doors
 * it is worse: an agent batching settlement attestations over N
 * transactions gets one attestation about the first, N-1 times.
 *
 * The scope is hashed rather than appended whole, because a `url`
 * parameter can be long and a KV key cannot.
 */
export async function idempotencyScope(
  path: string,
  query: URLSearchParams,
  bodyDigest: string | null = null,
): Promise<string> {
  /*
   * ENCODE BEFORE JOINING — corrected 2026-08-25, hours after the
   * first version of this function shipped.
   *
   * Interpolating raw makes the delimiters injectable: `=` and `&`
   * inside a DECODED value are indistinguishable from structure, so
   * `?tag=one&z=two` and `?tag=one%26z%3Dtwo` canonicalized to the
   * same string. Same item, same payer, same minute, same
   * store-suggested key — one cache slot, and the second caller
   * collects an ed25519-signed artifact naming the wrong subject.
   * Which is exactly the defect this function was added to close.
   *
   * Sorted by code point rather than locale: this value is a cache
   * key, and localeCompare is ICU-dependent by contract.
   */
  const canonicalQuery = [...query.entries()]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join("&");
  /*
   * THE BODY IS AN ARGUMENT TOO — found 2026-09-11, the same defect
   * as above one layer down. A purchase whose input rides in the
   * request body (a JSON POST; MCP tool arguments, which ARE the
   * body) had no term here, so two different purchases by the same
   * payer in the same minute shared a slot and the second was served
   * the first's cached goods: no settlement, no charge, and a signed
   * artifact naming the wrong subject. Admitted on
   * x402-foundation/x402#3325.
   *
   * The term is the sha256 of the CANONICAL body (see
   * requestBodyDigest / jsonBodyDigest), folded into the preimage
   * after a delimiter the encoded query can never contain — `#` is
   * percent-encoded by encodeURIComponent — so no query value can
   * impersonate a body term and no body can impersonate a query.
   * An absent body contributes nothing, which keeps every GET scope
   * byte-identical to what it was before this term existed: the
   * slots a looping client is holding right now stay reachable.
   */
  const canonical = bodyDigest
    ? `${canonicalQuery}#body:${bodyDigest}`
    : canonicalQuery;
  if (!canonical) return path;
  return `${path}#${(await sha256Hex(canonical)).slice(0, 16)}`;
}

/**
 * The canonical digest of a JSON body: RFC 8785 bytes (recursive key
 * sort, no whitespace, ECMAScript number and string serialization —
 * lib/jcs, the same canonicalizer the signatures use), then sha256.
 * So `{"a":1,"b":2}` and `{"b":2,"a":1}` are one purchase, and a value
 * that happens to contain `{`, `,` or `:` cannot become structure:
 * JCS quotes and escapes strings before it joins them, which is the
 * same care the query encoder above takes with `=` and `&`.
 */
export async function jsonBodyDigest(value: unknown): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(jcsCanonicalize(value)));
}

/**
 * The canonical digest of an HTTP request's body, or null when there is
 * nothing to bind — the GET/HEAD case and the empty POST, which must
 * keep today's scope and today's suggested key exactly.
 *
 * JSON (by Content-Type) is canonicalized before hashing so a client
 * that re-serializes its own request does not lose its replay; a
 * body that claims JSON and is not parses as what it is, raw bytes.
 * Anything else is hashed as the bytes on the wire: two encodings of
 * one intent become two purchases, which is the direction this file
 * always fails — a second charge, never somebody else's goods.
 *
 * Reads a CLONE, so the handler behind the gate still gets its body.
 */
export async function requestBodyDigest(request: Request): Promise<string | null> {
  if (request.method === "GET" || request.method === "HEAD") return null;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.clone().arrayBuffer());
  } catch {
    return null;
  }
  if (bytes.byteLength === 0) return null;
  const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (contentType === "application/json" || contentType.endsWith("+json")) {
    try {
      return await jsonBodyDigest(JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)));
    } catch {
      // Not JSON after all: hashed as the bytes it is, below.
    }
  }
  return sha256HexBytes(bytes);
}

export function usableIdempotencyKey(key: string | undefined): string | null {
  if (
    !key ||
    key.length < IDEMPOTENCY_KEY_MIN_LENGTH ||
    key.length > IDEMPOTENCY_KEY_MAX_LENGTH
  ) {
    return null;
  }
  return key;
}

export async function sha256Hex(value: string): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(value));
}

export async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface StoredReplay {
  body: Record<string, unknown>;
  first_served_at: string;
  transaction?: string;
}

async function kvKeyFor(
  surface: string,
  payer: string,
  idempotencyKey: string,
): Promise<string> {
  return KV_KEYS.idempotency(
    surface,
    // EVM address case is presentation; Solana base58 case is identity.
    /^0x[0-9a-fA-F]{40}$/.test(payer) ? payer.toLowerCase() : payer,
    await sha256Hex(idempotencyKey),
  );
}

/** Atomic ownership is separate from the optional response cache. */
export async function idempotentPurchaseStore(env: Env, surface: string, payer: string, key: string) {
  const namespace = env.PAID_RECOVERIES;
  if (!namespace) throw new Error("Purchase admission unavailable");
  const scope = await sha256Hex(await kvKeyFor(surface, payer, key));
  return namespace.get(namespace.idFromName(`idempotency:${scope}`));
}

/**
 * THE BUCKET-BOUNDARY GRACE, and it is why the suggested key is worth
 * shipping rather than merely defensible.
 *
 * A loop that starts at second 59 and retries at second 61 re-fetches
 * the challenge, is handed the NEXT bucket's suggestion, and misses
 * its own cached purchase — a real double charge, at every boundary,
 * forever. CV called that acceptable and consistent with how this file
 * already treats ambiguity, and he is right that it is bounded. It is
 * also nearly free to close, and the thing being spent is somebody
 * else's money.
 *
 * So: on a miss, IF the key presented is exactly the suggestion we
 * would hand out right now, try the previous bucket's suggestion too.
 * That fires only for clients demonstrably echoing our own value, adds
 * one KV read to a path that has already missed, and is scoped by the
 * same verified payer — so it can return a buyer nothing but their own
 * earlier purchase. A client using its own key never reaches it.
 *
 * What remains uncovered, stated rather than implied: a loop spanning
 * more than two buckets, which is a loop slow enough that the second
 * charge is arguably a second intent. Failing there means charging
 * normally, which is the direction everything else in this file fails.
 */
export async function lookupIdempotentWithBucketGrace(
  env: Env,
  surface: string,
  payer: string,
  presentedKey: string,
  itemId: string,
  nowMs: number = Date.now(),
  bodyDigest: string | null = null,
): Promise<StoredReplay | null> {
  const direct = await lookupIdempotent(env, surface, payer, presentedKey);
  if (direct) {
    return direct;
  }
  /*
   * The same digest the challenge folded into its suggestion, or the
   * comparison never matches for a keyed POST and the grace silently
   * stops working at every boundary — and the surface already carries
   * the body, so a grace hit can only ever be this body's purchase.
   */
  if (presentedKey !== suggestedIdempotencyKey(itemId, nowMs, bodyDigest)) {
    return null;
  }
  const previous = suggestedIdempotencyKey(
    itemId,
    nowMs - SUGGESTED_KEY_BUCKET_SECONDS * 1000,
    bodyDigest,
  );
  return lookupIdempotent(env, surface, payer, previous);
}

export async function lookupIdempotent(
  env: Env,
  surface: string,
  payer: string,
  idempotencyKey: string,
): Promise<StoredReplay | null> {
  try {
    const raw = await kvGet(env.COUNTERS, 
      await kvKeyFor(surface, payer, idempotencyKey),
    );
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed["body"])) {
      return null;
    }
    return parsed as unknown as StoredReplay;
  } catch {
    // The durable admission still runs after this optional cache misses.
    return null;
  }
}

export async function storeIdempotent(
  env: Env,
  surface: string,
  payer: string,
  idempotencyKey: string,
  body: Record<string, unknown>,
  transaction?: string,
): Promise<void> {
  try {
    const record: StoredReplay = {
      body,
      first_served_at: new Date().toISOString(),
      ...(transaction ? { transaction } : {}),
    };
    await kvPut(env.COUNTERS, 
      await kvKeyFor(surface, payer, idempotencyKey),
      JSON.stringify(record),
      { expirationTtl: IDEMPOTENCY_TTL_SECONDS },
    );
  } catch {
    // Storing the replay is a courtesy; the sale already happened.
  }
}

/**
 * How long a replay stays collectable, stated beside the key it applies
 * to — on both doors, from this one helper. Derived from the constant,
 * never typed: the day the TTL changes, the challenge changes with it.
 */
export function replayHorizonBlock(): Record<string, unknown> {
  return {
    replay_ttl_seconds: IDEMPOTENCY_TTL_SECONDS,
    replay_horizon: `The ORIGINAL result is served from cache for ${IDEMPOTENCY_TTL_SECONDS / 3600} hours after the first sale. Past that, a repeat with the same key is not a cached replay; the original signed payment can still retrieve retained goods or their status, and a fresh key is a deliberate second purchase.`,
  };
}

/** The note a replayed response carries, so a reader (or the looping
 * agent's operator, later, in the logs) can see what happened. */
export function replayNote(firstServedAt: string): Record<string, unknown> {
  return {
    idempotent_replay: true,
    first_served_at: firstServedAt,
    note: "This exact purchase (same item, same payer, same Idempotency-Key) already settled once, so this is the ORIGINAL result served from cache — no new payment was taken. The artifact ids are the same ones minted the first time. If you meant to buy again on purpose, send a fresh Idempotency-Key.",
  };
}
