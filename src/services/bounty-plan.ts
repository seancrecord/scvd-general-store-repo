import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import {
  BOUNTY_MAX_REWARD_USD,
  BOUNTY_WEEKLY_BUDGET_USD,
  bountyBoard,
  type BountyTier,
} from "@/services/bounty-board";
import type { Env } from "@/types";

/**
 * A STANDING ORDER FOR THE BOARD (2026-09-10, the keeper: "can we
 * automate a few weeks of them?").
 *
 * Posting bounties had been sixty seconds of the keeper's attention
 * per door, every week, forever — and the week it was skipped the
 * board simply went empty and the walkers who poll it found nothing.
 * This is the keeper writing down what he would have pressed, once,
 * for as many weeks as he means it.
 *
 * WHAT THIS IS NOT, AND THE DISTINCTION IS THE WHOLE DESIGN. It does
 * not choose doors by any new rule. Candidates come from
 * bountyCandidates, which reads THIS WEEK'S OWN CENSUS ROUND — the
 * same house-picked list the market page offers a keeper, in the same
 * order. Nothing self-nominates onto it, no seller can put their door
 * in front of a walker by asking, and the anti-farming property in
 * BOUNTY_BOARD.md is untouched. What is automated is the PRESS, not
 * the judgement.
 *
 * THE ONE RULE THAT MATTERS MORE THAN CONVENIENCE. The weekly budget
 * is checked at CLAIM time, last, after a walker has already paid the
 * door out of their own wallet. So a board that posts more than the
 * week can pay does not merely overspend — it takes strangers' money
 * and refuses them, which is the exact behaviour this store exists to
 * catch other people doing. Every posting here is therefore reserved
 * against OPEN bounties as well as spent ones (`committed` below), and
 * the plan stops early rather than post one listing it cannot honour.
 * A plan that posts nothing this week is working correctly.
 */

export interface BountyPlan {
  version: 1;
  /** Weeks still to run. Decremented once per ISO week, then retired at 0. */
  weeks_remaining: number;
  /** How many listings a week may stand open. */
  per_week: number;
  /** What each pays, capped by BOUNTY_MAX_REWARD_USD. */
  reward_usd: number;
  /** The tier every listing in this plan is posted at. */
  tier: BountyTier;
  /**
   * Rails to pin, cycled one per posting. Empty means "whatever the
   * door quotes first", which in practice is Base — so a plan that
   * wants the other rails exercised has to say so.
   */
  rails: string[];
  /** Free text carried onto every listing this plan opens. */
  note?: string;
  /** Asks carried onto every listing. */
  asks?: string[];
  /** Set when the plan was written, for the round to show its age. */
  created_at: string;
  /** The last ISO week this plan posted in, so a week runs once. */
  last_week?: string;
  /** Every week this plan has acted in, newest first, capped at 12. */
  history?: Array<{ week: string; posted: number; refused: number; note: string }>;
}

export interface PlanPass {
  /** Null when there was nothing to do, with `why` saying which nothing. */
  week: string;
  posted: number;
  refused: number;
  /** What the pass decided, in one line, for the keeper's round. */
  note: string;
  weeks_remaining: number;
}

export async function readBountyPlan(env: Env): Promise<BountyPlan | null> {
  const stored = await kvGetJson<BountyPlan>(
    env.COUNTERS,
    KV_KEYS.bountyPlan,
    "json",
  );
  return stored && stored.version === 1 ? stored : null;
}

export async function writeBountyPlan(
  env: Env,
  plan: BountyPlan | null,
): Promise<void> {
  await kvPut(
    env.COUNTERS,
    KV_KEYS.bountyPlan,
    plan ? JSON.stringify(plan) : JSON.stringify({ version: 1, weeks_remaining: 0, per_week: 0, reward_usd: 0, tier: "sprint", rails: [], created_at: new Date().toISOString() }),
  );
}

/**
 * WHAT THIS WEEK HAS ALREADY PROMISED — paid out, PLUS every listing
 * still standing open that would have to be paid if claimed.
 *
 * The second half is the part a naive reading misses, and it is the
 * one that protects a stranger: `spent_this_week_usd` only counts
 * money that has already moved, so a board with $9 of open listings
 * and $1 spent looks like it has $9 to give away. It has nothing.
 */
export async function committedThisWeek(
  env: Env,
  now: Date,
): Promise<{ spent: number; open: number; headroom: number }> {
  const board = await bountyBoard(env, now);
  const spent = board.spent_this_week_usd;
  const open = board.bounties
    .filter((record) => record.status === "open")
    .reduce((sum, record) => sum + record.reward_usd, 0);
  return {
    spent,
    open,
    headroom: Math.max(0, BOUNTY_WEEKLY_BUDGET_USD - spent - open),
  };
}

