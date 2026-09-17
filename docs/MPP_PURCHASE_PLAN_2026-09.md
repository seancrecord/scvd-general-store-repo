# MPP purchases: check the existing store, then extend it

September 16, 2026. The keeper supplied an implementation deep dive to
validate what exists, close gaps and keep the whole store coherent across
protocols. He approved the purchase-system scope and asked for a small CI
performance PR first, carrying this plan. This document is a plan, not a
claim that the store accepts MPP. No payment activation occurs in this PR.

## CI foundation: shorten the wait, retain the full gate

The baseline is CI run [35085849636](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35085849636),
commit `8c010f47cd0abd68ea2a677b1bb77adee4d73d23`: the Tests step took
2,796.32 seconds, with 733 files, 14,360 passing tests and one skip.
These are dated baseline numbers, not constants describing today's suite.

Four independent runners execute the full discovered Vitest inventory.
The stock hash partition would put 2,267 of the baseline's 4,303 test-body
seconds on one runner. `scripts/ci-sequencer.mjs` spreads measured slow
files first, using the baseline's average import cost for every file.
`scripts/ci-test-timings.json` keeps the source and hints for files taking
at least ten seconds. Hints only affect placement. Every new/unmeasured
file still runs; no maintained file allowlist selects coverage. Normal
unsharded `npm test` remains unchanged. Per-shard JSON results are retained
for 14 days to assess actual durations and refresh hints when warranted.

Quality checks run alongside those four jobs. The required `check` name
stays stable and succeeds only if both quality and the entire test matrix
succeed. A failed, skipped or cancelled group blocks it. Existing main
failure alerts still depend on that check. New PR commits cancel stale PR
runs; main runs are not cancelled. Timeouts, isolation, assertions and
existing tests are unchanged. Parallelism can add runner minutes; actual
speedup must be read from this PR's completed CI, not inferred from four
runners. The completed PR #734 run took approximately 21 minutes 15 seconds,
compared with approximately 48 minutes for the baseline workflow. All four
shards and the quality gate passed. This is one measured run, not a latency
guarantee.

During development: typecheck and focused affected tests before a commit;
bundle checks for imports/config/non-TypeScript changes. Full CI is still
required before merge. No protocol-only selection or nightly-only
replacement of the merge gate is introduced.

## Existing foundations to keep

- `lib/payments.ts`: catalog-derived price options and network/asset offers.
  Pay-what-it-deserves amounts above the minimum are tips for the same
  entitlement, not premium variants. Publication and commission pricing
  also need explicit coverage; menu products are not the entire store.
- `lib/payment-networks.ts`: configured checkout networks; reader support
  does not imply checkout support.
- `lib/offer-receipt.ts`: signed x402 offers/receipts. These optional
  signatures are not a substitute for mandatory MPP challenge validation.
- `services/purchase-intent.ts`, `services/paid-recovery.ts` and
  `lib/idempotency.ts`: durable admission, original-input binding, retained
  fulfillment and uncertain-settlement recovery. Extend, do not replace.
- `lib/payment-gate.ts` and `lib/mcp-payment.ts`: verified authorization and
  deferred settlement. Preserve rule 9's actual implementation: prepare the
  expensive/fallible work before settlement; minting and persistence can
  still fail afterwards and remain covered by recovery.
- The MPP batteries, census, passports and discovery comparison observe
  other services. Their observations must never enter store sales counts.
- Payment reporting PR #732 separates protocol, network and currency.
  Its legacy till source is x402/USDC; MPP must not enter that writer and
  inherit the wrong label. Integrate against its merged implementation.

## Purchase foundation: make the existing lifecycle protocol-aware

Deliver a versioned internal purchase/payment contract with the existing
x402 path as its first real producer. Include protocol, method, exact asset
identity, network, integer atomic amount, recipient, authenticated payer,
original request digest and payment identity. Normalize from verified
server terms, never a visitor's asserted protocol or amount. Retain the
original wire terms needed for verification/reconciliation. Read existing
v1 records as x402 without rewriting their evidence or identifiers.

