# PAYMENT_RAILS.md — the second-rail work order, and the audit that gates it

CV's MPP integration spec (2026-08-03), revised by the desk the same
day with the amendments evidence demanded, and adopted as the standing
process for EVERY future rail — MPP, Solana-exact, whatever arrives.
His original sequencing survives untouched because it is correct:
**audit the existing flow first, gate the new rail on the audit
passing plus hard facts verified, red-team after shipping.**

## The standing intake rule for rails (adopted from his B.5)

Two independently-growing lists, never entangled:
1. **Accepted payment schemes** grow by one entry only when a real,
   named counterparty proves an existing entry doesn't serve them —
   never preemptively because a player is big. (This gate already
   ruled correctly once: `gokite-aa` stayed out.)
2. **Discovery registry listings** grow additively — metadata
   registrations, never payment-flow changes. Tracked separately,
   shipped independently.

**How CDP discovery actually admits an endpoint (verified against
Coinbase's own docs, 2026-08-04, CV's chase — x402/welcome, /bazaar,
/network-support):** there is NO submission API, no dashboard form,
no manual override. "The CDP Facilitator catalogs your service the
first time it settles a payment for that endpoint" with
`paymentPayload.resource` set. One real settled payment per endpoint
is the only door in, on any chain — the rule is chain-agnostic, so a
Solana settle indexes an endpoint exactly as a Base one does.
Consequence: an unsold item is an UNDISCOVERABLE item, so a new
listing's first house purchase is not a nicety, it is the listing's
registration fee (~its own price, once).

**The path-shape rule that came with it:** Bazaar auto-consolidates
bare high-cardinality path segments (UUIDs, EVM/Solana addresses and
hashes) into one generic template entry. A paid route that embeds a
raw address in its path gets silently merged with strangers' routes.
Every paid route here is word-shaped or prefixed (`issue-:issue`,
`week-:week`) — keep it that way; a future route like `/watch/<id>`
must be `/watch/w-<id>` or carry a static prefix segment.

## Part A — the current-flow audit. RUN 2026-08-03, results below.

One amendment to the original: A.1.1's "a probe should never create
ANY state" is too strong. 402s deliberately write OBSERVABILITY state
(decline counters, event rows — bounded and allowlisted since the
venue hardening), because a census that cannot see window-shoppers
cannot falsify "nobody came." The invariant as audited: **no MONEY
state — no order, no cert, no patron number — before a signature.**

