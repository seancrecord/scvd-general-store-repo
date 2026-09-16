# Native MPP live qualification

This is the runbook for one bounded HTTP purchase of Context Anchor on
Base using native USDC. It is not a record of a completed live payment.
The unsigned production quote read on 2026-09-16 offered 1,000,000 atomic
USDC (1 USDC); it did not advertise an active native MPP challenge. Always
read the current quote before approving a spend. Implementation details and
remaining whole-store work: [native checkout pilot](MPP_NATIVE_CHECKOUT_2026-09.md).

## Who does what

The keeper chooses a wallet/client and approves the quoted amount and the
pilot activation window. The wallet stays under the keeper's control. Only
its public address is needed to prepare the run; no wallet key belongs in
chat, this repository, an evidence report, or the store's configuration.

The implementation operator prepares the release, reads the public challenge,
compares the transaction and goods, checks recovery and accounting, and
records the result. Provisioning the store's dedicated challenge secret is
separate from the buyer's wallet. An independently running stock MPP client
proves wire compatibility; a keeper-funded purchase remains house activity,
not evidence of independent customer demand.

## Before enabling

1. Merge the native checkout PR only after every required CI check passes.
   Verify both production Worker versions correspond to the approved release.
2. Confirm that the configured facilitator supports the exact Base USDC
   EIP-3009 authorization used by the pinned SDK, including its validity
   window, and that its account terms allow this use. Record the dated
   provider documentation/account confirmation. Start with the provider's
   [supported-schemes endpoint](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/get-supported-payment-schemes-and-networks)
   and [facilitator FAQ](https://docs.cdp.coinbase.com/x402/support/faq).
   Those describe supported mechanisms and pricing; they do not themselves
   prove this account's live acceptance of our SDK authorization. Fixture tests and an x402
   purchase alone do not close this item. Do not label it confirmed from
   the absence of a rejection.
3. Choose a public payer address and confirm it is classified as house
   **before admission** through the existing house-wallet configuration or
   authenticated house marker. The pilot captures this classification at
   admission; historical native reclassification is not implemented yet.
4. Prepare a short non-sensitive summary identifying the qualification run
   and one fresh UUID as `Idempotency-Key`. Keep the URL, summary and key
   identical for every retry. A Context Anchor is a retained signed artifact;
   do not put secrets in its summary.
5. Approve at most one purchase at the freshly quoted minimum price, no tip,
   using a stock `mppx@0.10.1` EVM client running outside the store. Explicitly
   select EVM/Base; a client supporting only Tempo is not sufficient for this
   pilot. Refuse a different asset, recipient, chain, price or expired offer.
   Disable automatic new-credential retries and paid x402 fallback.
6. Provision a fresh random `MPP_CHALLENGE_KEY` as a secret on the store only.
   Use the existing secure secret-management workflow; never print its value.
   Confirm `PAID_RECOVERIES` and `COUNTER_LEDGER` bindings on that deployment.
7. Prepare the reviewed changes setting `MPP_CHECKOUT_ENABLED` to `"true"`
   in both Worker configurations, plus the reverse change setting both to
   `"false"`. The flag enables this product for all callers, not just the
   qualification wallet. A strictly wallet-restricted canary would require
   an additional implementation before activation.

Before deployment, record the release commit, proposed window, payer public
address, approved spend cap and person approving it. Implementation approval
does not itself record this bounded live release decision.

## Run once, then recover the same purchase

1. Immediately before buying, capture `/stats` and `/admin/take`. Keep the
   existing x402 source and MPP organic/house counts and atomic amounts.
   Note the timestamp and any concurrent legitimate purchases; aggregate
   deltas alone cannot attribute a transaction.
2. Deploy the approved pilot configuration. Make an **unsigned** GET through
   `https://scvd.store/api/buy/context_anchor?summary=...` with the chosen
   `Idempotency-Key`. Expect 402, a parseable native `WWW-Authenticate: Payment`
   challenge and the existing x402 `PAYMENT-REQUIRED` offer. Check the exact
   Base USDC amount, recipient, realm, expiry and request binding. An
   informational authentication hint is not a native offer. Also make an
   unpaid request to another existing product and confirm its x402 discovery
   still works.
3. In the keeper-controlled client, approve the inspected EVM authorization.
   Send that credential once as `Authorization: Payment ...`, with the same
   URL and key and **no** x402 payment header. Keep the original credential
   privately in the client for recovery; omit it from logs and shared reports.
4. Require the signed Context Anchor goods and a success `Payment-Receipt`.
   Verify the artifact using its existing verification path. Independently
   read the receipt's Base transaction: successful receipt, correct USDC
   contract, payer, store recipient and exact amount. A store-generated MPP
   receipt alone is not independent settlement evidence.
5. Use the returned private recovery handle: GET its `status_url` with
   `Authorization: Bearer <status_token>`. Confirm settled/delivered state.
   Keep the capability token private. It is not a second payment request.
6. Replay the **original** native credential, URL and key. Compare certificate
   identity/content, settlement transaction and MPP receipt; replay metadata
   may differ. Expect retained goods and `charged_again: false`, with no new
   transfer and no additional native sale.
7. After the original challenge expires, repeat that exact recovery request.
   Do not sign a new credential to test expiry. It must still recover the
   original paid goods. Then disable both flags and verify recovery again;
   an unsigned request must no longer advertise an active native offer.

If submission times out, returns an unsuccessful result, or returns goods
without adequate settlement evidence, stop the purchase phase. Read the
private status and existing reconciliation desk; preserve the original
credential and purchase key. Do not create a new key, sign a second payment,
or switch to x402 while the first outcome remains unresolved. Fault injection
and forced provider outages remain local fixture tests, not live experiments.

## Accounting acceptance

Allow the existing durable ledger mirror/KV propagation to settle before
comparing public reads. Preserve both observation timestamps; do not repair
counts by hand to make the qualification pass.

- Exactly one native purchase owns the transaction. Its durable purchase
  has delivery and completed accounting; its monthly MPP ledger entry has
  the same identity, transaction, amount and house classification. The current
  admin page exposes aggregate amounts, not this per-sale ledger evidence.
  Establish an authenticated read-only inspection path before claiming this
  check passed; per-sale admin drill-down is the next implementation gap.
  Public aggregates do not substitute for inspecting the retained evidence.
- MPP **house** purchases increase by one, and its house amount increases by
  the exact quoted atomic amount. MPP organic purchases do not increase for
  this run. Replays leave both unchanged.
- This purchase never appears in the x402 source. Other traffic may change
  the overall x402 count during the window; reconcile that separately.
- `/stats`, the homepage, `/rails` and `/admin/take` agree with their shared
  rollup. The public organic headline must not rise from this house test.
  Admin shows the native house settlement amount as USDC on Base, before
  refunds. Protocol and network are distinct dimensions: MPP is the protocol,
  Base is the network.
- Disabling checkout preserves the purchase, receipt and recovery records.
  Rollback changes the flags; it never deletes purchase or ledger storage.

## Record the result

Save a sanitized, dated report containing: release commit and deployment
versions; client/version; provider acceptance evidence; approved cap; payer
public address; product/input digest and purchase ID; public transaction hash;
artifact identity/verification result; decoded receipt; initial/replay/expired/
disabled outcomes; before/after accounting observations; any concurrent sales;
and remaining gaps. Redact credentials, secret values and status tokens.

Mark each check passed, failed or not observed. Leave the pilot disabled
after this qualification window unless the keeper approves keeping it open.
Passing qualifies only this HTTP product/method/network/asset combination.
It does not qualify MCP checkout, other products, currencies or networks,
and it does not establish organic demand.

## Next implementation PR: inspect a purchase in admin

Add a bounded, authenticated read by purchase ID under the existing admin
surface, using the normalized purchase record for both x402 and MPP. Show
protocol, network, asset/decimals, exact amount, transaction, fulfillment
state and accounting state. Never return the recovery token, payment proof,
signature or arbitrary retained buyer inputs. Preserve the existing admin
authentication and no-cache behavior.

For MPP, derive the monthly ledger object from the retained purchase's
creation date and look up its one sale ID. Compare the ledger evidence with
the purchase instead of scanning all objects or treating a KV summary as the
individual sale. Report missing evidence separately from unavailable storage.
The read must not settle, reconcile, retry accounting or change a counter.

Acceptance tests cover unauthorized access, legacy x402 and native records,
unresolved payment, delivered-but-unaccounted payment, a matching native
sale, missing/mismatched ledger evidence, storage failure and credential
redaction. Existing full CI remains the merge gate; do not multiply all
product tests by every protocol to cover this read-only boundary.
