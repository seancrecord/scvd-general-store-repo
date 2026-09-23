# Four-wave buyer acceptance benchmark

**September 16 sequencing decision:** ROADMAP TR1 first extends the cold
instrument for buyer-first takeoff readiness; TR3 uses its evidence to close
the bounded stranger journey. [Design and acceptance](../docs/TAKEOFF_READINESS_2026-09.md).
The old directed, quote-only cohort remains attributed to its actual scope.
The new unbranded discovery cohort has separate denominators. This does not
close or replace the broader four-wave product/rail benchmark below, grant
its spending ceiling, or promote house testing to organic adoption.

Run in this order. A payment endpoint returning its documented status is not acceptance. A pass requires the right promised good, about the submitted subject, delivered and independently verifiable, with the money accounted for. Missing evidence is **incomplete**; an observed contradiction is **fail**. Keep failures visible even when other checks remain incomplete.

Current evidence includes the [September 12 baseline](buyer-waves-2026-09-12/REPORT.md), its [machine score](buyer-waves-2026-09-12/score.json) and [quoted shelf grid](buyer-waves-2026-09-12/shelf-quote-grid.json), the [September 14 paid receipt run](buyer-receipt-acceptance-2026-09-14/REPORT.md), the [September 15 remaining live acceptance](buyer-remaining-acceptance-2026-09-15/REPORT.md), and the [September 15 unsigned public refresh](buyer-public-recheck-2026-09-15/REPORT.md). The September 12 baseline spent **0 USDC**; that is not the later paid runs' spend. Waves 1 and 2 are partially measured; neither the full architecture matrix nor full shelf is complete. Attribute each result to its actual product, rail, release and purchase. The latest refresh exposed B-BCOLLECT in the primary comparator/crawler; do not treat its raw differences and placeholder requests as store defects.

**September 23 recheck:** [fresh public evidence](buyer-public-recheck-2026-09-23/REPORT.md)
did not reproduce BUY-040/042/044 at their stated scope. Thirty-three quoted
HTTP/MCP pairs agree on x402 rails; two refused pairs are excluded. The repaired
comparator follows local OpenAPI references and `allOf`; its original 35 false
contradictions remain beside the zero-issue offline replay. One link timeout
and all broader Wave 1 gaps remain open. No cold cohort or payment was added.

## Wave 1 — public contracts, then cold entry

1. Compare discovery across homepage, menu, OpenAPI, manifest, MCP, A2A, skill, llms, developer docs and listing metadata. For each SKU retain ID, name, description, price, fulfillment, SLA, required/optional arguments, lengths, rails, artifact type, verification, examples and closure behavior. Missing versus contradictory are distinct states; silence must not count as agreement.
2. Exercise omissions, wrong JSON types, URL refusal and published examples through both unpaid doors. Treat an explicitly documented HTTP price-only quote differently from a typed MCP purchase request. Preserve actionable error fields and whether a debit could have occurred.
3. Crawl links, concrete endpoint paths, examples, JSON references, verification and correction links. Resolve real template arguments; a crawler-created placeholder URL is not a buyer defect. Follow bounded redirects and keep redirect-loop, auth and promised-content-type checks separate.
4. Start six independent agents with only one entry each. No source or store-specific instructions. Include a cheaper model, record its exact resolved model if available, tools and output budget, and do not rescue it. A trace that inherits store facts is excluded.

Record ordered calls and pages, guesses, input revisions, actual origin 400s, tool failures, knowledge before payment, deliverable understanding and 402 interpretation. Keep client actions distinct from observable origin round trips. For unprompted verification measurement, **do not ask the agent to verify in its task**; use a separate recipient task afterward. The current explicitly prompted, wallet-free cohort cannot measure spontaneous verification or first-purchase success.

Repeat unsigned collection in a **fresh directory**:

```sh
node scripts/buyer-wave-snapshot.mjs research/buyer-waves-NEW
node scripts/buyer-wave-one.mjs research/buyer-waves-NEW
node scripts/buyer-cold-isolated.mjs --plan research/takeoff-readiness-2026-09-16/plan.json --out /private/tmp/buyer-cold-NEW --run
```

