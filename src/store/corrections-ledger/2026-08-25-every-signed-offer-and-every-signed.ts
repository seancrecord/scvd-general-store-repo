import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-25",
  what_was_wrong:
    "Every signed offer and every signed receipt this store issued carried a `payload` field. The x402 Signed Offers and Receipts spec permits `payload` for EIP-712 only and says it MUST be omitted for JWS, which is the format we emit — so the store published a MUST-level conformance violation on every paid door, while selling conformance checking of other people's offers and receipts. The envelope also described `acceptIndex` as binding the offer to a rail; it is not part of the signed payload and must not be relied on for that.",
  how_long:
    "From when signed offers shipped until 2026-08-25, on every paid door.",
  found_by:
    "Our own reading of the spec, and only barely. The investigation that led there was about header SIZE, and the argument for dropping the field was that nothing was lost by removing a duplicate — true, mechanically, and silent on whether the wire format permitted it. Reading the spec is what turned a tidying into a defect, and it is what found the receipt half, which no byte-counting argument would ever have reached.",
  what_changed:
    "The field is gone from both envelopes and the acceptIndex claim is corrected in the text that describes it. Conformance tests now assert the envelope shape against the spec rather than against what the code already emitted — the earlier tests passed because they required the violation.",
};