Keep payment identity separate from the negotiation protocol: rewrapping
the same underlying authorization as MPP cannot create another purchase.
Also distinguish a purchase/quote identity from each payment attempt, so
switching methods for one purchase cannot silently create a second sale.
Define ownership before linking attempts: an EVM signature does not prove
ownership of a Solana address. A public quote ID alone grants no access to
private results. Preserve current HTTP/MCP input/interface binding until
an explicit cross-interface recovery contract is tested.

Extract only the shared contract/admission seams needed by the two current
payment gates. Do not migrate every product handler into a new engine.
Resolve immutable quote terms before issuing an MPP challenge, including
product, selected supported amount, exact inputs, expiry and allowed method.
Decide which terms can be authenticated statelessly and which require a
durable claim; do not create orders/certificates on unpaid probes. An
expired offer refuses new settlement but must not prevent authenticated
recovery of an already completed purchase.

Acceptance: legacy record reads and x402 responses retain their meaning;
changed product/input/asset/recipient/amount is refused; competing attempts
cannot acquire the same purchase; unknown settlement prevents another
charge; completed recovery returns original goods after expiry. Add a
synthetic second-protocol adapter to exercise those boundaries without
advertising an MPP checkout or moving money. Accounting tests demonstrate
one source attribution and one purchase, including cross-protocol retries.

## Purchase foundation implementation (2026-09-16)

New purchases retain a v2 record with verified protocol/method, exact
settlement terms, proof digest and original request digest. Both existing
x402 gates use the shared admission function through their existing wrapper.
Historical v1 records remain x402, with their original bytes and identifiers.
The private status response names the recorded payment protocol. Unknown
record versions and inconsistent payment metadata refuse admission/recovery.

The synthetic MPP EVM adapter projects already-verified authorization facts;
it is not a signature verifier or an enabled checkout route. Protocol is
excluded from the existing payment identity. A second wrapper for one
EIP-3009 authorization therefore reaches the same durable record. Existing
payer-owned idempotency slots connect separate attempts, including across
EVM rails; uncertain settlement retains ownership, definitive non-payment
releases it, and completed recovery returns the original goods. This does
not authenticate a Solana identity with an EVM signature. HTTP/MCP input and
interface binding remain in place, including recovery after payment expiry.

Tests cover these shared boundaries, exact-term mismatch, legacy evidence,
source attribution on the one retained record, and both real x402 entry
points before a settlement failure. The checkout tests fail against the
previous implementation. Existing purchase, capacity, expiry and Solana
recovery tests continue to supply regression coverage; the protocol tests
do not duplicate the whole product suite.

Remaining in the native-adapter PR: immutable MPP challenge/quote issuance,
expiry checks for new settlement, authenticated attempt ownership on the
wire, cryptographic SDK qualification, protocol-specific receipts and
sales-ledger attribution. The existing idempotency key is the current
purchase linkage; this foundation does not introduce a public quote ID.
PR #732's writer remains x402/USDC-only. No MPP observation is a store sale,
and no MPP credential is accepted by this foundation alone.

## SDK qualification before native checkout

The pinned EVM adapter and stock-client Worker tests are described in
`docs/MPP_SDK_QUALIFICATION_2026-09.md`. This isolates non-mutating validation,
challenge binding and settlement-result preservation before a production
route can invoke them. It does not complete the native checkout acceptance
below; provider policy, expired recovery, transport and accounting remain.

## Following PR: native MPP on one existing Base/USDC product

