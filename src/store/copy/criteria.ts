import { DOCTRINE_DATED, NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";

/**
 * THE CRITERIA PAGE'S WORDS — rule 43's gate, and the keeper's ruling
 * on what retires a badge (2026-08-10: nothing does; it ages).
 *
 * Rule 43 ends: "No badge ships before its criteria page exists."
 * /becoming has said in public since 2026-07-30 that no criteria page
 * exists and nothing carries a badge — which made "we badge what's
 * safe" unshippable and this page the thing standing in front of it.
 *
 * Most of what a criteria page needs already existed under other
 * names: ARTIFACT_CLASSES carries trust_model / signs / does_not_prove
 * per class, and the preflight battery is published and versioned.
 * The one genuinely new piece was the keeper's to rule, and he ruled
 * it: a badge is a dated observation, never a live status. This file
 * holds only the words that are new; everything derivable is derived
 * at the route, per the rule that broke five things in one day once.
 */

/** The day the keeper ruled on badge retirement — the page's own date. */
export const CRITERIA_DATED = "2026-08-10";

export const CRITERIA_STANDFIRST =
  "What 'verified' means at this store: what gets checked, against which published criteria, what a verdict says, what it never says, and what happens when the thing changes. House rule 43 forbids any badge from shipping before this page exists — it existed first, and every mark this store serves ships against these terms. This page existing is not itself a badge, an endorsement, or a product.";

export const BADGE_IS =
  "A badge here would be a dated observation on a THING — a skill, a service, an endpoint — never a score on an actor. It says exactly this: as of a stated date, this artifact passed these named checks against this published criteria version. It is observation-shaped, never warranty-shaped. 'Ready' means the checks passed at that moment; it does not mean good, safe, reliable, or endorsed, and the copy on any badge this store ever ships is bound to that register by the same rule that wrote this page.";

/**
 * The keeper's ruling, verbatim in substance. This was the one part of
 * the page that could not be derived — nothing in canon answered what
 * retires a badge, and it is recorded here as ruled rather than
 * re-litigated.
 */
export const BADGE_RETIREMENT =
  "Nothing retires a badge. It ages. A badge is not a live status to revoke — it carries its own expiry by carrying its own date, and a reader weighs an old observation the way they weigh any old fact. If the thing changes, the badge does not change with it: a newer observation supersedes an older one by being newer, never by taking the old one down. Nobody is chased to remove anything, and nobody who relied on a dated observation is owed a retraction of it — the date was the disclosure. The question an aging badge cannot answer is 'is this still true', and this store sells the instrument that answers it: re-observation, on the record, at the same URL. A badge never answers it.";

export const NEVER_AN_ACTOR_SCORE =
  `${NEVER_A_RANKING_SENTENCE} That is rule 43's other half, amended ${DOCTRINE_DATED}, and it binds this page too. Individual dated observations are published because each one is a fact. A reading derived from them — ready in four of the last four rounds, say — is published only with the rule that made it (typed once, on this page), the fraction it came from, and the rows behind the fraction, so anyone can redo the arithmetic or apply a different rule to the same rows. A ratio printed alone is a verdict without its derivation, and the store does not print one. Nothing here is ever a ranking of one host against another, and nothing here is a score on an operator: a tier is a reading of a door's rounds, not a judgment of the person behind it.`;

/**
 * The verdict words a criteria-governed check may return. Observation
 * verdicts with the failing checks named — never a summary adjective.
 * 'Safe' is the most warranty-shaped word available and does not
 * appear in this vocabulary on purpose.
 */
export const VERDICT_VOCABULARY = [
  {
    verdict: "ready",
    means:
      "Every check in the named criteria version passed at the stated moment. Not an endorsement and not a prediction.",
  },
  {
    verdict: "not_ready",
    means:
      "One or more checks failed, and the failing checks are named on the artifact rather than collapsed into the label.",
  },
  {
    verdict: "unreachable",
    means:
      "The thing did not answer. A fact about one network path at one moment — it does not prove the endpoint is down.",
  },
  {
    verdict: "not_probed",
    means:
      "We did not look, and the record says so instead of saying nothing. Gaps are counted against the instrument, on the same page as the findings.",
  },
] as const;

export const CRITERIA_HONEST_LIMIT =
  "This page is the contract every badge on it ships against: the criteria version named on the artifact, the failing checks named on a miss, the date on everything, the gaps counted against us, and no score on any actor. If a badge this store issued ever violates a line on this page, the mailbox is free and the violation goes on /corrections with your name on it.";
