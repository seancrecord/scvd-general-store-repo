import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import {
  BOUNTY_MAX_REWARD_USD,
  BOUNTY_WEEKLY_BUDGET_USD,
  bountyBoard,
  type BountyTier,
} from "@/services/bounty-board";
import { BOUNTY_BATCH_CAP } from "@/services/bounty-batch";
import type { Env } from "@/types";

/**
 * A STANDING ORDER FOR THE BOARD (2026-09-10, the keeper: "can we
 * automate a few weeks of them?").
 *
 * Posting bounties had been sixty seconds of the keeper's attention
 * per door, every week, forever — and the week it was skipped the
 * board simply went empty and the walkers who poll it found nothing.
 * This is the keeper writing down what he would have pressed, once,
 * for as many runs as he means it.
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
 *
 * WHY THIS FILE CHANGED (2026-09-19, the keeper: "the automated
 * bounties dont seem to be updating and they also really arent very
 * relevant to the work we do, we need more cycles and options"). Three
 * faults, all of them real, all of them visible on the public board
 * that week — 92 listings, zero open, nothing posted since the 15th:
 *
 * ONE, THE CLOCK WAS THE WEEK. The pass stamped the ISO week and
 * returned for every firing after the first, so the board was restocked
 * at most once every seven days. The listings it opened were claimed
 * within hours — 85 of 92 walked and paid — and the other six and a
 * half days the board stood empty in front of walkers who polled it 235
 * times. A weekly clock is not a cadence, it is a pulse. The cadence is
 * now the keeper's: `every_hours`, from hourly to monthly.
 *
 * TWO, IT SPENT ITS RUNS ON DOORS IT COULD NOT POST. Candidates arrive
 * never-walked first, and the never-walked rows that stay never-walked
 * are exactly the ones every press refuses — the $1.00 and $5.00 doors
 * that no reward under the $0.25 ceiling can clear. The plan took the
 * first N of them, got N refusals, posted nothing, and decremented its
 * weeks anyway. Now the desk does that arithmetic before the press
 * (bounty-batch.ts) and the plan takes only doors its own reward can
 * actually clear.
 *
 * THREE, A QUIET RUN COST A RUN. A run is spent when the press is
 * MADE. No headroom, no eligible door, no census round, no field
 * wallet — nothing was attempted, so nothing is charged, and the next
 * tick tries again instead of the next week.
 */

/** Cadence bounds. An hour is the tick; a month is the longest wait. */
export const PLAN_MIN_EVERY_HOURS = 1;
export const PLAN_MAX_EVERY_HOURS = 720;
/** The default cadence when a plan does not name one: the old weekly. */
export const PLAN_DEFAULT_EVERY_HOURS = 168;
/** The most listings a plan may leave standing at once. */
export const PLAN_MAX_OPEN_CAP = 40;
/**
 * A tick fires on the hour and the clock drifts by seconds, so a plan
 * asking for "every hour" must not be pushed to every two hours by
 * three seconds of lateness. The grace is smaller than any cadence.
 */
const PLAN_DUE_GRACE_MS = 5 * 60 * 1000;

export interface BountyPlan {
  version: 2;
  /** Presses still to make. Decremented when a press is ATTEMPTED. */
  runs_remaining: number;
  /** How many listings one press opens, at most. */
  per_run: number;
  /** How long between presses. 168 is the weekly plan this replaced. */
  every_hours: number;
  /**
   * The most listings this plan may leave standing at once, counting
   * listings the keeper posted by hand. A cadence faster than walkers
   * claim would otherwise pile the board up; this is the brake, and it
   * is a brake on the BOARD rather than on the plan, which is why hand
   * presses count against it.
   */
  max_open: number;
  /**
   * Re-post a door this store already walked, once its last bounty is
   * this many days old. 0 keeps the old rule: never-walked doors only.
   *
   * A re-walk is not a wasted listing. "Did the door that took money
   * on the 9th still take money on the 19th" is a question only a
   * second settlement answers, and it is the question the corpus is
   * for. It is also what keeps a plan posting after the affordable
   * never-walked pool is empty, which is how a board goes quiet
   * without anything being broken.
   */
  revisit_days: number;
  /**
   * Post as SECOND WALKS: a wallet that already walked a door is
   * refused there (2026-09-19).
   *
   * This is the option the board most needed and never had. On
   * 2026-09-19 the board held 85 settlements from 6 wallets across 62
   * doors, and four doors had been walked more than once — three of
   * them three times by ONE wallet, which compares nothing. The
   * fourth, agent402.tools, was walked by two wallets and their
   * reported digests DIFFER: the only row in the corpus this store can
   * hold without trusting either stranger. Paired with `revisit_days`,
   * this is what turns a re-walk into that evidence rather than into a
   * repeat.
   */
  distinct_payer?: boolean;
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
  /** When the last press was made, which is what the cadence counts from. */
  last_run_at?: string;
  /**
   * A v1 plan's week stamp, kept so a plan written before the cadence
   * existed does not press twice the hour this deploys. Dropped the
   * first time this plan runs.
   */
  last_week?: string;
  /** Why the last pass did nothing, when it did nothing. */
  last_note?: string;
  /** Every press this plan has made, newest first, capped at 12. */
  history?: Array<{
    at: string;
    week: string;
    posted: number;
    refused: number;
    note: string;
  }>;
}

