# Deployment-boundary buyer audit — September 11–12, 2026

**Observed result: all 18 live purchases delivered the correct signed goods across a controlled deployment.** Both old quotes were accepted after the switch, both old certificates verified on the new version, and one paid execution began on the old version and completed after the deployment changed. Observed spending was **0.09 USDC**, within the 0.10 USDC limit. All nine exercised acceptance checks pass in the saved [score](score.json). The final chain observation at 01:53:33 UTC extends past the last authorization expiry at 01:53:20 UTC; each authorization appears in exactly one settlement. A still-open window would fail acceptance.

**This is an unchanged-code deployment control.** The uploaded version contains the exact same four module byte sequences, runtime settings and bindings as the previously deployed release. It proves continuity across a version/isolate boundary under the observed traffic, not forward compatibility across changed code or storage schemas. The human-order test used two isolated Worker instances and simulated payment. No real commission or keeper capacity was consumed.

## What actually deployed

The starting store version was `0b0da9f9-d343-4112-bed6-8c412747f293`. The controlled new version is `b8f5c59d-eddb-4350-a242-51d8358e912c`, now assigned 100% of store traffic. The deployment is `7b34199b-07cd-4ac6-9ac2-5942ea206381`.

There are two relevant Workers. `scvd-doors` supplies HTTP buy quotes and forwards paid calls into the store through a service binding. Its version stayed `8849e2e3-4bb3-4bd8-97f5-2464ea95cb70`. MCP calls go to the store. Consequently, the HTTP held quote crosses an unchanged doors Worker into the newly deployed store; the MCP held quote crosses old and new versions of the store itself.

The audit checkout was older than production. The test downloaded the deployed artifact and staged that artifact, preserving current bindings, secrets and migrations. It did not publish this checkout, rebuild application code, change routes/crons or alter product behavior. The [module comparison](staged-comparison.json) records all four hashes and byte equality. Provider version etags differed; they were not used as proof of equal source bytes.

At 01:46:18.891937 UTC on September 12, the new version was included at zero percent. A version-overridden free read verified an existing certificate on that version before normal traffic moved. At **01:46:40.478039 UTC**, the provider created the 100% deployment. The command began at 01:46:39.022 and returned at 01:46:41.830. See the [deployment timeline](deployment-timeline.json), [initial deployment](initial-deployment.json), [final deployment](final-deployment.json) and [version events](version-events.json).

## Buyer outcomes

- **Before:** one HTTP and one MCP purchase succeeded on the old store version. Both included the requested buyer name and unique purpose in the signed certificate.
- **During:** 12 alternating HTTP/MCP purchases succeeded. Execution logs attribute the first to the old store and the remaining 11 to the new store. Request `r11` began on the old store at 01:46:39.138, ran for 6,755 ms and returned successfully after the deployment changed. This is an observed overlapping execution, not merely a request labeled “during.”
- **Old quotes answered after deployment:** one HTTP quote from the doors Worker and one MCP quote from the old store were retained, signed once, and submitted after the switch. Both delivered on the new store version without replacement payment authorizations or retries.
- **After:** one fresh HTTP and one fresh MCP purchase succeeded on the new version.
- **Old certificates:** the two certificates minted by the before purchases remained valid when verified on the new store. Subsequent public verification collection matched every purchase's original signed payload and signature.
- **Human order:** the isolated test created a queued Collab order, disposed the old Worker runtime, and started a new runtime sharing the same fixture resources. The entire public order response was unchanged, its certificate verified, and a held cheap-item quote still purchased successfully. Two simulated debits occurred. The saved result includes the signed commission and both order responses.

The live purchasing sequence made **39 store requests**: 18 quotes, 18 paid requests, one staged smoke read and two post-deploy certificate reads. Proof collection adds free verification reads and chain RPC calls. No paid request was automatically retried. Client purchases were sequential, with one maximum in flight; this is not another concurrency stress test. All traffic originated from one client location, and the test does not establish global propagation timing.

## Money and artifact evidence

