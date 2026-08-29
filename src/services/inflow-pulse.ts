import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { type InflowCensus } from "@/services/inflow-census";
import type { Env } from "@/types";

/**
 * THE INFLOW TALLY, MADE PUBLIC — and the press that makes it so.
 *
 * The census has been readable at /admin/market/inflows since
 * 2026-08-28 and has never been published, for a reason worth
 * recording: there was no press path. The keeper asked why we were
 * not publishing and the honest answer was that nobody had built the
 * button, not that anyone had ruled against it. This is the button.
 *
 * PUBLISHED BY THE HAND, NOT THE CLOCK (rule 30). The reading derives
 * at call time and nothing lands on the public tally until the keeper
 * presses. He reads the round first; the neighbourhood hears second.
 *
 * PUBLISHING FREEZES A READING, which is a change in kind rather than
 * degree. The census deliberately stores nothing — its whole design
 * note says so, "nothing can be edited into politeness between the
 * walk and the page." A published claim has the opposite requirement:
 * it must still say tomorrow what it said today, or a reader cannot
 * check it. So the press snapshots the counts, and the snapshot is
 * what the public page serves. The live reading and the published
 * week can therefore disagree, and that is correct: one is what the
 * chain says now, the other is what we published then.
 *
 * THE PRESS PUBLISHES THE READING THE KEEPER LOOKED AT, not a fresh
 * one. The first draft re-walked the chain inside the press, which
 * meant he would read one set of numbers on the admin door, press
 * publish, and put a DIFFERENT set on the public page — numbers
 * nobody had ever seen. Rule 30 says he reads the round first and the
 * neighbourhood hears second; that only holds if the two are the same
 * round. So rendering the admin door stashes what it displayed, and
 * the press publishes exactly that, refusing when there is nothing
 * stashed or when it has gone stale. You cannot publish a number you
 * did not look at.
 *
 * WHAT IS PUBLISHED IS THE WHOLE COUNTS-ONLY READING, not a chosen
 * subset. Cherry-picking the flattering numbers is the defect this
 * instrument's own audit spent four rebuilds removing; the reading
 * already carries its denominators, its coverage and its two long
 * caveats, and those travel with it. T1 is unchanged: no address, no
 * host, no sender.
 */

export interface InflowWeekEntry {
  week: string;
  /** When the walk observed; the publish stamp is the keeper's press. */
  observed_at: string;
  published_at: string;
  /**
   * The census as it stood at the press, verbatim. Counts only — the
   * shape is already T1 by construction, and the two caption fields
   * carry the limits with the numbers rather than beside them.
   */
  reading: InflowCensus;
}

export interface InflowPulse {
  version: 1;
  /** Ascending by week; bounded so the one key stays small forever. */
  weeks: InflowWeekEntry[];
}

/** Two years of weekly rows. Oldest fall off. */
const INFLOW_WEEK_CAP = 104;

/**
 * How long a rendered reading stays pressable. Long enough to read
 * the page and decide; short enough that a tab left open overnight
 * cannot publish yesterday's chain as today's.
 */
export const PENDING_TTL_SECONDS = 30 * 60;

export interface PendingReading {
  rendered_at: string;
  reading: InflowCensus;
}

/**
 * Called by the admin door as it renders. What it stashes is what the
 * press may publish, and nothing else.
 */
export async function stashRenderedReading(
  env: Env,
  reading: InflowCensus,
  now: Date = new Date(),
): Promise<void> {
  const pending: PendingReading = {
    rendered_at: now.toISOString(),
    reading,
  };
  await kvPut(env.COUNTERS, KV_KEYS.inflowPending, JSON.stringify(pending), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
}

export async function readInflowPulse(env: Env): Promise<InflowPulse> {
  const stored = await kvGetJson<InflowPulse>(
    env.COUNTERS,
    KV_KEYS.inflowPulse,
    "json",
  );
  return stored ?? { version: 1, weeks: [] };
}

export type InflowPublishResult =
  | { ok: true; entry: InflowWeekEntry; weeks: number; replaced: boolean }
  | { ok: false; refusal: string };

/**
 * The keeper's press. Idempotent per week — re-publishing replaces
 * that week's row, and the replacement is visible in published_at
 * rather than silent.
 *
 * REFUSES RATHER THAN PUBLISHES A HOLE. A reading whose chains were
 * not walked over the same window is a floor, not a rate (rule 52),
 * and a reading that lost addresses to an unread provider does not
 * know its own denominator. Both refuse here rather than landing on
 * a public page with a caveat nobody reads. The keeper can see them
 * on the admin door either way; publishing is the higher bar.
 */
export async function publishInflowWeek(
  env: Env,
  now: Date = new Date(),
): Promise<InflowPublishResult> {
  const pending = await kvGetJson<PendingReading>(
    env.COUNTERS,
    KV_KEYS.inflowPending,
    "json",
  );
  if (!pending) {
    return {
      ok: false,
      refusal:
        "no reading has been rendered to press — open /admin/market/inflows and read the week before publishing it",
    };
  }
  const age = now.getTime() - Date.parse(pending.rendered_at);
  if (!Number.isFinite(age) || age > PENDING_TTL_SECONDS * 1000) {
    return {
      ok: false,
      refusal:
        "the reading on screen has gone stale; re-open the page so the press publishes a walk you have actually looked at",
    };
  }
  const reading = pending.reading;
  if (!reading.windows_equal) {
    return {
      ok: false,
      refusal:
        "the chains were not walked over the same window, so this reading is a floor and not a rate — publishing it as a weekly tally would state a share its own coverage cannot support (rule 52)",
    };
  }
  const unread = reading.windows.reduce(
    (sum, window) => sum + window.addresses_unread,
    0,
  );
  if (unread > 0) {
    return {
      ok: false,
      refusal: `${unread} watched addresses went unread this walk, so the reading does not know its own denominator; re-run before publishing`,
    };
  }

  const entry: InflowWeekEntry = {
    week: reading.week,
    observed_at: reading.observed_at,
    published_at: now.toISOString(),
    reading,
  };
  const pulse = await readInflowPulse(env);
  const existing = pulse.weeks.findIndex((row) => row.week === entry.week);
  const replaced = existing >= 0;
  if (replaced) {
    pulse.weeks[existing] = entry;
  } else {
    pulse.weeks.push(entry);
    pulse.weeks.sort((a, b) => a.week.localeCompare(b.week));
    if (pulse.weeks.length > INFLOW_WEEK_CAP) {
      pulse.weeks.splice(0, pulse.weeks.length - INFLOW_WEEK_CAP);
    }
  }
  await kvPut(env.COUNTERS, KV_KEYS.inflowPulse, JSON.stringify(pulse));
  return { ok: true, entry, weeks: pulse.weeks.length, replaced };
}
