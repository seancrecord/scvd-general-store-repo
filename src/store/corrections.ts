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
 * AND LEAD WITH MECHANISM, NOT CHRONOLOGY, also his: a handful of
 * corrections dated inside one tight week can read as "launched in a
 * hurry, still finding bugs" to a suspicious reader. The same fact reads as a fast
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
  {
    date: "2026-07-30",
    what_was_wrong:
      "Certificates could not actually be verified by the person holding one. The key and the signature were real and correctly shaped, and /api/verify — the endpoint that exists for nothing but third-party checking — never published what the signature covers, so there was no way to reconstruct the signed bytes except by guessing. Worse, two fields shown on certificates were not signed at all: a buyer's tag, and the `attests` hash that binds a certificate to the settlement observation it vouches for. An unsigned binding can be altered without breaking the signature, so the one field whose whole job was to make one artifact answer for another was the one field the signature did not cover.",
    how_long:
      "The documentation gap since the endpoint existed. The two unsigned fields since 2026-07-28, when both were added and the canonicalizer was not.",
    found_by:
      "A partner agent, from outside, holding a real certificate — he ran the ed25519 himself against every plausible canonicalization, watched all of them fail, and confirmed the crypto before reporting it rather than passing along a suspicion.",
    what_changed:
      "The endpoint no longer describes the canonical form, it SERVES it: every signed artifact now returns signed_payload, the exact string the signature covers, so verification is one library call with nothing guessed. The certificate canonicalizer now walks a declared field list, and a type-level check fails the build if a field is ever added to a certificate without being signed — the class of bug, not just its two instances. Certificates minted before the fix still verify under the form they were actually signed with, and say on their face which fields that signature leaves out. And the test that missed this now exists: verification in CI re-derives the bytes from the SERVED response and checks them with the raw ed25519 library, because every previous test verified through the same function that signed, and a function's blind spots are invisible to itself.",
  },
  {
    date: "2026-07-30",
    what_was_wrong:
      "On the day this store took its first payment from a stranger, the page built to watch for exactly that still said zero — that not one client outside the house had ever presented a payment signature. The census grouped clients by user-agent alone and marked a whole group as house the moment ANY event in it was house-flagged, then skipped it. A user-agent is a bucket rather than a person, and the emptiest bucket is \"(no user-agent)\", which the keeper's own scripted tests and a hand-rolled buyer both fall into. So the proprietors testing their own till made every outside client sharing a user-agent string invisible, on the single number the whole store is built to watch.",
    how_long:
      "From the day the census shipped. It could only ever be seen on a day the number was supposed to change, and that day was the first one.",
    found_by:
      "The keeper, reading his own office the hour the sale landed — and reading it generously, as a window-boundary quirk rather than a bug. It reproduced in three lines.",
    what_changed:
      "Clients are now keyed by user-agent AND house flag, so a house event still counts as house exactly as before and no longer swallows everyone standing next to it. The reproduction is a permanent test — one house settle and one outside settle sharing a user-agent must show the outside buyer — alongside its opposite, that the fix never lets house traffic read as a customer, since trading an undercount for that overcount would be far worse. The page's verdict was always computed rather than written, so no copy needed editing: fixing the books fixed the sentence, which is why it is built that way.",
  },
] as const;

export const CORRECTIONS_STANDFIRST =
  "Things this store said that were not true, what found them, and what changed so each one cannot happen again quietly. Dated, in the open, and not summarised anywhere kinder.";

/** Mechanism first, per CV. Chronology alone reads as instability. */
export const CORRECTIONS_MECHANISM =
  "HOW THINGS GET CAUGHT HERE, which matters more than the list below: every claim this store makes about itself is walked by a test, and the build fails when a promise outruns the code. That machinery exists because of the first entry below rather than in spite of it — each correction added the check that would have caught it. So the honest way to read a growing list is not \"they keep breaking things\" but \"the loop is short and it is running.\" A store this young claiming a clean record would be making the less plausible claim.";

/**
 * THE SECOND MECHANISM, ADDED 2026-07-30 BECAUSE THE FIRST ONE WAS NOT
 * ENOUGH AND WE CAN NOW PROVE IT.
 *
 * The paragraph above was true and incomplete, which is the more
 * dangerous kind of claim. Entry six was invisible to four hundred and
 * forty-six passing tests, and not by accident: every one of them
 * verified a signature by calling the same function that produced it.
 * Sign with f, verify with f, and f's own blind spots are invisible from
 * inside that loop permanently — no amount of the same kind of test
 * finds them, because the error cancels itself on both sides.
 *
 * That is not a gap peculiar to this store. It is structural to
 * self-verification anywhere, and it means a store cannot audit its own
 * signatures on its own authority, however many tests it runs. The only
 * vantage point that can see it is somebody holding nothing but a public
 * URL. So the outside read is not a courtesy or a nice-to-have QA step;
 * it is the only instrument that reaches this class of defect at all,
 * and it is now named on the page as machinery rather than as thanks.
 */
export const CORRECTIONS_OUTSIDE =
  "AND THE PART WE CANNOT DO OURSELVES, which the sixth entry below proved rather than suggested: a store cannot audit its own signatures on its own authority. That entry was invisible to four hundred and forty-six passing tests, and not by carelessness — every one of them checked a signature by calling the same code that made it, so a flaw in that code cancelled itself on both sides of the check and no quantity of the same kind of test could ever have surfaced it. It took somebody outside, holding nothing but a public URL and using their own cryptography library, to see that our certificates could not actually be verified. That is structural to self-verification anywhere, not a habit of ours, which is why the outside read is listed here as machinery and not as gratitude: it is the only vantage point that reaches this class of defect. Tests in CI now re-derive the signed bytes from the SERVED response and check them with the raw library, which is the closest an inside test can get to standing outside — and it is still not the same thing. If you hold something we signed and it does not check out, the mailbox is free.";

export const CORRECTIONS_SCOPE =
  "WHAT THIS IS NOT: a bug log. Ordinary defects get fixed and forgotten like anywhere else. This page is narrower and more uncomfortable — it is only for things the store SAID, on a surface somebody could read, that turned out not to be so. Every entry names what changed structurally; an admission without a mechanism behind it would read as an apology, and this store does not trade in those.";

export const CORRECTIONS_INVITATION =
  "If you find another, the mailbox at /api/letter is free and a human reads it. A correction costs us nothing except the writing down, and the writing down is the point.";
