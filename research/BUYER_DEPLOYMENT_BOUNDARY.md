# Buyer deployment-boundary benchmark

Acceptance: a paid good, an outstanding quote, an order and its certificate keep their meaning across the next Worker revision. HTTP 200 alone is insufficient.

[September 11–12 run](deployment-boundary-2026-09-11/REPORT.md) · [saved score](deployment-boundary-2026-09-11/score.json) · [exact log additions](deployment-boundary-2026-09-11/LOG_ADDITIONS.md).

## Reproduce the score without spending

From the repository root:

```sh
node --test scripts/buyer-deployment-score.test.mjs
node scripts/buyer-deployment-score.mjs
```

The first command tests the detector against missing revision evidence, wrong inputs, substituted words, missing goods, duplicate settlement, a still-open authorization window and altered verification evidence. The positive unit-test fixture explicitly assumes a closed window; the actual saved-run score must use the chain evidence and cannot make that assumption.

The second command reads saved, redacted responses, independently collected chain receipts, public verification responses and filtered Worker execution events. It never imports a signer, submits a payment or deploys anything. Nonzero exit means failed acceptance or incomplete evidence; inspect the individual checks before calling it a product defect.

## Run the isolated human-order control

Download the exact deployed bundle with Wrangler, preserving all Text modules. Then:

```sh
node scripts/buyer-deployment-local.mjs /absolute/path/to/downloaded-worker /absolute/path/to/new-local-result.json
```

This creates fresh temporary fixture storage, a disposable unfunded signer and a temporary signing key. It mocks all outbound requests and refuses unknown egress. It creates a human commission, saves an unpaid cheap-item quote, disposes the first Worker runtime, starts an independent runtime with the same fixture storage, polls the old order, verifies its certificate and pays the held quote with simulated money. Both the signer and Worker use the same fixed clock. It tests restart/storage continuity using identical code, not a schema migration or real keeper labor. The downloaded deployed artifact is intentionally not committed into the audit report.

## Prepare a new live run

Do not rerun the dated live script against this run's journal. It has an exclusive private run lock and retained signed authorizations. New live work needs a fresh directory/run ID and an explicit bounded purchase/deployment scope.

1. Resolve the currently deployed store and doors versions. Do not deploy an older audit checkout. Save a hash for every module and compare runtime settings and bindings.
2. Upload an inactive version of the intended approved release. For an unchanged-code control, require every uploaded module byte to match. Keep secrets in provider bindings and private tool state.
3. Start filtered live tails for **both** Workers with a unique audit header. Calibrate a free request and confirm that `scriptVersion.id` is actually present. Exclude raw request headers from published evidence.
4. Add the new version at zero percent, smoke-test it using a version override, then buy one cheap item through each door on the old version. Acquire and retain one old quote through each door.
5. Start paid traffic, shift the new version to 100 percent, and keep traffic flowing. Check for intervening deployments before changing traffic. This run used 12 alternating HTTP/MCP purchases, one at a time, with 600 ms gaps.
6. Pay the retained quotes without creating replacement authorizations. Buy through both doors after deployment. Verify the two original certificates on the new version.
7. Read receipts and scan the bounded block range for the buyer's authorization nonces. Close the observation after every authorization expires. Match payer, asset, recipient and amount; never infer spending from success status alone.
8. Correlate every paid request with actual execution-version events. Prove an old execution overlaps the deployment and new executions follow. Timestamps alone do not identify a Worker version.
9. Stop the temporary log tails. Publish only redacted responses, minimal version events, public certificates/receipts, scores, limits, hashes and exact ledger additions.

The dated live runner enforces a $0.10 ceiling, half-cent Base quotes, a declared house wallet, separate request identities and no automatic paid retries. The collector is read-only. Current scripts are explicit run artifacts, not a production deployment service.

## Required coverage labels

Keep these separate: unchanged-code deployment; changed-code compatibility; storage migration; real human order; isolated human order; single-region traffic; multi-region propagation; individual payment rails. A passing control cannot close an unexercised category. Human completion after a deployment, deploy rollback, signing-key rotation and independently rolling both Workers are further variants.

Cloudflare documents [version/deployment separation](https://developers.cloudflare.com/workers/versions-and-deployments/) and [version overrides, including versions at zero percent](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/). The benchmark's version attribution comes from captured execution events, not an assumption that publishing completes propagation everywhere.
