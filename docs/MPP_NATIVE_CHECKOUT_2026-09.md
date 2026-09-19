# Native MPP checkout pilot — September 16, 2026

The [scoped activation release](MPP_SCOPED_ACTIVATION_2026-09-17.md) (#780,
merged 2026-09-17 19:53 UTC) set both checked-in Worker flags to true; its
release record holds the unsigned reads. Before it, both configurations were
disabled following the bounded September 17 house qualification. One live HTTP Context Anchor / EVM / Base / USDC purchase,
its signed delivery, expired/disabled recovery and exact native accounting were
checked. [The dated result](MPP_LIVE_RESULT_2026-09-17.md) names the evidence
sources and the unobserved before-expiry replay. Fixture tests alone establish
none of those live facts. MPP observation, census and passports remain independent.

## Implemented boundary

As piloted: only HTTP GET `/api/buy/context_anchor`, using the existing
minimum price, Base and native USDC. Since the
[whole-store release](MPP_WHOLE_STORE_2026-09-18.md) every HTTP door on the
shelf carries the same offer at its own minimum; the boundaries below on
transport, network, asset and tip are unchanged. The offer derives its
amount, asset, recipient, authorization domain and expiry window from the
existing catalog/payment configuration. There is no second price table.
Since the [MCP release](MPP_MCP_CHECKOUT_2026-09-18.md) the MCP door
carries the same offer on tools/call in the SDK's MCP wire shape, and since
the [browser bridge release](MPP_WEBMCP_CHECKOUT_2026-09-18.md) the WebMCP
quote carries it too. Since the [native tips release](MPP_NATIVE_TIPS_2026-09-19.md)
a pay-what-it-deserves door offers one challenge per tier; other networks and
other assets are not enabled here.

When explicitly enabled, an unsigned request gets the existing x402 offer
and a genuine MPP `WWW-Authenticate` challenge. The dedicated
`MPP_CHALLENGE_KEY` authenticates the challenge. Its protected metadata binds
the exact input digest, path and purchase key. Caller keys are retained;
otherwise the store uses its existing time-bucketed suggestion. Public
challenge/key knowledge cannot retrieve goods without payer authentication.
As with x402, deliberate new purchases with new keys remain new purchases;
the bucket is not a permanent identity for every identical future request.

The stock SDK signs an EIP-3009 authorization. SDK validation is non-mutating,
followed by the existing authenticated facilitator's verify call. Fulfillment
uses the existing preparation and artifact checkpoint code. Immediately
before settlement, shared durable admission owns the authorization and key;
the SDK revalidates the challenge, signature and expiry and the facilitator
rechecks chain state. Exactly one submission callback runs per admission.
Native code never calls the SDK's broadcasting `verifyCredential` alias.

Ambiguous requests carrying both HTTP payment protocols are refused before
settlement. MPP failure never silently falls back to a paid x402 attempt.
The same underlying authorization or payer-owned key reaches the existing
purchase journal across protocols. The doors Worker forwards native paid
requests unchanged; when its pilot flag is enabled, it also forwards this
one product's unsigned requests to the store, where the challenge key and
durable bindings live. It needs no copy of the MPP key.

The one browser pilot supports explicit payment-header preflight and exposes
the challenge and receipt. Responses are not cached; their Vary fields retain
Authorization and Idempotency-Key alongside existing payment/content headers.
The combined challenge remains within the tested HTTP header budget.

## Recovery and bookkeeping

A returned successful settlement must name the matching network, payer,
amount (when supplied) and a transaction hash. Its MPP receipt is retained
with the payment and returned beside the existing signed goods. Exact
credential fingerprints authenticate retained purchases after expiry, key
rotation or disabling checkout. No executable credential is stored.
Private purchase status continues to work independently of payment expiry.

An exception before the submission callback records non-payment. An
unsuccessful or unanswered submission remains unknown, with durable ownership
and an existing admin reconciliation row. This first native lane conservatively
keeps even an unsuccessful provider answer unresolved; it does not infer
non-payment from an absent event. The alarm uses the existing finalized-chain
nonce/transfer pairing, then resumes the original artifact checkpoint. MPP
can issue a server receipt for that independently confirmed transaction;
it never fabricates a lost x402 facilitator response.