Pin and qualify a maintained SDK in the real Worker runtime before adding
it to the payment boundary. The current documentation describes a split
between [validateCredential](https://mpp.dev/sdk/typescript/server/Mppx.validateCredential)
and [broadcastCredential](https://mpp.dev/sdk/typescript/server/Mppx.broadcastCredential).
Validation is advisory; final acceptance must revalidate and retain durable
replay protection. Prove the chosen EVM method supports deferred settlement
and the intended facilitator/relayer, including authentication, fees and
uncertain outcomes. SDK documentation is not production qualification.

Use a disabled-by-default capability flag for a single existing product.
Offer a genuine 402 challenge, validate its credential and request binding,
use the shared preparation/settlement/recovery path, return the MPP receipt,
and record the MPP source. Initially prefer a server-submitted authorization
with strong challenge binding; do not silently enable client-broadcast
hash receipts or introduce a server wallet merely for convenience.

Cover both Workers: unpaid challenge parity, forwarding of Payment
credentials, header budgets, CORS/Vary/cache behavior and refusal when the
method is unavailable. Ambiguous requests carrying multiple protocol
credentials need an explicit refusal/selection rule, never two settlements.
Keep x402 advertised and working independently when MPP is disabled or fails.

Acceptance includes malformed/wrong/expired/tampered credentials, no settle
on preparation failure, concurrent/cross-protocol replay, failed receipt
persistence, lost responses and unknown settlement. A stock MPP client's
round trip with controlled settlement fixtures is required. Any production
payment or flag activation remains a separately recorded, bounded release
step under the existing rail-intake process; this plan is not proof of a
live MPP purchase.

## Native pilot implementation (2026-09-16)

`docs/MPP_NATIVE_CHECKOUT_2026-09.md` records the implemented HTTP pilot,
its exact boundaries, tests and activation checklist. Both Worker flags remain
false. The existing `context_anchor` minimum Base/USDC entitlement now has a
native challenge/credential path behind that flag, with shared durable
admission, artifact recovery, retained receipts, a disjoint idempotent sales
ledger, and shared public/admin reporting. The September 17 bounded house run
qualified this exact lane, including expired/disabled recovery and retained
accounting, with the before-expiry replay gap recorded in
[the dated result](MPP_LIVE_RESULT_2026-09-17.md). Checkout was disabled afterward.

The readiness follow-up adds per-purchase native house corrections without
rewriting original evidence, HTTP request outcomes by protocol in admin, and
enabled capabilities derived across catalog/contracts/OpenAPI/guide. Existing
x402 discovery stays intact; native canonical discovery/indexer interoperability
is still unqualified because both draft schemas claim `x-payment-info` with
incompatible shapes. Ongoing activation and the expansion below remain separate
release work. Full CI remains one shared gate, not one suite per protocol.

## Whole-store expansion and release

Expand only after the first flow is qualified. EVM chains can share adapter
code but each needs verified token/domain/recipient configuration and
settlement/reconciliation evidence. Solana needs its own credential and
verification qualification. Current x402 support proves neither. Stripe,
subscriptions and additional assets are separate scope, not implied by MPP.

Cover the actual catalog and its fulfillment families: instant goods,
observations, term watches, human queues, publications and commissions.
Audit HTTP, MCP, WebMCP/browser helpers and packages by what each really
supports; no blanket capability claim across all transports. Derive catalog,
OpenAPI, payment guides, public counters, receipts and admin reconciliation
from enabled capabilities. Update protocol declarations only as real flows
become available. Keep refunds, house purchases, settlement-unknown records
and monetary totals separated by actual currency and network.

Use shared lifecycle contracts, protocol adapter contracts and network
verification tests, plus representative end-to-end tests across fulfillment
families. Do not blindly multiply every historical fault case by every new
protocol; retain known regression tests and add coverage for actual seams.
Cross-protocol races and recovery always remain explicit tests. The full
suite remains the merge gate while this coverage structure matures.

Finally qualify discovery-to-purchase with an independent client, and only
then describe the store as MPP-payable or prepare a services-directory entry.
An observing passport is not payment acceptance; a configured offer is not
settlement proof; a passing fixture is not a production purchase.
