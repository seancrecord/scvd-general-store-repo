import { DurableObject } from "cloudflare:workers";
import type { Env } from "@/types";

/**
 * THE TRADE COUNTER'S NONCE STORE — a Durable Object, and the reason
 * it is not KV (2026-09-03).
 *
 * The store's existing replay guard (lib/replay-guard.ts) is
 * read-then-write on KV, and it is SAFE that way for one reason it
 * states itself: EIP-3009 nonces burn on-chain, so the KV row is an
 * early refusal and the chain is the backstop. test/replay-concurrency
 * .spec.ts pins that property against a chain-shaped mock.
 *
 * A trade-account sale has no chain behind it. The marketplace's
 * signed instruction IS the authorization, and if the same instruction
 * is honoured twice we have delivered twice for one sale — a free
 * good on a stateless item, a duplicate record on a stateful one.
 * KV is eventually consistent across edges for up to about a minute,
 * so a captured request replayed at a second colo inside that window
 * passes the read on both. That is not a resilience gap; it is the
 * guard not existing.
 *
 * So the nonce set lives here: one object per partner, one writer,
 * the same answer from every edge. `claim` is the only operation and
 * it is atomic by construction — a Durable Object runs one request at
 * a time. SQLite-backed (wrangler.jsonc, new_sqlite_classes), which
 * is what the current plan offers and more than this needs.
 *
 * WHAT IT HOLDS: the replay key and when it may be forgotten. The
 * TTL is the caller's and must OUTLIVE the dialect's timestamp window
 * with room to spare, or a nonce could expire while the request it
 * belongs to is still acceptable — the classic off-by-a-window. An
 * alarm sweeps expired keys so the object never grows past one
 * window's worth of traffic.
 */
export class TradeNonceStore extends DurableObject<Env> {
  async claim(key: string, ttlSeconds: number): Promise<"fresh" | "seen"> {
    const now = Date.now();
    const expiresAt = await this.ctx.storage.get<number>(key);
    if (expiresAt !== undefined && expiresAt > now) {
      return "seen";
    }
    const until = now + ttlSeconds * 1000;
    await this.ctx.storage.put(key, until);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(until);
    }
    return "fresh";
  }

  /** Has this key been presented? Read-only: the check desk asks, and consumes nothing. */
  async peek(key: string): Promise<boolean> {
    const expiresAt = await this.ctx.storage.get<number>(key);
    return expiresAt !== undefined && expiresAt > Date.now();
  }

  /** How many keys are held right now. For tests and the admin desk. */
  async size(): Promise<number> {
    const rows = await this.ctx.storage.list<number>();
    return rows.size;
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const rows = await this.ctx.storage.list<number>();
    const expired: string[] = [];
    let nextExpiry: number | null = null;
    for (const [key, until] of rows) {
      if (until <= now) {
        expired.push(key);
      } else if (nextExpiry === null || until < nextExpiry) {
        nextExpiry = until;
      }
    }
    // storage.delete takes at most 128 keys per call.
    for (let index = 0; index < expired.length; index += 128) {
      await this.ctx.storage.delete(expired.slice(index, index + 128));
    }
    if (nextExpiry !== null) {
      await this.ctx.storage.setAlarm(nextExpiry);
    }
  }
}

export type NonceClaim = "fresh" | "seen" | "unavailable";

export async function peekTradeNonce(
  env: Env,
  partnerId: string,
  key: string,
): Promise<boolean | "unavailable"> {
  const namespace = env.TRADE_NONCES;
  if (!namespace) {
    return "unavailable";
  }
  try {
    const stub = namespace.get(namespace.idFromName(partnerId));
    return await stub.peek(key);
  } catch {
    return "unavailable";
  }
}

/**
 * Ask the partner's object whether this key has been presented before,
 * and record it if not. `unavailable` when the binding is absent or
 * the object cannot be reached — and the caller MUST refuse on it.
 * Money fails closed (AT_SCALE rule 7): a replay guard that cannot
 * answer is not a guard that says yes.
 */
export async function claimTradeNonce(
  env: Env,
  partnerId: string,
  key: string,
  ttlSeconds: number,
): Promise<NonceClaim> {
  const namespace = env.TRADE_NONCES;
  if (!namespace) {
    return "unavailable";
  }
  try {
    const stub = namespace.get(namespace.idFromName(partnerId));
    return await stub.claim(key, ttlSeconds);
  } catch {
    return "unavailable";
  }
}