Sales use a separate monthly MPP ledger on the existing CounterLedger binding.
The purchase identity and complete sale evidence are inserted atomically with
the updated summary. Repetition is idempotent; altered evidence is refused.
Amounts remain integer atomic USDC. KV mirrors carry absolute summaries,
with a durable alarm retained before writes. Native rows never enter legacy
x402 counter repair. The purchase alarm retains its accounting obligation
even after delivery, so a lost acknowledgement cannot double-count a sale or
silently abandon its bookkeeping.

The homepage, stats, rails, menu and MCP payment rollups inherit the disjoint
source through the shared stats reader. Admin's take page shows MPP house
counts and organic/house amounts with network and asset identity. Its existing
all-time certificate take also includes native certificates. Amounts are
settlements before refunds, not net revenue. Unique buyers use a union of
legacy and native wallet keys. House classification is captured at admission. The authenticated purchase page
can record a separate historical correction for a currently registered house
buyer against matched, settled, accounted native evidence. The original purchase
and sale remain intact; one correction per purchase atomically moves its exact
amount and count in the native summary. Shared rollups expose those adjustments;
x402 counters are unchanged. Reads never perform a correction.

## Validation and next release

The keeper/operator steps and acceptance evidence are in
[the live qualification runbook](MPP_LIVE_QUALIFICATION_2026-09.md).

`test/mpp-checkout.spec.ts` exercises the real route with the stock client,
both Workers, deferred submission, changed input/key/credential refusal,
expiry, concurrent requests, cross-protocol ownership, receipt persistence,
lost settlement replies, finalized-chain recovery, accounting acknowledgement
loss, house exclusion, admin amounts, CORS and header size. Adapter tests
cover cryptographic/challenge mutation; existing shared recovery suites keep
their full regression matrix. New native tests cover integration boundaries
without multiplying every historical product test by each protocol.

Before activation, make a separately recorded bounded release: confirm the
provider accepts this exact authorization flow and its commercial terms,
provision a dedicated random challenge key on the store, confirm both durable
bindings, and change the pilot flag in both reviewed Worker configurations.
Read the actual challenge through the public doors Worker and complete the
authorized bounded purchase with an independent client. Check the receipt,
private recovery, native ledger, x402 count, public rollup and admin amount.
Disabling both flags stops new native settlement while retained recovery
continues. Retain durable records and the ledger during rollback.

The released admin lookup at `/admin/purchases` supplied the keeper's individual
ledger match during the September 17 run. It also reads any subsequent house
correction separately. The original accounting evidence remains inspectable.

The take now includes best-effort, current-month HTTP request outcomes by
declared protocol (x402, MPP or mixed). These include retries and house requests,
exclude free quotes and tool transports, and cannot be interpreted as sales.
Missing observations are labeled; storage failure never changes checkout.

Menu and compact contracts publish `payment_capabilities`; OpenAPI uses the
store-specific `x-scvd-payment-capabilities`. Native declarations appear only
for configured HTTP doors and use each challenge's own offer terms. The
payment guide names the exact scope. The directory compatibility follow-up adds
an MPP protocol object to the existing AgentCash `x-payment-info.protocols`
array, derived from the enabled capability. Existing x402 fields, price and
inputs remain unchanged. This is the directory profile, not a claim of
conformance to the separate draft extension with the same name. Runtime
challenges remain authoritative; directory admission is a separate check.

After the whole-shelf HTTP rollout and the MCP door: native discovery/indexer
interoperability, broader live paid qualification and separate
network/asset qualification remain open.
No Stripe, subscription, Solana or client-broadcast hash method follows from
this Base/USDC pilot.

The first CI run passed all four test shards but caught the doors bundle at
1,616,795 bytes, above its existing 1,000,000-byte limit. A dynamic import in
the shared payment gate still bundled native settlement into both Workers.
The store now supplies the native loader at route assembly; discovery checks
and the x402 gate implementation remain shared. The corrected local doors
bundle is 935,710 bytes with the budget unchanged. An import-graph regression
test fails before that separation and passes afterward, alongside real-route
native checkout and public-door parity tests.