/**
 * ONE WEEK'S WORTH OF THE STANDING ORDER.
 *
 * Called from the hourly tick, and idempotent within a week by
 * `last_week`: the first firing after the ISO week rolls does the
 * posting and every firing after that returns without touching the
 * board. That is deliberately a stamp rather than a schedule — a tick
 * missed at the week boundary (a deploy, an outage) means the plan
 * runs an hour late instead of skipping the week entirely.
 */
export async function bountyPlanPass(
  env: Env,
  now: Date = new Date(),
): Promise<PlanPass | null> {
  const plan = await readBountyPlan(env);
  if (!plan || plan.weeks_remaining <= 0) return null;
  const week = currentWeekKey(now);
  if (plan.last_week === week) return null;

  /*
   * PAYOUTS OFF IS A REASON TO STOP, NOT TO POST AND HOPE. A listing
   * opened while the field wallet is unbound is a door a walker can
   * pay and never be paid for.
   */
  if (!env.FIELD_WALLET_KEY) {
    return {
      week,
      posted: 0,
      refused: 0,
      note: "payouts are paused (no field wallet), so nothing was posted — the plan keeps its weeks and will run when the wallet is back",
      weeks_remaining: plan.weeks_remaining,
    };
  }

  const { latestWardRound } = await import("@/services/ward-round");
  const round = await latestWardRound(env);
  if (!round) {
    return {
      week,
      posted: 0,
      refused: 0,
      note: "no census round to pick doors from, so nothing was posted",
      weeks_remaining: plan.weeks_remaining,
    };
  }

  const { headroom } = await committedThisWeek(env, now);
  const reward = Math.min(plan.reward_usd, BOUNTY_MAX_REWARD_USD);
  const affordable = reward > 0 ? Math.floor(headroom / reward) : 0;
  const wanted = Math.max(0, Math.min(plan.per_week, affordable));
  if (wanted === 0) {
    const note = `this week is already committed ($${headroom.toFixed(2)} of headroom against a $${reward.toFixed(2)} reward), so nothing was posted — the budget is checked after a walker has paid a door, and a listing this board cannot honour is worse than an empty board`;
    await writeBountyPlan(env, { ...plan, last_week: week, history: pushHistory(plan, { week, posted: 0, refused: 0, note }) });
    return { week, posted: 0, refused: 0, note, weeks_remaining: plan.weeks_remaining };
  }

  const { bountyCandidates, openBountyBatch } = await import(
    "@/services/bounty-batch"
  );
  const board = await bountyBoard(env, now);
  const ourHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const candidates = bountyCandidates(round, board.bounties, ourHost, now).filter(
    (candidate) => !candidate.blocked && candidate.history.state === "never",
  );

  let posted = 0;
  let refused = 0;
  /*
   * ONE RAIL AT A TIME. `rail` is a property of a batch rather than of
   * a URL, so a plan that names three rails posts three small batches
   * instead of one. Cheaper to read, and a rail that refuses every
   * door takes the others down with it if they share a call.
   */
  const rails = plan.rails.length > 0 ? plan.rails : [""];
  let cursor = 0;
  for (let index = 0; index < rails.length && posted + refused < wanted; index += 1) {
    const rail = rails[index]!;
    const share = Math.ceil((wanted - posted - refused) / (rails.length - index));
    const urls = candidates.slice(cursor, cursor + share).map((c) => c.url);
    cursor += urls.length;
    if (urls.length === 0) break;
    const result = await openBountyBatch(env, {
      urls,
      rewardUsd: reward,
      tier: plan.tier,
      ...(rail ? { rail } : {}),
      ...(plan.note ? { note: plan.note } : {}),
      ...(plan.asks ? { asks: plan.asks } : {}),
    });
    posted += result.posted;
    refused += result.refused;
  }

  const note =
    posted === 0
      ? `nothing posted from ${candidates.length} candidates — every door refused (usually a moved 402), and the plan keeps its weeks`
      : `posted ${posted} of ${wanted} at $${reward.toFixed(2)}${refused > 0 ? `, ${refused} refused` : ""}`;
  const remaining = Math.max(0, plan.weeks_remaining - 1);
  await writeBountyPlan(env, {
    ...plan,
    weeks_remaining: remaining,
    last_week: week,
    history: pushHistory(plan, { week, posted, refused, note }),
  });
  return { week, posted, refused, note, weeks_remaining: remaining };
}

function pushHistory(
  plan: BountyPlan,
  row: { week: string; posted: number; refused: number; note: string },
): BountyPlan["history"] {
  return [row, ...(plan.history ?? [])].slice(0, 12);
}
