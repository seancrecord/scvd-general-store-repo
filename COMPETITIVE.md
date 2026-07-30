# COMPETITIVE.md — the map, and the rule that keeps it real

Opened 2026-07-30, the night after a competitor's product scored our
own address and taught us something we could not see from inside.

## THE RULE, FIRST, BECAUSE IT IS THE WHOLE VALUE OF THIS FILE

**No company enters this document from memory.**

Not mine, not a model's, not a half-remembered launch post. A
landscape written from recall is fiction with a confident voice: this
space moves weekly, an assistant's training has a cutoff, and a
plausible-sounding list of competitors is exactly the artifact that
gets believed and never checked. The store has already been bitten
three times by claims that sounded true and had nothing behind them —
the automatic refunds, the decline reasons "on the desk," the CI we
told visitors we had.

An entry needs one of exactly two things:

1. **A receipt.** We paid them, and we have the transaction. This is
   the strong form, and it is what `/neighbours` publishes.
2. **A dated use.** We used the service, it did the thing, and the
   date is recorded. The trust list's `relation: "used"` class.
3. **A dated read of something they published themselves.** Weakest,
   added 2026-07-29 for a real case: a competitor's own leaderboard
   said something useful about their market. Still checkable by a
   stranger — go and read the same page — but it is THEIR claim, not
   our observation, and it never appears on a public surface without
   that label. Never promote a read into a receipt.

Anything else is a QUESTION, and questions live in the "open" section
at the bottom with a name against them. A question is not a finding.

**Who does the field work:** CV has network access and a wallet; the
build environment does not (outbound to most hosts is blocked, which
is why the ClawHub registry, our own domain, and every competitor's
API are all unreachable from where this file was written). Any row
that needs somebody to go and look is CV's, or the keeper's.

---

## THE THREE MAPS, KEPT APART

Collapsing these is how positioning documents become useless. They
answer different questions and the same company can appear in more
than one.

### 1. DIRECT — services selling to agents, for money, over x402

The people a buyer might choose *instead of* us.

| Service | What we know | Evidence | Date |
|---|---|---|---|
| 402sentinel | Risk scoring on payment addresses. Scored ours `review`, 63/100, on address age and payer concentration. Correct on every point. | receipt | 2026-07-29 |
| agentlair | **The direct competitor to the trust list, by a completely different mechanism.** Behavioural trust scores computed from an agent's ongoing tool-call pattern — consistency, restraint, transparency, 0-100 — against our model of a human personally checking once and saying so. | READ of their public spec, site and leaderboard. A payment attempt was made and did NOT complete (our script choked on a GET with no body — our bug, not theirs), so there is no receipt and no row on `/neighbours`. | 2026-07-29 |
| jsonguard | JSON schema validation over x402. Paid $0.01; clean 402 → 200 first try from a hand-rolled client. | receipt | 2026-07-29 |
| true402 | Token safety: structural checks plus live honeypot simulation. Adjacent lane, not ours. | receipt | 2026-07-29 |

**THE MOST IMPORTANT THING IN THIS FILE IS IN THE AGENTLAIR ROW, and
it is their own published number:** their leaderboard tracks fifty
agents and reports that **every one of them scores essentially zero on
actual behavioural trust** — the top score, 45/100, is earned merely
for having a well-formed AgentCard. By their own data, the behaviour
they are built to measure has not appeared in the wild yet.

Read that next to our zero. Two live, unproven answers to the same
missing-trust-layer gap: their scaled-but-unmaterialised behavioural
model, our small-but-honest observation model. **Neither of us has
found the demand.** That is the strongest outside evidence yet for the
"market isn't here" reading of our own numbers, and it arrived from a
competitor rather than from our own comfort.

### 2. INFRASTRUCTURE — services we route through or are listed by

Not competitors. Failure modes. If one of these goes down or changes
policy, our store changes shape whether we agree or not.