For schema-2 cold runs, follow [the cold instrument guide](BUYER_COLD.md): preserve each transcript and write evidence-bound per-cell reviews, then rescore. Put the complete cohort under `cold/` to include it in a buyer-wave score. Legacy schema-1 cohorts retain their `cold/reviewed-metrics.json`; populate a dated `readiness.json`. The scorer requires these human/agent-reviewed observations and must not inherit the prior cohort's scores. Run `node scripts/buyer-wave-score.mjs research/buyer-waves-NEW`. The structural comparison, direct crawl and prepayment battery are partial instruments, not implementations of every check above. The current snapshot collector adds response provenance that the original eight snapshots lacked.

## Wave 2 — cheapest suitable instant good, real money

Select from live offers, not a hardcoded historical cheapest item. The September 12 quoted cheapest was **Spot Check, $0.001**, requiring `host`. It returns signed existing observations or an explicit `not_observed`; it does not probe the host. Use a meaningful, reviewed host and judge usefulness against that promise.

Run Base, Polygon and Solana first. For each rail retain selected terms, signed authorization privately, exact inputs, chain evidence, complete response and original artifact. Then exercise:

- Lost response after sending payment: reconcile the original authorization and recover the original good before creating another payment.
- Exact wire replay and original idempotency key; changed input with the same key; a new key with the same authorization. Require one debit and correctly bound fulfillment or an actionable no-charge refusal.
- Same-wallet batches of ten: distinct keys, identical keys, different items, mixed HTTP/MCP and delayed responses. Give every subject a unique marker and reconcile the whole authorization window for duplicate charges, lost goods, wrong orders and post-debit rate limits.
- Fresh sessions retaining only full response, artifact ID, order ID, transaction hash, or wallet plus approximate time. Count additional facts the buyer must supply and distinguish public lookup from authenticated recovery.
- Original certificate verification and a fresh recipient's account of key, scope, history and the difference between valid signature and true claim.
- Before/during/after deployment traffic, retained old quotes, old orders and old certificates. Attribute answering versions; distinguish identical-code rollout from changed-code compatibility. Use [the deployment benchmark](BUYER_DEPLOYMENT_BOUNDARY.md).

Do not use mocks as live settlement evidence. The shopping collector is sequential HTTP and does **not** implement this concurrency/recovery matrix; use dedicated scenario drivers and retain their actual evidence. Prior #22 proves 18 Base Small Blessing deliveries across an identical-code deployment for $0.09, not this matrix on Spot Check or other rails.

## Wave 3 — architecture representatives

The September 12 public-contract plan selected Small Blessing, Confession, Signature Agent Card, Settlement Attestation, Attestation Bundle, Standing Watch, Aura Walk, Bitcoin Anchor and Graffiti on a Train. Respectively these exercise generated text, buyer text, URL probe, chain lookup, multiple transactions, periodic work, human queue, external anchoring and stateful publication. Their listed one-rail minimum sum is **$158.059**, unspent.

Recheck the deployed fulfillment paths before executing; expand only for material implementation differences. Supply real valid transaction hashes, a meaningful endpoint, reviewed text and a digest of retained bytes. Observe watch completion, human fulfillment and external anchor confirmation before passing those purchases. An order receipt or “queued” status proves acceptance of work, not delivery of the promised result. Inventory/capacity and sold-out behavior need their own observed transitions.

## Wave 4 — full offered shelf

The September 12 retained quotes contain **33 products / 163 offered item-and-rail pairs**, with minimum arithmetic total **$3,040.430**. Base, Polygon, World and Solana each total $610.886; Arbitrum totals $596.886 because Launch Check and Opening Day do not offer it. Recompute from each actual offer. This is not a fulfillable capacity reservation, and excludes earlier waves, retries, optional tiers and network fees.

Use the existing house shopping walk with `BUYER_GRADE=1`, one explicitly scoped rail and reviewed item group at a time. First inspect a dry run:

```sh
DRY_RUN=1 BUYER_GRADE=1 ITEMS=spot_check RAIL=base node scripts/shopping-run.mjs
```

