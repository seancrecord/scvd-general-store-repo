# Payment reach qualification — 2026-09-16 UTC

The keeper asked for historical evidence to be released first, followed by
payment reach qualification. These reads were taken on September 15 local
time / September 16 UTC while historical PR #726 completed CI. They change
no payment configuration and authorize no purchase. The original raw reads
are retained privately; [the reviewed aggregate](../research/payment-reach-2026-09-16/qualification.json) carries counts, boundaries and input hashes.

## What this pass establishes

All **35 catalog GET purchase routes** discovered in the live x402 document
returned 402 quotes parsed by the installed stock x402 SDK. Each advertised
Base, Polygon, Arbitrum, World and Solana. This denominator covers the named
menu routes selected by the collector, not every publication, tip tier,
parameter combination or endpoint in the store.

The reader used `@x402/core`, `@x402/evm` and `@x402/svm` **2.25.0**. The
public `onBeforePaymentCreation` hook aborted after offer selection. Scheme
payload creation was replaced with a sentinel that would throw if reached;
it was called **zero times**. No wallet, private key, authorization or
facilitator settlement was involved. A cheap Base fixture reached the hook;
an over-budget fixture and a malformed header refused. These controls make
the reader's successful selections meaningful without making them payments.

For each of Base, Polygon, Arbitrum and Solana, **21 of 35** product quotes yielded
a selectable offer and **14 of 35** refused under the SDK's default spending cap.
Those refusals are expected budget enforcement, not unavailable checkout.
An application buying a more expensive item must approve its actual price;
turning off all spending controls is not the remedy.

**World differs:** its offers were refused in all 35 product quotes under
the default asset policy.
The installed SDK's default-asset map does not recognize this World USDC
contract. A second, offline selection used the retained live Small Blessing
quote with an explicit network-and-token allowlist and a per-asset atomic
cap. Selection passed; wrong-token, wrong-network and one-unit-over-cap
controls refused. Exact-cap selection passed. Payload creation remained zero.
The retained quote's original expiry still applies; this offline check does
not make that offer payable after expiry.

