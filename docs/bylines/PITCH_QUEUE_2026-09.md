# Byline pitch queue — 2026-09-08

Candidates drawn from work landed between 2026-08-18 and 2026-09-08.
Each entry names the evidence already in this repo, the one canonical
link the piece would point at, and the boundary the piece must state.
Ordered by how hard the finding is for anyone else to reproduce.

Already published, do not repeat the angle:
- AURa — HackerNoon, 2026-08.
- "35 x402 hosts served no signed offer" — dev.to, 2026-09-03.

Standard: `docs/bylines/STANDARD.md`. One target question per piece.

---

## 1. The ecosystem got dramatically better in 18 days — and the number is a trap

**Target question:** does x402 actually work yet?

August 18/19: 1,589 domains walked, 1,707 attempts, **489 paid — 28.6%**.
September 5: 40 domains, 34 payments presented, **34 settled — 100%**,
$0.0350 spent, reconciliation gap $0.0000.

The honest piece is not "it went from 29% to 100%." It is why those two
numbers cannot be subtracted. August walked the entire walkable set
including the dead fleets; September walked 40 doors that were already
answering. Same instrument, different denominator. The interesting
constant is the one that did not move: **~87% of doors return a
structured 402 in both runs** (87–88% August preflight, 87.5%
spec_conformant September). The gate held steady; what changed is which
doors you point at.

- Evidence: `research/field-run-2026-08-18/FIELD-REPORT.md`,
  `research/field-run-2026-09-05/report.md`, both ledgers.
- Canonical link: the corpus round.
- Boundary: two runs, one wallet, two moments. Not a trend line.

**Why nobody else can write this:** it requires having walked the whole
set once with real money, and having kept the ledger.

---

## 2. I told an agent to rob my own store. It found 39 ways.

**Target question:** what actually breaks in an agent-payment checkout?

39 findings against a live x402 storefront: **6 SEV-1, 24 P1, 9 P2**.
Not fuzzing for crashes — auditing the money boundary. The good ones:

- **BUY-001** (SEV-1): a required text field of `U+0000` passes
  validation, settles the payment, then vanishes during fulfillment.
  24 mocked settlements, empty goods delivered.
- **BUY-005** (SEV-1): buy a case file with claim A, pay again with a
  corrected claim B, and the signed artifact still contains A.
- **BUY-017** (SEV-1): a lost settlement acknowledgement leaves no
  artifact and reports "No charge."
- **BUY-028** (SEV-1): an invalid renewal target buys a *different pass*.

The frame that makes it a piece: every one of these is a way to take
money and not deliver, and **none of them is a payment bug**. The
payment layer worked every time. x402 is solved; the twelve inches on
either side of it are not.

- Evidence: `research/BUYER_AUDIT_LOG.md` (39 entries with
  reproductions), `BUYER_REPAIR_CHECKLIST.md`, the per-audit reports.
- Canonical link: the audit log.
- Boundary: isolated worktree, disposable keys, simulated settlement.
  No live-money incident is claimed.

**Why nobody else can write this:** almost nobody adversarially audits
their own paid endpoint, and nobody publishes the findings with IDs.

---

## 3. My A2A endpoint passed the compliance checker. It was not compliant.

**Target question:** does my A2A agent actually conform?

`@a2a-compliance/cli@0.3.3` returned **exit 0, MANDATORY, 16/20 pass,
0 fail**. The card command returned **FULL_FEATURED, 6/6**. The endpoint
was still broken against the official 0.3.0 schema:

- A completed Task omitted the required `contextId`. The official schema
  rejects it; the checker's Task schema has `contextId` optional.
- `tasks/get` on a Task ID returned by that exact request immediately
  returned `-32001`. Same for `tasks/cancel`. §11.1.2 requires both.
- `message.parts: [null]` returned HTTP 500 instead of a JSON-RPC
  invalid-params error.

