# MPP EVM SDK qualification — September 16, 2026

This records the SDK qualification before native checkout. At that boundary,
no production route imported the adapter. The subsequent disabled HTTP pilot
is documented in `MPP_NATIVE_CHECKOUT_2026-09.md`; it wires admission,
fulfillment, recovery and accounting without activating production payments.

## Dependency decision

`mppx` is pinned to **0.10.1**, from `wevm/mppx`, with its npm integrity retained
in `package-lock.json`:

```
sha512-MTpZqCMK7rQTz6uMONeigTesTb57b7dtdLhE1+cDfvc1rVPS4pCOvh7ocA1MF0692T0/GCVP10yafW5Ai8++Aw==
```

The additions were installed with lifecycle scripts disabled. The dated install
reported no known audit vulnerabilities; that is not a source-code security
proof. The lock adds the SDK, `@stripe/stripe-js`, `eventsource-parser`,
`structured-headers`, and nested `ox`, `abitype` and `zod`. The chosen server
imports are the core server and EVM method; this does not enable Stripe,
Tempo, sessions, subscriptions or SDK automatic payment middleware.

The SDK sees a dedicated challenge key and explicit payment configuration,
not the Worker environment or the artifact signing key. EVM transfer terms
come from the existing catalog projection. The adapter accepts only exact
Base USDC EIP-3009 payments, with the store's existing domain and decimals.
A future dependency update must repeat these qualification tests.
AMENDED 2026-10-07: repeated for **0.13.1**; the dated section at the end
records the new integrity, the lock delta and the one wire-level change.

The real bundle exposed an additional requirement that the Worker test pool
alone did not: the server core dynamically imports the optional
`@modelcontextprotocol/sdk/types.js` even for this HTTP flow. That peer is
therefore pinned to **1.30.0** too. The combined lock adds 84 package entries;
no existing package version changes. This is a material dependency cost,
recorded rather than hidden behind an alias or a stub. It does not replace
the store's MCP server or enable new MCP payment behavior.

`npm run build:check` also runs `scripts/mpp-sdk-build-check.mjs`, a dry-run-only
Worker entry that keeps the SDK reachable and inherits the store's actual
compatibility settings. It has no bindings or secrets and is never deployed.
The dated standalone bundle was 1,630.33 KiB raw / 310.75 KiB gzip. This is
not a measurement of the future production bundle's incremental size.

## Why a small store adapter

