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

export type { Correction } from "./corrections-ledger/types";
/** Derived from src/store/corrections-ledger/, newest first. Regenerate: npm run corrections:index. */
export { CORRECTIONS } from "./corrections-ledger/index";


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

/**
 * WHAT THE RECORD CANNOT SHOW YOU (AT_SCALE rule 5b), added
 * 2026-08-02 during the sweep that asked every published verdict what
 * it would look like if the thing it measures failed silently.
 *
 * This one had the answer the page could least afford: the list above
 * is a hand-written array in this file. NOTHING writes to it. The
 * delivery audit and the chain walk raise ALERTS — that is all they
 * do, deliberately, because rule 30 says nothing publishes without a
 * hand — and the distance between an alert firing and an entry
 * appearing here is a person remembering.
 *
 * That is the correct design and the wrong silence. A reader has no
 * way to tell a quiet week from an unwritten one, and the paragraph
 * above about "the loop is short and it is running" describes the
 * DETECTION half while reading as a claim about the whole loop.
 *
 * Found while checking a sentence I had written on /try earlier the
 * same day, which said findings are "published at /corrections" as
 * though that step were mechanical. It is not, and the page that
 * would have to carry the consequence should say so first.
 */
export const CORRECTIONS_HAND_KEPT =
  "WHAT THIS RECORD CANNOT SHOW YOU: the entries below are written by hand. Detection is largely automatic — a delivery audit looks for settlements with no artifact behind them, an hourly walk compares our books against Base itself, and the build fails when a claim outruns the code — but every one of those raises an ALERT to a person, and a person then writes the entry. Nothing on this page is machine-generated, on purpose: a store that could auto-publish its own corrections could auto-phrase them. So read a quiet stretch carefully. It means nobody wrote anything down, which is usually because nothing happened and is not the same statement. The gap between the two is a human being, and if you want to check that human rather than trust him, the artifacts are signed and the chain is public: our books can be walked against Base by anyone, without asking us.";

/**
 * HOW TO READ THIS RECORD (F30, 2026-09-03, an outside reviewer's ask
 * the keeper carried in): the one paragraph a stranger needs before
 * the ledger, so a long list reads as what it is — a public,
 * falsifiable quality system — rather than as a lot of errors.
 */
export const CORRECTIONS_HOW_TO_READ =
  "HOW TO READ THIS RECORD: each entry is one thing this store said that was not true, dated the day it was found, with how long it stood, who found it, and the mechanism that changed so it cannot recur quietly. What qualifies is a published claim that was false or overstated, not a bug nobody could have read; a bug that never reached a claim is a commit, not an entry. Entries are never edited after publication; a correction to a correction is a new entry under a new date, and the old one stands. Outside reports are credited as outside reports. Nothing here is summarised anywhere kinder, and the count going up is the system working.";

export const CORRECTIONS_INVITATION =
  "If you find another, the mailbox at /api/letter is free and a human reads it. A correction costs us nothing except the writing down, and the writing down is the point.";

/**
 * The forwarding pointer every evidence surface carries (outside
 * review, 2026-08-27): signed history cannot be retro-edited, so
 * discoverability runs the other way — any reader standing on a
 * claim is one hop from the record of what later proved wrong. One
 * constant, one wording, every surface (the standing check is
 * test/corrections-forwarding.spec.ts).
 */
export const CORRECTIONS_POINTER =
  "Things this store said that later proved wrong live at /corrections — dated, with what changed so each cannot recur quietly. If a claim on this surface was ever corrected, that is where the correction stands.";
