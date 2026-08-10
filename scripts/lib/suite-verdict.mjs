/**
 * DID THE FRESHNESS SUITE ACTUALLY REACH A VERDICT?
 *
 * Pulled out of scripts/publish-skill.mjs so it can be tested, because
 * it was written wrong once already and the wrong answer is expensive
 * in a specific way: it tells the keeper his bundle is stale when the
 * bundle was never opened.
 *
 * THE TEST IS FOR A VERDICT, NOT FOR A CRASH. The first cut enumerated
 * failure modes — vitest's "Failed Suites" banner, its "no tests"
 * summary — and died on the first machine where vitest ITSELF was not
 * installed, since none of vitest's vocabulary appears when vitest
 * never starts. The ways a run can fail are unbounded and the ways it
 * can succeed are one: a summary line reading "Tests N failed" or
 * "Tests N passed". Anything else means nothing examined the bundle.
 *
 * Which also puts the burden the right way round. A guard that accuses
 * by default accuses when it is confused, and that is exactly when it
 * has the least right to.
 */

/** vitest's summary line, the only shape that means a run finished. */
const VERDICT = /Tests\s+\d+\s+(failed|passed)/;

/** Node and vitest both phrase an unresolvable import this way. */
const MISSING_PACKAGE = /Cannot find (package|module)/;

/**
 * @param {string} output combined stdout+stderr of the suite run
 * @returns {{ reachedAVerdict: boolean, missingPackage: boolean }}
 */
export function readSuiteOutcome(output) {
  const text = String(output ?? "");
  return {
    reachedAVerdict: VERDICT.test(text),
    missingPackage: MISSING_PACKAGE.test(text),
  };
}
