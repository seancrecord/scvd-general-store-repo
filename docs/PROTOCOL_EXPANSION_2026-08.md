# PROTOCOL_EXPANSION_2026-08.md — hands in every pot

**A read of the whole agentic-payment surface on 2026-08-30, sized against
this store's own intake rule, product by product.**

The question this file answers is NOT "should we add MPP." The industry is
early enough that nobody can answer that honestly, and the keeper has said
so. The question is the one that survives being early:

> **If the agentic economy grows and no single protocol wins, what does it
> take for this store to have a hand in every pot — payable down every
> road an agent takes, legible to every directory an agent reads, and
> holding first-hand signed evidence on every rail — without acquiring
> latency we don't want or regulation we don't want?**

Everything below is sized for that question. Where a door is cheap and
additive, it is named cheap. Where it is a second protocol wearing a
familiar hat, it is named that too.

---

## Sourcing note — read this before quoting anything here

The 2026-08-21 spec reads in `docs/SPEC_READS.md` carried an honest
caveat: the primary spec hosts were egress-blocked from the build
environment, so byte-level claims were not settled facts. **That block is
still partly in force.** On 2026-08-30, from this environment:

| Source | Reached? | How |
|---|---|---|
| `paymentauth.org` (rendered MPP/IETF spec) | **NO** | egress-blocked |
| `docs.stripe.com`, `stripe.com/blog` | **NO** | egress-blocked |
| `developers.cloudflare.com` (direct) | **NO** | egress-blocked |
| `github.com/tempoxyz/mpp-specs` | YES | fetched; index of specs only, thin on wire detail |
| `github.com/cloudflare/cloudflare-docs` (MPP pages, source `.mdx`) | YES | the same docs, read from the repo they are built from — working code, not prose about code |
| `github.com/aws/bedrock-agentcore-sdk-python` PR #643 | YES | a shipped buyer-side MPP implementation with field names |
| `github.com/x402-foundation/x402` issues #447, #1461, #2582 | YES | Circle's own Gateway/x402 proposal, Bazaar indexing failure modes, origin-hosted discovery proposal |
| `developers.circle.com` (Gateway/nanopayments/agent-stack) | INDEX ONLY | retrieved as indexed passages, not fetched from the origin |
| `mpp.dev` (quickstart, faq, mpp-vs-x402, advanced/discovery, services) | INDEX ONLY | same |
| Secondary coverage (Alchemy, Dwellir, Turnkey, Openfort, Formance, checkout.com, li.fi, commercetools, news) | YES | labelled `[secondary]` wherever load-bearing |

**Rule for anything built off this file:** a claim marked INDEX ONLY or
`[secondary]` gets re-read against the primary before a line of payment
code is written. Positions and door-sizing below do not depend on the
bytes; wire format does.

---

## 1. The map on 2026-08-30 — five layers, not one race

The single most expensive mistake available here is treating these as
competitors in one bracket. They are not. They stack, and a store can be
present at four of the five layers without ever running a card.

