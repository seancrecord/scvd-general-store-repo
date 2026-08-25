import { describe, expect, it } from "vitest";

/**
 * HOUSE RULE: A LOOKUP THAT CANNOT SEE EVERYTHING MUST NOT ANSWER "NO".
 *
 * This file is the check behind that rule, because rule 35 says a rule
 * with no check gets retracted in public.
 *
 * SIX INSTANCES IN ONE DAY, 2026-08-25, every one the same shape — a
 * measurement that could not see everything reporting as though it
 * could:
 *
 *   1. The census published `ready` for doors it never pay-checked;
 *      ward-round calls the offline battery and checkRailReceivable is
 *      reachable only from preflight.
 *   2. /rails published `rail_not_recorded: 0` — the field that exists
 *      to say "we do not know" answering zero.
 *   3. /pulse published 33 organic settlements while /stats and /rails
 *      said 14; the house reclassification was applied in one reader
 *      and not the other.
 *   4. test/offer-receipt.spec.ts asserted `offer.payload.*`, so
 *      passing REQUIRED the spec violation it should have caught.
 *   5. Two drafts of the header-budget guard went green against a live
 *      defect, because this test worker cannot reach production's
 *      challenge size.
 *   6. The published latency histogram timed only successful 402s, so
 *      its percentiles excluded our own failures without saying so.
 *
 * The mechanical form is always a BOUNDED READ whose incompleteness is
 * never asked about. `listKeys` takes a cap and returns `truncated`
 * beside its names; a caller that never reads that flag has answered a
 * question it did not ask.
 *
 * WHAT THIS CHECK CANNOT SEE, stated here because the rule applies to
 * its own enforcement first. It works per FILE, not per call site: a
 * file that handles truncation for one `listKeys` call and silently
 * drops it for a second passes this check. Catching that needs a
 * parser and a scope analysis, which is a bigger claim than this file
 * makes. The baseline below is therefore a floor on the problem, not a
 * census of it — exactly the distinction the rule is about.
 */

const SOURCES = import.meta.glob("../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The escape hatch, and it has to be said in the code to count. */
const SAFE_MARKER = "BOUNDED-READ-SAFE:";

/**
 * Files that call `listKeys` and never mention `truncated`, as of
 * 2026-08-25. Recorded rather than fixed: some of these caps are
 * provably above any possible key count, and some results never reach
 * a published figure. Calling all of them defects would be its own
 * overclaim — the point of writing them down is that the question now
 * has to be answered once, in the code, per file.
 *
 * THIS LIST ONLY SHRINKS. A new entry means somebody added a bounded
 * read without deciding what happens when it truncates.
 */
const KNOWN_UNACKNOWLEDGED = [
  "../src/lib/alerts.ts",
  "../src/lib/bazaar-observer.ts",
  "../src/lib/referrals.ts",
  "../src/services/almanac-store.ts",
  "../src/services/bounty-board.ts",
  "../src/services/closers.ts",
  "../src/services/confessions.ts",
  "../src/services/corpus.ts",
  "../src/services/gazette.ts",
  "../src/services/grudges.ts",
  "../src/services/guestbook.ts",
  "../src/services/letters.ts",
  "../src/services/orders.ts",
  "../src/services/patron-anchors.ts",
  "../src/services/payer-repair.ts",
  "../src/services/phantom.ts",
  "../src/services/refunds.ts",
  "../src/services/requests.ts",
  "../src/services/stats.ts",
  "../src/services/stock.ts",
  "../src/services/tips.ts",
  "../src/services/train.ts",
  "../src/services/trust-profile.ts",
  "../src/services/watch-sweep.ts",
];

function callSites(source: string): number {
  return source.split("listKeys(").length - 1;
}

describe("a lookup that cannot see everything must not answer no", () => {
  /**
   * THE NON-VACUITY CLAUSE, and it exists because three guards written
   * on the same day as this one went green having measured nothing. A
   * check whose walker silently found no files would report a clean
   * sheet, which is the precise failure this rule names. So the walk
   * proves itself before it judges anything.
   */
  it("actually walked the source it claims to have walked", () => {
    const files = Object.keys(SOURCES);
    expect(files.length, "the source glob found nothing").toBeGreaterThan(150);
    const total = Object.values(SOURCES).reduce(
      (sum, source) => sum + callSites(source),
      0,
    );
    expect(
      total,
      "found no bounded reads at all — the pattern this file matches must have changed",
    ).toBeGreaterThan(40);
  });

  it("every file with a bounded read has decided what truncation means", () => {
    const unacknowledged = Object.entries(SOURCES)
      .filter(([, source]) => callSites(source) > 0)
      .filter(
        ([, source]) =>
          !source.includes("truncated") && !source.includes(SAFE_MARKER),
      )
      .map(([path]) => path)
      .sort();

    /*
     * Reported as a set difference in both directions, on purpose. A
     * plain subset assertion would let the list rot: a file that got
     * fixed would sit here forever, and the next reader would trust a
     * baseline describing a repo that no longer exists.
     */
    const added = unacknowledged.filter(
      (path) => !KNOWN_UNACKNOWLEDGED.includes(path),
    );
    expect(
      added,
      "a new bounded read that never asks whether it saw everything — read the flag, or mark the call BOUNDED-READ-SAFE: <reason>",
    ).toEqual([]);

    const fixed = KNOWN_UNACKNOWLEDGED.filter(
      (path) => !unacknowledged.includes(path),
    );
    expect(
      fixed,
      "these are acknowledged now — take them out of KNOWN_UNACKNOWLEDGED so the baseline keeps meaning something",
    ).toEqual([]);
  });
});
