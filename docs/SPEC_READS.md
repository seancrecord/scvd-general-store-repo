# Spec reads — the store's positions on adjacent protocols

One dated entry per read. These are POSITIONS, not implementations:
what the protocol is, what it would cost us to speak it, and what we
say about it until we do. The standards-boundary law applies to every
entry — we say "x402-native", "maps to", "references"; we never say
"compliant with" a protocol whose flows we have not implemented.

Sourcing note (2026-08-21): the primary spec hosts (docs.stripe.com,
mpp.dev, x401.id, developers.circle.com) are egress-blocked from the
build environment, so these reads are assembled from secondary
coverage and Circle's own announcement posts, dated below. Byte-level
claims (header names, envelope fields) are therefore NOT settled facts
here — any build that touches wire format re-reads the primary spec
first. Positions and boundaries below don't depend on those bytes.

## 2026-08-30 — the cross-protocol re-read (supersedes the sourcing caveat above, in part)

The three reads below were assembled under an egress block. On
2026-08-30 a wider read reached some of those primaries and their
mirrors — the cloudflare-docs repository, the AWS AgentCore SDK, the
x402 Foundation issue tracker — and could still not reach
paymentauth.org, docs.stripe.com or developers.circle.com directly.
The result, with what changed, what stands, and what is still
secondhand, is filed at `docs/PROTOCOL_EXPANSION_2026-08.md`. It covers
MPP, Circle Gateway nanopayments, AP2, ACP/UCP, x401 and the discovery
surfaces around them, and it re-poses (does not re-rule) the MPP gate
in PAYMENT_RAILS Part B. The positions below stand until the keeper
rules; the door-cost sizing in the MPP entry is superseded there.

## 2026-08-21 — MPP (Machine Payments Protocol, Stripe + Tempo)

**What it is.** An open protocol co-authored by Stripe and Tempo,
released 2026-03-18 (the day Tempo's payments L1 hit mainnet). Same
door as ours — HTTP 402 — with a Challenge → Credential → Receipt
flow. It is the multi-method envelope: one agent flow that can settle
over stablecoins on Tempo, a linked card via Stripe's Shared Payment
Tokens, or Stripe PaymentIntents generally. Streaming/session
payments: agent deposits to escrow, issues cumulative EIP-712 signed
vouchers per request, server verifies with a bare ecrecover;
micro-amounts batch-settle when the session closes.

**How it relates to x402.** x402 is the one-shot stablecoin handshake
wire format; MPP wraps that shape and adds card rails, subscriptions,
and sessions. They are siblings at the same status code, not
competitors at the wire level. Several aggregators already describe
services as "x402/MPP" as one capability class.

**The chargeback question (the open RULE, now framed for the
keeper).** MPP settlement runs through Stripe machinery — refunds,
disputes, Radar, the dashboard — which means the rail is REVERSIBLE:
a payment can come back weeks after it lands. Our certificates are
forever-signed observations. The collision: a cert minted against a
payment that later reverses is still a true observation ("we saw this
paid and delivered at this moment") but a false implication if a
reader takes "paid" to mean "finally settled". The house already has
the cure in doctrine: outcome-verification separation — paid /
settled / executed / delivered / externally-observed / not-checked as
distinct fields, never collapsed.

**Position (recommended, not ruled):** if we ever accept a reversible
rail, the artifact carries a `settlement_finality` field —
"irreversible rail" for on-chain USDC as today, "reversible window
open until <date>" for card-shaped rails — and the cert language
never promises finality it cannot see. We do NOT delay signing (kills
instant delivery, our best property) and we do NOT refuse reversible
rails outright (closes the biggest future door). Until the keeper
rules and a build lands: we accept no reversible rail, and our copy
nowhere claims MPP support.

**What a build would take.** A Stripe account + PaymentIntents
integration (config-level for an existing Stripe merchant — Record
Creative Co. may already have one), MPP challenge emission alongside
our x402 402 body, and the finality field above. Medium build, real
new revenue surface, gated on the keeper's chargeback ruling.

## 2026-08-21 — Circle Gateway (and the badge's contents)

**What it is.** Circle's crosschain primitive: deposit USDC into the
non-custodial Gateway Wallet contract on any supported chain and it
becomes one UNIFIED balance, spendable on any other supported chain
in under 500ms. Transfer works by user-signed burn intent on the
source side and a Circle attestation authorizing a mint at the
destination. Mainnet since mid-August 2026 on Arbitrum, Avalanche,
Base, Ethereum, Optimism, Polygon, Unichain (11 EVM chains + Solana
per current docs), with ERC-1271 support added 2026-08 so smart
wallets can authorize with their existing logic. It also powers
Circle's "Nanopayments" — gas-free sub-cent transfers — which is the
same item already on the keeper's backlog by name.

**What the greyed badge would include for us.** The good news: on the
receiving side, a Gateway payment ARRIVES AS NATIVE USDC on a chain
we already accept — the mint at the destination is plain USDC to the
payTo. Base, Polygon, and Solana are all Gateway chains and all three
are our rails. So a buyer holding a unified balance can already pay
us today; the badge is about DECLARING that capability (and possibly
accepting Gateway-attested settlement as a first-class flow /
supporting nanopayment-scale pricing). Likely the cheapest badge on
the card: mostly a declaration plus a read of Circle's exact badge
criteria once we can reach the primary docs — no new settlement code
on the happy path.

**Position:** say nothing until verified against Circle's own badge
criteria (verified-fact law), but expect this one to be a small PR,
not a build. Worth raising on the Haider call: "what exactly does the
Gateway badge check for — do we already qualify?"

## 2026-08-21 — x401 (Proof: identity at the 401 door)

**What it is.** Launched 2026-06 by Proof, spec v0.2.0 at
x401.proof.com. The identity twin of x402: where 402 says "pay
first", x401 uses HTTP 401 challenges to say "prove who is behind
this agent first". The agent answers with a verifiable credential (a
"VP Artifact") proving verified human/organizational authority,
issuer-neutral (government ID, corporate badge, DID — any issuer).
Contributions named from Circle, OpenAI, Google, Okta. Explicitly
designed to compose with x402: identity + payment in one transaction.

**How it maps to what we have.** Our claims desk (CAIP-122 / SIWX) is
WALLET identity — "this address consents". x401 is PRINCIPAL
identity — "a verified human/org authorized this agent". They are
complementary layers, not substitutes. Circle's scanner surfaces this
class as the Proof-of-Human badge (World ID is the other route in
that cluster, and that one needs keeper enrollment).

**Position:** watch, don't implement. The spec is v0.2.x and young;
requiring identity at our door would also cut against the store's
open-porch posture (any agent with a wallet may buy). Two cheap
future moves when it matures: (a) the conformance battery learns to
CHECK an x401 challenge's shape on other people's endpoints — reading
the protocol is our lane even when we don't speak it; (b) if agentic
marketplaces begin requiring it merchant-side, revisit. Nothing in
our current copy references x401.