/** What a v1 plan looked like, for the read that migrates it. */
interface BountyPlanV1 {
  version: 1;
  weeks_remaining: number;
  per_week: number;
  reward_usd: number;
  tier: BountyTier;
  rails: string[];
  note?: string;
  asks?: string[];
  created_at: string;
  last_week?: string;
  history?: Array<{ week: string; posted: number; refused: number; note: string }>;
}

export interface PlanPass {
  week: string;
  posted: number;
  refused: number;
  /** What the pass decided, in one line, for the keeper's round. */
  note: string;
  runs_remaining: number;
  /** True when this pass actually knocked on doors. */
  pressed: boolean;
  /** When the cadence next comes due, after this pass. */
  next_run_at?: string;
}

/**
 * THE PLAN AS THIS FILE UNDERSTANDS IT, whichever version is on disk.
 *
 * A v1 plan keeps running on the cadence it was written under — a week
 * — because that is what the keeper asked for when he wrote it. Its
 * week stamp carries forward so the deploy that ships this does not
 * press a second time in a week already pressed.
 */
export async function readBountyPlan(env: Env): Promise<BountyPlan | null> {
  const stored = await kvGetJson<BountyPlan | BountyPlanV1>(
    env.COUNTERS,
    KV_KEYS.bountyPlan,
    "json",
  );
  if (!stored) return null;
  if (stored.version === 2) return stored;
  if (stored.version !== 1) return null;
  const legacy = stored;
  return {
    version: 2,
    runs_remaining: legacy.weeks_remaining,
    per_run: legacy.per_week,
    every_hours: PLAN_DEFAULT_EVERY_HOURS,
    max_open: Math.max(1, legacy.per_week),
    revisit_days: 0,
    reward_usd: legacy.reward_usd,
    tier: legacy.tier,
    rails: legacy.rails ?? [],
    ...(legacy.note ? { note: legacy.note } : {}),
    ...(legacy.asks ? { asks: legacy.asks } : {}),
    created_at: legacy.created_at,
    ...(legacy.last_week ? { last_week: legacy.last_week } : {}),
    ...(legacy.history
      ? {
          history: legacy.history.map((row) => ({
            at: row.week,
            week: row.week,
            posted: row.posted,
            refused: row.refused,
            note: row.note,
          })),
        }
      : {}),
  };
}

