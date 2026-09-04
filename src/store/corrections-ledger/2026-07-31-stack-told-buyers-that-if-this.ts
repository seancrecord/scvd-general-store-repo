import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-31",
  what_was_wrong:
    "/stack told buyers that if this store's signing key were lost, \u201Cevery artifact ever issued becomes unverifiable.\u201D That was never true, and it was the scarier half of the sentence. The public key and the exact signed bytes are already published and already copied — out of our hands by design — so anything signed stays checkable by whoever holds it whatever happens to us. What a lost key actually costs is the FUTURE: nothing new could ever join the record. The same entry also said the key had \u201Cno substitute and no recovery,\u201D which stopped being true the day a paper backup existed. And separately, /attestation's statement of exactly which fields a certificate signature covers was a hand-written list that had fallen a day behind the code — it omitted made_by, then the five payment fields, on the one page whose whole job is telling a reader which bytes are covered.",
  how_long:
    "The unverifiable claim: since /stack was published on 2026-07-29, three days. The stale field list: about a day, from when made_by shipped.",
  found_by:
    "Ourselves, on a deliberate read-every-page pass the keeper asked for after a run of small nuanced slips. Notably NOT by a test: every claim here was prose, and prose about code is the category with no compiler.",
  what_changed:
    "Both fixed, and both structurally rather than by editing a sentence. The field list on /attestation is now DERIVED from the same CERT_FIELDS array the signing code walks, so the page cannot describe a different set than the one being signed, and a test fails the build if any signed field goes unmentioned. The /stack entry now says what a lost key actually costs, states that recovery covers loss and not theft, and points at key_history. The lesson recorded rather than the instance: a prose list beside a code list is two sources of truth for one fact, which is the same defect as a hand-typed rotation count and a hand-typed \u201Cnever rotated\u201D line, both of which broke the same week.",
};