The SDK's [validation API](https://mpp.dev/sdk/typescript/server/Mppx.validateCredential)
is non-mutating. Its [broadcast API](https://mpp.dev/sdk/typescript/server/Mppx.broadcastCredential)
revalidates before submission. In 0.10.1, `verifyCredential` is an alias for
broadcast; it is not the pre-check and is deliberately unused here.

Inspection of `dist/x402/server/EvmCharge.js` showed that the built-in
facilitator settler converts unsuccessful responses to verification errors.
The store already reconciles failures which name a landed transaction and
holds uncertain outcomes against another charge. Therefore the adapter
uses the SDK's custom settlement callback, retaining the original unsuccessful
result or thrown transport error. It makes no retry or non-payment decision.

The adapter takes a non-mutating facilitator verification callback. It runs
that callback after local SDK validation and again immediately before the
submission callback. Signature/challenge validation alone is not a balance,
nonce or chain-state check. The production caller must provide the store's
authenticated facilitator client and retain its settlement policy.

Configuration is snapshotted. The issued challenge binds the realm, route,
original input digest, purchase key, transfer terms and expiry. A caller
cannot alter issued terms by mutating its configuration object afterwards.
Native credentials project to the existing verified purchase contract and
the same payment identity as an x402 wrapper of the authorization.

A success receipt requires a transaction hash and matching network, payer
when supplied, and amount when supplied. Missing/mismatched success evidence
throws `MppSettlementEvidenceUnavailable`: submission may already have
happened, so this must enter uncertain-settlement recovery, never release the
purchase key as unpaid. Unsuccessful replies produce no success receipt.

## Executed evidence

`test/mpp-evm-adapter.spec.ts` runs in the repository's real Cloudflare Worker
test runtime. It uses the stock SDK EVM client, disposable fixture signatures,
and controlled facilitator callbacks. A stock `Fetch.from` client completes
an HTTP 402 / Authorization: Payment / Payment-Receipt exchange through a
local request handler which takes the existing durable purchase lock.
No live payment, provider credentials or funded wallet is used.

The tests tamper with challenge amount, asset, recipient, scope, input digest,
purchase key, expiry and realm. They also alter credential nonce, signer,
recipient, amount, source, signature and credential type. Metadata tampering
changes the wire `opaque` field, not merely its decoded in-memory view.
They cover fresh chain-state checks, expiry during preparation, mismatched
settlement evidence, unsuccessful replies, transport uncertainty, immutable
configuration and one durable admission across native MPP and x402 wrappers.

The test for chain-state revalidation was run with that check removed from
the adapter. It failed because submission proceeded; restoring the check
restores the expected refusal. Existing x402 and doors-parity tests are part
of the focused run. The final local run passed 66 tests across six files in 26.94 seconds.
Typecheck and all three dry-run bundles passed. Full repository CI remains
required before merge.

The npm package references source maps that it does not ship. Vite reports
missing-map warnings during development; the executable SDK tests pass.
No package files are patched and no checks or timeouts are weakened.

## Remaining acceptance for native checkout

- Wire one existing product (initial candidate: `context_anchor`) behind a
  disabled-by-default flag, using server-derived offers and the same input
  and availability checks as x402.
- Use the existing authenticated facilitator, preserving auth, fees,
  uncertain-outcome reconciliation and durable admission before broadcast.
  Fixture success is not qualification of live provider policy or pricing.
- Distinguish expired new settlement from authenticated recovery of an old
  purchase. The SDK correctly rejects expired payment; the store must recover
  retained original goods without invoking broadcast or weakening expiry.
- Reuse preparation-before-settlement, retain MPP receipts through response
  loss and persistence failure, and test simultaneous and cross-protocol
  retries at the actual checkout entry point.
- Add MPP accounting as a disjoint protocol source, with durable retry and
  deduplication, across the homepage, `/rails`, admin and recovery. The current
  legacy writer remains x402/USDC-only.
- Test both Workers, unpaid challenge parity, credential forwarding, header
  budgets, ambiguous dual credentials, CORS/Vary/cache behavior and disabled
  mode. Update capability declarations only for the enabled surfaces.

Only after those acceptance checks does this become a flag-dark checkout
implementation. Any live purchase or activation still follows the separate,
bounded rail-intake release step.

## Dependency update — October 7, 2026: mppx 0.13.1

The pin moved from 0.10.1 to **0.13.1** (Dependabot #981), npm integrity
retained in `package-lock.json`:

```
sha512-PKz2U3l74aqPbvhzLcPzntHWGCncC6czeH0k0aN/f8f9V60E5/nQq9msyoG425njU+UU/jhOh4Ug8gVv62rJQA==
```

Lock delta against main at the time: `viem` 2.56.9 → 2.57.2 (the SDK now
requires `viem >= 2.57.1` as a peer), `@stripe/stripe-js` 9.13.0 → 9.17.0,
`structured-headers` 2.0.3 → 2.1.0; the nested `ox` and `abitype` under
`mppx` are gone (resolved from the top level now) and a nested
`eventsource-parser` 4.1.1 arrived. The optional
`@modelcontextprotocol/sdk` peer is `>= 1.25.0`, satisfied by the 1.32.0
already on main (#983). The store's dry-run bundle grew from 1,651.52 KiB
raw / 317.31 KiB gzip to 1,680.73 KiB raw / 323.19 KiB gzip. Still not
enabled: Stripe, Tempo, sessions, subscriptions, SDK payment middleware.

### The one wire-level change

0.13.0 ("fixed EVM nonce hashing so input fields were framed
unambiguously") changed `challengeHash`, the value a client signs as the
EIP-3009 `nonce` and the value the server compares it against:

```
0.10.1   keccak256(utf8(`${id}${realm}`))
0.13.1   keccak256(utf8(JSON.stringify([id, realm])))
```

Both sides check it. A door on 0.10.1 refuses every credential a 0.13.x
client signs, and a door on 0.13.1 refuses every credential a 0.10.x client
signs. 0.13.1 has been npm's `latest` since 2026-10-02, so before this update
every fresh stock install was already refused by the live lane. After it, a
client still on 0.10.x is the one refused. The store's purchase identity
uses the nonce the client sent, so identity derivation is unaffected.
Nothing in `src/` or `test/` derives the challenge hash itself; the MPP
conformance desk (`mpp-core`) does not re-hash challenges.

`test/mpp-evm-adapter.spec.ts` now pins the framing: the stock client's
nonce must equal the JSON-pair hash, a credential re-signed under the
current framing validates, and the same authorization re-signed by the same
key under the concatenation framing is refused before any facilitator call.
Shown red against 0.10.1 (the stock client there signs the concatenation)
and green against 0.13.1.

### Server-side changes read in the shipped dist

`evm/server/Charge.js` gains `credentialHeaders` and `matchCredential`
plumbing for composed methods; `evm/server/Methods.js` gains the ordered
`currencies` form beside the singular `currency` the adapter uses.
`evm/Types.js` is the hash change above. Nothing the adapter calls changed
shape. 0.11.0 also removed the client's requirement that an x402 envelope's
`resource.url` equal the response URL, which makes
`registry/upstream-mppx-x402-resource-url.md` moot.

### Repeated qualification

The adapter spec, `mpp-checkout`, `mpp-mcp-checkout` and `mpp-core` ran on
the combined tree (main + #981 + the x402 2.28 bump): 4 files, 83 tests
passed. #981's own CI passed all four shards. Typecheck and all three dry-run
bundles passed. Not done here, and the keeper's hand, not a build: one live
purchase on the native lane with a stock 0.13.1 client, recorded beside
`MPP_LIVE_RESULT_2026-09-18.md`. The source-map warnings noted above persist.

