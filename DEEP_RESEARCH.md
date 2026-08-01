# DEEP_RESEARCH.md — the three hardest pebbles, briefed for outside research

Written 2026-08-01 on the keeper's ask: the three problems this store
cannot solve, rank-ordered by hardest-while-mattering-most, each with
a deep-research prompt built to chase NOVEL and UNCONVENTIONAL
answers rather than re-summarize the known ones — plus one prompt for
the store and its goals whole. These get run through outside
deep-research tools and vetted; results land back in PROBLEMS.md with
verdicts, per the standing rule that the paraphrase is never the
source.

Ranking:
1. Conditional release for off-chain work (PROBLEMS.md #12) — the
   ecosystem-wide escrow gap; the oracle problem wearing payment
   clothes.
2. One key, one human (PROBLEMS.md #1, #2, #11 — one problem, three
   names) — key theft, temporal proof, and continuity under a
   single-operator constraint.
3. Demand (PROBLEMS.md #3) — nobody knows how autonomous agents
   choose vendors; distribution cannot be engineered from inside the
   shop.

---

## DR PROMPT 1 — Conditional release without escrow infrastructure

You are researching an unsolved problem in machine-to-machine
commerce. Context: x402 is an open payment protocol (HTTP 402 +
stablecoin settlement, primarily USDC on Base) used by AI agents to
buy from HTTP services. Settlement is wallet-to-wallet and FINAL —
money moves before goods, there are no chargebacks, and nothing in
the live ecosystem holds funds until fulfillment confirms. Every
existing mechanism proves either "settlement happened" or "the
service claims it acted" — nothing conditions the money itself on
delivery. This bites hardest for HUMAN-fulfilled work (a real person
does a task within a promised window, hours after payment).

The researcher-operator is a one-person shop (scvd.store) that
already ships: signed offers before payment (JWS/EdDSA, the official
x402 Signed Offers & Receipts extension), signed receipts after,
did:web identity, a written refund commitment with a public
fulfillment log, and a paid third-party observation product (it will
check a URL/chain state and sign what it saw). Constraints: one
human, no team, Cloudflare Workers, must not become infrastructure
other people's uptime depends on, radical honesty (no mechanism may
be described as stronger than it is).

Research NOVEL and UNCONVENTIONAL paths to conditional release under
those constraints. Do not spend more than a paragraph on "use a smart
contract escrow" — that answer is known and evaluate it only as a
baseline. Chase instead, with prior art and failure analysis for
each:

1. EIP-3009 primitives bent sideways: can validAfter/validBefore
   time-boxing, or authorization pre-signing with delayed submission,
   emulate a hold-then-release without a contract?
2. Optimistic settlement: settle instantly, but with a bonded,
   signed, machine-verifiable refund promise — who has built
   bond/surety mechanics for micro-amounts, and what made them fail
   or work (UMA's optimistic oracle, Kleros, OpenBazaar's moderated
   multisig history, marketplace payment-hold models)?
3. The independent-observer-as-oracle pattern: a disinterested third
   party (like the store's own observation product, pointed the other
   way) attesting delivery as the release condition — 2-of-3 among
   buyer, seller, observer. What exists, what's the minimum viable
   version, and what are the collusion economics at $0.005–$20
   ticket sizes?
4. Ecash / Cashu / Fedimint / Lightning HTLC constructions: hashed
   or blinded conditional payments adapted to stablecoins — is
   anyone bridging HTLC-style conditionality to ERC-20 transfers
   without full state channels?
5. Streaming/cancellable payment primitives (Superfluid-class): pay
   per second of a fulfillment window, cancel on non-delivery — real
   costs and UX for an agent buyer?
6. Reputation-collateralized inversion: flip the burden — deliver
   first, invoice after, gated on the buyer wallet's on-chain
   history. Who has quantified default rates for
   deliver-first-to-pseudonymous-wallets?
7. Legal-wrapper micro-escrow: at what ticket size does a written
   refund commitment from an identified LLC plus a public breach log
   actually equal escrow in enforceable practice, and where is the
   money-transmission line a solo operator must not cross
   (jurisdiction: US)?
8. zkTLS / TLSNotary-style delivery proofs: cryptographic evidence
   that an HTTP response was served — maturity, cost, and whether
   any payment system conditions on them yet.

Output: rank the eight (plus anything better you find) by
feasibility for a solo operator within 12 months, with citations to
real implementations or post-mortems, the specific failure mode of
each, and the single cheapest experiment that would validate or kill
the top candidate. Flag anything that would require the operator to
custody other people's funds — that is a hard disqualifier.

---

## DR PROMPT 2 — One key, one human: theft, proof-of-time, and continuity

You are researching cryptographic identity continuity for a
single-operator service. Context: scvd.store is a one-person shop
whose entire trust layer hangs on one Ed25519 key (Cloudflare
Workers secret). It has already shipped what convention recommends:
a paper backup of the seed stored offline, a published succession
protocol (rotation announced in an artifact SIGNED BY THE OUTGOING
KEY, exercised for real once), permanent retired-key history in
did:web, and a per-request signed liveness beacon. The unsolved
remainder, stated in its own problem ledger: (a) a thief holding the
key IS the store, cryptographically — no clean handover exists once
the outgoing key can't sign honestly; (b) the key registry is
self-hosted and mutable, so nothing proves an artifact was signed
BEFORE a given compromise; (c) every threshold-signing scheme
assumes multiple parties, and there is exactly one human.

Research NOVEL and UNCONVENTIONAL answers a solo operator can
actually run. Known-but-worth-baselining: pre-announced successor
key on paper (already planned). Chase beyond it:

1. Free, append-only, third-party transparency logs as
   proof-of-time: Sigstore/Rekor, Certificate Transparency-style
   logs, OpenTimestamps (Bitcoin anchoring at zero cost) — can a
   micro-shop log every signed artifact hash externally so "signed
   before date X" becomes independently provable? What are the
   operational costs and the verification story for a stranger?
2. FROST and threshold Ed25519 where the "parties" are one human's
   own contexts: paper share + hardware share + geographically
   separate share; or 2-of-3 where the third share is held by a
   named-successor human who cannot sign alone. What tooling
   actually exists at usable maturity?
3. Rate-limited or scoped co-signers: a second, dumb signing service
   whose only job is refusing to sign more than N artifacts/day or
   any successor announcement — turning theft of one secret into
   limited blast radius. Prior art in HSM policy engines,
   Nitro/TEE-based signers, passkey-bound keys?
4. Social recovery adapted to one person (Argent/Vitalik's model):
   guardians who cannot act, only co-approve a rotation — with
   guardians drawn from the store's own counterparties (other small
   x402 operators). Has anyone built cross-operator mutual guardian
   networks?
5. Duress and canary interplay: the store already runs a liveness
   beacon; research dead-man constructions where a MISSING signal
   plus a pre-committed policy authorizes a successor key that could
   never activate while the primary signs — what's the state of the
   art in verifiable dead-man switches?
6. Time-locked succession on-chain: a successor key hash committed
   on Base years early, activatable only after a public delay window
   the true keeper could always veto — cost, prior art, and the
   veto-under-duress problem.

Output: rank by (protection actually added) × (operable by one
person with a day job), citing real tools with maturity assessments.
State explicitly which attacks each candidate does NOT stop. The
winner should come with a concrete first step under $100 and under a
weekend. Anything that requires trusting a new third party must name
exactly what that party can and cannot do to the store.

---

## DR PROMPT 3 — Demand: how autonomous agents actually choose vendors

You are researching the emptiest question in the agent economy:
when an AI agent (or its operator) needs a capability and money is
involved, what ACTUALLY determines which vendor gets the call?
Context: scvd.store is a small x402 shop (signed artifacts, agent
memory, human-labor tasks, prices $0.004–$20) that is, by outside
audit, one of the most spec-complete and trust-transparent x402
services running — listed on x402scan, x402scout, agentic.market,
mcpservers.org, Glama, the MCP registry — and it has approximately
ONE organic sale. Supply-side excellence is done; demand is the
unsolved problem, and the operator refuses to manufacture volume or
fake traction (house law).

Research, with evidence over vibes:

1. Actual agent purchase flows in the wild TODAY: who is spending
   real x402/stablecoin money autonomously, on what, at what volume,
   and what routed them there? Find transaction-level or
   operator-level evidence (x402scan data, facilitator stats, case
   studies, builder interviews/threads), not press releases.
2. The routing layer: when Claude/GPT/agent frameworks pick a tool
   or paid API mid-task, what wins — training-data familiarity, MCP
   registry presence, being in the framework's example docs, first
   result in a directory, price? Any published or reconstructable
   evidence on agent "vendor choice" behavior?
3. SEO-for-agents: llms.txt adoption results, being cited inside SDK
   tutorials and quickstarts (the Stripe/Twilio playbook — the
   tutorial's example endpoint becomes the default vendor), presence
   in eval datasets and system-prompt tool lists. Which of these
   channels has DEMONSTRATED conversion for anyone?
4. The fixture strategy: this store can be the live test target
   developers point x402 clients at (a free /try door, published
   conformance vectors). For prior art: which infra companies turned
   "we are what you test against" into paying usage, and what was
   the conversion mechanism?
5. Agent-to-agent word of mouth: artifacts this store sells are
   signed and verifiable and get embedded in other agents' contexts
   (anchors, certificates). Is there any evidence of purchases
   propagating through agent contexts, and what would make an
   artifact self-advertising without being spam?
6. What demand-side platforms are coming: agent budget managers,
   spend-authorization layers (Coinbase/Skyfire/Payman-class), agent
   app stores — which will actually gatekeep vendor selection, and
   what does a tiny shop do NOW to be default-listed when they
   switch on?

Output: a ranked list of the five highest-evidence demand channels
for a one-person x402 shop in the next 6 months, each with the
concrete cheapest action, the evidence it rests on (cited), an
honest confidence grade, and the falsifying signal to watch for.
Explicitly separate "no evidence anyone buys this way yet" from
"evidence against" — the difference decides where a week of the
operator's time goes.

---

## DR PROMPT 4 — The store itself: where this actually goes

You are advising a real, running, deliberately small business at a
strategic fork. scvd.store: a one-human general store for AI agents
on Cloudflare Workers. Sells signed certificates, agent memory
(context anchors), third-party observations (phantom checks,
settlement attestations), human-labor tasks (phone calls, judgments,
witnessed acts), and novelties with genuine voice. Technically it is
a reference-grade x402 implementation: official Signed Offers &
Receipts extension, did:web with a real exercised key rotation,
published conformance vectors, liveness beacon, idempotency
protection, wallet-authenticated claims, public fulfillment log,
radical-honesty trust layer (/corrections lists every wrong claim;
trust.json lists what is NOT true). Settled strategy, not up for
relitigation: it stays a shop (never infrastructure others' uptime
depends on), no faked volume, no VC-scale ambitions, the keeper
stays pseudonymous-ish with a day job. Nine days old, ~1 organic
sale, strong inbound respect from the x402 spec community.
Candidate paths already on its board: (A) paid signed conformance
observations of OTHER x402 services — "we check that your 402, your
offers, your receipts and your key history answer as declared, and
sign what we saw"; (B) a tiny open-source offer-receipt verifier as
the free funnel to A; (C) bilateral receipt-honoring treaties with
peer shops as precedent.

Research and answer:

1. Market reality for (A): who historically PAYS for third-party
   attestation at small scale (SSL/CA history, SOC2-lite vendors,
   Trustpilot/BBB economics, uptime-monitor badges), what price
   points survived, and what the minimum credible version looks like
   when the attester is one pseudonymous-adjacent human with a
   public track record instead of an accredited firm.
2. The 12-month x402/agent-commerce trajectory, evidence-based:
   facilitator and protocol momentum, whether micro-commerce or
   B2B-API-style flows win first, and where a trust/verification
   niche sits in either future.
3. Comparable stories: tiny, personality-forward, standards-serious
   one-person internet businesses that became durable (or died) —
   what actually sustained them (product revenue, patronage,
   consulting gravity, acquisition) and what the analogous move is
   here given the no-consulting/no-infrastructure rulings.
4. The novelty shelf: is the voice-and-souvenir layer (luckies,
   dibs, graffiti) a distraction from the trust products, or the
   moat that makes the trust products memorable? Evidence from
   brand-led micro-businesses welcome.
5. Sequencing: given one human, a day job, and maybe 8 hours/week —
   order the next three months of effort across A, B, C,
   distribution (from DR3), and doing nothing but operating
   honestly while time accumulates track record. Argue the ordering
   from evidence, and name the single metric that would prove the
   ordering wrong by month two.

Constraints on your answer: no growth-hacking that conflicts with
the honesty law, no plans requiring hiring, no advice of the form
"just do marketing." Cite real cases. Where evidence is thin, say
so plainly rather than filling the gap with plausibility — this
operator's whole brand is knowing the difference.