| # | Scenario | Verdict | Evidence |
|---|----------|---------|----------|
| A.1.1 | 402 issued, buyer never signs → no money state | **PASS** | test/payment-flow-audit.spec.ts (new); patron counter unchanged by unsigned probes |
| A.1.2 | Bad signature / expired offer → no settle, clear error | **PASS** (existing) | facilitator verify-fail paths in test/paid-flow.spec.ts, decline desk records reason |
| A.1.3 | Facilitator settle fails → no cert, no patron, legible error | **PASS** | test/payment-flow-audit.spec.ts (new): settleShouldFail → 402, no cert_id anywhere in body, patron unchanged |
| A.1.4 | Settled but our write fails → money moved, no receipt | **COVERED BY DESIGN, verify live** | delivery intents + hourly delivery audit (problem ledger #18) + chain reconciliation (ledger #4, the one check independent of our own writes). CV live-verification welcome but the machinery predates this audit |
| A.1.5 | KV read-after-write 404 on fresh verify | **PASS** (existing, 08-01) | loud explicit message shipped; CV confirm-live optional |
| A.1.6 | Same Idempotency-Key retry → replay, not double settle | **PASS** (existing + new race test) | test/idempotency-replay-authorization.spec.ts; concurrent same-key race added in payment-flow-audit.spec.ts — at most one distinct cert |
| A.1.7 | Fresh authorization, no key → honest second charge, warned | **PASS** (existing) | before_you_retry on declines; idempotency.suggested_key on 402 |
| A.1.8 | amount_check on EVERY priced 402 | **PASS** (new) | payment-flow-audit.spec.ts iterates the whole menu, not just small_blessing |
| A.1.9 | Human-queue polling states | **PASS** (existing) | order routes tests; sold-out refuses pre-402 |
| A.2.a | Concurrent stock race past the ceiling | **REAL — cannot be prevented on KV; silence refused instead** | recordInventorySale is read-modify-write, stock gate runs before payment gate: two buyers at remaining=1 both pass. KV has no transactions. THE FIX SHIPPED: the sale count returns to the caller, and a sale past the ceiling fires an OVERSOLD alert naming the order and the refund instruction — the keeper settles it by hand, never unknowing. Pinned deterministically (the race outcome is simulated; the backstop is asserted) |
| A.2.b | Concurrent same-key idempotency race | **PASS** — with a finding about the instrument, not the flow | Two simultaneous same-key requests → ≤1 distinct certificate. The test flaked at first and the flake was the finding: the KV replay guard is read-modify-write, so two concurrent requests can both pass it — in production the CHAIN is the backstop (EIP-3009 reverts a reused nonce), but the mock facilitator settled the same authorization twice, i.e. the instrument was looser than reality. Fixed by making the mock enforce nonce-once like the chain (test/helpers/facilitator-mock.ts); same lesson as the per-isolate rate buckets and the exactly-100 census page |

**Items marked for CV's live hands** (cannot be proven from inside):
A.1.4 and A.1.5 confirm-live; a real concurrent double-buy attempt
against production on a stocked item (expect: both settle at worst,
OVERSOLD alert fires, keeper refunds one — the documented outcome,
not a silent one).

## Part B — MPP (evm.charge, crypto-only). GATES RUN 2026-08-04. GATE 1 FAILED — RE-SCOPED TO WAIT-AND-SEE.

The gates as originally posed, and what CV's primary-source read
(paymentauth.org/draft-evm-charge-00 and mpp.dev/quickstart/server +
/advanced/security, the documents themselves, not summaries) returned:

**Gate 1 — is `evm.charge` a drop-in `accepts[]` entry? NO. It is
not x402 at all.** `evm.charge` is the EVM payment method for the
IETF-track "Payment HTTP Authentication Scheme"
(I-D.httpauth-payment) — a separate parent protocol. The offer rides
a `WWW-Authenticate` challenge header (base64url, JCS-canonicalized
JSON — draft §4 ¶1), the client answers with `Authorization: Payment
<credential>`, and the flow (§1.4) contains no `accepts[]` and no
payment-signature header anywhere. Its credential negotiation
(§4.2.2: permit2/authorization/transaction/hash) is its own. Building
it is standing up a SECOND challenge/credential protocol beside x402
— new headers, new encoding, new security surface, coupled
idempotency across two protocols — not appending an array entry.

**Gate 2 — is crypto-only registration-free? PASSED, as far as two
pages can confirm.** The Direct signing path is a self-generated key;
`MPP_SECRET_KEY` is self-generated HMAC root-of-trust material (their
security doc's own language), not an issued API key; no
account-creation step exists on either page. The only
registration-flavored line is optional DISCOVERY listing (MPPScan /
MPP Services directory), which gates nothing. Honest bound stated by
the auditor: "didn't find one across two pages," not "confirmed
absent system-wide"; the `Mppx.create` SDK reference is the next
document if this ever needs to be airtight.

**The wrinkle that connects them:** every server-quickstart example
is `tempo.charge()` — Tempo (Paradigm/Stripe's chain, pathUSD) —
and `evm.charge` appears nowhere on MPP's server docs. MPP appears
to implement the same PARENT scheme but ship a Tempo-specific
credential. So "build evm.charge, get MPP crypto-only for free" is
likely TWO code paths under one spec, not one deliverable.

**THE RULING, via the standing intake rule at the top of this file:**
an accepted payment scheme grows by one entry only when a real,
named counterparty proves the existing entry doesn't serve them. No
buyer has asked for httpauth-payment, MPP, or Tempo; the build is a
parallel protocol, not a door that takes a day (so the door-cost
lens, which rightly overrode demand-gating for CHEAP doors, does not
override here — both lenses point the same way for once). MPP moves
to WAIT-AND-SEE behind Solana. What reopens it: a named counterparty
asking to pay via this scheme, OR the scheme showing up in ward-round
drift data as ecosystem-adopted (C.9 already tracks scheme drift, so
the watch is automatic, not a memory).

Architecture notes preserved for whenever it reopens: one 402,
existing exact entry untouched, zero new buyer-facing branches;
idempotency one cache across rails (C.4 attacks it); cert records
carry which rail settled, signed at mint. Card/KYC legs stay ruled
out (fee math: ~$0.30 + 2.9% against a $0.005 floor item).

The Solana-exact door (sized 2026-08-03, PROBLEMS.md) ran through
THIS SAME order of operations and CLEARED IT, 2026-08-04:
supported-kinds confirmed the CDP facilitator settles solana-exact
(v2, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`), so the rail reuses
the existing verify/settle path — the exact "one accepts[] entry"
shape MPP failed to be. Built flag-gated on SOLANA_PAY_TO (unset =
byte-identical store); Base stays accepts[0] forever as a
compatibility promise; certs record which rail settled at mint.
The receive ceremony ran (Solflare, seed on paper is the keeper's
still-open homework, public address deployed as the secret).

THE RECONCILIATION-LIMIT RULING, resolved 2026-08-04: the bank
reconciliation walks Base RPC only, so Solana settles are
unreconciled until a Solana-side walk ships. The door opens anyway,
BOUNDED: cumulative Solana settles past $10 page the keeper (ship
the Solana reconciliation or unset the flag), metered at both doors
(HTTP gate and MCP), never refusing a buyer mid-purchase — a
paid-and-refused settle would be worse than an unreconciled one.
The Solana reconciliation walk is the standing follow-up build that
retires the cap.

**THE REGISTRATION RUN, COMPLETED 2026-08-04 (same day the rail
shipped):** all 14 instant/queue shelf items settled over the Solana
rail, house-flagged, every artifact verify:valid — patrons #69–86
across four batches. Each settle is also its endpoint's discovery
registration (the only admission mechanism; see the intake note
above), so the whole shelf entered the source catalog in one
afternoon. The run's failures were worth as much as its successes:
it surfaced the EVM-only decline diagnosis mislabeling Solana
refusals, the default Solana RPC rate-limiting the bank walk into
silence, and the delivery audit's missing by-hand resolution lever —
all fixed and tested the same day, none reachable by any test that
stays inside the store. Two spurious settlement_attestation settles
(fulfillment crashed on a flaky Base RPC read, post-settle) were
caught by the delivery audit within the hour and resolved
house_absorbed via the new lever.

## Part C — post-ship red team. Unchanged from CV's spec, one addition.

C.1 (naive x402-only agent unaffected) is the load-bearing test, run
as a genuinely clean-context subagent per the cold-walk discipline.
ADDITION C.9: the ward round and preflight advisories should observe
the new rail's entries as ordinary data (scheme/network drift
tracking) — confirm the store's own instruments read its own second
rail without special-casing it.


## Part D — the third rail (Polygon PoS). GATES RUN 2026-08-20. OPEN — SHIPPED FLAG-GATED, DARK.

The intake rule ran the same two gates the Solana door ran, and both
stood open wider.

**Demand.** Token Terminal's 30-day read (2026-08-19, reported across
multiple outlets): ~14M x402 transfers, Base 7.3M, **Polygon 5.6M** —
the second-biggest rail in the economy, carrying 40% of protocol
volume. A finding rides along: our own census shows only 2.5% of
listed doors quoting non-Base/non-Solana networks, which means the
Polygon x402 economy runs almost entirely OUTSIDE the Base-centric
discovery surface this store probes. The registry census has a named
blind spot now; that is a census finding, not a rails blocker.

**Door cost.** Lower than Solana's was, on all four counts: (1) the
CDP facilitator — the same one that verifies and settles every sale
here — announced Polygon support (their launch page, 2026); (2) the
@x402/evm dependency already carries the Polygon mainnet USDC
deployment (eip155:137 → 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359,
EIP-3009 v2) in its own asset table, so "$X" maps to the right
contract with no store-side address to mistype; (3) the scheme is the
SAME ExactEvmScheme class the Base rail runs — zero new payment code;
(4) an EVM pay-to address works on Polygon as-is, so no new wallet
and no new key ceremony.

**What shipped (2026-08-20), mirroring the second rail's discipline:**

- Flag-gated on `POLYGON_PAY_TO` (0x-address-shaped or the offer never
  mints). Unset, the store is byte-identical to before the rail.
  Deliberately never inferred from PAY_TO_ADDRESS: lighting a rail is
  the keeper's decision.
- Base stays `accepts[0]` at the minimum tier — the compatibility
  promise survives a third rail. EVM entries precede Solana.
- The unreconciled cap: `POLYGON_UNRECONCILED_CAP_USDC = 10`, counted
  at the till from the first settle, alarmed past the bound, never a
  refusal — standing until a Polygon-side bank walk ships (the walk
  needs a `POLYGON_RPC_URL`; the Alchemy account already covers it).
- THE BOOKS BUG THE BUILD CAUGHT: `railOf` mapped every eip155
  network to "base", which was true while Base was the only EVM rail
  and would have silently booked Polygon income as Base income the
  day the flag flipped. Polygon has its own bucket end to end now —
  till counters, certificate walk, organic_by_rail, the books
  invariant, and the net-by-chain statement (observed side honestly
  absent until the walk exists). Other eip155 networks keep the
  legacy "base" mapping because stored history was written under it.

**What stays Base-only, deliberately:** bounty-claim verification and
regulars'-credit cash-outs — the money-out doors are their own risk
surface and their own decision, exactly as they were for Solana.

**What waits on the flag flip:** the copy pass. "USDC on Base or
Solana" is keeper-ink across the storefront, /what, llms.txt, the
skill, and the specs; updating it before the rail is lit would
advertise a door that does not exist. When the keeper sets
POLYGON_PAY_TO, the machine surfaces that derive from
acceptedNetworks() follow instantly; the hand copy is a ⚑ pass filed
in TASKS.md.


## Part E — the cross-protocol re-read, 2026-08-30. THE PART B GATE IS RE-POSED, NOT RE-RULED.

Part B ruled MPP to WAIT-AND-SEE on 2026-08-04 and named its own two
reopening conditions: a named counterparty asking to pay that way, OR
the scheme showing up as ecosystem-adopted in drift data. A full read
of the surrounding surface — every protocol an agent can pay over, not
just MPP — is filed at `docs/PROTOCOL_EXPANSION_2026-08.md`. Three
things from it belong in this file, because they change the sizing
this file did:

**1. Gate 1's finding stands; its cost estimate does not.** `evm.charge`
is still not an `accepts[]` entry and MPP is still a second
challenge/credential protocol — that read was correct and is unchanged.
What changed is that the encoding and verification are now a
dependency rather than a build: `mppx` ships Hono middleware and a
manual Fetch-API server mode, and Cloudflare documents accepting MPP on
a Worker route AND on an MCP tool (read from the cloudflare-docs repo
itself, not from a summary). What remains ours — and remains the real
cost — is coupled idempotency across two protocols, a second decline
surface, a third class of key material, and the certificate semantics.

**2. The reopening condition appears to be met, on the second limb.**
Not by a buyer at our door — none has asked, and that is still the
stronger limb. By implementation: AWS Bedrock AgentCore (x402 and MPP
through one ProcessPayment API, with an explicit x402 fallback),
Cloudflare Agents, Arbitrum, Abstract, MultiversX and http4k have all
shipped MPP support, observed in their own repositories. **Whether
implementation-by-the-ecosystem counts as adoption, or adoption means a
buyer, is the keeper's ruling, and this file does not pre-empt it.**

**3. A cheaper door was found beside it, and it IS the `accepts[]`
shape.** Circle Gateway nanopayments plug a `GatewayEvmScheme` and a
`BatchFacilitatorClient` into the same `x402ResourceServer` this store
already runs, offering both rails in one `accepts` array, gas-free,
down to $0.000001, on the EIP-3009 signature we already verify. Under
the door-cost lens that opened Solana and Polygon, this sizes BELOW
both. Its one genuinely new cost is reconciliation: Gateway credits an
off-chain balance and batch-settles later, so the chain walk — the one
check independent of our own writes — arrives late and in aggregate.
The bound is the same bound Solana and Polygon got: a cap, alarmed,
never a refusal mid-purchase, and the gap published rather than
smoothed.

Ordering, sizing, per-product impact, the latency and regulation
scoring the keeper asked for, and the six rulings only he can make are
all in the linked file. Nothing in this Part changes an accepted
scheme; the intake rule at the top of this file still governs, and no
rail moves without it.
