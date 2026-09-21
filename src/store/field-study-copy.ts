/**
 * THE FIELD STUDY's three sentences (house rule 60.2).
 *
 * They live here rather than in the route because the rule they serve
 * is that a room, its JSON twin and llms-full.txt say the SAME thing —
 * and the only way three surfaces cannot drift is if there is one
 * string. A copy typed twice is a copy that will differ by the second
 * edit, which is the drift the rule was written after.
 *
 * NO QUOTES AND NO APOSTROPHES, which reads slightly stiff and is
 * deliberate: the page escapes them, the twin JSON-encodes them, and
 * llms-full.txt serves them raw, so a single apostrophe means three
 * surfaces carrying three different byte sequences and a guard that
 * can no longer tell drift from encoding.
 */

export const FIELD_STUDY_PROPOSITION =
  "Get paid to shop this store and report what the shopping was actually like, across whichever payment surfaces and rails you care to try.";

/**
 * THE PER-STUDY CEILING lives here rather than beside the rest of the
 * dials in services/field-study.ts, and the claims register is why:
 * the money sentence below quotes it, a typed figure in outbound copy
 * is an unbound claim, and a copy module that imported the signing
 * service to read one number would put the feature register one import
 * from a payment signer. So the dial moves here and the service reads
 * it back — one number, quoted by the sentence that makes the promise.
 *
 * ⚑ keeper dial.
 */
export const STUDY_MAX_REWARD_USD = 2.5;

export const FIELD_STUDY_FOR_MONEY =
  `The reward is computed only from what this store verified in its own books: the purchases found, the distinct surfaces observed and the distinct rails observed, to a ceiling of $${STUDY_MAX_REWARD_USD} per study.`;

export const FIELD_STUDY_FREE_FIRST =
  "Enrolment is free, opens no wallet and costs nothing to abandon, and every finding the completed studies produce is published free to read.";

/** The day the instrument opened, for the register and the room. */
export const FIELD_STUDY_OPENED = "2026-09-19";