The buyer used the declared house wallet on Base. Every good costs 5,000 atomic USDC units. Eighteen distinct transaction receipts match the quoted asset, payer, recipient and amount, for **90,000 atomic units / 0.09 USDC**. Each receipt also contains the corresponding authorization nonce. The bounded authorization scan is carried past the final authorization's expiry before accepting one-settlement-per-authorization. [Receipts and public verification](proofs.json) · [final chain scan](chain-final.json).

Each successful response is checked independently for protocol success, a valid Ed25519 certificate signature, the exact submitted name and purpose, the correct item and certificate identity, the quoted amount/network, a valid purchased-text signature using the certificate's key, and the exact delivered words bound to that certificate. Public verification must return the original payload and signature; a newly minted replacement certificate would fail. Chain transfer, nonce and exactly-one-settlement checks complete the per-good verdict.

These are ordinary chain receipts and bounded log observations, not a claim of irreversible consensus finality. No refunds or charge reversals were exercised. The store's delivery-first policy means an artifact alone is not evidence of settlement, which is why both are checked.

## Scored benchmark and detector controls

[Run score](score.json) separates live delivery, actual revision attribution, deployment overlap, held quotes, old certificates, and the authorization-window close. The local human-order result is reported separately and cannot raise live coverage. The complete benchmark remains **partial in scope** even when every exercised check passes.

Thirteen detector tests pass. They reject timestamps without version events, a transition with only one observed version, a phase label without actual overlapping execution, wrong buyer input, substituted words, missing goods, an extra settlement, a still-open authorization window, a quote acquired after the boundary and verification of a different signature. They also pin the local/live distinction and test the log parser. [Repeatable protocol](../BUYER_DEPLOYMENT_BOUNDARY.md).

The isolated restart control uses fresh temporary state on each run, mocked outbound services, a disposable unfunded signer and a fixed clock shared by buyer and Worker. It does not inherit production secrets or access live keeper queues. [Local result](local-runtime.json).

Validation: the 13 detector tests pass; the repeated isolated restart control passes all six checks; repository typechecking passes. No application source changed and no commit was made. The full implementation suite was not run for these audit-only scripts and evidence files.

## New ledger entries and enhancements

**No new BUY defect is added from this run.** None of the exercised boundaries produced loss, mismatched inputs, invalid original signatures, an avoidable paid retry or duplicate nonce settlement. This does not close earlier buyer defects.

- **E22-01 — changed-release compatibility:** run the same scored traffic against the next actual approved functional release, retaining previous-release quotes, orders and artifacts. Include schema/data migrations explicitly.
- **E22-02 — two-Worker boundary:** exercise independent store/doors upgrades and mixed revisions, including catalog/price/input-schema changes while old quotes remain outstanding. This run changed only the store version and kept code identical.
- **E22-03 — propagation coverage:** run independent clients in multiple regions with version attribution and execution overlap. Retain bounded purchase caps; add other checkout rails as separate denominators.
- **E22-04 — human-order lifecycle:** carry an existing consented live commission through a planned release and complete/poll it afterward. The current fixture proves queued-order continuity, not completed real labor across a deployment.

Roadmap entry **B22** retains these next steps and the evidence requirements. [Exact added text and focused diff](LOG_ADDITIONS.md).

## Instrument and evidence limitations

The initial local control passed, but its original public result file and several earlier audit artifacts were unavailable in the current checkout when work resumed. The private execution log survived. That initial log summary is retained separately; the local control was rebuilt and rerun to obtain a complete current result. Earlier missing audit files were not reconstructed or silently claimed present.

Local harness corrections—module root, sandbox socket access and the SDK's default $1 payment cap—were instrumentation issues. The simulated $300 commission uses an explicitly uncapped **fixture** client with all egress mocked; the live half-cent runner retains its cap. No failed fixture setup is classified as a product defect. Temporary live log tails were filtered to the unique audit header and are stopped after collection. Raw headers, house credentials, wallet keys, payment authorizations and live recovery capabilities remain private.

Cloudflare documents [versions separately from deployments](https://developers.cloudflare.com/workers/versions-and-deployments/), [zero-percent version overrides](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/) and [real-time execution logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/). Those mechanisms enabled this control; the saved observations establish its outcomes.
