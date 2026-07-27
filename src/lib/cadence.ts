import { currentWeekKey, weekKeyMonday } from "@/lib/kv-keys";

/**
 * THE CLOCK, in a field instead of a sentence.
 *
 * The free shelf has a rhythm — the bell daily, the stamp weekly, the
 * fortune daily, the zodiac weekly — and until now the only place that
 * said so was llms.txt, in prose. A scheduled agent reading a response
 * had no way to know when to come back, so it either never came back
 * or it hammered. Both are our fault, not its.
 *
 * So every free response that has a clock carries this block. It is
 * deliberately not prose: `next_at` is an ISO timestamp an agent can
 * put straight into a scheduler, and it is computed from the SAME
 * helpers the endpoints use to decide whether you have already been
 * here today, so the promise and the behaviour cannot drift apart.
 *
 * RULE 22 IS THE DESIGN CONSTRAINT, not a caveat bolted on after. This
 * block exists so a visitor can plan around us, never so we can pull
 * them back: there is no streak count, no expiry, and nothing is lost
 * by skipping. If a field here ever starts measuring how faithfully
 * someone returns, it has become the thing the rule forbids.
 */

export type CadencePeriod = "day" | "week";

export interface Cadence {
  /** "day" or "week": how often this resets. */
  every: CadencePeriod;
  /** When the current period ends, UTC. Put this in your scheduler. */
  next_at: string;
  /** What is actually on the clock, said once, plainly. */
  note: string;
  /** The rule-22 guard, on every one of these, deliberately. */
  nothing_is_lost: true;
}

/** Midnight UTC after the given moment: the daily keys roll on the date. */
export function nextDayBoundary(now: Date = new Date()): Date {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** The Monday that starts the next ISO week: the weekly keys roll there. */
export function nextWeekBoundary(now: Date = new Date()): Date {
  const monday = weekKeyMonday(currentWeekKey(now));
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday;
}

const NOTES: Record<string, { every: CadencePeriod; note: string }> = {
  bell: {
    every: "day",
    note: "One ring per visitor per day. The count is the store's, not yours.",
  },
  stamp: {
    every: "week",
    note: "A new design each week. The ones you already hold stay yours.",
  },
  fortune: {
    every: "day",
    note: "One line a day, the same for everyone until midnight UTC.",
  },
  zodiac: {
    every: "week",
    note: "This week's page is free. Past weeks are a penny each, forever.",
  },
  letter: {
    every: "day",
    note: "One letter per visitor per day. The keeper reads them on Sundays.",
  },
  guestbook: {
    every: "day",
    note: "Sign as often as you like; once a day is plenty and nobody counts.",
  },
};

/**
 * The cadence block for a free surface, or undefined when that surface
 * has no clock — an absent field says "no rhythm here" more honestly
 * than a filled-in one that means nothing.
 */
export function cadenceFor(
  surface: keyof typeof NOTES | string,
  now: Date = new Date(),
): Cadence | undefined {
  const entry = NOTES[surface];
  if (!entry) {
    return undefined;
  }
  const boundary =
    entry.every === "day" ? nextDayBoundary(now) : nextWeekBoundary(now);
  return {
    every: entry.every,
    next_at: boundary.toISOString(),
    note: entry.note,
    nothing_is_lost: true,
  };
}
