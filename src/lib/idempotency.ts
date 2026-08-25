import { KV_KEYS } from "@/lib/kv-keys";
import { isRecord } from "@/types";
import type { Env } from "@/types";

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
 * FAILURE DIRECTION, decided consciously: a cache miss, a KV
 * hiccup, or two identical keys racing inside one propagation window
 * all fail toward A NORMAL CHARGE — the till working is the fallback,
 * and a rare duplicate charge is exactly what the refund policy
 * already covers. Failing the other way (refusing sales when the
 * cache is unsure) would break the till to protect a courtesy.
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
 * before. Nothing about this rejects a request.
 */
export const SUGGESTED_KEY_BUCKET_SECONDS = 60;

/** The bucket a moment falls in. Exported so tests can straddle one. */
export function idempotencyBucket(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (SUGGESTED_KEY_BUCKET_SECONDS * 1000));
}

/**
 * Deliberately readable and comfortably over the minimum length by
 * construction — the prefix alone is 15 characters, so no item id is
 * short enough to produce a key the store would then reject as
 * decoration.
 */
export function suggestedIdempotencyKey(
  itemId: string,
  nowMs: number = Date.now(),
): string {
  return `scvd-suggested-${itemId}-${idempotencyBucket(nowMs)}`;
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
): Promise<string> {
  const canonical = [...query.entries()]
    .sort(([a, av], [b, bv]) =>
      a === b ? av.localeCompare(bv) : a.localeCompare(b),
    )
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  if (!canonical) return path;
  return `${path}#${(await sha256Hex(canonical)).slice(0, 16)}`;
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
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
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
    payer.toLowerCase(),
    await sha256Hex(idempotencyKey),
  );
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
): Promise<StoredReplay | null> {
  const direct = await lookupIdempotent(env, surface, payer, presentedKey);
  if (direct) {
    return direct;
  }
  if (presentedKey !== suggestedIdempotencyKey(itemId, nowMs)) {
    return null;
  }
  const previous = suggestedIdempotencyKey(
    itemId,
    nowMs - SUGGESTED_KEY_BUCKET_SECONDS * 1000,
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
    const raw = await env.COUNTERS.get(
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
    // Fail toward a normal charge; see header comment.
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
    await env.COUNTERS.put(
      await kvKeyFor(surface, payer, idempotencyKey),
      JSON.stringify(record),
      { expirationTtl: IDEMPOTENCY_TTL_SECONDS },
    );
  } catch {
    // Storing the replay is a courtesy; the sale already happened.
  }
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