And the checker has its own defects worth naming: it recognizes only the
exact strings `0.3` and `1.0`, warns on a valid `0.3.0`, maps
`message/send` to 1.0 when the official 0.3.0 spec uses it, and **treats
a MUST warning as non-failing** — so a zero exit is not a gate.

Includes a correction the ecosystem needs: the widely-repeated claim
that A2A agents are near-zero-compliant traces to
[A2A issue #1755](https://github.com/a2aproject/A2A/issues/1755) — one
autonomous research agent's sample of 50 advertised agents. That is an
issue author's sample, not a maintainer statement or an ecosystem rate.

- Evidence: `docs/A2A_COMPLIANCE_2026-09-06.md`,
  `research/a2a-2026-09-06/` (raw probes, official schema, package lock,
  the pre-deploy gate that failed exactly the five expected checks).
- Canonical link: the A2A desk.
- Boundary: one endpoint, one snapshot, structural validation only.

**Why nobody else can write this:** it needs a real A2A endpoint, a
willingness to publish your own failure, and a reading of the checker's
source rather than its README.

---

## 4. An audit told me I lacked WebMCP. My store ships zero JavaScript.

**Target question:** should my site expose WebMCP tools?

An outside audit scored the store **0/5 Required** on WebMCP and 0/100
on "can a user act through an agent?" Two things were wrong with the
scorecard before the store even had to answer it:

1. `navigator.modelContext` — the API the audit scored against — **is
   deprecated in Chrome 150**; the surface moved to
   `document.modelContext`. Building to the audited name ships a
   deprecation on day one.
2. WebMCP tools execute *in the visiting agent's browser*, from a
   `<script>` the site ships. This store shipped none — no script tag
   outside `application/ld+json`, no form, no listener, no CSP header,
   because nothing had ever needed one.

That collided with a standing house rule: *the store never asks a
visiting agent to run code.* The piece is the ruling that resolved it —
what got amended, and the shape that survived: a browser bridge that
**transports an already-signed payment and never opens a wallet, signs,
installs a client, or retries**. Quotes live in bounded page memory,
capped at 16, five-minute expiry.

- Evidence: `docs/WEBMCP_AND_MCP_APPS_2026-08.md` (the brainstorm with
  the ruling annotated mid-document), `webmcp/purchase.js`,
  `docs/BROWSER_CHECKOUT_2026-09-06.md`.
- Canonical link: the browser till.
- Boundary: one Base browser-till purchase is verified
  (`cert_et6zuesrrn`). In-page signed completion, other chains, and
  broad extension compatibility remain untested.

**Why nobody else can write this:** the "audit scored a deprecated API
name" catch requires reading the spec, not the scorecard.

---

## 5. A Solana signature can claim an Ethereum buyer's receipt

**Target question:** what breaks when a payment endpoint accepts more
than one chain?

Multi-rail is the buzzword; this is the bill. Checkout runs on Base,
Polygon, Arbitrum, World and Solana. Two findings, both structural:

- **BUY-018**: a cryptographically valid Solana signer attaches an
  unsigned, EVM-shaped `payload.authorization.from` naming someone
  else's wallet — and both HTTP and MCP doors return **that EVM buyer's
  cached certificate**, without settling the Solana payment. The
  facilitator SDK correctly returns the real Solana payer. The store's
  cache lookup read the adjacent, unauthenticated field. *The signature
  authenticates the transaction, not the metadata next to it.*
- **BUY-019**: a settlement response carrying `transaction: "0OIl!"`
  mints a certificate containing that value, and `/api/verify` reports
  it **valid**. The signature is valid. The payment reference is neither
  base58 nor a 64-byte signature. *Certificate validity is not
  transaction validity.*

The general law: derive identity from the rail that was actually
verified. Every cross-rail cache, replay guard and nonce store is a
place to get this wrong.

- Evidence: `research/buyer-cross-rail-2026-09-06.md` (116
  observations, real ed25519 fixtures, independent SDK validation in
  Node), `SOLANA_PARITY.md`.
- Canonical link: the defect page.
- Boundary: disposable identities, simulated chain state, no mainnet
  broadcast. Not a claim about any live facilitator's current output.

**Why nobody else can write this:** you need three rails live and a
test matrix that crosses them.

---

## 6. Your unsold endpoint is an undiscoverable endpoint

**Target question:** how do I get my x402 endpoint into Coinbase's Bazaar?

Verified against Coinbase's own docs: there is **no submission API, no
dashboard form, no manual override**. The CDP Facilitator catalogs a
service *the first time it settles a payment for that endpoint* with
`paymentPayload.resource` set. One real settled payment is the only door
in, on any chain.

The consequence sellers miss: **a new listing's first purchase is its
registration fee.** If nothing has ever bought it, nothing can find it.
Buy your own thing once.

Second, sharper, tactical finding: Bazaar **auto-consolidates bare
high-cardinality path segments** — UUIDs, EVM and Solana addresses,
hashes — into one generic template entry. A paid route with a raw
address in its path gets silently merged with strangers' routes. The fix
is a static prefix: `/watch/w-<id>`, never `/watch/<id>`.

- Evidence: `PAYMENT_RAILS.md` (CDP discovery section, verified
  2026-08-04 against x402/welcome, /bazaar, /network-support).
- Canonical link: the store guide.
- Boundary: reads Coinbase's published behavior at one date.

**Why nobody else can write this:** it's a small, concrete, immediately
actionable finding — the highest-retrieval shape there is.

---

## 7. 23 of the 28 ways an x402 door can be broken are visible before you pay

**Target question:** how do I check an endpoint before spending money?

The defect vocabulary is at v13: **28 named classes, 23 detectable by an
unpaid probe, 5 only by a settled payment.** Every class carries what it
asserts, what a buyer loses, what would falsify a finding of it, and
both halves of the remediation — operator side and buyer side.

The argument the piece makes: the industry keeps proposing reputation
scores for endpoints when **82% of the failure surface is a free GET
away**. You do not need a rating. You need a parser and a name for what
you saw.

Names carry the piece — `unsignable-offer`, `nonce-unbound-from-
settlement`, `payto-moved`, `delivered-nothing`, `offer-contradicts-
challenge`. And the one that gives it teeth: `delivered-nothing` is in
the paid-only bucket, which is precisely why free preflight is a floor
and never a guarantee.

- Evidence: `defects/defects.json` (v13), `defects/fixtures/doors/*`
  (recorded 402 responses, each naming the checks it fails),
  `npm i scvd-defects`.
- Canonical link: `/defects`.
- Boundary: describes one endpoint at one moment. Never a ranking, and
  no hostname ever appears in it.

**Why nobody else can write this:** the vocabulary is versioned,
published, MIT/CC BY, and derived from a 1,589-domain walk.

---

## 8. The agent economy's headline numbers are 85–95% wash

**Target question:** how big is agentic commerce really?

Two deep-research passes through different models converged without
citing each other: headline agent-economy volume — tens of millions of
transactions, tens of millions of dollars — is **85–95% wash trading,
idle probing, or self-directed testing** once filtered. Real 30-day
organic GMV on x402/Base looks closer to **~$0.5M**, across roughly
**100 genuinely organic sellers**, with a **median seller revenue near
one cent**.

One frequently-cited flagship was checked directly on chain: lifetime
inflow was two funding transfers totaling **33 USDC**, no customer
revenue at all, and every advertised endpoint returned a server error.

Backed by structure from the August walk: six host fleets (vercel.app
147 domains, workers.dev 101, railway.app 81, klymax402 70, and two
more) account for **over 470 of 1,589 domains — nearly a third**. x402
is not a broad ecosystem yet; it is a handful of operators running
multi-domain patterns.

One sentence to build around: *the agents spending money mostly aren't
earning it, and the ones claiming to earn it mostly can't prove it.*

- Evidence: `research/x402-pulse.md`,
  `research/field-run-2026-08-18/FIELD-REPORT.md` (fleet table).
- Canonical link: the corpus.
- Boundary: two research passes plus one walk; the wash percentage is a
  derived estimate, not a measured census.

**Why nobody else can write this:** it needs the on-chain check of the
flagship *and* the fleet concentration table to land as structure rather
than cynicism.

---

## 9. The single biggest failure in x402 is not adoption. It's the 400.

**Target question:** why did my x402 payment fail?

From 1,707 real attempts, the failure taxonomy:

| Failure | Count | Share |
|---|---|---|
| Payment failed: 400 (facilitator rejects a signed payment) | 667 | 39% |
| Still 402 after paying | 188 | 11% |
| 422 unprocessable | 129 | 8% |
| 404 ghost endpoint | 82 | 5% |
| No PAYMENT-REQUIRED header | 81 | 5% |
| 500/502 | 60 | 4% |
| ENS payTo with no resolver | 21 | 1% |

**Two in five failures are a correctly signed payment the facilitator
rejects.** That is not an agent bug and not an adoption problem.

Plus the shape problem: a buyer must parse **at least four different 402
challenge structures** — `paymentRequirements` (only ~33% use the
standard), an `accepts` array, `x402Version` + `resource`, and a
base64 PAYMENT-REQUIRED header with an empty body. Two endpoints both
"speak x402" and structure the challenge differently.

Buyer rules that fall out of it: treat 400 as *reject and move on*, not
*fix and retry*. Never trust `accepts[0]`. Expect ~34% first-try success
on cheap doors and build fallback facilitators, not re-signing.

- Evidence: `research/field-run-2026-08-18/FIELD-REPORT.md`,
  `ledger.jsonl` (1,707 entries).
- Canonical link: `/defects`.
- Boundary: one buyer, one wallet, one week, one facilitator path.

**Why nobody else can write this:** the denominator is 1,707 real paid
attempts. That's the whole moat.

---

## 10. My own ledger under-reported my spending by 10%

**Target question:** can I trust my agent's record of what it spent?

Reconciling the August walk against Base: the ledger recorded **489 paid
entries, $5.7355**. The chain showed **669 transfers, $6.3970**. Gap:
**$0.6615 across 180 transfers the ledger never recorded as paid** — a
**10.3% under-report**, concentrated at the cheapest tier ($0.001:
283 on chain, 157 in the ledger).

Root cause is mundane and universal: the script signs and sends, then
the response isn't 200 — or it times out, or it crashes — and the
payment settles on chain anyway while the ledger writes a failure. **Any
agent that logs after the response under-reports its own spend.** The
ledger is a lower bound; the chain is ground truth.

The follow-through is the better half of the piece. September 5's run
reconciled to a **gap of $0.0000** — and the report says plainly that a
zero gap *does not establish independence*, because the ledger and the
reconciler are one party's tooling reading one declared wallet. A defect
common to both survives a gap of zero unchanged. Every settled row
carries its transaction hash so anyone can be the second instrument.

- Evidence: `research/field-run-2026-08-18/FIELD-REPORT.md`
  (`usdc-transfers.json`, 669 transfers, blocks 50140000–50180000),
  `research/field-run-2026-09-05/reconciliation.json`.
- Canonical link: the corpus round.
- Boundary: one wallet, two block ranges, one party's tooling.

**Why nobody else can write this:** publishing that your own accounting
was 10% wrong is the entire credibility of the piece.

---

## Sequencing note

If the goal is HackerNoon web3 ranking retention, **#2 and #3** are the
strongest openers: both are "I broke my own thing" pieces, which travel
further than census pieces and cannot be written by anyone without a
live endpoint. **#6 and #9** are the highest-retrieval evergreen pieces
— they answer a query a builder types while stuck. **#1, #8 and #10**
are the ones a publication is most likely to want as a headline.