| Layer | What it settles | Who is there | Our position today |
|---|---|---|---|
| **1. Authorization** — did a human authorize this agent, for what, up to what | Nothing. Proof only | **AP2** (Google → donated to FIDO Alliance, 2026-04-28; mandates as SD-JWT verifiable credentials) `[secondary]`; Mastercard Verifiable Intent (FIDO, 2026-05-26) `[secondary]` | `the_mandate` is a home-grown answer to the same question. We are ADJACENT and unlabelled |
| **2. Commerce / checkout** — cart, catalog, order, returns | Goods, in a chat surface | **ACP** (OpenAI+Stripe; Instant Checkout Feb 2026, in-chat retreat Mar 2026), **UCP** (Google, Jan 2026, Walmart/Target/Shopify) `[secondary]` | Wrong shape for us. We sell one signed artifact per call, not carts. **Observation lane only** |
| **3. The machine payment wire** — 402 handshake | Money, per HTTP request | **x402** (Coinbase; x402 Foundation under Linux Foundation, 2026-04-02, 22 launch members incl. AWS, Circle, Google, Mastercard, Stripe, Visa) `[secondary]`; **MPP** (Stripe+Tempo, mainnet 2026-03-18) | x402 v2 native, three rails |
| **4. Settlement / liquidity** — where value actually moves | USDC, PYUSD, pathUSD, BTC, cards | Base / Polygon / Solana (ours), **Circle Gateway + Nanopayments** (batched, gas-free, floor $0.000001), Tempo L1 (0.6s finality `[secondary]`), Lightning via Lightspark, Stripe card rails | Three chains, one asset (USDC), one facilitator (CDP) |
| **5. Discovery** — how an agent finds a payable door at all | Attention | CDP Bazaar (earned by settling), Circle Agent Marketplace (submitted + reviewed), `mpp.dev/services` (curated), Agent Almanac (cross-protocol), MCP Registry, `.well-known/x402.json` (proposed, x402#2582) | Bazaar-registered, MCP-registry-listed, `.well-known/x402.json` already served |

**The runtimes that actually hold the wallets** matter more than the specs,
because they decide which doors an agent can walk through without its
developer writing code:

- **AWS Bedrock AgentCore payments** — one `ProcessPayment` API speaking
  **both** x402 and MPP; MPP methods `evm`, `tempo`, `solana`; **falls back
  to x402 when a 402 advertises both and no MPP challenge is satisfiable**
  (PR #643, merged path, Aug 2026). *Primary.*
- **Cloudflare Agents SDK** — x402 and MPP, both directions (accept and
  pay), including MCP tools. The MPP client "also recognizes x402
  Challenges." *Primary (docs repo).*
- **Circle CLI / agent-stack** — `circle services search|inspect|pay`,
  paying x402 doors out of a Gateway balance. *Index only.*

Read that row again: **three of the largest agent runtimes in the world
pay x402 doors natively today, and two of them pay MPP doors too.** Being
payable is decided by what those clients can do, not by which spec wins.

### The demand picture, stated with its contradiction intact

Rule 43 says one dated observation, gaps published. So:

- x402 cumulative transactions crossed ~160M by June 2026, >90% on Base,
  average transaction ~$0.13 `[secondary]`; another read puts the protocol
  at ~200M payments / $50B `[secondary]`.
- A 30-day window around August 2026: **14M–17.8M transactions**
  `[secondary]` — consistent with the Token Terminal read that opened the
  Polygon rail (PAYMENT_RAILS Part D).
- **And**: daily settlement *volume* is reported down ~93% YTD, 7-day
  average ~$41.8K, provisional daily ~$28.4K mid-August 2026 `[secondary]`.
- MPP launched with 100+ integrated services (Anthropic, OpenAI, Shopify,
  Alchemy, Dune named) `[secondary]`, and has since been implemented by
  AWS, Cloudflare, Arbitrum, Abstract, MultiversX and http4k — *observed
  directly in their repos and docs, not claimed by Tempo*.

Those readings are in tension and both are probably true: **transaction
count is holding at machine scale while dollar volume collapses toward the
true size of the real economy.** That is exactly the shape of a market
where the average payment is a tenth of a cent and the hype money went
home. It is also, precisely, our market: the cheapest thing on our shelf is
$0.001.

**Nobody should read this file as evidence the agentic economy is big. It
is evidence that it is FRAGMENTING, and fragmentation is a different bet
than growth.**

---

## 2. Three corrections to our own prior reads

House discipline (rule 56): a reading taken with an instrument that could
not reach its subject gets a dated correction out loud, not a quiet edit.

**Correction 1 — "MPP is not a drop-in `accepts[]` entry" STANDS. "So it is
a from-scratch parallel protocol" DOES NOT.**
The 2026-08-04 Gate 1 finding was right about the wire: `WWW-Authenticate:
Payment` challenge, `Authorization: Payment` credential, no `accepts[]`, no
`PAYMENT-SIGNATURE`. What has changed is the *build cost*, and it changed
because other people built it:
- `mppx` ships **framework middleware including Hono** — the framework this
  store runs — and a manual `mppx/server` Fetch-API mode. *Primary
  (Cloudflare docs repo + Tempo examples).*
- Cloudflare documents accepting MPP **on a Worker route and on an MCP
  tool**, with the receipt returned in MCP `_meta`. That is our exact
  deployment target and our exact second door. *Primary.*
- There are at least four independent server implementations in the wild
  (mppx, http4k Kotlin, Abstract's package, AWS's buyer side).

The 08-04 sizing said "standing up a SECOND challenge/credential protocol
beside x402 — new headers, new encoding, new security surface, coupled
idempotency across two protocols." **Every word of that is still true.** The
correction is only that the *encoding and verification* are a dependency
now, not a build. The coupled idempotency, the second decline surface, and
the cert semantics remain ours and remain the real cost.

**Correction 2 — MPP is explicitly backwards-compatible with x402, which
means a class of MPP buyers can already pay us.**
"The core x402 'exact' flow maps directly onto MPP's charge intent, so MPP
clients can consume existing x402 services" (Cloudflare docs, mpp.dev FAQ,
Alchemy, Dwellir — *primary + index + secondary, agreeing*). The AWS SDK
implements exactly this fallback. **Practical consequence: our marginal
gain from native MPP is not "MPP buyers" — it is (a) Tempo/card/Lightning
rails we do not otherwise touch, (b) the *session* intent, (c) presence in
MPP-side discovery, (d) first-hand evidence of the protocol.** That is a
smaller and much more honest prize than "a second payment standard."

**Correction 3 — Circle Gateway nanopayments are the additive
`accepts[]` entry MPP was not.**
This is the finding with the best cost-to-value ratio in the file.
Circle ships `@circle-fin/x402-batching`, whose server half plugs a
`GatewayEvmScheme` and a `BatchFacilitatorClient` into the **same
`x402ResourceServer` from `@x402/core/server` that this store already
runs**, alongside our existing `HTTPFacilitatorClient`. `GatewayEvmScheme`
"extends the standard onchain scheme, so your 402 responses offer both
rails in one `accepts` array and buyers pick whichever they have funded"
(*index only — Circle's own seller how-to*). Floor: **$0.000001**, gas-free,
buyer signs the same EIP-3009 authorization we already verify.

Circle's own words to sellers could have been written by this store's
intake rule: *"Supporting both rails maximizes the buyers who can transact
with you, the same way a merchant accepts more than one card network. For
the same reason, accept payment on more than one blockchain."*

The catch, which is real and is section 8's problem: **Gateway credits an
off-chain balance immediately and settles on chain in a batch minutes
later.** Our bank walk reads chains. See §7.6.

---

## 3. Two different things people mean by "hands in every pot"

Separating these is the whole analysis.

**A. TILL-SIDE REACH — can an arbitrary agent pay us?**
Value: incremental sales on a shelf that runs $0.001–$21 (plus the $300
collab). Honestly: small, and it will stay small until the economy is
bigger. But it is also **the evidence license.** This store's product is
first-hand signed observation. We cannot publish a dated first-hand
observation of an MPP settlement we have never taken. Every rail we accept
is a rail we can testify about; every rail we refuse is a rail where we are
a commentator. That is the strategic reason to open cheap doors, and it is
worth more than the sales.

**B. INSTRUMENT-SIDE COVERAGE — can we READ everyone else's protocol?**
Value: the actual product. `preflight_endpoint` reads x402 doors.
`check_conformance` reads x402 offers and receipts. The census walks
Base-centric discovery. **None of that requires us to accept a single new
payment.** Reading a `WWW-Authenticate: Payment` challenge costs an HTTP
GET and a parser. Reading an AP2 mandate costs a JWT verify.

And here is the thesis worth writing down:

> **Fragmentation is this store's bull case.** A single winning protocol
> shrinks the observatory's surface to one battery. Five live protocols,
> each with its own receipt shape, its own finality semantics, its own
> directory and its own defect vocabulary, is a market that structurally
> needs a neutral party who reads all of them, is paid by none of them, and
> publishes what expired. Nobody is that today. `mppx validate` exists
> (Stripe's own, *index only*) — first-party and free, which is exactly why
> a third-party dated signed observation is a different product, and the
> copy must say so rather than pretend the competitor doesn't exist.

**The recommendation in one line: be aggressive and cheap on B, additive
and conservative on A, and never let A's regulation get near B's
independence.**

---

## 4. The doors, sized against our own intake rule

`PAYMENT_RAILS.md`'s standing rule: an accepted payment scheme grows by one
entry only when a real named counterparty proves an existing entry doesn't
serve them — with the door-cost lens overriding demand-gating for genuinely
cheap doors. Discovery registrations grow additively and separately.

Latency delta and regulatory delta are scored as the keeper asked: **added
latency and added regulation are costs, not neutral.**

| # | Door | Door cost | Latency delta | Regulatory delta | Reconciliation debt | Verdict |
|---|---|---|---|---|---|---|
| **D1** | **Circle Gateway nanopayments** (x402 scheme entry) | **LOW** — one scheme + one facilitator client on the existing stack | **Zero or negative** (gas-free, off-chain accept) | **Near-zero to accept**; sanctions screening of payout address only at listing | **NEW CLASS** — off-chain balance, no chain walk | **BUILD FIRST, flag-dark** |
| **D2** | **MPP charge, crypto methods** (`evm` / `tempo` / `solana`) | **MEDIUM** — second challenge protocol, dependency-provided, our idempotency/decline/cert work | Low (+1 parse; Tempo 0.6s finality `[secondary]`) | **Zero** — self-generated `MPP_SECRET_KEY`, no account (Gate 2, 08-04, still standing) | Tempo = a fourth chain to walk, or a capped rail | **BUILD SECOND, flag-dark, evm+solana first, Tempo capped** |
| **D3** | **MPP session intent** (escrow + cumulative vouchers) | **HIGH** — channel state, voucher ledger, batch settle, a genuinely new money-state machine | **Best in class** (~sub-100ms/req, no tx per request `[secondary]`) | Zero–low (escrow held by protocol, not by us) | Highest — an open channel IS a receivable | **WAIT** — reopen when a named counterparty meters us, or when the corpus/API sells per-query |
| **D4** | **MPP card via Stripe SPT** | **MEDIUM** code, **HIGH** everything else | Fine | **HIGH — the line we said we wouldn't cross** (KYB on Record Creative Co., disputes, tax, merchant-of-record obligations) | Stripe dashboard, a second book | **NO on the artifact shelf. Narrow yes-if for `the_collab`-class only** (§6) |
| **D5** | **AP2 mandates** | **LOW-MEDIUM** — verify SD-JWT VC chains; we already sign mandate records | None (not a rail) | **Zero** (we verify credentials; we hold no funds) | None | **BUILD — as an INSTRUMENT, not a rail. Highest-value lane in this file** |
| **D6** | **ACP / UCP** | HIGH and wrong-shaped (catalog feeds, carts, merchant application, Stripe account) | n/a | High | n/a | **NO as a merchant. YES as a subject the observatory reads** |
| **D7** | **Lightning (via MPP method)** | Rides D2's protocol, needs a node or Lightspark relationship | Fast | Low-medium | A fourth ledger | **WAIT — behind D2, no demand signal** |
| **D8** | **x401 identity at the 401 door** | Low to READ, doctrine-hostile to REQUIRE | n/a | n/a | n/a | **Unchanged from 08-21: watch, read others', never gate our own porch** |

### D1 — Circle Gateway nanopayments (recommended first)

*What it is.* Buyers deposit USDC into the non-custodial Gateway contract
once; thereafter they sign the **same EIP-3009 authorizations we already
verify**, and Circle batches thousands of them into one on-chain
settlement, amortising gas to nothing. Floor $0.000001. Mainnet since
~May 2026 `[secondary]`; the seller/facilitator SDK paths are documented.

*Why it fits this store specifically, and almost nobody else:*
1. **It is an `accepts[]` entry.** Same server object, same scheme family,
   same signature type. This is the shape Solana passed and MPP failed.
2. **It makes a price point real that we currently cannot charge.** Our
   $0.001 floor exists because gas made anything lower absurd. Batched
   settlement removes that floor. A per-query corpus read at $0.0002, a
   per-defect-lookup at $0.0005, a per-check preflight tip — these become
   arithmetic instead of theatre. **New price points are worth more than
   new buyers.**
3. **It comes with a directory** (§7.8): the Circle Agent Marketplace takes
   submissions with an OpenAPI spec — which we already publish — rather
   than requiring a settled payment first.
4. Circle's x402 issue #447 tells sellers, in Circle's own voice, *"do not
   trust `/verify`; only begin processing once `/settle` has completed."*
   **We already do exactly that** (rule 9 as amended: deliver first, settle
   at the last moment before signing; nothing mints on `/verify`).

*The cost, stated plainly:* Gateway is a **trusted third party with a TEE**
holding an off-chain balance we must later withdraw. That is a receivable
against Circle, and our whole reconciliation doctrine is "the chain is the
one check independent of our own writes." §8 R4.

### D2 — MPP charge, crypto only

Everything from the 08-04 gate survives, minus the build. What it buys:
Tempo-native buyers, the MPP directories, `Payment-Receipt` as a first-hand
artifact we can testify about, and the honest right to say "MPP" in copy
(standards-boundary law — never "compliant" until the flows run).

What it costs, and this is the part no dependency removes:
- **A second decline surface.** The Solana registration run's most
  expensive finding was that EVM-shaped decline diagnosis silently
  mislabelled Solana refusals. A second *protocol* will do that worse than
  a second chain did.
- **One idempotency scope across two protocols.** Non-negotiable: a buyer
  must not be able to pay for the same delivery intent once over x402 and
  once over MPP. Keyed on resource + payer + bucket, protocol-agnostic,
  with the open delivery intent as the interlock.
- **`MPP_SECRET_KEY` is new key material** — an HMAC root of trust, a third
  secret class beside the ed25519 signing seed and the CDP keys.
- **A new dependency on the money path** (`mppx`), which `AT_SCALE.md`
  rule 6 makes a supply-chain decision rather than a convenience. Audit
  before adding; there is a public advisory page for the npm package that
  this read did not open.

### D5 — AP2 mandates: the lane with the most headroom

We already sell `the_mandate` ($0.10): the agent writes down what it claims
it was authorized to do, we sign the record dated, hold it as neither
party, and bind it into later purchase certificates. The copy already says
the honest thing — it proves the claim was MADE, never that the human said
it.

AP2 defines exactly this object with an industry behind it: Intent /
Cart(Checkout) / Payment mandates as W3C verifiable credentials, chained,
each hop naming the authorizing party and whether a human was present;
donated to FIDO 2026-04-28; card-network dispute processes are the stated
consumer `[secondary]`.

**The product that follows is not "support AP2." It is: take anyone's
presented AP2 mandate chain and return a dated signed third-party
observation of what it did and did not establish** — chain well-formed,
issuer resolvable, constraints as stated, human-present flag as claimed,
expiry, and *what it does not prove.* AP2 itself is explicit that a mandate
cannot tell you money moved; the settlement-side answer is a different
artifact — and we already sell that one (`settlement_attestation`).

Nobody neutral is doing this. The parties who verify mandates today are the
parties with money at stake in the answer. That is the whole argument for
an observatory, made for us by somebody else's protocol.

---

## 5. Latency — what each door costs the buyer, and what it costs us

The keeper's constraint: latency added is a cost. Two separate budgets.

**The buyer's budget** (best available numbers; benchmark rows `[secondary]`):

| Rail | Per-payment step | On-chain settle | True finality | Fee floor |
|---|---|---|---|---|
| x402 exact / Base (ours, `accepts[0]`) | one signature | ~seconds | ~15–20 min | fraction of a cent |
| x402 exact / Solana (ours) | one signature | ~400ms | ~14.4s | ~$0.00025 |
| x402 exact / Polygon (ours, dark) | one signature | ~seconds | ~minutes | fraction of a cent |
| **Gateway nanopayment** | one signature, **no gas** | **deferred (batch, minutes)** | at batch | **$0.000001 floor** |
| **MPP charge / Tempo** | one signature | ~0.6s deterministic | 0.6s | sub-$0.001 |
| **MPP session** | **voucher, ~sub-100ms, no tx** | at session close | at close | ~$0.00001/req |
| Card via SPT | seconds | T+2 | **reversible ~90–120 days** | ~$0.30 + 2.9% |

**Our budget, which is the one we control.** The store delivers first and
settles at the last moment before signing. So the happy path is dominated
by KV round trips and one facilitator call — **not by chain finality.**
Consequences:

1. **Adding rails does not slow the sale.** It adds one verify branch and
   grows the 402 body. Both are real but small.
2. **The 402 body is a shared resource.** Every rail adds `accepts[]`
   entries; MPP adds a second challenge header entirely. The MCP door
   carries the challenge inside a JSON-RPC error. Watch the byte size —
   `PAYMENT_VARY` and the offer-receipt signing both walk the offer set.
3. **The tail is where new rails hurt**: a slow or degraded second
   facilitator (Gateway's API, an MPP verifier) sits on the settle path.
   **Fallback rule: a rail that cannot answer inside its budget must
   degrade to "this rail is not on offer right now," never to a slower sale
   on the rails that work.** Money fails closed; decoration fails open —
   here the *offer* is decoration and the *settle* is money.
4. **Deferred settlement changes what a certificate can claim** (§7.7),
   which is a semantics cost, not a latency cost, and it is the more
   expensive of the two.

---

## 6. Regulation — where the line is, and why it is drawn there

The keeper's constraint: regulation acquired is a cost. Draw it as three
standing tests, so a future door answers them instead of arguing.

**Test 1 — does the door make us hold anybody's money?**
No custody, no float, no balance sheet. This is already doctrine ("not an
escrow, a guarantor, or a dispute court"). x402 today passes trivially:
funds move buyer→payTo, we never hold. **Gateway is the first door that
half-fails**: our proceeds sit as a Gateway balance until we withdraw.
That is not custody of a *buyer's* money — it is a receivable of ours — but
it is a new category, and it gets the same treatment the Solana and Polygon
rails got: **a hard unreconciled/undrawn cap, alarmed, never a refusal
mid-purchase.**

**Test 2 — does the door require anyone to have an account with anyone?**
The porch is open: any agent with a wallet may buy; we never ask for
credentials. A rail that requires the *buyer* to onboard somewhere fails
this test at the door. Gateway passes (the buyer's deposit is their own
business, and non-Gateway buyers still see the standard entry). MPP crypto
passes. **Cards fail it structurally** — not for the buyer, for us: KYB on
Record Creative Co., merchant-of-record obligations, dispute handling, tax
treatment, and a compliance surface that never sleeps.

**Test 3 — is the money reversible after we have signed something forever?**
This is the 08-21 chargeback RULE and it is still open. Card rails reverse
for ~90–120 days. Our certificates are permanent signed observations. A
cert minted against a payment that later reverses stays a *true*
observation and becomes a *false implication*.

**The recommended ruling, unchanged in spirit from 08-21 and now sharper:**

- **Artifact-minting items never take a reversible rail.** Not "delay the
  signing" — that kills instant delivery, our best property. Just: the
  reversible rail is not offered on those items.
- **Every certificate carries `settlement_finality` regardless**, because
  we now have a non-card reason to need it: Gateway's deferred batch means
  even an irreversible rail can be *not yet on chain* at mint. Values want
  to be honest about three different things: `irreversible_onchain`,
  `accepted_offchain_pending_batch`, `reversible_window_open_until:<date>`.
- **If cards ever open, they open exactly where the fee math and the
  delivery shape already agree**: the human-queued, high-ticket end of the
  shelf (`the_collab`-class), where 2.9% + $0.30 is ~1% instead of 6000%,
  where delivery is a person's hand anyway, and where no forever-artifact
  mints at settle time. That is a narrow, defensible door — and it is still
  a keeper decision about acquiring a regulated relationship, not an
  engineering call.

**Ambient regulation worth tracking, none of it blocking today** `[secondary]`:
GENIUS Act (law 2025-07-18; Treasury targeting final rules ~July 2026;
bans stablecoin interest, which is why a Gateway balance is a receivable to
sweep, not a treasury to farm); MiCA in force in the EU since 2024-06-30;
and the standing structural fact that agents have no legal personhood, so
liability lands on whoever funded the wallet. **That last one is the demand
driver under `the_mandate` and under D5.** Also worth naming: Circle
sanctions-screens the payout address at marketplace listing — we already
screen `payTo` on other people's doors, so this is alignment, not friction.

---

## 7. What it touches — every product, every instrument, every surface

This is the section the keeper asked for: *how does this hit everything we
already have.*

### 7.1 The till (code seams, named)

| File | What changes for D1 (Gateway) | What changes for D2 (MPP) |
|---|---|---|
| `src/lib/payments.ts` | Register `GatewayEvmScheme` beside `ExactEvmScheme`; add `BatchFacilitatorClient` to the stack; new flag `GATEWAY_PAY_TO`-shaped gate; `acceptedNetworks()` unchanged (same chains, new scheme) | New: a second challenge builder, realm, `MPP_SECRET_KEY`, method config |
| `src/lib/payment-gate.ts` | New scheme branch; `maxTimeoutSeconds` for batched entries (~7 days) breaks the current signing-window assumption | Second protocol path: `WWW-Authenticate` out, `Authorization: Payment` in, receipt header out |
| `src/lib/mcp-payment.ts` | Unchanged in shape | **Second payment convention on the MCP door** — ours is `_meta["x402/payment"]`; MPP's MCP transport returns its receipt in `_meta` too. Both must land in ONE settle pipeline |
| `src/lib/idempotency.ts`, `src/lib/replay-guard.ts` | Nonce space unchanged (still EIP-3009) | **Load-bearing**: one scope across protocols, delivery intent as interlock |
| `src/lib/decline-diagnosis.ts` | New refusal reasons (insufficient Gateway balance, batch rejected) | **Highest-risk file.** A second protocol's refusals must not be diagnosed in the first protocol's vocabulary — the exact bug the Solana run found |
| `src/lib/metrics.ts` (`railOf`) | New bucket or the books silently book Gateway income as Base income — **the Polygon `railOf` bug, verbatim** | Same, for `tempo` |
| `src/lib/offer-receipt.ts` | Signed offers must cover the new entries | Our signed-offer extension is x402-shaped; MPP has its own receipt. Two receipt formats, one drawer |
| `src/lib/payments.ts` `PAYMENT_VARY` | Unchanged (same headers) | **Add the MPP headers** — the one-string, four-site rule exists for exactly this |
| `src/lib/client-spend-cap.ts`, `pay-to.ts` | Caps apply per rail | Same |

### 7.2 The shelf

- **Penny/sub-cent items** (`spot_check` $0.001, `settlement_attestation`
  $0.004, `settlement_reconciliation` $0.006, penny pages $0.01): D1 is
  transformative — these are the items whose economics were gas-bound.
  **These are also where a sub-$0.001 tier becomes possible for the first
  time.**
- **Mid shelf** ($0.99–$5 audits, watches, cards, mandate, anchors): D1/D2
  are pure reach; no change to fulfillment.
- **`the_mandate` ($0.10)**: gains a sibling product under D5, and its copy
  gains a mapping table ("what an AP2 chain establishes; what this record
  establishes; where they differ").
- **Human-queue / high ticket** (`the_collab` $300, commission rungs):
  the only place cards are ever arguable (§6).
- **Recurring** (`recurring_patronage`, `conformance_watch`): MPP's
  subscription/session intents are the natural home for real recurring
  billing rather than repeat one-shots — **but that is D3, and D3 waits.**

### 7.3 The free instruments — where the cheap wins are

These are readers. They cost no rail, no key, no regulation, and they are
how the observatory's coverage grows faster than its till.

| Instrument | Cross-protocol extension | Cost |
|---|---|---|
| `preflight_endpoint` | Read a `WWW-Authenticate: Payment` door as well as an x402 one; report which protocols a door speaks and which it *claims* to speak | **Small.** A parser and new advisory rows |
| `check_conformance` | Second battery for MPP challenge/credential/receipt shapes; third for AP2 mandate chains | Medium per battery, and each battery is a new subject family (`src/evidence/subject.ts` — the rule that a row arrives WITH its battery holds) |
| `check_before_you_pay` | Advise across protocols: "this door offers x402 and MPP; here is what each costs you and what finality each gives" | Small, high copy value |
| `verify_artifact` | Unchanged for ours; the paid third-party receipt-verification door (KEEPER_LIST #11) becomes **cross-protocol** — the single most defensible new SKU in this file | Medium |
| The census (`scripts/x402-census.mjs`) | Walk `mpp.dev/services`, Circle's Discovery API and `.well-known` manifests beside CDP Bazaar | Medium; **fixes a named blind spot** (Part D already recorded that our census sees ~2.5% non-Base doors) |

### 7.4 The MCP door

Two live conventions, one till:
- ours today — 402 as JSON-RPC error, payment in `params._meta["x402/payment"]`;
- MPP over MCP — challenge thrown, receipt in `_meta`.

Both are documented and both exist in the wild. **The tool descriptions
must not grow a protocol matrix** — the five grouped `buy_*` tools exist
because per-item tools were worse for the agent. A rail is a detail of the
402, not a tool name. **No new tools for new rails, ever.** What changes:
`read_store_guide` copy, the payment-guidance strings, and the free
instrument tools' outputs.

### 7.5 The skill, the CLI, the plugin, the listings

- `skills/scvd-general-store/SKILL.md` — "USDC on Base or Solana" is
  keeper-ink in several places; it derives nothing from `acceptedNetworks()`.
  The Polygon copy pass is already owed. **Do not widen it before a rail is
  lit** — advertising a door that does not exist is the one thing worse
  than a dark door. Then it becomes one pass, not four.
- `cli/` — wraps free instruments only, holds no key, cannot sign a payment.
  **That constraint should survive every rail added here.** The CLI gains
  protocol-aware *reads* and never a payer.
- `server.json` / MCP registry — a published version is immutable
  (DISTRIBUTION §1). Any positioning change to "cross-protocol" is a
  version bump plus the workflow button, and `doors:check` already goes red
  on drift.
- `plugin.json`, `mcp.json`, `llms.txt`, `/what`, `openapi.json`,
  `.well-known/x402.json` — machine surfaces derived from
  `acceptedNetworks()` follow automatically; hand copy does not. That split
  is already documented; it just gets exercised harder.

### 7.6 The books, reconciliation, tax — the expensive part

Today: the bank walk reads Base RPC; Polygon carries a $10 unreconciled cap
until its walk ships; Solana had the same treatment.

**Gateway breaks the pattern rather than extending it.** There is no chain
to walk at settle time — the seller's proceeds are an off-chain Gateway
balance, batch-settled later. Reconciliation becomes:
1. our own till record (what we think we sold),
2. **Circle's `getBalances()` / Search x402 Transfers API** (the
   counterparty's record — *not independent of anybody's writes but ours*),
3. the eventual on-chain batch (independent, but late and aggregated —
   a batch does not name our individual sales).

So the honest statement is: **for batched rails, the independent check
arrives late and in aggregate, and per-sale reconciliation is against a
counterparty API.** That is a real reduction in evidence quality and it
must be *published*, not smoothed — it is precisely the kind of gap this
store counts against itself. Bound it the way Solana and Polygon were
bound: a cap on undrawn Gateway balance, alarmed, plus a scheduled sweep.

Everything else follows the Polygon precedent exactly: own bucket end to
end in `railOf`, till counters, certificate walk, `organic_by_rail`, the
books invariant, the net-by-chain statement (with the observed side
honestly absent until a walk exists), and `tax-export`.

### 7.7 Certificates and the attestation spec

- **`settlement_finality` ships with the first non-instant rail**, not
  after (§6).
- The cert already records which rail settled, signed at mint. It gains
  **which protocol** carried it.
- The outcome-verification separation the house already believes in
  (paid / settled / executed / delivered / externally-observed /
  not-checked) becomes load-bearing rather than doctrinal: batched and
  reversible rails are exactly the cases where collapsing those fields
  would make the artifact lie.
- `scvd-attestation` spec version bump; JCS dual-emit unchanged;
  `key_history` / did:web unchanged.

### 7.8 Discovery, census, corpus, six doors

Four different admission mechanisms, and conflating them is how a listing
run wastes a week:

| Surface | How you get in | Our state |
|---|---|---|
| **CDP Bazaar** | **Earned**: one settled payment per endpoint, `paymentPayload.resource` set. No form, no override | In, whole shelf (the 08-04 registration run) |
| **Circle Agent Marketplace** | **Submitted + reviewed**: live 402 door, published OpenAPI, payout address sanctions-screened | **Not submitted. We already meet every stated prerequisite.** Keeper's hand |
| **`mpp.dev/services`** | **Curated list** of live MPP services | Not eligible without D2 |
| **Agent Almanac** | Cross-protocol public reference (x402, MPP, ACP, UCP, AP2, A2A, MCP) | Not listed; the most on-thesis directory in the file |
| **`.well-known/x402.json`** | **Self-hosted.** x402#2582 proposes origin-hosted discovery explicitly because facilitator discovery is payment-gated and client-echoed — *and cites MPP's merchant manifests as the precedent* | **We already serve it.** We are early on a proposal others are drafting |
| MCP Registry / Claude connectors / skills indexes | Publish / submit | Live / owed (DISTRIBUTION) |

`src/evidence/subject.ts` already anticipates all of this: "MPP, AP2/ACP-class
land here as new rows when their batteries are built — **the row arriving
WITH the battery is the point.**" Nothing in this file changes that rule; it
just names which rows are worth building batteries for, and in what order.

`SIX_DOORS.md` is unaffected in structure — the six doors are about how an
agent *reaches* us, not how it pays. But a seventh question now sits
alongside it and deserves the same weekly instrument: **which protocols is
the store reachable and legible in?** Same shape, same expiry, same
published misses.

---

## 8. Risks, drawbacks, fallbacks

**R1 — the naive x402-only buyer.** The load-bearing test (C.1 in the
red-team spec) is that an agent that knows nothing about any of this
behaves *identically*. Base stays `accepts[0]` at the minimum tier. New
entries append. A second protocol's challenge header must never displace
the x402 body. **Fallback: every rail ships flag-dark; unset flag = a
byte-identical store.** This has worked twice; it is not a hypothesis.

**R2 — double payment across protocols.** A client that sees both an x402
body and an MPP challenge could, buggily, satisfy both. The AWS client
explicitly falls back one way and never resubmits after submission — good
citizens exist, bad ones will too. **Fallback: one idempotency scope,
protocol-agnostic key, open delivery intent as the interlock, and the chain
as the last backstop (a reused EIP-3009 nonce reverts).** Test it the way
the 08-04 audit tested it: concurrently, with a mock that enforces
nonce-once like the chain does, because a looser mock is how this exact
class of bug hid last time.

**R3 — decline mislabelling.** Established, not hypothetical: the Solana
run shipped with EVM-shaped diagnosis mislabelling Solana refusals. A
second protocol is a bigger version of that bug. **Fallback: refusal
diagnosis is protocol-tagged from the first line of the build, and the
"unknown protocol" branch says *unknown* rather than guessing** — an
instrument that accuses when confused accuses hardest when it has least
right to.

**R4 — counterparty and custody creep (Gateway, Tempo, Stripe).** Each new
rail is a new party who can be down, can freeze, can change terms, or can
hold our proceeds. **Fallback: caps and sweeps, per the Solana/Polygon
precedent, plus the standing rule that a degraded rail is withdrawn from
the offer set rather than allowed to slow or fail a sale.**

**R5 — supply chain.** `mppx` and `@circle-fin/x402-batching` on the money
path. `AT_SCALE.md` rule 6 makes this a decision, not a convenience.
**Fallback: pin, audit, read the advisory history, and prefer the manual
server mode over framework middleware where it reduces surface** — mppx
documents a manual Fetch-API mode; we run our own gate anyway.

**R6 — evidence quality dilution.** Batched and reversible rails weaken
what a certificate can honestly assert. **Fallback: `settlement_finality`,
outcome-separation, and publishing the reconciliation gap as a counted
miss.** If we cannot say it honestly, we do not take that rail on that item.

**R7 — copy drift and premature claims.** The standards-boundary law
("x402-native", "maps to", "references"; never "compliant" without the
flows) is now under maximum pressure, because five protocol names are
suddenly available to sprinkle. **Fallback: no protocol name enters copy
until its flow runs in production, and the mapping table ships with it.**

**R8 — the whole bet is wrong.** Volume is down 93% YTD on one honest
read. Fragmentation could resolve to one winner (most likely x402 or MPP
absorbing the other, given they are already compatible at the charge
layer), and a plural observatory would have built batteries for ghosts.
**Fallback, and it is a good one: every instrument-side build is a READER.**
A reader for a protocol nobody adopts costs a parser and a subject row. A
till-side build for a protocol nobody adopts costs a flag left dark. Both
failure modes are cheap on purpose. **The expensive builds (D3 sessions,
D4 cards) are exactly the ones gated behind a named counterparty.**

---

## 9. Revenue — how fragmentation pays, assuming the economy takes

Three lanes, in ascending order of how much they are actually worth.

**Lane 1 — the same goods through more doors.** Real but small: our shelf
is cheap by design. The honest model is *reach × conversion on a shelf
whose average sale is under a dollar.* Do not fund a roadmap on it.

**Lane 2 — new price points that did not previously exist.** Batched and
session settlement make sub-$0.001 pricing arithmetic instead of theatre.
That opens metered products we cannot currently sell: per-query corpus
reads, per-lookup defect vocabulary, per-check preflight at a tip price,
per-row registry access. **This is where nanopayments actually pay: not
more buyers, more sellable units.**

**Lane 3 — the observatory monetises fragmentation itself.** The strongest
lane, and it needs no new rail:

1. **Cross-protocol receipt verification** (KEEPER_LIST #11, now bigger
   than filed): take anyone's receipt — x402, MPP `Payment-Receipt`,
   Gateway batch reference, ACP order — and return a signed dated verdict:
   valid / invalid / insufficient-evidence / expired / indeterminate. Free
   by ID for ours forever; paid for batch and third-party. **The value goes
   up with every additional receipt format in the world.**
2. **The mandate desk (D5)** — third-party observation of AP2 mandate
   chains, where liability and card-network dispute evidence actually land.
   Highest ceiling in the file.
3. **Cross-rail settlement attestation** — extend the existing SKU beyond a
   Base RPC walk to Solana, Polygon, Tempo, and Gateway's transfer search.
   Each protocol proves settlement differently and none of them are
   comparable; a single signed comparable verdict across all of them is a
   thing only a neutral party can sell.
4. **The cross-protocol census/corpus** — the only dated, signed,
   weekly-appending map of who is payable, on what protocol, over what
   rail, with what finality. Feeds every SKU above, feeds the passport,
   feeds the AEO surface, and is the strongest possible argument for
   inclusion in every directory in §7.8.
5. **The compatibility mapping pack** (KEEPER_LIST #12) — now buildable
   with real requirements: what an operator's metadata has, what each
   protocol needs, which claims they must not make.
6. **The Endpoint Passport, multi-protocol** — the umbrella that makes 1–5
   one purchasable object.

**The shape of the bet, stated for the record:** lanes 1 and 2 pay if the
economy grows. **Lane 3 pays if the economy grows *and stays plural* — and
it is also the lane that costs least to hold open while we find out.**

---

## 10. The sequence, and what would falsify each step

Ordered by ROI × doability, the keeper's own criterion, and every step
sized so a wrong bet is cheap.

| Step | What | Size | Gate | Falsified by |
|---|---|---|---|---|
| **0** | **Re-read the primaries.** paymentauth.org, mpp.dev, docs.stripe.com, developers.circle.com, from a machine that can reach them. Fix any byte-level claim in this file | hours | none — do it before any code | — |
| **1** | **Circle Agent Marketplace submission** (D1's directory half, no code) | keeper's hand, minutes | prerequisites already met | rejected listing → we learn why, free |
| **2** | **Agent Almanac + cross-protocol directory pass** | keeper's hand | rule 30 | — |
| **3** | **Instrument-side readers**: preflight reads MPP doors; census walks MPP/Circle/manifest surfaces | small | none | nobody's door speaks them → the census says so, which is itself a finding |
| **4** | **D1 Gateway nanopayments, flag-dark**, with cap + sweep + `railOf` bucket + `settlement_finality` | medium | flag unset = byte-identical store | scheme rejected by our facilitator stack → fails in test, costs a day |
| **5** | **Sub-cent price tier** on one metered product, once D1 is lit | small | keeper prices it | nobody buys at $0.0005 → we learn the floor is demand, not gas |
| **6** | **MPP conformance battery** (read-only) + subject row | medium | the row arrives with the battery | — |
| **7** | **AP2 mandate desk** (D5) | medium | keeper rules the product | AP2 stalls at v0.2 under FIDO → the reader still verifies what exists |
| **8** | **D2 MPP charge, crypto, flag-dark**, evm+solana first, Tempo capped | medium-large | **the reopening condition from Part B is now met** (§11) | our own dogfood purchase fails → we publish the failure, which is on-brand |
| **9** | Cross-protocol receipt verification SKU | medium | after 6 | — |
| **10** | D3 sessions / D4 cards | large | **named counterparty only** | — |

---

## 11. What the keeper has to rule (nobody else can)

1. **Does the MPP wait-and-see reopen?** Part B's own reopening condition
   was "a named counterparty asks, OR the scheme shows up in ward-round
   drift data as ecosystem-adopted." **The second condition is met on the
   evidence in §1** — AWS, Cloudflare, Arbitrum, Abstract, MultiversX and
   http4k have all shipped MPP support, observed in their own repos. No
   buyer has asked. That is a ruling, not a deduction: *does
   implementation-by-the-ecosystem count as adoption, or does adoption mean
   a buyer at our door?*
2. **The chargeback RULE, still open since 08-21.** §6 recommends: never on
   artifact-minting items, `settlement_finality` ships regardless, cards
   only ever at the `the_collab` end. Needs a yes/no.
3. **Circle relationship** — the marketplace listing is free and needs no
   account; a deeper Gateway relationship (and the Alliance Program thread
   from 08-20) is a keeper conversation.
4. **The Gateway receivable cap number**, in the shape of the $10 Solana
   and Polygon caps.
5. **Price** for any sub-cent tier, and for the mandate desk. Prices are
   keeper ink.
6. **Copy**: whether the store's one-liner becomes cross-protocol before or
   after a second protocol runs. The standards-boundary law says after.

---

## 12. What this read could not establish

Counted against us, per the house rule that an instrument publishes its
own gaps:

- **Byte-level MPP wire facts remain secondhand.** paymentauth.org and
  docs.stripe.com were unreachable; the strongest primary here is
  Cloudflare's docs source and AWS's SDK, which are implementations, not
  the spec.
- **Circle's seller and marketplace requirements were read as indexed
  passages, not fetched from developers.circle.com.** The sanctions
  screening, prerequisites and SDK shapes are quoted from that index. The
  claim "no Circle account is required to accept nanopayments" is the one
  most worth re-verifying, because the whole doctrine-fit argument for D1
  rests on it.
- **No number in §1's demand picture was measured by us.** Our own census
  is the instrument we trust, and it currently sees a Base-centric slice —
  a limit it already publishes.
- **`mppx` was not audited.** A public advisory page exists for the npm
  package; this read did not open it.
- **Nothing here was tested against a live MPP or Gateway door.** The
  cheapest way to convert this file from analysis into evidence is the way
  it was done for Solana: buy something, ourselves, on the new rail, and
  write down what happened — including the failures, which last time were
  worth more than the successes.
