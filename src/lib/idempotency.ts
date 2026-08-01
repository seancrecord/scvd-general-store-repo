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

async function sha256Hex(value: string): Promise<string> {
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
