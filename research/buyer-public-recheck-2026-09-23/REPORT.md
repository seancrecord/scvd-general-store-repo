# Buyer public recheck — September 23, 2026

The three original discovery findings did not reproduce at their stated scope.
This run retained eight public surfaces, 539 unsigned input requests and 328
direct-link attempts, without loading a wallet or sending a payment.

- **BUY-040:** all 33 example pairs that quoted over both HTTP and MCP agree
  on x402 rails, also matching their OpenAPI and manifest declarations. A2A
  Repair Kit and Trust Profile refused their example targets on both doors;
  their empty offer sets are excluded, not credited as matching quotes.
- **BUY-042:** the published Attestation Bundle and Bitcoin Anchor examples
  quote literally through both doors. This closes this run's recheck of those
  two examples; it does not establish all-product example success.
- **BUY-044:** llms now points at the canonical signing-key URL, which answered
  200. It no longer links `/keys`. The retired alias was not tested.

## A comparator defect, preserved beside its correction

The original `comparison.json` reported 35 input contradictions. The served
OpenAPI schemas factor optional disclosure fields into a local `allOf` reference;
the collector ignored that reference. All fields were present in the captured
contract. The repaired comparator projects required names and property types,
length limits and enums through local references and `allOf`. It preserves
schema siblings, does not fetch remote references, and counts unresolved,
cyclic, over-budget or ambiguous compositions as missing evidence. It remains
a limited structural comparison, not a general JSON Schema equivalence check.

Both new collector regressions failed before the repair: a shared-schema
agreement was falsely contradictory and a missing reference was mislabeled.
Changed shared limits still produce contradictions. Additional controls cover
escaped pointer names, cycles, remote references, unsupported alternatives,
overlapping constraints, depth limits and inherited-property refusal.

The repaired comparator finds zero issues over the **same retained bytes**.
`comparison.json` remains the original output; `summary.json` records the
separate offline replay. No second acquisition or replacement clean score was
invented. The complete buyer regression command passes 239 tests locally. One sandboxed
run blocked the existing loopback HTTP fixture with EPERM (238 passed); the
permitted rerun is the complete passing result, not a waived test.

## Remaining gaps

All 539 input requests answered, without a transport failure or HTTP 5xx.
MCP errors commonly use HTTP 200; these are not counted as successful purchases.
Of 328 link attempts, 327 answered and one `/corpus/tiers.json` read timed out.
The original timeout remains a gap. There were no observed 404s or HTTP 5xx;
9 method refusals and 6 bad-input replies require their source context, not a
blanket dead-link verdict. Sixteen template occurrences remain unresolved.

No new cold cohort, recursive crawl, all-surface semantic comparison, complete
error-code battery, MPP parity measurement, settlement or fulfillment was
performed. B-WAVES remains open. No aggregate buyer score was generated without
a fresh cold-cohort and readiness review. This run spends zero USDC.

## Replay

`manifest.json` pins all original evidence files and the exact repaired
comparator, frozen as `comparator.mjs` so later collector edits cannot change
this replay. `reviewed-findings.json` references actual requests from this run.
The offline reader verifies retained hashes, replays the comparisons and derives
quote/link counts and findings:

```sh
node research/buyer-public-recheck-2026-09-23/review.mjs
```

Its output matches `summary.json`. Five retained files are stored as
lossless gzip; the manifest checks their decoded lengths and hashes. This
reader decompresses them directly. To use the original collectors' uncompressed
input format, unpack copies in a separate directory; keep this record intact. The comparator and Paywall guide changes
remain local; no commit, PR, push or deployment is part of this batch.
