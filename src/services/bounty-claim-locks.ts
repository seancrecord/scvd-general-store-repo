import { DurableObject } from "cloudflare:workers";
import type { Env } from "@/types";

/**
 * ONE CLAIM AT A TIME, PER BOUNTY — and the hole it closes was written
 * down in the claim door's own comments the day the door shipped
 * (2026-08-25, corrected 2026-09-09):
 *
 *   "AND ONE GAP THIS DOES NOT COVER AT ALL, stated rather than
 *    implied: only the TX key is claimed. Two concurrent claims of the
 *    same bounty with two DIFFERENT real settlements both read status
 *    'open' above and both pay. That is a separate defect with no fix
 *    in this commit."
 *
 * It is a real one. Two walkers who each really paid the same door,
 * claiming within the same second, would each be verified on chain,
 * each pass the replay guard (different transactions), and each be
 * signed a reward — one listing, two payouts, and the weekly budget
 * counted once because that counter is read-then-written too. The
 * money is not stolen; it is spent twice for one piece of evidence.
 *
 * WHY KV COULD NEVER FIX IT. Workers KV is last-write-wins with
 * edge-cached reads and no compare-and-swap. The tx guard narrows its
 * window by claiming a key and reading it back, and the claim door
 * says plainly that this "is not a mutex" — two colos can each write
 * and each read back their own write. A second KV key for the bounty
 * would inherit exactly the same weakness.
 *
 * A Durable Object runs one request at a time, so the check and the
 * take are one indivisible step by construction. Same instrument the
 * trade counter's nonce store uses, for the same reason: the guard
 * either exists or it does not, and read-then-write on KV is the
 * version that does not.
 *
 * WHAT IT HOLDS, AND FOR HOW LONG. One key per bounty, holding the
 * claim id that took it and when the hold lapses. The hold is SHORT —
 * long enough to cover one claim's chain reads, screen and signature,
 * and no longer — because a claim that dies mid-flight must not lock a
 * listing until somebody notices. Released explicitly on every refusal
 * (the claim door releases its KV guard the same way), and by the
 * clock if the isolate that took it never comes back.
 *
 * The tx-level guard in KV STAYS. This bounds "one payout per
 * listing"; that one bounds "one payout per settlement, ever", it is
 * durable rather than a lease, and the chain is the backstop behind
 * both. Two questions, two guards.
 */
export class BountyClaimLocks extends DurableObject<Env> {
  /**
   * Take the lock for this bounty, or say who holds it. Atomic: a
   * Durable Object handles one call at a time, which is the entire
   * point of moving this off KV.
   */
  async take(
    bountyId: string,
    claimId: string,
    ttlSeconds: number,
  ): Promise<"taken" | "held"> {
    const now = Date.now();
    const held = await this.ctx.storage.get<{ claimId: string; until: number }>(
      bountyId,
    );
    if (held && held.until > now && held.claimId !== claimId) return "held";
    const until = now + ttlSeconds * 1000;
    await this.ctx.storage.put(bountyId, { claimId, until });
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(until);
    }
    return "taken";
  }

  /**
   * Give it back — but only if it is still ours. The claim door's KV
   * guard learned this the hard way on 2026-08-25: an unconditional
   * release let a loser delete the winner's hold, so the guard against
   * double payment became the thing that permitted it.
   */
  async release(bountyId: string, claimId: string): Promise<void> {
    const held = await this.ctx.storage.get<{ claimId: string; until: number }>(
      bountyId,
    );
    if (held?.claimId === claimId) await this.ctx.storage.delete(bountyId);
  }

  /** Locks held right now. For the tests and the keeper's desk. */
  async size(): Promise<number> {
    const rows = await this.ctx.storage.list<{ until: number }>();
    const now = Date.now();
    let live = 0;
    for (const row of rows.values()) if (row.until > now) live += 1;
    return live;
  }

  /** Expired holds cost nothing to keep and are swept anyway. */
  async alarm(): Promise<void> {
    const rows = await this.ctx.storage.list<{ until: number }>();
    const now = Date.now();
    let next: number | null = null;
    for (const [key, row] of rows) {
      if (row.until <= now) await this.ctx.storage.delete(key);
      else next = next === null ? row.until : Math.min(next, row.until);
    }
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }
}

/**
 * A claim's hold, in seconds. One claim's work is a chain read, a
 * sanctions screen and a signature — seconds, not minutes. Sixty
 * gives a slow rail room and still frees a listing fast enough that a
 * dead isolate is a pause rather than an outage.
 */
export const BOUNTY_LOCK_SECONDS = 60;

/**
 * The lock for one bounty, or null where no binding exists.
 *
 * FAIL-OPEN, DELIBERATELY, AND SAID OUT LOUD. A deployment without the
 * binding (a preview upload before the migration lands, a test env
 * that does not need it) keeps the board working with exactly the
 * guarantees it had before this file existed — the KV tx guard and the
 * chain. Refusing every claim because a lock is unavailable would turn
 * a rare double-pay into a total outage, which is the worse trade for
 * an instrument whose whole job is paying strangers who really walked.
 */
export function bountyLock(env: Env): DurableObjectStub<BountyClaimLocks> | null {
  const namespace = (env as { BOUNTY_CLAIM_LOCKS?: DurableObjectNamespace<BountyClaimLocks> })
    .BOUNTY_CLAIM_LOCKS;
  if (!namespace) return null;
  // One object for the board: the lock set is small, and a single
  // writer keeps the ordering trivially correct.
  return namespace.get(namespace.idFromName("board"));
}
