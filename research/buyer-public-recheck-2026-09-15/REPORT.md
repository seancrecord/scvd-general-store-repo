# Public buyer recheck — September 15, 2026

A fresh unsigned run collected **8 public discovery surfaces**, exercised **539 HTTP/default-MCP input cases**, and requested **352 direct links or concrete OpenAPI paths**. It spent **0 USDC**, loaded no wallet and submitted no payment. Snapshot acquisition ran from 2026-09-15T15:35:23.646Z through 2026-09-15T15:35:25.717Z; later requests carry their own timestamps. This observes deployed production separately from the local wallet-recovery repair.

## What this run establishes

- The 35 menu items agree with the x402 manifest on the compared price tiers, fulfillment, normalized input fields and full item spec. OpenAPI agrees on price tiers and the current input schema's required fields, property names, types, max/min lengths and enums. The reviewed comparator finds **0 contradictions in that bounded comparison**.
- The input battery recorded no 5xx or transport failure. All MCP HTTP responses were 200, including protocol-level quotes and refusals; HTTP 200 is not scored as a purchase success. Of 70 requests carrying published example inputs, 66 returned payment terms. A2A Repair Kit and Trust Profile refused their placeholder/precondition examples over both doors before payment. Their responses explain unsupported setup or missing census evidence. This review does not claim the placeholder inputs are ready to buy with or that these preconditions have been satisfied.
- The direct crawl found no 5xx, transport failure or 401/403. Its nine 404s all contain unsubstituted template variables. Source inspection found template instructions such as `/api/order/{order_id}` and `/corpus/month/{YYYY-MM}`; no concrete 404 URL was observed in this set. GET requests against documented POST routes and missing-argument requests are not treated as dead endpoints. Forty 402 responses are payment terms, not a generic server failure.

## Benchmark defects exposed

**B-BCOLLECT — comparator drift, open in the primary collector.** Raw `comparison.json` reports 35 OpenAPI input differences because `scripts/buyer-wave-one.mjs` reads only `x-request-schema`. These public snapshots carry the schema at `x-payment-info.input.schema`. The published data exists and agrees; the collector read the wrong location and converted missing instrument data into a product contradiction. `review.mjs` preserves the raw findings, reads the observed published location and writes `reviewed-summary.json`. Its controls reject a changed maximum length and an absent schema. This review does not silently repair the original collector or its scorer.

**B-BCOLLECT — URL extraction, also open in the primary collector.** The crawler checks for literal braces after URL normalization has percent-encoded them, so it requests nine unfilled templates and sees 404. Its URL regex also stops at the colon in a nested URL value, producing inputs such as `url=https`, and includes trailing prose punctuation. These are not confirmed store defects. The 19 redirects are retained, but this collector does not follow them; it cannot establish redirect-loop absence. Fix the primary extractor and add controls before treating its raw status counts as a buyer verdict.

## What stays open

This is a bounded refresh, not completion of Wave 1. It does not compare every requested field on all ten discovery/listing surfaces, recurse through every page, resolve every JSON reference or real example argument, check every promised content type, exercise every public error code, run the alternate MCP payment profile, run a fresh cold-entry cohort, or make a purchase. Eight starting snapshots are not a complete first-party crawl. No new confirmed store defect, BUY-001–039 count, commissioned Aura report or live recovery pass is claimed here.

Reproduce acquisition in a **new directory** with `scripts/buyer-wave-snapshot.mjs` followed by `scripts/buyer-wave-one.mjs`. Reproduce this snapshot-only review with `node research/buyer-public-recheck-2026-09-15/review.mjs`. The latter makes no requests or payments. The primary runner's two defects and the missing cold/readiness observations mean no aggregate acceptance score is published for this refresh.


## Subsequent local repair

The primary collector/scorer has since been repaired with failing controls and 36 passing benchmark/evidence tests. This dated baseline remains unchanged; see [the follow-through report](../buyer-public-recheck-fixed-2026-09-15/REPORT.md) for the separate public refresh, punctuation follow-up and remaining coverage gaps.
