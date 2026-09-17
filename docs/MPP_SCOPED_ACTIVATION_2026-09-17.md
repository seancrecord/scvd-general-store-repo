# Scoped native MPP activation — September 17, 2026

Prepared after the keeper's instruction to merge readiness PR #766 and scope
the next release. This is the activation plan, not an activation receipt.
The plan does not submit a payment or change production flags.

## Public offer

- Product: the existing Context Anchor.
- Transport: HTTP GET `/api/buy/context_anchor` only.
- Protocol and method: MPP `evm/charge`, alongside the existing x402 offer.
- Network: Base mainnet (`eip155:8453`).
- Asset: native USDC (`0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`), six decimals.
- Price: the existing catalog minimum, derived by `nativeCheckoutTerms` from
  `manifestAccepts`; the qualified September 17 offer was 1 USDC / 1000000
  atomic units. Re-read the challenge at release; do not freeze a second price.
- No native tip. No automatic paid fallback to x402.
- Audience: all callers of this one HTTP endpoint. The current flag is not a
  wallet allowlist, traffic percentage, purchase cap or total-spend limit.
- Duration: an ongoing offer if separately approved for activation, with both
  flags available for rollback. This is different from the completed bounded
  house-test window.

The same endpoint and minimum entitlement remain purchasable through x402.
MPP-only, x402-only and mixed-protocol observing/passport behavior is separate
from this payment release and retains its current meaning.

## Release change

The next activation change sets `MPP_CHECKOUT_ENABLED` to `"true"` in the
store and doors Worker configurations. The existing challenge secret remains
on the store; no secret is copied to doors or into the repository. Both
`PAID_RECOVERIES` and `COUNTER_LEDGER` remain bound to their existing durable
storage. No data migration, repair or additional provider integration is part
of activation.

Before executing that change:

The September 17 house test also exposed a legacy reconciliation gap: the
certificate sweep looked only for x402 payer-settle records. The follow-up
reconciliation fix must be deployed before activation. A matched native
individual ledger is sufficient accounting evidence; native missing,
inconsistent or unavailable evidence remains an alarm. The legacy repair must
skip native and undetermined certificates rather than import them into x402.
Verify the next sweep of `cert_5aa8cb3n33` against the retained test purchase;
do not clear its old alert by running the legacy repair. Historical alarm rows
remain history; this code change does not acknowledge or delete them.

The reconciliation merged in #771 classifies a Context Anchor / Base
certificate by the settle headers retained with its purchase. A rescued x402
settle keeps no facilitator header by design, so #771 alone read such a sale
as undetermined for good: paged hourly, skipped by the legacy repair, dropped
from the counter raise. The follow-up lets the ledgers decide when headers
cannot: a native sale naming the transaction is MPP; a legacy per-settle
record with no native sale is x402; a settle neither ledger holds, or a native
ledger that cannot be read, stays undetermined and keeps its alarm. Deploy that
follow-up with the reconciliation and read one clean hourly sweep before
activation.

1. Confirm #766 is merged after the full shared CI gate, and record the store
   and doors deployment versions serving the readiness code.
2. Retain the September 17 live qualification as evidence for this exact lane.
   It proves one accepted provider authorization, signed delivery, expired and
   disabled recovery, and a keeper-provided individual accounting match. It
   does not establish provider commercial/account permission; retain the dated
   provider/account confirmation required by the qualification runbook.
3. Record the decision to make this one offer ongoing and publicly callable.
   No additional house purchase is needed just to toggle configuration. A
   further paid qualification, if wanted, needs its own explicit spend choice.
4. Run the existing full CI gate for the activation change. Do not create a
   second full test suite for MPP or multiply product tests by protocol.

## Unsigned release checks

Read through the public doors Worker after deployment:

- A valid unpaid Context Anchor request returns 402 with the native Payment
  challenge and the existing x402 `PAYMENT-REQUIRED` offer. Compare the native
  method, network, asset, amount, recipient and expiry to configured terms.
- Full/compact item contracts, the store-specific OpenAPI capability extension
  and payment guide declare precisely this native HTTP offer. Other products
  and MCP/WebMCP tool checkout remain on their existing x402 paths.
- A different existing product still quotes x402, and the x402 discovery shape
  remains compatible with the existing consumers.
- Public purchase counts and admin source amounts retain the same meaning:
  organic excludes house; protocol, network and currency are separate axes.
  Deployment itself creates no sale. Allow mirror propagation and account for
  concurrent real traffic before interpreting aggregate differences.
- Admin's per-purchase inspection remains available. Operational outcomes are
  request counts, including retries, not evidence of new settlements.

Record release commit, both deployment versions, read times and observed
headers/capabilities. These reads use no wallet signature and submit no payment.

## Stop and rollback

If native challenge terms, delivery/accounting evidence or protocol declarations
disagree, disable the native flags in both Workers. Do not switch an unresolved
buyer's payment to another protocol, sign a replacement, reset a ledger, or
remove a challenge secret or durable record to force a clean state.

After rollback, unsigned requests must no longer advertise native MPP while
x402 stays available. Retained native status/recovery and accounting evidence
must remain readable. The September 17 run verified recovery with checkout
disabled; rollback does not erase a completed sale.

## Explicit limits and follow-up

This release does not add native MCP/WebMCP checkout, other products or
fulfillment families, networks, currencies, Stripe, subscriptions, native
refund automation or a public browser checkout. Those require their own
implementation and representative boundary tests.

Canonical MPP discovery/indexer interoperability remains unqualified: the
MPP draft and the current x402/AgentCash contract use incompatible schemas
under `x-payment-info`. #766 preserves x402 and supplies explicitly
store-specific capabilities. Do not submit a directory entry or claim
standards-compliant native discovery from that extension.

Before-expiry replay was not observed in the live house run. Fixture coverage
and successful expired/disabled recovery remain the evidence; do not turn that
gap into a claimed live pass. The house purchase is not organic customer demand.