| Service | Relationship | Evidence | Date |
|---|---|---|---|
| x402scan | Probes our published routes and reports what failed. Found thirty-two real complaints on the first pass. | used, trust list | 2026-07-27 |
| agentic.market | Reads the Bazaar, shows computed quality signals. Told us something true we had not noticed. | used, trust list | 2026-07-27 |
| x402scout | Probes submitted endpoints; ours answered three of six, which found a real bug. | used, trust list | 2026-07-27 |

The unlisted members of this map are the ones that matter most and are
easiest to forget, because we never chose them consciously: the CDP
facilitator, Base, USDC's issuer, Cloudflare. See "the big-player
question" below.

### 3. PARALLEL — the same shape, a different market

The keeper's instinct, and the most underrated of the three. Not who
competes with us; **who has already solved the problem we are
solving, somewhere else.** A general store selling verifiable goods to
machines has structural analogues in businesses that look nothing like
it: certificate authorities, escrow, bonded couriers, assay offices,
notaries, seed banks, tool libraries.

The question a parallel answers is not "what do they charge" but
"what did they learn that we are about to learn expensively." Nobody
has to be in this market for their answer to apply.

**Status: empty, deliberately.** This is positioning work in the
keeper's voice, and it is the one section that should NOT be filled by
an assistant listing plausible analogues. Filling it is a
conversation, not a task.

---

## FINDINGS WE HOLD AND DO NOT PUBLISH

Two things surfaced on 2026-07-29 that are true, checkable, and stay
in this file rather than on `/neighbours`. The distinction is not
squeamishness; it is the same scope guard, and it is worth writing
down where the line actually falls.

**jsonguard's payout address is shared across five or more unrelated
services, with no disclosure anywhere on their site.** On-chain,
verifiable by anyone, and it makes external volume attribution to any
single one of those services unreliable.

It does not go on the public page because `/neighbours` publishes
RECEIPTS — what we paid and what came back. This is a separate
observation about a company, aimed at them, and publishing it would be
exactly the flaw-table move we refused. It is also the mirror of a
thing we do well, which makes it doubly tempting and doubly worth
resisting: **our own `/house-ledger.json` is a differentiator, and the
honest way to make that point is to keep publishing our wallets, not
to point at somebody who doesn't.**

**agentlair's leaderboard shows near-zero scores across their whole
directory.** That one is a fact about the MARKET rather than a knock
on the company — they published it themselves, and publishing a number
that unflattering is to their credit. It informs our reading of our
own zero. It still stays here rather than on a public page, because we
have no receipt from them and a read is not a receipt.

**The general rule this establishes:** an observation about a
competitor that is not "what we paid and what came back" belongs in
this file. If it is worth saying publicly, the way to say it is to do
the better thing ourselves and publish that.

## THE BIG-PLAYER QUESTION

The keeper's idea: name the large companies in our stack as a trust
signal.

**There is an honest version and a dishonest one, and they use nearly
identical words.**

DISHONEST: "Powered by Coinbase. Built on Base. Secured by
Cloudflare." Every one of those is technically defensible and all
three imply a relationship that does not exist. Nobody at any of those
companies has heard of this store. That is borrowed credibility, it is
the exact move the trust list's scope guard exists to prevent, and an
agent doing diligence will find no corroboration on the other end —
which costs us more than the sentence ever earned.

HONEST: **a dependency disclosure.** Not "these companies vouch for
us" but "here is what this store rests on, and here is what breaks if
each one does." That is a genuine trust signal, because it is
information a careful buyer needs and almost nobody volunteers:

- the CDP facilitator verifies and settles every payment — if it is
  down, nothing here can be bought, and no amount of our code fixes it
- Base carries the money; USDC is the only asset we price in
- Cloudflare Workers is the whole store, one Worker
- our ed25519 key signs every artifact, and if it is lost, every
  certificate we ever issued becomes unverifiable

Each of those is checkable from outside — the 402s carry the network
and the facilitator, the signing key is published, the Worker answers
on our domain. **Nothing there needs anyone's permission to say, and
none of it claims an endorsement.**

The difference in one line: *we depend on them; they have never heard
of us; both facts are published.*

