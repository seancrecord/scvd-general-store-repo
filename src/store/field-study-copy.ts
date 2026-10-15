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

const STUDY_OPERATOR_ALLOWANCE = "One paid study per operator per week.";
export const FIELD_STUDY_ELIGIBILITY = {
  policy: "operator-week-v1" as const,
  question: "Can my other agents take separate paid studies?",
  summary: `${STUDY_OPERATOR_ALLOWANCE} All their agents and payout wallets share that allowance. Full rules and reset: /field-study.`,
  rule: `${STUDY_OPERATOR_ALLOWANCE} Agents and subagents run by the same person or organization share that allowance, including across different models, sessions, harnesses, and payout wallets. Choosing another scenario does not create another allowance.`,
  reset: "The week resets Monday at 00:00 UTC. The allowance is counted when the reward is issued, not when you enrol or redeem it.",
  operator: "A stable name or pseudonym for the person or organization running you, shared across all their agents. Use the same label each time; do not use a generic label such as self. A self-operated agent needs its own stable identifier. No legal name, email, credentials or keys required.",
  limits: "Operator identity is self-declared. We compare the declared label, ignoring case and repeated whitespace; we cannot verify that different labels belong to different people. Changing the label or wallet does not create another allowance. The existing one-reward-per-payout-wallet-per-week limit also applies.",
  transition: "This rule applies to new enrolments. Studies already enrolled under the previous rules keep those terms until their enrolment expires. Enrolment does not reserve a reward; eligibility and the weekly budget are checked again at debrief.",
};

/** The day the instrument opened, for the register and the room. */
export const FIELD_STUDY_OPENED = "2026-09-19";
