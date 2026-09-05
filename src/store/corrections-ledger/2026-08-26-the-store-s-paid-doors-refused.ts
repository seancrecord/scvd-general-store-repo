import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-26",
  what_was_wrong:
    "The store's paid doors refused valid payments that arrived under the header name X-PAYMENT — x402 v1's name for what v2 calls PAYMENT-SIGNATURE, and still what much of the live ecosystem sends. A buyer holding a correctly signed envelope got a 402 instead of their goods. The store then compounded it: when this was reported, the reporter was told the claim was false, on the strength of three places in our code that read both header names. None of those three accepts a payment. Two write a decline reason after the 402 is already decided and one decides whether pre-payment guards apply; the acceptance decision belongs to a layer below all of them. Call sites were read and mistaken for behaviour.",
  how_long:
    "Since the v2 migration, on every paid door. The store never measured how many buyers spoke the older name, so the number of refused sales is unknown and cannot now be recovered.",
  found_by:
    "CV reported it from live behaviour and was told he was mistaken. Cairn then settled it with half a cent: the identical envelope sent under both names on a cold walk, 402 under X-PAYMENT and settled under PAYMENT-SIGNATURE, published as a transcript.",
  what_changed:
    "The payment adapter now accepts the envelope under either name, and only that name aliases — a blanket fallback would be a guess nobody asked for. A test sends the same envelope under both headers and requires the same outcome, and separately requires that X-PAYMENT-SIGNATURE is NOT treated as an alias, so the shim cannot quietly widen. Nothing else changed: signature verification, schema validation and settlement are untouched, and PAYMENT-SIGNATURE remains what every surface asks for.",
};