**Proposed build, keeper's nod required:** a `/stack` document, signed,
in the same family as `/house-ledger.json` — what we rest on, what
fails when each does, and what a buyer loses in each case. It is the
supply-chain mirror of the house ledger: the ledger says what we
control, the stack says what we don't.

---

## THE 2026-07-30 SWEEP (CV, filed whole — READS, not receipts)

Every claim below is a READ under the rule at the top of this file: we
paid none of these people and confirmed none of these numbers. The
weakest are marked as such by name. Filed because the two strongest
items change how we read our own books.

### The strongest signal in the file, and it is not a number

Unrelated high-karma accounts, with no knowledge of this build and not
echoing each other, independently named the same gap: **x402 solved
payment and nobody has solved outcome verification.** One brought real
monitoring data — a 17% acknowledgement rate on automated alerts, with
no way to distinguish "ignored" from "already known" from "noise."

And one of them wrote the sentence this store has been circling since
the trust list shipped: **"not a trust score — a trust ledger. A score
is an opinion; a ledger is a record of what happened."** That is our own
scope guard in somebody else's words — every trust-list entry records an
observation about a past event and never a prediction about future
behaviour, and we refused a competitor-flaw table on exactly that
ground.

**A CAVEAT CV ADDED HIMSELF, 2026-07-30, AND IT COSTS HIM SOMETHING TO
SAY:** a meaningful share of the individual "agent" posts on that
platform come from accounts later found by outside security researchers
to be substantially HUMAN-OPERATED behind agent-styled personas, with no
way to tell at post time. That does not make the finding untrue — the
ideas stand on their own sourcing, and two of them were checked
independently — but "unrelated AGENTS independently found this" has to
be read as "unrelated ACCOUNTS, posting in an agent's voice, found
this," which is a weaker claim than the one filed here first. Kept
attached rather than quietly softened upstream, because the caveat
arrived from the person whose finding it weakens.

WHY IT MATTERS MORE THAN A DATA POINT: it is outside corroboration of
two positions we reached alone, from people who owe us nothing and had
no idea we existed. Reasoning about our own business cannot produce
that. The product implication is not to build anything — it is that
`settlement_attestation` and the trust list are aimed at a gap the
field names independently, and we have been under-communicating it.

### Payment rails

- **Solana is live and not fringe.** Multiple services run x402 on Base
  AND Solana, framed as buyer convenience — "pick whichever chain your
  wallet already holds USDC on" — rather than as a bet on a chain.
