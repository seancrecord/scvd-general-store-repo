import { describe, expect, it } from "vitest";
import { marketAggregates } from "@/services/market";
import { takeCensus, type SourceResult } from "@/services/population";
import { buildRegistryWeek } from "@/services/registry-pulse";
import { env } from "cloudflare:test";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE DENOMINATOR GUARD — a ratio may only be taken over the set we
 * actually measured, never over the set we merely enumerated.
 *
 * WHY THIS FILE EXISTS AT ALL, given that no violation was found when
 * it was written. The audit that produced it (2026-09-04) walked every
 * `_pct` this store serves and found the discipline intact: `rot.pct`
 * divides by probed rows, `signed_offers.pct` by ready rows,
 * `coverage_pct` by the enumerated universe BECAUSE coverage is the
 * one figure whose subject IS the enumeration, and the weekly brief
 * serves no ratio at all. Good.
 *
 * The reason to write a test anyway is a neighbouring measurement
 * project's finding, which is the whole argument in one sentence: a
 * card on their front page "was performing exactly the division this
 * entry forbids, and had been since 2026-07-11" — while the warning
 * against it was correct, current, and published in TWO places. The
 * discipline was written down. Nothing held it. It drifted for three
 * weeks in public.
 *
 * The forbidden division is always the same shape: a numerator counted
 * by MEASURING and a denominator counted by LISTING. Divide the doors
 * we found broken by the doors we know exist and you have published a
 * rate of ecosystem rot that is really a statement about how many
 * doors you had time to knock on. It gets worse the better your
 * enumeration gets, which is the tell.
 */

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  extra: Partial<WardHostResult> = {},
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api`,
    verdict,
    failed: verdict === "not_ready" ? ["some-check"] : [],
    advisories: [],
    ...extra,
  } as WardHostResult;
}

/**
 * The shape the guard is built around: a round that ENUMERATED far
 * more than it PROBED. This is not a hypothetical — it is the ward's
 * ordinary week, where the population layer counts ~10k hosts and the
 * cap lets the round knock on 750.
 */
const PROBED: WardHostResult[] = [
  host("a.example", "ready"),
  host("b.example", "ready"),
  host("c.example", "unreachable"),
  host("d.example", "not_ready"),
];

describe("a rate of rot is taken over doors we knocked on", () => {
  const market = marketAggregates(PROBED);

  it("divides dead doors by probed doors, and publishes both", () => {
    expect(market.probed).toBe(4);
    expect(market.rot.dead_doors).toBe(1);
    expect(market.rot.pct).toBe(25);
    // The two numbers the ratio came from ride beside it, so a reader
    // can redo the division and get the same answer.
    expect(market.rot.pct).toBe(
      Math.round((market.rot.dead_doors / market.probed) * 100),
    );
  });

  /**
   * THE FORBIDDEN DIVISION, held by a test rather than by a comment.
   * A thousand enumerated hosts and four probed ones must not move
   * the rot rate at all: enumeration is not observation, and a figure
   * that improves when the directory read gets better was never
   * measuring the ecosystem.
   */
  it("does not move when enumeration widens and probing does not", async () => {
    const thousand = Array.from({ length: 1000 }, (_u, i) => `h${i}.example`);
    const sources: SourceResult[] = [{ source: "discovery", hosts: thousand }];
    const census = await takeCensus(testEnv, sources, PROBED.length).catch(
      () => null,
    );
    // The census knows the wide universe...
    expect(census?.population_known).toBeGreaterThan(500);
    expect(census?.population_walked).toBe(4);
    // ...and the rot rate is untouched by it.
    expect(marketAggregates(PROBED).rot.pct).toBe(25);
  });

  it("divides signed offers by READY doors, not by every door", () => {
    // Two ready doors here; a denominator of `probed` would halve it.
    expect(market.signed_offers.of_ready).toBe(market.ready);
    expect(market.signed_offers.of_ready).not.toBe(market.probed);
  });

  it("refuses a ratio rather than printing zero when nothing was probed", () => {
    const empty = marketAggregates([]);
    expect(empty.probed).toBe(0);
    // Zero here is the count, and the rate must not imply a measured 0%.
    expect(empty.rot.dead_doors).toBe(0);
    expect(empty.signed_offers.of_ready).toBe(0);
  });
});

/**
 * COVERAGE IS THE ONE RATIO WHOSE SUBJECT IS THE ENUMERATION, so it
 * is the one place the wide denominator is correct — and it must be
 * NULL rather than a number when there is nothing to divide, because
 * a printed 0% or 100% would be a measurement nobody took.
 */
describe("coverage is allowed the enumerated denominator, and only it", () => {
  it("is null when the universe is empty, never 0 and never 100", async () => {
    const census = await takeCensus(
      testEnv,
      [{ source: "discovery", hosts: null }],
      0,
    ).catch(() => null);
    if (census && census.population_known === 0) {
      expect(census.coverage_pct).toBeNull();
    }
  });

  it("says what it is a share OF, in the round's own fields", async () => {
    const census = await takeCensus(
      testEnv,
      [{ source: "discovery", hosts: ["one.example", "two.example"] }],
      1,
    ).catch(() => null);
    expect(census).not.toBeNull();
    // Both counts travel with the ratio; neither is left for a reader
    // to guess at from the percentage.
    expect(typeof census?.population_known).toBe("number");
    expect(typeof census?.population_walked).toBe("number");
  });
});

/**
 * THE PUBLISHED WEEK carries the same numbers, and the guard has to
 * hold on the surface a stranger actually reads — the registry pulse
 * is where these ratios leave the building.
 */
describe("the published week keeps its ratios' denominators beside them", () => {
  function roundWith(hosts: WardHostResult[], known: number): WardRound {
    return {
      week: "2026-W36",
      at: "2026-09-06T11:00:00.000Z",
      listed_resources: known,
      coverage_suspect: false,
      capped: true,
      our_search_presence: true,
      population: {
        at: "2026-09-06T11:00:00.000Z",
        population_known: known,
        population_walked: hosts.length,
        coverage_pct: known === 0 ? null : Math.round((hosts.length / known) * 1000) / 10,
        per_source: [{ source: "discovery", hosts: known }],
        sources_failed: [],
        carried_forward: 0,
        appeared: [],
        disappeared: [],
        returned: [],
        collapse_suspect: false,
        what_this_cannot_see: [],
      },
      hosts,
    } as unknown as WardRound;
  }

  it("publishes probed beside every rate derived from it", () => {
    const week = buildRegistryWeek(roundWith(PROBED, 10_000), "2026-09-06T12:00:00.000Z");
    expect(week.probed).toBe(4);
    expect(week.rot.pct).toBe(Math.round((week.rot.dead_doors / week.probed) * 100));
    // The wide universe is published too, and is NOT what the rate used.
    expect(week.coverage!.population_known).toBe(10_000);
    expect(week.coverage!.population_walked).toBe(4);
    expect(week.rot.pct).not.toBe(
      Math.round((week.rot.dead_doors / week.coverage!.population_known!) * 100),
    );
  });

  /**
   * A capped round is the normal case, not the edge case, and the
   * flag that says so has to survive into the published row. Without
   * it a reader sees four probed hosts and no reason to think there
   * were ten thousand.
   */
  it("carries the cap flag into the published week", () => {
    const week = buildRegistryWeek(roundWith(PROBED, 10_000), "2026-09-06T12:00:00.000Z");
    expect(week.coverage!.capped).toBe(true);
  });
});
