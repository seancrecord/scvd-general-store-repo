import { canonicalAddress } from "@/lib/addresses";
import { isHouseWallet } from "@/lib/channel";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import watchedPages from "@/store/watched-pages.json";
import type { Env, PayerRecord } from "@/types";

/**
 * THE HYPOTHESIS, AND WHAT WOULD REFUTE IT (2026-09-21, the keeper's).
 *
 * The claim is "we will grow with the market". A claim that cannot
 * fail is not a hypothesis, it is a slogan — so the market's series
 * and ours ride the same row, in the same months, and the reading
 * says in words when the market moved and we did not. That sentence
 * is the whole point of this block. Everything else is its receipts.
 *
 * THE MARKET here is the signed corpus's own closing reading for the
 * month: doors listed and doors payable, off the chain, not off a
 * press release. It is a census of a directory, so it is a floor on
 * the market and never the market itself — doors nobody lists are
 * doors nobody here can count.
 *
 * FOUR READINGS RIDE WITH IT, each the keeper's, each named for what
 * it counts rather than for what it would mean if it moved:
 *
 *   new faces         wallets whose first purchase landed this month
 *   the door          declines against settles
 *   the loop          free checks that became sales
 *   who found us      systems citing us that we never wrote to
 *
 * None of the four is a growth rate. At two dozen buyers a percentage
 * is theatre: one wallet is +100%, and the next month's absence is
 * -50%, and neither is a fact about the market.
 */

/** The month's new wallets, and the ones that had already bought before. */
export interface NewFaces {
  /** Wallets whose first_seen falls in this month. */
  first_time: number;
  /** Wallets seen this month that were first seen in an earlier one. */
  returning: number;
  /** True when the payer scan hit its cap: both counts are floors. */
  truncated: boolean;
}

const PAYER_SCAN_CAP = 5000;

/**
 * Every payer row once, bucketed by the month it first appeared and
 * the months it was seen in. One scan for the whole ledger rather
 * than one per month.
 *
 * A WALLET IS NOT A BUYER, and this is the same floor the buyers page
 * prints: a custodial signer is many agents, one operator can hold
 * several wallets, and the store has no way to tell either from one
 * that is exactly what it looks like. House wallets are skipped.
 */
export async function readNewFaces(env: Env): Promise<Map<string, NewFaces>> {
  const byMonth = new Map<string, NewFaces>();
  const keys = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.payerPrefix,
    cap: PAYER_SCAN_CAP,
  });
  const rows = await bulkGetJson<PayerRecord>(env.COUNTERS, keys.names);
  const at = (month: string): NewFaces =>
    byMonth.get(month) ??
    (byMonth.set(month, { first_time: 0, returning: 0, truncated: keys.truncated }),
    byMonth.get(month)!);

  for (const row of rows.values()) {
    if (!row?.address || !row.first_seen) continue;
    if (isHouseWallet(env, canonicalAddress(row.address))) continue;
    const first = row.first_seen.slice(0, 7);
    at(first).first_time += 1;
    const last = (row.last_seen ?? row.first_seen).slice(0, 7);
    // Seen again in a LATER month than the one it arrived in. Within
    // the arrival month it is a new face, not a returning one; the two
    // columns must never count the same wallet twice in one row.
    if (last > first) at(last).returning += 1;
  }
  return byMonth;
}

/**
 * WHO CITES US, AND WHETHER WE ASKED THEM TO.
 *
 * Off the watched-pages register, which carries both dates: the day
 * the keeper stamped a note as sent, and the day the citation watch
 * first read a live citation. A row with a citation and no note is
 * somebody who found us.
 *
 * THE GAP, STATED RATHER THAN HIDDEN: `note_sent` records a STAMPED
 * send. The keeper talks to people; a mention in a thread the repo
 * never saw leaves no stamp, so "unprompted" is a ceiling on what we
 * did not ask for, not proof that we did not ask. It is still the one
 * number here that our own effort cannot manufacture, which is why it
 * is worth printing at all.
 */
export interface FoundUs {
  /** Rows the Sunday watch fetches. */
  watched: number;
  /** Rows carrying a live citation. */
  citing: number;
  /** Citing, and no stamped note ever went out. */
  unprompted: number;
  /** Citing after a stamped note. */
  prompted: number;
  /** Citing rows whose citation began in this month, by name. */
  began: { name: string; since: string; asked: boolean }[];
}

interface WatchedRow {
  name: string;
  url: string;
  note_sent: string | null;
  cites_since: string | null;
}

export function readFoundUs(month?: string): FoundUs {
  const rows = (watchedPages as { rows: WatchedRow[] }).rows ?? [];
  const citing = rows.filter((row) => row.cites_since);
  return {
    watched: rows.length,
    citing: citing.length,
    unprompted: citing.filter((row) => !row.note_sent).length,
    prompted: citing.filter((row) => row.note_sent).length,
    began: citing
      .filter((row) => (month ? row.cites_since!.slice(0, 7) === month : true))
      .map((row) => ({ name: row.name, since: row.cites_since!, asked: !!row.note_sent }))
      .sort((a, b) => a.since.localeCompare(b.since) || a.name.localeCompare(b.name)),
  };
}

