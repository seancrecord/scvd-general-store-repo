/**
 * THE DOCTRINE SENTENCE — one constant, every surface.
 *
 * From the founding through 2026-09-01 the store's refusal read
 * "never a score, a rating or a ranking" (and its cousins: "nothing
 * here is a score, a rating, or a ranking", "never a score or a
 * ranking"). On 2026-09-02 the keeper replaced it, in his words:
 *
 *   never a ranking, and never a verdict without its derivation and
 *   denominator beside it.
 *
 * What changed and what did not. Rankings stay forbidden — nothing on
 * this store ever orders one host against another. What is now in
 * scope is a DERIVED verdict with a published rule: a tier on a
 * passport that comes from the signed per-host rounds by arithmetic
 * anyone can redo, printed with the fraction it came from ("4 of 4,
 * W33–W36") and linking the rows. No ratio without its denominator;
 * no tier without its rows. The old sentence refused the division
 * itself; the new one refuses the division WITHOUT its working.
 *
 * Why. The old refusal was written when the only thing a ratio could
 * be was a number with nothing behind it — a trust score. A verdict
 * that carries its own rule, its own denominator and its own rows is
 * a different object: it is checkable in the same way every signed
 * observation here is checkable, and a reader who disagrees with the
 * rule can apply their own to the same rows. The store's own
 * per-host history had been publishing every row and refusing to
 * publish the one line a reader would derive first, which made the
 * reader do the arithmetic and take the blame for it.
 *
 * What does not resign. Signed corpus rows, snapshots and paid
 * artifacts that quote the old sentence keep their bytes. The new
 * sentence applies to what is signed from 2026-09-02 on.
 *
 * This file imports nothing so that every surface can import it.
 */

/** The day the keeper ruled it. */
export const DOCTRINE_DATED = "2026-09-02";

/** The sentence, lowercase, for the middle of a line. His words. */
export const NEVER_A_RANKING =
  "never a ranking, and never a verdict without its derivation and denominator beside it";

/** The sentence standing alone. */
export const NEVER_A_RANKING_SENTENCE =
  "Never a ranking, and never a verdict without its derivation and denominator beside it.";

/** The sentence the store retired, kept here so a test can hunt it. */
export const RETIRED_DOCTRINE_SENTENCE = "never a score, a rating or a ranking";

/**
 * Every form the retired doctrine took on a public surface. A test
 * walks the public surfaces and fails on any of these. Case-folded
 * by the test; listed here in the shapes they were actually written.
 */
export const RETIRED_DOCTRINE_FORMS: readonly string[] = [
  "never a score, a rating or a ranking",
  "never a score, a rating, or a ranking",
  "nothing here is a score, a rating, or a ranking",
  "nothing here is a score, a rating or a ranking",
  "never a score or a ranking",
  "never a score, never a rating, never a ranking",
  "not a score, a rating, or a ranking",
  "not a score, rating or ranking",
  "not a rating, a score, a ranking",
  "not a score, not a rating, not a ranking",
  "not a score, not a ranking",
  "never a score, a rating or a compliance verdict",
];

/** The note on /criteria: what changed, why, and what did not resign. */
export const DOCTRINE_NOTE = {
  dated: DOCTRINE_DATED,
  now: NEVER_A_RANKING_SENTENCE,
  was: "Never a score, a rating or a ranking.",
  what_changed:
    "Rankings stay forbidden: nothing on this store ever orders one host against another. Derived verdicts with a published rule are now in scope — a verdict that comes from the signed rows by arithmetic anyone can redo, printed with the fraction it came from and linking the rows it came from. No ratio without its denominator; no tier without its rows.",
  why: "The old sentence refused the division itself. It was written when the only thing a ratio could be was a number with nothing behind it. A verdict that carries its own rule, denominator and rows is checkable the way every signed observation here is checkable, and a reader who disagrees with the rule can apply their own to the same rows. The per-host history was publishing every row and refusing the one line a reader would derive first, which left the reader to do the arithmetic and carry the blame for it.",
  what_did_not_change:
    "Every verdict is still one dated observation that expires and is re-taken, or a derivation from those observations that says which ones. Nothing here is an endorsement, a warranty, a guarantee, or a claim about any operator. The gaps in our own coverage are still counted against us on the same surface as the findings.",
  what_keeps_its_bytes:
    "Signed corpus rows, snapshots and paid artifacts issued before this date that quote the old sentence keep their bytes and verify as issued. Nothing is resigned. The new sentence governs what is signed from this date on.",
  rule: "House rule 43, amended the same day.",
} as const;