export async function writeBountyPlan(
  env: Env,
  plan: BountyPlan | null,
): Promise<void> {
  await kvPut(
    env.COUNTERS,
    KV_KEYS.bountyPlan,
    plan
      ? JSON.stringify(plan)
      : JSON.stringify({
          version: 2,
          runs_remaining: 0,
          per_run: 0,
          every_hours: PLAN_DEFAULT_EVERY_HOURS,
          max_open: 0,
          revisit_days: 0,
          reward_usd: 0,
          tier: "sprint",
          rails: [],
          created_at: new Date().toISOString(),
        } satisfies BountyPlan),
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
): Promise<{ spent: number; open: number; open_count: number; headroom: number }> {
  const board = await bountyBoard(env, now);
  const spent = board.spent_this_week_usd;
  const standing = board.bounties.filter((record) => record.status === "open");
  const open = standing.reduce((sum, record) => sum + record.reward_usd, 0);
  return {
    spent,
    open,
    open_count: standing.length,
    headroom: Math.max(0, BOUNTY_WEEKLY_BUDGET_USD - spent - open),
  };
}

/** When the cadence next comes due after a press made at `from`. */
export function nextRunAt(plan: BountyPlan, from: Date): string {
  return new Date(from.getTime() + plan.every_hours * 3_600_000).toISOString();
}

/**
 * ONE PRESS OF THE STANDING ORDER.
 *
 * Called from the hourly tick, and idempotent within a cadence window
 * by `last_run_at`: the first firing after the window closes does the
 * posting and every firing before that returns without touching the
 * board. That is deliberately a stamp rather than a schedule — a tick
 * missed at the boundary (a deploy, an outage) means the plan runs an
 * hour late instead of skipping the window entirely.
 *
 * `force` is the keeper's own hand on the same lever: it skips the
 * cadence and nothing else. Every rule that protects a walker — the
 * budget reservation, the open ceiling, the reward that must clear the
 * door's price, the field wallet, one bounty per domain per week —
 * holds exactly as it does on the tick.
 */
export async function bountyPlanPass(
  env: Env,
  now: Date = new Date(),
  options: { force?: boolean } = {},
): Promise<PlanPass | null> {
  const plan = await readBountyPlan(env);
  if (!plan || plan.runs_remaining <= 0) return null;
  const week = currentWeekKey(now);
  if (!options.force && !isDue(plan, now)) return null;

  /*
   * A PASS THAT ATTEMPTED NOTHING COSTS NOTHING (2026-09-19). None of
   * these four is a press: the plan keeps its run, keeps its clock, and
   * the next tick asks again — an hour, not a week. Writing the reason
   * down is the whole difference between "the plan is quiet" and "the
   * plan is broken", and the desk reads it off `last_note`.
   */
  const quiet = async (note: string): Promise<PlanPass> => {
    if (plan.last_note !== note) {
      await writeBountyPlan(env, { ...plan, last_note: note });
    }
    return {
      week,
      posted: 0,
      refused: 0,
      note,
      runs_remaining: plan.runs_remaining,
      pressed: false,
    };
  };

  /*
   * PAYOUTS OFF IS A REASON TO STOP, NOT TO POST AND HOPE. A listing
   * opened while the field wallet is unbound is a door a walker can
   * pay and never be paid for.
   */
  if (!env.FIELD_WALLET_KEY) {
    return quiet(
      "payouts are paused (no field wallet), so nothing was posted — the plan keeps its runs and will press when the wallet is back",
    );
  }

  const { latestWardRound } = await import("@/services/ward-round");
  const round = await latestWardRound(env);
  if (!round) {
    return quiet("no census round to pick doors from, so nothing was posted");
  }

  const committed = await committedThisWeek(env, now);
  const reward = Math.min(plan.reward_usd, BOUNTY_MAX_REWARD_USD);
  const affordable = reward > 0 ? Math.floor(committed.headroom / reward) : 0;
  const room = Math.max(0, plan.max_open - committed.open_count);
  const wanted = Math.max(
    0,
    Math.min(plan.per_run, BOUNTY_BATCH_CAP, affordable, room),
  );
  if (affordable === 0) {
    return quiet(
      `this week is already committed ($${committed.headroom.toFixed(2)} of headroom against a $${reward.toFixed(2)} reward), so nothing was posted — the budget is checked after a walker has paid a door, and a listing this board cannot honour is worse than an empty board`,
    );
  }
  if (room === 0) {
    return quiet(
      `${committed.open_count} listings already stand open and this plan holds the board at ${plan.max_open}, so nothing was posted — the walkers have more than they have walked`,
    );
  }
  if (wanted === 0) return quiet("nothing to post this pass");

  const { bountyCandidates, openBountyBatch } = await import(
    "@/services/bounty-batch"
  );
  /*
   * WHAT THE LAST PRESS WAS TOLD AT EACH DOOR (2026-09-20). Without
   * this the plan is the worst offender: three doors that answered
   * 526, 401 and 301 on 2026-09-19 still read "ready, never walked,
   * cheap" in the census, so a twelve-hour cadence would knock on all
   * three fourteen times a week and collect the same three refusals.
   * The memory expires against the next census round, not a clock.
   */
  const { readRefusalMemory, refusalsForRound } = await import(
    "@/services/bounty-refusals"
  );
  const refusals = await readRefusalMemory(env)
    .then((memory) => refusalsForRound(memory, round.at))
    .catch(() => ({}));
  const board = await bountyBoard(env, now);
  const ourHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const offered = bountyCandidates(
    round,
    board.bounties,
    ourHost,
    now,
    /*
     * Look at the whole round, not the deskful. The desk caps its
     * OFFER at 24 rows because a keeper reads them; the plan is
     * choosing from the same ordered list and has no such limit, and a
     * cap here would re-create the blindness bounty-batch.ts fixed in
     * September — the first 24 rows, forever, whatever else the round
     * found.
     */
    Number.MAX_SAFE_INTEGER,
    reward,
    refusals,
  );
  const candidates = offered.filter((candidate) => {
    if (candidate.blocked) return false;
    if (candidate.history.state === "never") return true;
    /*
     * A REVISIT IS A DATED QUESTION, NOT A REPEAT (2026-09-19). Off by
     * default, because breadth was and remains the board's first job.
     * On, it is what keeps the board stocked once every affordable
     * never-walked door in the round has been walked — and what turns
     * "this door took money on the 9th" into "this door still took
     * money on the 19th", which is the only shape of evidence that
     * expires.
     */
    if (plan.revisit_days <= 0) return false;
    if (!candidate.history.at) return false;
    const age = (now.getTime() - Date.parse(candidate.history.at)) / 86_400_000;
    return Number.isFinite(age) && age >= plan.revisit_days;
  });
  if (candidates.length === 0) {
    const ceilinged = offered.filter((row) => row.above_ceiling).length;
    const refused = offered.filter((row) => row.last_refusal).length;
    const pricedOut = offered.filter(
      (row) => row.blocked && !row.above_ceiling && row.min_reward_usd !== undefined,
    ).length;
    return quiet(
      `no door in the round this plan can post at $${reward.toFixed(2)}: ${offered.length} ready rows, ${ceilinged} priced above the $${BOUNTY_MAX_REWARD_USD.toFixed(2)} ceiling, ${pricedOut} needing a bigger reward than this plan pays, ${refused} refused by the door itself since this round was taken, the rest already walked${plan.revisit_days > 0 ? ` inside ${plan.revisit_days} days` : " (revisits are off)"}`,
    );
  }

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
      roundAt: round.at,
      ...(plan.distinct_payer ? { distinctPayer: true } : {}),
      ...(rail ? { rail } : {}),
      ...(plan.note ? { note: plan.note } : {}),
      ...(plan.asks ? { asks: plan.asks } : {}),
    });
    posted += result.posted;
    refused += result.refused;
  }

  const note =
    posted === 0
      ? `nothing posted from ${candidates.length} affordable candidates — every door refused (usually a moved 402)`
      : `posted ${posted} of ${wanted} at $${reward.toFixed(2)}${refused > 0 ? `, ${refused} refused` : ""}`;
  const remaining = Math.max(0, plan.runs_remaining - 1);
  const pressed: BountyPlan = {
    ...plan,
    runs_remaining: remaining,
    last_run_at: now.toISOString(),
    history: pushHistory(plan, {
      at: now.toISOString(),
      week,
      posted,
      refused,
      note,
    }),
  };
  delete pressed.last_week;
  delete pressed.last_note;
  await writeBountyPlan(env, pressed);
  return {
    week,
    posted,
    refused,
    note,
    runs_remaining: remaining,
    pressed: true,
    next_run_at: nextRunAt(plan, now),
  };
}

/** Has the cadence come round? A v1 plan still answers by its week. */
function isDue(plan: BountyPlan, now: Date): boolean {
  const last = plan.last_run_at ? Date.parse(plan.last_run_at) : Number.NaN;
  if (Number.isFinite(last)) {
    return (
      now.getTime() - last >=
      plan.every_hours * 3_600_000 - PLAN_DUE_GRACE_MS
    );
  }
  if (plan.last_week) return plan.last_week !== currentWeekKey(now);
  return true;
}

function pushHistory(
  plan: BountyPlan,
  row: NonNullable<BountyPlan["history"]>[number],
): BountyPlan["history"] {
  return [row, ...(plan.history ?? [])].slice(0, 12);
}
