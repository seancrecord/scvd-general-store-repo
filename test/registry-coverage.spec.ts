import { describe, expect, it } from "vitest";
import { coverageCaveat } from "@/routes/registry";
import { buildRegistryWeek } from "@/services/registry-pulse";
import type { RegistryWeekEntry } from "@/services/registry-pulse";
import type { WardRound } from "@/services/ward-round";

/**
 * THE TALLY PUBLISHES ITS OWN INCOMPLETENESS (rule 52; the keeper's
 * ruling 2026-08-28, "yes safer better").
 *
 * The round has always recorded `capped`, `coverage_suspect`,
 * `coverage_drop` and the population denominator honestly. The
 * publish step dropped every one of them, so /registry served a
 * capped walk with nothing beside the number to say it was a floor —
 * under a sentence about knocking on every listed door.
 *
 * The load-bearing case is the THIRD one: a caveat that goes silent
 * is worse than no caveat, because silence reads as a clean walk.
 * All three states must say something, and the state "we never
 * recorded coverage for this week" must never pass for "coverage was
 * fine."
 */

const ROUND: WardRound = {
  week: "2026-W35",
  at: "2026-08-26T00:00:00.000Z",
  listed_resources: 6000,
  coverage_suspect: false,
  capped: false,
  our_search_presence: true,
  hosts: [],
} as unknown as WardRound;

const entryFrom = (round: Partial<WardRound>): RegistryWeekEntry =>
  buildRegistryWeek(
    { ...ROUND, ...round } as WardRound,
    "2026-08-28T00:00:00.000Z",
  );

describe("the round's coverage reaches the published week", () => {
  it("carries a clean round through as recorded-and-clean", () => {
    const entry = entryFrom({});
    expect(entry.coverage).toBeDefined();
    expect(entry.coverage!.capped).toBe(false);
    expect(entry.coverage!.coverage_suspect).toBe(false);
    expect(coverageCaveat(entry)).toContain("no coverage trouble");
  });

  it("says a capped walk is a floor, in the caveat beside the number", () => {
    const entry = entryFrom({ capped: true });
    expect(entry.coverage!.capped).toBe(true);
    const caveat = coverageCaveat(entry);
    expect(caveat).toContain("host cap");
    expect(caveat).toContain("floor");
  });

  it("names a suspect feed and a coverage drop with its numbers", () => {
    const entry = entryFrom({
      coverage_suspect: true,
      coverage_drop: {
        previous_hosts: 400,
        this_round: 38,
        previous_at: "2026-08-19T00:00:00.000Z",
      },
    });
    const caveat = coverageCaveat(entry);
    expect(caveat).toContain("undercount");
    expect(caveat).toContain("38");
    expect(caveat).toContain("400");
    // Our instrument, said as ours.
    expect(caveat).toContain("our instrument");
  });

  it("carries the population denominator when the round had one", () => {
    const entry = entryFrom({
      population: {
        population_known: 5873,
        population_walked: 750,
        coverage_pct: 13,
      } as WardRound["population"],
    });
    expect(entry.coverage!.population_known).toBe(5873);
    const caveat = coverageCaveat(entry);
    expect(caveat).toContain("5873");
    expect(caveat).toContain("750");
    expect(caveat).toContain("13%");
  });

  it("a week with NO coverage block says so, and never reads as a clean walk", () => {
    /*
     * The one that matters. Weeks published before this shipped carry
     * no coverage block at all, and the honest rendering of that is
     * "not recorded" — never silence, which a reader would take for
     * a complete walk.
     */
    const legacy = { ...entryFrom({}) };
    delete (legacy as { coverage?: unknown }).coverage;
    const caveat = coverageCaveat(legacy);
    expect(caveat).not.toBe("");
    expect(caveat).toContain("not recorded");
    expect(caveat).toContain("not a claim that the walk was complete");
  });
});
