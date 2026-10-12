# Arc Gateway checkout — October 12, 2026

Status: implemented and configured locally, not deployed. The keeper authorized
full checkout rather than a pilot and supplied the public recipient on October
12. `ARC_PAY_TO` is identical in both Worker configs and will activate with the
code release. Arc RPC returned chain ID 5042 and no deployed code for the
recipient; this does not establish ownership. No payment, withdrawal, refund
or historical adjustment was made by this work.

A direct secret update was refused by Cloudflare because the store has a newer
undeployed version. No secret was changed and that version was not deployed.
The public recipient therefore ships with the reviewed config, like the public
Solana recipient, rather than activating an unrelated Worker version.

## Payment behavior

A valid explicit Arc recipient adds an `exact` x402 offer for `eip155:5042`
on the shared HTTP, MCP, publication, commission and UCP checkout paths. Prices
come from the existing catalog. Base remains the first offer. Other rails use
the existing facilitator; only Arc uses Circle Gateway. Quote metadata and
browser signing preserve Gateway's EIP-712 contract and seven-day minimum
validity. The buyer needs a funded Gateway balance on the selected source chain.

The integration adds no dependency and sends no CDP credentials to Circle.
It uses Circle's mainnet API through a bounded adapter implementing the existing
x402 facilitator interface. Pinned supported metadata prevents an unavailable
Circle metadata endpoint from closing the existing checkout rails. Verify and
settle still contact Circle and fail closed. SDK and primary-source evidence is
in [SPEC_READS](SPEC_READS.md#2026-10-12--arc-gateway-checkout).

Goods are prepared before payment submission, as on the existing checkout.
Gateway acceptance admits fulfillment; it does not establish chain settlement.
The signed certificate carries `gateway_payment` and `accepted_usdc`, and
omits `settlement_tx` and `paid_usdc`. Both new fields are in the canonical
signature and cannot be appended to an old certificate under a legacy signature.
A later confirmation does not rewrite a certificate already issued.

Every authorization has a purchase identity derived from network, payer and
nonce. The internal `gateway:<purchase_id>` reference is never presented as a
chain transaction. Two purchases in the same batch remain two purchases.
HTTP/MCP retries, UCP submission claims and purchase recovery reuse the retained
purchase. A lost or malformed settlement response remains unknown, blocks a
second submission and is reconciled through read-only transfer history.

## Reconciliation and accounting

The purchase Durable Object checks Circle transfer history after acceptance,
including after delivery. It matches payer, recipient, nonce, source and
recipient networks, token and exact atomic amount. Empty, ambiguous, paginated
or unreadable evidence never establishes non-payment. A confirmed/completed
transfer must include its batch transaction. Failed transfers are excluded from
revenue; already delivered goods are not delivered again. Unconfirmed payments
older than one hour and failed payments use the existing keyed alarm trail.

A serialized monthly ledger stores one row per purchase and adds its amount to
the monthly summary exactly once at confirmation. Repeated confirmations and
stale accepted-state writes cannot increment the total again. Confirmed amounts
join public totals as a distinct `x402-gateway` payment source and Arc network.
Pending/failed rows remain visible at `/admin/gateway`. Legacy settlement
counters, payer rows, certificate backfills and raises exclude Gateway payments.

The accounting export reads confirmed Gateway rows, including publications
that issue no certificate, and includes `purchase_id` and `payment_protocol`
columns. The shared batch transaction is evidence about a batch, not an
independent per-sale chain witness. This integration trusts Circle's API for
individual transfer confirmation. It does not implement an independent Arc
receive-wallet walk or an automatic withdrawal. Proceeds become a Gateway
balance; the keeper uses Circle's supported wallet/client withdrawal flow.

## Validation and release

Final focused validation: 144 checks across 12 affected specs pass using the
branch's locked dependencies. These include 20 Arc integration checks for
HTTP/MCP/UCP, publication delivery, queued-work signatures, retries, lost
acknowledgements, malformed settlement evidence, failed batches, receipt
tampering, transfer identity mismatch, accounting idempotency, tax export and
admin privacy. All 72 browser-till/WebMCP checks pass. Typechecking and the
store, doors and MPP SDK dry-run builds pass with the locked dependencies.

The full local run completed with 888 passing files and three failing files
(16,256 passing tests, five failing, one skipped). That run began before the
last fixes. Its Arc failures and the transaction-write guard failure are fixed
and covered by the final 144-test run. Its MPP framing failure came from the
shared local install's mppx 0.10.1 instead of this branch's pinned 0.13.1; it
passes with the correct locked install. A fresh complete run on the final tree
with locked dependencies remains a required CI release gate. The earlier full
run is not represented as a clean full-suite result.
After configuring the keeper-supplied recipient, all five configuration parity
checks and 33 checkout checks passed again, along with typechecking and all
dry-run builds. The address passes EIP-55 checksum validation.

The browser Gateway signing test was also run against the old signing-contract
behavior in a temporary copy and failed, then passed with the implementation.
All payment execution in the tests uses fixtures. No funded Arc wallet was used, so a real
mainnet purchase and withdrawal remain unmeasured.

Both configs now carry the same explicit `ARC_PAY_TO`. Activation requires
the normal branch/PR release gates and public readback of HTTP,
MCP, OpenAPI and catalog offers. A quote readback proves advertising, not a
live settlement. No one-product gate or trial mode exists in this implementation.

The separate [historical receipt audit](../research/settle-reconciliation-2026-10-12/README.md)
leaves the one-count legacy warning unresolved. It found no transaction-backed
single-counter correction or refund basis, and changed no production records.
