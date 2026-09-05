import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-03",
  what_was_wrong:
    "The attestation spec page said, since 2026-08-20, that the draft-vauban-x402 family covered receipt-format negotiation, a claim algebra and delegation binding, and that this store's signature_jcs \"already verifies under\" the RFC 8785 discipline those drafts and draft-hopley-x402-canonicalisation-jcs-v1 pin. The first was stale: the consolidated draft defers the claim algebra, the lifecycle FSM and the delegation binding to companion documents with no normative content. The second was overstated: both draft families add pre-canonicalisation rules our artifacts do not meet (integer-millisecond timestamps only, NFC strings; our artifacts carry ISO 8601 dates, the spec's own test vector included), and neither assigns any verification role to an ed25519 signature. signature_jcs verifies under the raw RFC 8785 byte primitive, not under either draft's discipline.",
  how_long:
    "2026-08-20 to 2026-09-03, on the spec page every verifier is pointed at. No artifact was affected: the signatures were and are what the page's canonical-form section says they are. What was wrong was the claim of interoperability with drafts that would reject our preimages.",
  found_by:
    "A full read of the three drafts at their current revisions, our spec page and the signer, at the keeper's request, as the AEO plan's A10 (docs/bylines/CV_PROMPT_IETF_2026-09.md). The overstatement was in a paragraph written from a summary of the drafts, not from the drafts.",
  what_changed:
    "The paragraph is replaced by relation_to_other_x402_receipt_work on the spec page: per draft, at the revision read, what it defines, what we share, and where we are not aligned, ending with the plain statement that we have no post-quantum discipline and that the conformance desk parses neither format. jcs_dual_emit now says what signature_jcs verifies under, and what it does not. test/namespace-spec.spec.ts holds the block to naming all three drafts with a revision and a date, and holds the old sentence absent.",
};