/** The market's own closing numbers for a month, off the signed chain. */
export interface MarketReading {
  week: string;
  listed: number;
  payable: number;
}

export interface HypothesisSide {
  market: MarketReading | null;
  settles: number;
  new_faces: number;
  returning_faces: number;
  checks: number;
}

export interface GrowthHypothesis {
  /** The market this month, and ours. */
  now: HypothesisSide;
  /** The month before, when there is one to compare against. */
  before: HypothesisSide | null;
  /**
   * THE SENTENCE THE BLOCK EXISTS FOR. It says "the market grew and we
   * did not" when that is what happened, in those words, because a
   * hypothesis nobody can see fail is not being tested.
   */
  reading: string;
  /** True only on the reading that refutes the claim for this month. */
  against_us: boolean;
  /** Declines against settles. Moves for four reasons; see the note. */
  door: { declines: number; settles: number; per_hundred_settles: number | null };
  /** Free argument-carrying checks, and the sales that followed them. */
  loop: { checks: number; settles_per_hundred_checks: number | null };
  found_us: FoundUs;
}

const perHundred = (top: number, bottom: number): number | null =>
  bottom === 0 ? null : Math.round((top / bottom) * 1000) / 10;

/**
 * FOUR THINGS MOVE THE DOOR RATIO AND THIS SERIES CANNOT TELL THEM
 * APART. Said here once, printed beside the number, because a falling
 * ratio read as "the market is learning" is the store reading its own
 * changelog back as ecosystem progress — which is exactly the claim it
 * refuses to accept from anybody else.
 */
export const DOOR_RATIO_NOTE =
  "Declines against settles, per month. It falls when buyers get better at paying, when WE fix a door of our own, when a noisy scanner stops or is reclassified, and when fewer agents try at all. This series cannot tell those apart: the stage split that can — input, payment, settlement — is on the funnel, and only for its scanned window. Read a fall beside the month's releases before reading it as the market learning.";

export const MARKET_NOTE =
  "The market is the signed corpus's closing week for the month: doors a directory listed, and how many of them were payable when the round knocked. A census of a directory is a floor on the market and never the market itself — doors nobody lists are doors nobody here can count, and their number is unknown rather than zero.";

/** Did a count rise, fall, or hold? Null when either side is unmeasured. */
function moved(now: number | null, before: number | null): number | null {
  if (now === null || before === null) return null;
  return now - before;
}

export function deriveHypothesis(input: {
  now: HypothesisSide;
  before: HypothesisSide | null;
  declines: number;
  settles: number;
  checks: number;
  settlesPerHundredChecks: number | null;
  foundUs: FoundUs;
}): GrowthHypothesis {
  const { now, before } = input;
  const marketMove = moved(now.market?.listed ?? null, before?.market?.listed ?? null);
  const oursMove = moved(now.settles, before?.settles ?? null);

  let reading: string;
  let againstUs = false;
  if (!now.market) {
    // Short on purpose: this one repeats across every unmeasured
    // column, and a paragraph per cell buries the months that DO read.
    reading = "Not measured: no signed week. Not a flat market — an unread one.";
  } else if (!before || marketMove === null || oursMove === null) {
    reading = "First month here: the hypothesis needs two months to say anything.";
  } else if (marketMove > 0 && oursMove > 0) {
    reading = `The market grew by ${marketMove} listed door${marketMove === 1 ? "" : "s"} and our settles grew by ${oursMove}. Grew with the market, this month.`;
  } else if (marketMove > 0 && oursMove <= 0) {
    reading = `THE MARKET GREW BY ${marketMove} LISTED DOOR${marketMove === 1 ? "" : "S"} AND OUR SETTLES DID NOT (${oursMove}). This is the reading the hypothesis has to survive, and this month it did not.`;
    againstUs = true;
  } else if (marketMove < 0 && oursMove > 0) {
    reading = `The market fell by ${Math.abs(marketMove)} listed door${Math.abs(marketMove) === 1 ? "" : "s"} and our settles rose by ${oursMove}. Grew against the market — which the hypothesis does not predict and does not forbid.`;
  } else if (marketMove < 0) {
    reading = `The market fell by ${Math.abs(marketMove)} and so did we (${oursMove}). Fell with the market: consistent with the claim, and no evidence for it.`;
  } else {
    reading = `The market held at ${now.market.listed} listed doors. A month the hypothesis cannot be tested on.`;
  }

  return {
    now,
    before,
    reading,
    against_us: againstUs,
    door: {
      declines: input.declines,
      settles: input.settles,
      per_hundred_settles: perHundred(input.declines, input.settles),
    },
    loop: { checks: input.checks, settles_per_hundred_checks: input.settlesPerHundredChecks },
    found_us: input.foundUs,
  };
}
