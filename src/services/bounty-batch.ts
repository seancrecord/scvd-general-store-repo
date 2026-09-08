import {
  BOUNTY_MAX_REWARD_USD,
  BountyRefused,
  openBounty,
  type BountyBoardOptions,
  type BountyRecord,
  type BountyTier,
} from "@/services/bounty-board";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * POSTING A ROUND OF BOUNTIES, NOT A BOUNTY (2026-09-08, the keeper:
 * "i should probably do up to ten bounties and then like tracking what
 * we are doing with it").
 *
 * The board's posting door took one URL typed by hand. Ten bounties
 * was ten trips to the market page with ten copies of the same URL
 * hunt in between, and nothing anywhere said which doors this store
 * had already sent a walker to — so the tenth press was as blind as
 * the first, and the domain-per-week refusal was the only thing
 * stopping a repeat.
 *
 * TWO PIECES, AND THE FIRST IS THE ONE THAT WAS MISSING. `candidates`
 * turns the week's round into a posting list with THIS STORE'S OWN
 * history beside each door — never walked, open now, paid on a date,
 * expired unclaimed — so the choice is made against the record rather
 * than against memory. `openBountyBatch` then posts the chosen ones,
 * one live 402 read each, and reports every outcome including the
 * refusals: a batch that silently drops eight of ten would be worse
 * than the ten trips it replaces.
 *
 * WHAT DOES NOT CHANGE. Every door is still house-picked from the
 * round's own rows — nothing self-nominates onto this list, which is
 * the whole anti-farming design (BOUNTY_BOARD.md). Every posting still
 * reads the door's live 402 and captures ITS terms as the terms of
 * record. The per-domain-per-week rule, the reward cap and the weekly
 * budget are enforced where they always were, in openBounty, and this
 * file never reaches around them.
 */

/** The most doors one press may post. Ten was the keeper's number. */
export const BOUNTY_BATCH_CAP = 10;
/** How many candidates the desk offers to choose from. */
export const BOUNTY_CANDIDATE_CAP = 24;

/** What this store has already done at a door, in one word and a date. */
export interface DoorHistory {
  state: "never" | "open" | "paid" | "expired";
  /** When that bounty opened. Absent for "never". */
  at?: string;
  bounty_id?: string;
  /** Set on a paid row: the walk really happened and was verified. */
  walked_by?: string;
}

export interface BountyCandidate {
  url: string;
  domain: string;
  verdict: WardHostResult["verdict"];
  /** The cheapest USDC ask the round read at this door, when it read one. */
  min_usdc?: number;
  /** When the round knocked, so a stale row is visible as stale. */
  observed_at?: string;
  history: DoorHistory;
  /**
   * Why this door cannot be posted right now. A blocked candidate is
   * SHOWN rather than filtered away: "you already have a bounty open
   * here this week" is the answer to the question the keeper is
   * actually asking, and hiding the row makes him ask it again.
   */
  blocked?: string;
}

/** The latest bounty this store opened at each domain. */
function historyByDomain(
  bounties: readonly BountyRecord[],
): Map<string, BountyRecord> {
  const latest = new Map<string, BountyRecord>();
  for (const bounty of bounties) {
    const held = latest.get(bounty.domain);
    if (!held || bounty.opened_at > held.opened_at) {
      latest.set(bounty.domain, bounty);
    }
  }
  return latest;
}

/**
 * The doors worth pointing a paid walker at, from the week's own
 * round.
 *
 * READY ROWS ONLY, and this is a judgement about the WALKER'S money
 * rather than about the door. The reward pays for a verified
 * settlement: a door that never takes the payment produces no
 * settlement, so a walker sent at one spends their gas, gets nothing
 * back, and learns what our own probe already knew for free. The
 * evidence a bounty buys is the case the probe CANNOT see — a door
 * that answers every check and still refuses a stranger's money — and
 * that door is a "ready" row by definition.
 */
export function bountyCandidates(
  round: WardRound,
  bounties: readonly BountyRecord[],
  ourHost: string,
  now: Date = new Date(),
  cap = BOUNTY_CANDIDATE_CAP,
): BountyCandidate[] {
  const history = historyByDomain(bounties);
  const seen = new Set<string>();
  const out: BountyCandidate[] = [];
  const nowIso = now.toISOString();
  for (const host of round.hosts ?? []) {
    if (out.length >= cap) break;
    if (host.verdict !== "ready" || !host.url) continue;
    let domain: string;
    try {
      domain = new URL(host.url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (domain === ourHost.toLowerCase()) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    const record = history.get(domain);
    const state: DoorHistory["state"] = !record
      ? "never"
      : record.status === "paid"
        ? "paid"
        : record.status === "open" && nowIso <= record.expires_at
          ? "open"
          : "expired";
    const candidate: BountyCandidate = {
      url: host.url,
      domain,
      verdict: host.verdict,
      history: {
        state,
        ...(record ? { at: record.opened_at, bounty_id: record.bounty_id } : {}),
        ...(record?.claim?.payer ? { walked_by: record.claim.payer } : {}),
      },
      ...(host.offer?.min_usdc !== undefined
        ? { min_usdc: host.offer.min_usdc }
        : {}),
      ...(host.observed_at ? { observed_at: host.observed_at } : {}),
    };
    if (state === "open") {
      candidate.blocked =
        "a bounty is already open here — one per domain per week";
    }
    out.push(candidate);
  }
  /*
   * Never-walked doors first, then the ones whose last bounty is
   * oldest: the board's job is breadth, and re-walking the same four
   * doors every week buys the corpus nothing it already has.
   */
  return out.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    if (a.history.state === "never" && b.history.state !== "never") return -1;
    if (b.history.state === "never" && a.history.state !== "never") return 1;
    return (a.history.at ?? "").localeCompare(b.history.at ?? "");
  });
}

export interface BatchOutcome {
  url: string;
  ok: boolean;
  bounty_id?: string;
  domain?: string;
  amount_usd?: number;
  /** The refusal, verbatim from the posting door that produced it. */
  refusal?: string;
}

export interface BatchResult {
  posted: number;
  refused: number;
  reward_usd: number;
  /** The length these listings were posted to stand under. */
  tier?: BountyTier;
  days?: number;
  outcomes: BatchOutcome[];
  /** Set when the press asked for more doors than one press may post. */
  trimmed?: number;
}

/**
 * Post a chosen set of doors, one at a time.
 *
 * SEQUENTIAL ON PURPOSE. Each posting fetches a stranger's door and
 * reads a chain head; ten of those in parallel is ten simultaneous
 * knocks from one address at ten operators who never asked to be
 * walked, and the store's own rule about being a polite guest applies
 * to its own presses first.
 *
 * A REFUSAL IS AN OUTCOME, NOT AN ERROR. openBounty refuses for good
 * reasons a keeper needs to read one by one — the door no longer 402s,
 * its payTo is a name rather than an address, the reward would not
 * clear its price, a bounty already stands there this week. Every one
 * of those comes back beside its URL; nothing is swallowed and nothing
 * takes the rest of the batch down.
 */
export async function openBountyBatch(
  env: Env,
  input: {
    urls: readonly string[];
    rewardUsd: number;
    note?: string;
    /** How long these listings stand: a tier, or a day count. */
    tier?: BountyTier;
    days?: number;
    /** What this store wants observed at every door in the press. */
    asks?: readonly string[];
    /** Post them as second walks: a wallet already paid here is refused. */
    distinctPayer?: boolean;
  },
  options: BountyBoardOptions = {},
): Promise<BatchResult> {
  const wanted = input.urls
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  const urls = wanted.slice(0, BOUNTY_BATCH_CAP);
  const outcomes: BatchOutcome[] = [];
  for (const url of urls) {
    try {
      const bounty = await openBounty(
        env,
        {
          targetUrl: url,
          rewardUsd: input.rewardUsd,
          ...(input.note ? { note: input.note } : {}),
          ...(input.tier ? { tier: input.tier } : {}),
          ...(input.days !== undefined ? { days: input.days } : {}),
          ...(input.asks && input.asks.length > 0 ? { asks: input.asks } : {}),
          ...(input.distinctPayer ? { distinctPayer: true } : {}),
        },
        options,
      );
      outcomes.push({
        url,
        ok: true,
        bounty_id: bounty.bounty_id,
        domain: bounty.domain,
        amount_usd: bounty.amount_usd,
      });
    } catch (error) {
      outcomes.push({
        url,
        ok: false,
        refusal:
          error instanceof BountyRefused
            ? error.message
            : `the posting failed: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`,
      });
    }
  }
  const posted = outcomes.filter((outcome) => outcome.ok).length;
  return {
    posted,
    refused: outcomes.length - posted,
    reward_usd: input.rewardUsd,
    ...(input.tier ? { tier: input.tier } : {}),
    ...(input.days !== undefined ? { days: input.days } : {}),
    outcomes,
    ...(wanted.length > urls.length
      ? { trimmed: wanted.length - urls.length }
      : {}),
  };
}

/** One line a keeper can read at a glance, for the notice after a press. */
export function batchNotice(result: BatchResult): string {
  const length = result.tier
    ? ` (${result.tier})`
    : result.days !== undefined
      ? ` (${result.days} days)`
      : "";
  const head = `Posted ${result.posted} bount${result.posted === 1 ? "y" : "ies"} at $${result.reward_usd.toFixed(2)} each${length}`;
  const refusals = result.outcomes
    .filter((outcome) => !outcome.ok)
    .map((outcome) => `${outcome.url} — ${outcome.refusal}`);
  const trimmed = result.trimmed
    ? ` ${result.trimmed} door${result.trimmed === 1 ? "" : "s"} past the ${BOUNTY_BATCH_CAP}-per-press cap were not posted.`
    : "";
  return refusals.length === 0
    ? `${head}. Nothing was refused.${trimmed}`
    : `${head}; ${refusals.length} refused: ${refusals.join(" · ")}.${trimmed}`;
}

/** The reward a batch defaults to: the cap's ceiling is never the default. */
export const BOUNTY_BATCH_DEFAULT_REWARD =
  Math.round(BOUNTY_MAX_REWARD_USD * 40) / 100;
