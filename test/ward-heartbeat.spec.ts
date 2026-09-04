import { describe, expect, it } from "vitest";
import {
  OVERDUE_AFTER_HOURS,
  deriveHeartbeat,
  missingWeeks,
  roundWrote,
} from "@/services/ward-heartbeat";
import type { WardRound } from "@/services/ward-round";

/**
 * THE WATCHDOG'S OWN TEST. Two failures had no alarm on them before
 * today, and each has to be caught for a DIFFERENT reason:
 *
 *   A round that never ran throws nothing, so no error path fires.
 *   A round that ran and wrote nothing succeeds, so no error path
 *   fires either — and it is invisible on every published surface,
 *   because an empty week and a quiet week render identically.
 *
 * The second is the one worth the file. "The run finished" is the
 * check every pipeline has; "the run wrote something" is the check
 * that would have caught the outage this design was borrowed from.
 */

function round(
  week: string,
  at: string,
  opts: {
    hosts?: number;
    known?: number;
    sources?: { source: string; hosts: number | null }[];
  } = {},
): WardRound {
  const sources = opts.sources ?? [{ source: "discovery", hosts: 12 }];
  return {
    week,
    at,
    listed_resources: 1,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    population: {
      at,
      population_known: opts.known ?? 40,
      population_walked: opts.hosts ?? 3,
      coverage_pct: 50,
      per_source: sources,
      sources_failed: sources.filter((s) => s.hosts === null).map((s) => s.source),
      carried_forward: 0,
      appeared: [],
      disappeared: [],
      returned: [],
      collapse_suspect: false,
      what_this_cannot_see: [],
    },
    hosts: Array.from({ length: opts.hosts ?? 3 }, (_unused, index) => ({
      host: `h${index}.example`,
    })),
  } as unknown as WardRound;
}

const NOW = new Date("2026-09-06T12:00:00.000Z");

describe("the heartbeat catches a round that never ran", () => {
  it("beats when the newest round is recent and wrote something", () => {
    const beat = deriveHeartbeat([round("2026-W36", "2026-09-06T11:00:00.000Z")], NOW);
    expect(beat.verdict).toBe("beating");
    expect(beat.newest_week).toBe("2026-W36");
    expect(beat.hours_since_newest).toBe(1);
  });

  it("calls it overdue once the grace on a weekly cadence is past", () => {
    const stale = new Date(
      NOW.getTime() - (OVERDUE_AFTER_HOURS + 1) * 3_600_000,
    ).toISOString();
    const beat = deriveHeartbeat([round("2026-W34", stale)], NOW);
    expect(beat.verdict).toBe("overdue");
    // The distinction the old alerting could not make.
    expect(beat.detail).toContain("did not run");
  });

  it("does not cry overdue inside the grace", () => {
    const late = new Date(
      NOW.getTime() - (OVERDUE_AFTER_HOURS - 2) * 3_600_000,
    ).toISOString();
    expect(deriveHeartbeat([round("2026-W35", late)], NOW).verdict).toBe("beating");
  });

  it("a store with no rounds at all is never_run, not overdue", () => {
    const beat = deriveHeartbeat([], NOW);
    expect(beat.verdict).toBe("never_run");
    expect(beat.newest_wrote).toBeNull();
    expect(beat.weeks_missing).toEqual([]);
  });
});

/**
 * THE BORROWED LESSON, held by a test: a cycle that COMPLETES having
 * done nothing must alert. Before this, the round below was a success.
 */
describe("the heartbeat catches a round that wrote nothing", () => {
  it("flags a round that probed nobody, enumerated nobody and read no source", () => {
    const beat = deriveHeartbeat(
      [
        round("2026-W36", "2026-09-06T11:00:00.000Z", {
          hosts: 0,
          known: 0,
          sources: [
            { source: "discovery", hosts: null },
            { source: "fuchss", hosts: null },
          ],
        }),
      ],
      NOW,
    );
    expect(beat.verdict).toBe("ran_empty");
    expect(beat.newest_wrote).toEqual({
      hosts: 0,
      population_known: 0,
      sources_answered: 0,
      sources_asked: 2,
    });
  });

  /**
   * A round that probed nobody but still ENUMERATED a population is
   * the long walk's ordinary shape, not a fault. Calling it empty
   * would page the keeper every week the walk assembled a round.
   */
  it("does not call a round empty when enumeration still worked", () => {
    const beat = deriveHeartbeat(
      [
        round("2026-W36", "2026-09-06T11:00:00.000Z", {
          hosts: 0,
          known: 9000,
          sources: [{ source: "fuchss", hosts: 9000 }],
        }),
      ],
      NOW,
    );
    expect(beat.verdict).toBe("beating");
  });

  it("publishes what the round wrote so the verdict can be recomputed", () => {
    const wrote = roundWrote(
      round("2026-W36", "2026-09-06T11:00:00.000Z", {
        hosts: 5,
        known: 700,
        sources: [
          { source: "discovery", hosts: 300 },
          { source: "fuchss", hosts: null },
        ],
      }),
    );
    expect(wrote).toEqual({
      hosts: 5,
      population_known: 700,
      sources_answered: 1,
      sources_asked: 2,
    });
  });
});

/**
 * A GAP IN AN APPEND-ONLY RECORD IS A FACT ABOUT THE RECORD. Serving
 * only the weeks we looked reads as continuous coverage, which is the
 * one thing this store spends its design budget refusing to imply.
 */
describe("missing weeks are named, not merely absent", () => {
  it("names the weeks between the oldest and newest that hold no round", () => {
    expect(missingWeeks(["2026-W36", "2026-W33", "2026-W32"])).toEqual([
      "2026-W34",
      "2026-W35",
    ]);
  });

  it("is empty when the run is unbroken", () => {
    expect(missingWeeks(["2026-W36", "2026-W35", "2026-W34"])).toEqual([]);
  });

  it("says nothing about a history too short to have a gap", () => {
    expect(missingWeeks([])).toEqual([]);
    expect(missingWeeks(["2026-W36"])).toEqual([]);
  });

  /**
   * The year boundary is the same code path as any other week — the
   * gap walker steps by week key, never by adding seven days to a
   * date and hoping December behaves.
   */
  it("walks across a year end without inventing or losing a week", () => {
    const missing = missingWeeks(["2027-W02", "2026-W52"]);
    expect(missing).toContain("2027-W01");
    expect(missing).not.toContain("2026-W52");
    expect(missing).not.toContain("2027-W02");
  });

  it("rides the heartbeat so the gap travels with the verdict", () => {
    const beat = deriveHeartbeat(
      [
        round("2026-W36", "2026-09-06T11:00:00.000Z"),
        round("2026-W34", "2026-08-23T11:00:00.000Z"),
      ],
      NOW,
    );
    expect(beat.verdict).toBe("beating");
    expect(beat.weeks_missing).toEqual(["2026-W35"]);
    expect(beat.weeks_held).toBe(2);
  });
});
