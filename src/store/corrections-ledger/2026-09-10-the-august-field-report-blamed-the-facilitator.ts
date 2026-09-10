import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-10",
  what_was_wrong:
    "The August field report — 1,707 paid attempts against 1,589 x402 domains, published 2026-08-19 and linked from every walkabout report since — called its largest failure bucket, 'Payment failed: 400', a case where 'the payment is signed per spec but the facilitator rejects it', and on that basis named facilitator rejection the ecosystem's number one friction point. The stored response bodies do not support that. Sorted by what each 400 body says: 276 of the 616 (44.8%) name a missing or invalid request input, 250 (40.6%) carry no body at all, 50 (8.1%) are a usage hint, and 40 (6.5%) mention payment, signature, nonce or authorization in any form. The report also stated the bucket as 667, which added 51 rows where the unpaid probe itself answered 400 to the 616 that answered 400 after a signed payment. The corrected reading: most of these are doors refusing a request that was malformed before payment was considered, because the x402 challenge has no field for required inputs and the walker sent none — the inputs-undeclared class. The defect vocabulary had already named that class 'the largest single cause of refused purchases at otherwise-working endpoints in the August 2026 field run'; the report and the vocabulary disagreed about the same data for three weeks and nothing compared them.",
  how_long:
    "From 2026-08-19 to 2026-09-08, in the field report's sections 3 and 6, in the reports page that links it, and in at least one draft byline built on the sentence. The 'facilitator rejection' framing was repeated in this store's own buyer guidance for that period.",
  found_by:
    "The desk, drafting a byline on the 400 figure on 2026-09-08 and reading the ledger's body_preview column before quoting the sentence. Not found by any test: the report's numbers were typed, not derived, and nothing walked the ledger against the prose.",
  what_changed:
    "The field report carries a dated correction block above the section it withdraws, with the original text left standing beneath it. scripts/four-hundred-buckets.mjs re-derives the four buckets from the ledger, and scripts/four-hundred-buckets.test.mjs (npm run four-hundred:test) runs it against research/field-run-2026-08-18/ledger.jsonl and fails if the counts drift from the ones this entry states — so the correction's own numbers are walked, which the original report's never were.",
};