The token was checked against both the store's `WORLD_USDC` constant and
[World's contract directory](https://docs.world.org/world-chain/reference/useful-contracts),
not trusted merely because the quote named it. The tested policy was:

```js
client.setSpendControls({
  allowedAssets: [{
    network: 'eip155:480',
    asset: '0x79a02482a880bce3f13e09da970dc34db4cd24d1',
    maxAmountPerPayment: '1000000', // atomic USDC; an explicit policy cap
  }],
});
```

This is a dated configuration reading for the generic x402 client, not a
new store constant, a CDP-managed-wallet test or a claim that every wallet
supports World. The test registered only this network. Default-asset rules
remain enabled. The per-asset cap matters: an unknown asset has no default
USD valuation in this SDK, so a token allowlist without its atomic cap would
not preserve the intended spending limit.

## MCP and the real browser door

The root MCP catalog advertises grouped buying tools. An unpaid call to
`buy_simple` with `item_id: small_blessing` returned both supported forms:

- Default `/mcp`: HTTP 200 with JSON-RPC error 402 and
  `error.data['x402/payment-required']`.
- `/mcp?payment=tool-result`: HTTP 200 with `result.isError: true`, an x402
  v2 `structuredContent` quote, identical JSON in the text content, and the
  idempotency/input-contract metadata. It offered the same five networks.

The first two probes incorrectly called `buy_small_blessing` on the grouped
root and got `unknown_tool`. They remain in the raw capture. Calling that
tool on `/mcp?item_id=small_blessing` works and returns a quote; its listing
contains that one purchase tool. An intermediate private note calling the
name obsolete was wrong. This was an instrument scope error, not a payment
profile failure. Neither correct response exercises a host's signed-payment
loop or its handling of a lost paid response.

On the actual `/try` page, **Chrome 152** exposed `document.modelContext`
and registered **14 tools**, including quote and completion. The quote tool
returned the five networks and `payment_sent: false`. The completion tool
refused an empty signed-payment object with the published wallet-signing
guidance and `isError: true`; no new Resource Timing entries were observed.
This is a no-signature refusal, not paid completion or a browser consent test.

The observed native API accepted serialized JSON input. Passing an object
failed input parsing before tool execution. The current
[WebMCP draft](https://webmachinelearning.github.io/webmcp/) uses an `any`
input argument. This runtime/draft difference is retained as an instrument
limit; it does not establish a defect in the store or behavior in another
browser. The runtime's enumerated annotations did not expose every draft
field. No conclusion about an actual payment confirmation UI follows.

The served `/webmcp.js` reading returned HTTP 200, 47,866 UTF-8 bytes,
SHA-256 `9474714c80344017752365c127a2ae517a5f06bb0a628c3b1ce696cf375638b9`.
It contains the quote/completion tool names, but neither `Purchase-Recovery`
nor `purchase_recovery`. This agrees with the source/release gap below; it
does not establish that all recovery mechanisms are missing.

## Browser boundaries, payload cost and expiry

A cross-origin OPTIONS read on `/mcp` returned 204 and allowed the requested
payment/idempotency/content-type headers. An OPTIONS read on the direct
purchase route returned 405, and its ordinary unpaid GET returned 402 with
no `Access-Control-Allow-Origin`. Source in `src/lib/cors.ts` confirms this
boundary. A server-side HTTP client and the same-origin till are different
integration paths from an external page directly fetching a paid route.
This pass does not widen CORS or prove an external browser's paid flow.

Across the 35 HTTP quotes, `Payment-Required` values ranged from **8,068 to
12,100 bytes** and all 35 responses declared `Cache-Control: no-store`.
Those are header-value bytes as exposed by Fetch, not compressed wire bytes.
No proxy/header-cap failure was observed. The requests are sequential reads
of different products with no controlled cold/warm condition; their elapsed
times are not service p95 or a comparison with Rubric. Future payment
measurement must separate quote, authorization, processing, settlement and
recovery for the same product/client/network. Preserve signatures, supported
offers and recovery information while measuring any optimization.

The live six-door reader was run **without `--record`**. It reported 27
criteria met, one partial, none unmet or unknown, and no reviews due. Its
one regression against the saved reading is advance origin-trial expiry:
**Edge expires October 15; Chrome expires November 17**. Both tokens were
present. The live tokens match the public source entries; their payloads
were decoded, not independently signature-verified. A first-brace parser
initially failed on one token because a signature byte was a brace; the
corrected reader and the existing door reader agree. The six-door result is
discovery/access evidence, not payment acceptance on six clients.

## What is built, released and published

Source/package comparison started at main `b62b30b2`. Main advanced to
`c3dfe160` during CI; none of the eight compared package paths changed.
Registry tarballs were checked against their SHA-512 integrity and compared
with `npm pack --dry-run --ignore-scripts` file lists. No published package
code or lifecycle hook was executed.

- **x402-verify 1.3.0, x402-sign 1.0.3, scvd-cli 0.3.0,
  scvd-preflight 0.1.0, scvd-corpus-client 0.1.0 and
  scvd-mcp-starter 0.1.0:** exact file parity with the published versions.
  Historical detached catalog evidence works through the existing verifier;
  this work does not require a signer/verifier release.
- **scvd-tab 0.11.1:** runtime files match. The published README still lacks
  the pinned invocation and corrected pager command already in the repo.
  This is documentation distribution drift, not a new runtime failure.
- **scvd-defects:** npm is 0.15.0; main is 0.17.0. The generated vocabulary,
  package manifest and changelog differ. Main's v17 and the separate MPP
  branch's v17 describe different additions. Reconcile the existing snapshots
  and choose one release version before publishing; do not overwrite either
  line of history or assume a source version means an npm release.

Two earlier PRs were merged into stacked feature branches, **not main**.
Their merge commits are not ancestors of the checked `c3dfe160`:

- [#714](https://github.com/seancrecord/scvd-general-store-repo/pull/714)
  went into `codex/agent-catalog-readability`. Its publication-recovery
  propagation in WebMCP is absent from main and the served module read.
- [#715](https://github.com/seancrecord/scvd-general-store-repo/pull/715)
  went into `codex/mpp-discovery-comparison-pr`. Its core draft-01 reader
  is absent from main. MPP census/passport and discovery comparison are
  already integrated through #691/#712. None of these readers enables
  store MPP checkout.

Reconcile and integrate those existing changes through their owning tasks;
do not rebuild them or describe their branch merges as production releases.
This qualification adds no scheme, chain, dependency or package publication.

## Existing paid evidence and the remaining boundary

The keeper's September 6 Base browser-till purchase is recorded in
`docs/BROWSER_CHECKOUT_2026-09-06.md`. Its signature was independently
checked, while browser/extension versions and an independent RPC receipt
read were not part of that check. It is useful evidence with those limits.

The separate buyer acceptance report under
`research/buyer-remaining-acceptance-2026-09-15/` records real Base HTTP/MCP
purchases, concurrent mixed products, retained-payment recovery, cancelled
responses and independently verified goods. It is not a managed-CDP-wallet
or paid WebMCP test. #718 released the wallet-to-original-good repair;
the separate #720 release-record PR reports a fresh-wallet recovery of the
already-paid Spot Check. That is recovery of a prior purchase, not a new
payment. This pass did not re-run or silently broaden any of those readings.

The remaining named acceptance gap is a buyer-authorized purchase through
the actual WebMCP completion tool or an existing CDP-managed client. The
client choice question is pending; silence is not a wallet selection or
spending authorization. No credentials are needed in chat. A paid exercise
needs a named client/network/product, a buyer-approved amount and receiver,
and retention of the original payment/key and private recovery handle.
Then independently check settlement, exact delivery, verification and a
no-new-payment recovery. One success closes that combination only.

## Ordered follow-through

1. Historical PR #726 passed required CI and merged to main at
   `bc294edbbc0497404d81f6cf95fc30ea6e8d3ff1` on September 16,
   02:20:12 UTC. Preserve the
   recovered catalog commitments and the 28 unresolved report bindings as
   separate findings; fresh reads cannot replace missing original bytes.
2. The existing #714 recovery change is integrated locally in this release
   branch with its original client documentation and regressions. Both
   retention and schema controls were observed failing on current main
   before applying the original runtime patch. Complete release gates and
   re-read both served browser modules before crediting production.
3. World client policy and explicit-price approval for higher-priced
   products are linked from the integrated payment client guidance. Keep
   the atomic cap and its negative controls; store-side money checks are
   unchanged.
4. Run one chosen, bounded paid client acceptance exercise when a signer is
   available. Preserve unsupported/unfunded combinations as untested.
5. Reconcile #715 and the defect vocabulary release. MPP checkout stays a
   separate intake and acceptance project under `PAYMENT_RAILS.md`, including
   deliver-first failure, cross-protocol replay, ambiguous settlement and
   lost-response recovery. Observing MPP does not settle those questions.
6. Renew the earlier Edge trial before expiry and publish the corrected Tab
   instructions at the appropriate documentation release. Neither needs a
   new checkout rail. Header/latency optimization follows measured failures
   or a controlled baseline, not the old directory scoreboard.

Primary client references read for this pass:
[CDP buyer quickstart](https://docs.cdp.coinbase.com/x402/buyer/quickstart),
[client configuration](https://docs.cdp.coinbase.com/x402/buyer/client-configuration),
and [MCP payments](https://docs.cdp.coinbase.com/x402/buyer/mcp-payments).
`CdpX402Client` was inspected but not instantiated: it provisions/manages
accounts, which is outside this unsigned reading. Its default Base baseline
and additive network configuration do not prove managed-wallet reach on all
five store networks.

## September 16 release follow-through

The release branch now starts from main `01a97e7d`, including historical
PR #726 and the buyer recovery release record. The earlier reading and
`qualification.json` remain dated to their actual source/observation times.
#714's runtime patch, tests, README guidance and September 15 evidence are
reused from `e7c6d06d8a73ac9291b269cddc1f09dcf6c42205`. This avoids merging
unrelated stacked-branch changes or rewriting the earlier observations.
The fix copies one already-returned header into the existing result and
cache; it adds no request, signing, automatic retry or settlement behavior.
No npm package contract changes. Full validation and production verification
are recorded separately as they complete. #715 remains outside this release.

Local release validation completed: **732 test files and 14,344 tests
passed**, with one existing skip, exit zero, in 1971.59 seconds.
The five focused Worker tests and all 61 till/browser bridge tests pass;
typecheck, both Worker bundles, audit, claims and documentation checks pass.
The two new regression controls were first observed failing without the
existing patch. Source/test hashes were unchanged throughout the full run.
Evidence: [release validation](../research/payment-reach-2026-09-16/release-validation.json).
GitHub CI, main integration and deployed module verification remain separate
release steps; this result is not a live paid-client test.