For an authorized live run supply `MAX_TOTAL_USDC`, `BUYER_INPUTS_FILE` and a fresh `BUYER_JOURNAL` path, plus the existing locally configured funded buyer. The input template at `buyer-waves-2026-09-12/buyer-inputs.template.json` intentionally leaves required values null. Fill them from the published contracts; they are not ready-to-buy examples. Set the aggregate ceiling across runs, reserving unresolved payments; a per-process ceiling cannot coordinate separate processes.

The collector records exact inputs, quoted terms, selected offer, payment receipt, chain response, store response, signed artifact, public verification, HTTP round trips, unexpected paid retries and scheduled waits. It preserves the authorization **before transmission**, refuses automatic second paid submissions, reserves unresolved submissions against the run ceiling and stops on ambiguous paid transport outcomes. A journal is created exclusively and private by default; it can contain live authorizations and private order-status capabilities. Keep it out of version control and publish only redacted evidence after reconciliation.

For each purchase attach a `product_review` with evidence references and `inputs_preserved` / `promised_good_received`, and an independent `recipient_understanding` review with `state: "reviewed"`, `understands`, and the recipient's actual explanation. Recompute with `assessAttempt` from `scripts/lib/buyer-run-evidence.mjs`. Never fill booleans from HTTP status alone. Verify linked goods and hashes, scope and correct subject using the product contract; inspect usefulness, not just JSON validity. A fresh recipient gets only the purchased public artifact and public surfaces, never the private journal.

An EVM receipt match or Solana confirmed owner/mint balance match is a bounded chain observation, not proof of irreversible finality or absence of every duplicate authorization. Use the broader window scans in the scenario drivers to establish exactly-once behavior. The new collector has fixture controls and a no-spend dry run; **its live path is not yet validated**.

## Advancement and outstanding decisions

Keep the order visible; do not silently skip incomplete checks or turn historical tests into this run's passes. The September 12 Wave 1 baseline reproduced BUY-040, BUY-042 and BUY-044; consult the later repair and deployed-acceptance records before treating that dated status as current. Complete the remaining semantic surface/error/crawl coverage before claiming Wave 1 done. Cheap live coverage needs the requested total spending ceiling and a funded Solana signer configured locally; neither can be supplied by a test fixture. Watch/human/anchor completion may outlast the purchase session and remains incomplete until actually observed.


## Benchmark regression and evidence attribution

Run `npm run buyer:test` before relying on collector/scorer changes; local gates and CI include it. Use a fresh acquisition directory. The comparator reads current and legacy input schemas and records duplicate-copy disagreement. Treat `missing` entries as missing evidence and `contradiction` entries as observed disagreement. `unresolved-links.json` retains templates that need real values; they are coverage gaps, not fetched broken links.

Do not copy an older `score.json`, cold review or reproduced-defect list. The optional `reviewed-findings.json` has a `findings` array of `{ "id": "BUY-040", "state": "reproduced", "request_ids": [1] }` entries. States are `reproduced`, `not_reproduced` or `incomplete`; IDs must be unique and request references must exist in that run's retained requests. A conclusive review needs references. Omitting the file yields an unreviewed/null reproduced-finding result, not a clean bill. References establish provenance; the reviewer still must substantiate the verdict. Fresh cold metrics and readiness review remain required for the aggregate scorer.

The September 15 [repair follow-through](buyer-public-recheck-fixed-2026-09-15/REPORT.md) preserves both public runs and their parser-created false positives. Its bounded result does not complete Wave 1.


For bounded direct-link redirect/format follow-through run:

```sh
node scripts/buyer-link-check.mjs research/buyer-waves-NEW research/buyer-links-NEW
```

The starting snapshot hashes must match their acquisition records. The output directory must be new. Inspect `summary.json`, then review every `needs_review`/`incomplete` row against the documented method, required inputs and actual source link. Never turn GET-on-POST or unfilled examples into confirmed dead links. Loop/format failures are candidates requiring context; `checked` means only this bounded read was checked, never that a purchase succeeded. Preserve raw outcomes when a separately bounded follow-up closes a read gap. The checker neither recurses nor submits POSTs/payments.
