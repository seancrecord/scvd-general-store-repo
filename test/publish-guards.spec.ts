import { describe, expect, it } from "vitest";
// @ts-expect-error — a plain .mjs helper shared with the publish script,
// which has no types and needs none; the shape is asserted right here.
import { readSuiteOutcome } from "../scripts/lib/suite-verdict.mjs";

/**
 * THE GUARD THAT DECIDES WHETHER TO ACCUSE THE BUNDLE.
 *
 * scripts/publish-skill.mjs runs the freshness suite before it lets
 * bytes leave, and until 2026-08-10 it read ANY non-zero exit as "the
 * bundle does not match the shelf." Both live failures that day were
 * something else entirely — a missing @x402/svm, then a missing vitest
 * — and both sent the keeper to edit a file that was correct.
 *
 * The fixtures below are real output, pasted rather than imagined,
 * because the first fix was written against imagined output (it looked
 * for vitest's own words) and was wrong within the hour on a machine
 * where vitest never spoke at all.
 */

/** Real: 2026-08-10, stale node_modules missing @x402/svm. */
const CRASHED_ON_IMPORT = `
 FAIL  test/skill-bundle-freshness.spec.ts [ test/skill-bundle-freshness.spec.ts ]
Error: Cannot find package '@x402/svm/exact/server' imported from /Users/x/src/lib/payments.ts

 Test Files  1 failed (1)
      Tests  no tests
   Start at  10:41:49
   Duration  1.14s
`;

/** Real: 2026-08-10, a checkout with no node_modules at all. */
const VITEST_NEVER_STARTED = `
code: 'ERR_MODULE_NOT_FOUND'
Error: Cannot find package 'vitest' imported from /repo/noop.js
    at packageResolve (node:internal/modules/esm/resolve:768:81)
`;

/** What genuine drift looks like: the suite ran and disagreed. */
const REAL_DRIFT = `
 FAIL  test/skill-bundle-freshness.spec.ts > the bundle names every shelf
AssertionError: expected bundle to mention 'conformance_watch'

 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
`;

describe("the publish script only accuses the bundle when something read it", () => {
  it("does not blame the bundle when the suite died on an import", () => {
    const outcome = readSuiteOutcome(CRASHED_ON_IMPORT);
    expect(outcome.reachedAVerdict).toBe(false);
    expect(outcome.missingPackage).toBe(true);
  });

  /**
   * THE ONE THE FIRST FIX GOT WRONG. Looking for vitest's "Failed
   * Suites" banner works only while vitest is running; here it never
   * loaded, so the output contains none of its vocabulary and a
   * crash-shaped test falls through to the accusation.
   */
  it("does not blame the bundle when vitest itself never started", () => {
    const outcome = readSuiteOutcome(VITEST_NEVER_STARTED);
    expect(outcome.reachedAVerdict).toBe(false);
    expect(outcome.missingPackage).toBe(true);
  });

  it("does blame the bundle when the suite ran and disagreed", () => {
    const outcome = readSuiteOutcome(REAL_DRIFT);
    expect(outcome.reachedAVerdict).toBe(true);
  });

  /**
   * Empty output is the case with no evidence at all, and the answer
   * has to be "I could not tell" rather than "you are guilty."
   */
  it("treats silence as no verdict rather than a finding", () => {
    expect(readSuiteOutcome("").reachedAVerdict).toBe(false);
    expect(readSuiteOutcome(undefined).reachedAVerdict).toBe(false);
  });
});