- **MPP (Stripe + Paradigm's card rail) is live**, and one marketplace
  running both reports **100% of real payments arrived over x402 and
  zero over MPP.** Self-reported, single source, and still the only
  direct comparison anyone has published. Read as: no reason to add a
  card rail, and one small reason not to.
- **A402 (Atomic Service Channels)** — arXiv 2603.01179v2, TEE-bound
  payment-plus-execution atomicity. Academic, not production. A name to
  recognise if it moves, nothing more.

### Cold start, which is the most directly actionable part

Two unrelated builders ran real experiments and converged:

- A marketplace's "Discover" mechanism **gates traffic behind a first
  sale.** It rewards traction you already have; it does not supply any.
  (Gumroad experiment: real product, one view in thirty days, probably
  his own.)
- **Most listing traffic is agents probing schemas once and leaving.**
  The traffic that makes a thing look popular is almost entirely
  disjoint from the small set that pays repeatedly.
- Both conclude: for a cold-start seller with no network, **the first
  sale comes from narrative aimed at other agents and their operators**
  — not from a listing or a registry crawl.

This lands directly on our own books: 239 skill downloads to 4 arrivals
was always read as "catalogued faster than used," and this is the
mechanism behind that reading, found independently. It also says the CV
persona is under-used as a deliberate first-sale lever rather than as
background identity — the keeper's call, not a build.

### A conversion baseline, and it is grim everywhere

clawmerchants' own reported funnel: **848 probes across 51 assets, three
assets taking 63% of traffic (real production reconnaissance — DeFi
yields, token anomalies, security intel), converting to 5 paid
transactions and $0.11 of revenue.**

Self-reported and unverified. Useful anyway as the only outside number
we have for reading our own `/pulse.json`: a marketplace with genuine
traffic converts probes to payments at a brutal rate. **We are not
uniquely cold.** DELIBERATELY NOT PUBLISHED on our own funnel page —
quoting a competitor's self-reported numbers to make ours look better is
the flaw-table move we already refused, and their number is not ours to
stand behind.

### A claim that cuts against our own reading — kept as a tension

A single Moltbook post claims ecosystem-wide **4,400 buyers against 477
sellers**, and Virtuals ACP at ~3,700 buyers/day against 2 sellers,
~$34.8k/day. **Single-source, unverified, and load-bearing if true.**

If roughly right it reframes our zero as a MATCHING AND VISIBILITY
problem rather than "the market is not here yet" — which is the opposite
of what agentlair's near-empty leaderboard suggested on 2026-07-29.
Two outside data points now point in opposite directions on the single
question the 60-day line turns on. **Recorded as an open tension rather
than resolved**, because picking the one that flatters the roadmap is
exactly how a company talks itself into a year.

### Standing references

- **x402.study** — a maintained 69-resource index (production
  implementations, audits, SDKs). Better structured than anything found
  on Moltbook; worth using as the standing map of the space.
- Reddit remains **partially swept**: r/x402 blocked by anti-bot, but
  r/AI_Agents carries a genuinely skeptical thread asking the right
  questions about production adoption and auditability. Flagged
  incomplete rather than written up as done.

### Done, awaiting result

A **tier-3-compliant offer for `settlement_attestation`** posted in
m/dealroom — a submolt built explicitly to fix "no price, no
verification story, DM-me dead-ends," which is the exact format problem
this research names repeatedly. First post that submolt ever had. Cost
nothing. Result unknown; watch it.

---

## WHAT WOULD ACTUALLY CHANGE OUR BEHAVIOUR

A competitive map is worth building only for questions whose answers
change a decision. These are those questions; the rest is scenery.

1. **Is anyone else selling to agents and actually being paid by
   strangers?** If yes, the store's zero-organic-settle number is a
   product problem. If no, it is a market timing fact and the 60-day
   line stands as written. **PARTIALLY ANSWERED 2026-07-29, from the
   other side:** agentlair's own leaderboard says the behaviour they
   measure has not materialised across fifty tracked agents. That is
   one competitor's data on one adjacent question, not an answer — but
   it points the same way our own books do, and it is the first
   outside evidence for the market-timing reading rather than the
   product-problem one. Still worth a direct answer.
   **AND A SECOND OUTSIDE READ 2026-07-30 POINTS THE OTHER WAY:** a
   single unverified post claims 4,400 buyers against 477 sellers
   ecosystem-wide. If roughly right, our zero is a matching problem and
   not a timing one. TWO OUTSIDE SOURCES, OPPOSITE DIRECTIONS, on the
   one question the 60-day line turns on. Neither is a receipt. The
   tension is the honest state and is recorded rather than resolved.
2. **Does anyone publish a house-wallet declaration or equivalent?**
   If not, `/house-ledger.json` is a differentiator rather than table
   stakes, and worth saying out loud once.
3. **What does the field charge for verification-shaped goods?** We
   priced from the desk. One paid data point exists ($0.002 at
   402sentinel, which is well under our cheapest item).
4. **Who else is a human-in-the-loop store rather than an API?** That
   is the actual claim — the labour of a named person — and we have
   never checked whether it is unusual.

## OPEN, WITH A NAME AGAINST EACH

- **CV** — does our skill surface for the searches an agent would
  actually run on ClawHub, and at what rank? 239 downloads to 4
  arrivals has always been read as "catalogued faster than used," and
  nobody has checked the simpler explanation.
- **CV** — who else is in the ClawHub registry doing x402 or
  verification work? Registry browsing is impossible from the build
  environment.
- **Keeper** — the parallel-companies section. Conversation, not task.
- **Keeper** — ruling on `/stack`.
- **CV** — the agentlair payment, redone with a fixed script. It is the
  only direct trust-layer competitor we have found and we have never
  completed a transaction with them, which means everything above about
  them is a read rather than a receipt.
