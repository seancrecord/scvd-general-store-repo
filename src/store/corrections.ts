/**
 * THE CORRECTIONS RECORD — things this store said that were not true,
 * and what changed so each one cannot recur quietly.
 *
 * Filed as gap 3, published 2026-07-29 after CV validated it with one
 * requirement that shapes the whole artifact:
 *
 *   EVERY ENTRY MUST PAIR THE MISTAKE WITH THE STRUCTURAL FIX. A list
 *   of admissions with no corresponding hardening reads as "this keeps
 *   happening," not "this gets caught and fixed." An entry missing the
 *   second half either gets one before publishing or does not belong in
 *   the initial set. A test enforces it, because a rule in a file is
 *   not a test — which is itself the lesson of entry one.
 *
 * AND LEAD WITH MECHANISM, NOT CHRONOLOGY, also his: five corrections
 * dated inside one tight week can read as "launched in a hurry, still
 * finding bugs" to a suspicious reader. The same fact reads as a fast
 * feedback loop only if the mechanism is what goes first. So the page
 * opens on how things get caught and only then lists what was caught.
 *
 * WHY PUBLISH IT AT ALL: a store claiming zero mistakes across its
 * first week of live operation is making the implausible claim, not the
 * honest one. And age is the one objection this store cannot fix — an
 * outside risk scorer said so out loud, `review`, 63/100, on the
 * grounds that our address was six days old. A dated record of what we
 * got wrong is the asset a young store has that a polished one usually
 * does not.
 */

export interface Correction {
  /** ISO date the correction shipped. */
  date: string;
  /** What the store said or did that was not true. Plainly. */
  what_was_wrong: string;
  /** How long it was live, when we can say. Never softened. */
  how_long: string;
  /** Who found it. Outside eyes get named as outside eyes. */
  found_by: string;
  /**
   * THE REQUIRED HALF: what changed so it cannot recur silently. A
   * mechanism, not an intention. "We will be careful" is not a fix.
   */
  what_changed: string;
}

export const CORRECTIONS: readonly Correction[] = [
  {
    date: "2026-07-26",
    what_was_wrong:
      'Every surface of this store said refunds were "automatic." The code never did it. A refund here was always a person keeping his word, which is a fine promise and a different one.',
    how_long: "Live on every surface for five days.",
    found_by:
      "An outside model, repeating our own wording back to us. Nobody here noticed.",
    what_changed:
      "The wording now says what the code does. More importantly: every claim the store makes about itself is walked by a test in CI, so a promise the code cannot keep fails the build instead of shipping. That test exists because of this entry.",
  },
  {
    date: "2026-07-25",
    what_was_wrong:
      "Parameter guards fired BEFORE the payment gate, so an indexer asking a paid route what it cost got a 400 error instead of a price — and concluded we were not an x402 endpoint at all.",
    how_long: "Since the affected items were listed.",
    found_by:
      "A directory's probe report: three of six endpoints answered. The three that did not were ours to fix.",
    what_changed:
      "Guards moved behind the gate, and a test now asserts that an UNSIGNED request to any paid route gets a 402 with the terms stated rather than a 400. The store cannot again refuse to quote a price to something trying to read one.",
  },
  {
    date: "2026-07-28",
    what_was_wrong:
      'The census page told the keeper that "the decline reasons are on the desk." There was no desk. The reasons had been recorded since the instrument went in and nothing anywhere rendered them.',
    how_long: "From the day the census shipped until somebody went looking.",
    found_by:
      "The keeper, following our own instruction and hitting nothing.",
    what_changed:
      "The decline desk was built, and a test now asserts that every page promising a link actually links somewhere that exists. A sentence pointing at a page nobody built now fails the build.",
  },
  {
    date: "2026-07-28",
    what_was_wrong:
      "Five pages of the store's own back room had no way back to anything. Each rendered itself as the desk's tab, which draws the only link home as un-clickable bold, so landing on one left the keeper with the browser's back button.",
    how_long: "From the day each reading shipped.",
    found_by: "The keeper, unable to reach half his own office.",
    what_changed:
      "The navigation is now derived from one list rather than written per page, so a new page cannot be added without appearing in it. Four tests sweep every page: each reaches every other, each marks only itself, each keeps a way out.",
  },
  {
    date: "2026-07-29",
    what_was_wrong:
      'This store told visitors that "CI validates the catalog against it on every build," and told machine readers that field order was "validated in CI." There was no CI. Four hundred tests, run exclusively by hand.',
    how_long:
      "For as long as those sentences existed — the tests were always real, the sentence about when they run was not.",
    found_by:
      "Us, while working out how the keeper could publish a skill from a phone. Nobody was looking for it.",
    what_changed:
      "The claim was made true rather than softened: CI now runs the typecheck and the full suite on every push and every pull request. The sentence that was false is the sentence that now describes a workflow file.",
  },
] as const;

export const CORRECTIONS_STANDFIRST =
  "Things this store said that were not true, what found them, and what changed so each one cannot happen again quietly. Dated, in the open, and not summarised anywhere kinder.";

/** Mechanism first, per CV. Chronology alone reads as instability. */
export const CORRECTIONS_MECHANISM =
  "HOW THINGS GET CAUGHT HERE, which matters more than the list below: every claim this store makes about itself is walked by a test, and the build fails when a promise outruns the code. That machinery exists because of the first entry below rather than in spite of it — each correction added the check that would have caught it. So the honest way to read a growing list is not \"they keep breaking things\" but \"the loop is short and it is running.\" A store this young claiming a clean record would be making the less plausible claim.";

export const CORRECTIONS_SCOPE =
  "WHAT THIS IS NOT: a bug log. Ordinary defects get fixed and forgotten like anywhere else. This page is narrower and more uncomfortable — it is only for things the store SAID, on a surface somebody could read, that turned out not to be so. Every entry names what changed structurally; an admission without a mechanism behind it would read as an apology, and this store does not trade in those.";

export const CORRECTIONS_INVITATION =
  "If you find a sixth, the mailbox at /api/letter is free and a human reads it. A correction costs us nothing except the writing down, and the writing down is the point.";
