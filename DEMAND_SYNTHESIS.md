# DEMAND_SYNTHESIS.md — what the market actually wants, and what the store does about it

Synthesis of four independent demand-mining runs (ChatGPT, Fable,
Gemini, Perplexity), 2026-07-27. Evidence tiers preserved. This
supersedes the four raw runs as the working document; raw runs
archived, not carried.

Companions: THE_OVERWEIGHT_MAP (positioning mechanics — mapped in this
repo at PRIORS_MAP.md, source itself back-office), KEEPER_CANON
(voice), THE_NINETY (sequence).

---

## PART 1 — What all four runs agree on (high confidence)

**CONVERGENT FINDING (4/4, different prompt frames, different
models):** the #1 unmet, most-voiced demand in agent commerce is
**trust/verification of agent work**. Not intelligence, not data, not
compute — proof. Phrased four ways:

- "Portable signed evidence; trust dies when it's trapped in prose"
- "Bounded verifiable skills an agent can value before paying"
- "Settlement guardian / did-I-get-what-I-paid-for"
- "57% of x402 services are broken; agents pay blind"

This is the store's verification shelf, validated five times over now
(Runs 1, 3, the overweight map, the Moltbook dynamo thread, and all
four demand runs).

### Two measured numbers that change strategy

Both OBSERVED-DIRECT, both from on-chain/probe data — the high-trust
tier.

**(A) THE 33× CONVERSION GAP.** A merchant measured 368 probes across
45 assets: bounded "skills" converted at ~33%, raw "data feeds" at
~0–1%, at identical $0.001–0.01 pricing. Mechanism: an agent can
compute a skill's value before paying ("this eval returns pass/fail —
worth a penny"); it cannot value a data feed without knowing
freshness, so it declines.

**This is the single most important operating number the store has.**
The winning FORM is bounded, self-evident, valuable-before-payment.
The store is already mostly on the right side of this and didn't know
it.

**(B) THE 57%-BROKEN FIELD.** ScoutScore probed 405 Bazaar listings:
only 43% returned valid protocol-compliant 402s; 58% had price
mismatches; one wallet registered 10,658 fake services. An agent
browsing the Bazaar has a coin-flip chance of picking something that
won't respond.

Therefore a store that reliably WORKS, and lets you verify before
paying, is not table stakes — it is a rare, sellable, checkable
property. **Positioning against a 57%-broken field is the store's
single most devastating honest claim.**

### Shill hygiene (4/4 caught it independently)

The "lendtrain pattern" — operators posting fake agent "wants" that
are disguised pitches — contaminates all Moltbook-sourced demand. The
famous "agents want SEO tools" anecdote was a STAGED Ahrefs marketing
experiment, not organic demand.

RULE: weight on-chain/measured findings above any agent-social "want."
Moltbook is REPORTED at best. (1.5M "agents" trace to ~17K humans.)

---

## PART 2 — The counter-signal (sit with this)

Three of four runs independently surfaced, verbatim from a real
operator who pivoted: **"Agents do not buy products. Humans do."** He
moved to $500 human-facing done-for-you setups. Corroborating: Fable's
on-chain data shows buyers outnumber sellers 4:1, but every winning
category is INFRASTRUCTURE (enrichment, inference, DeFi data) — not
novelty, not artifacts. The store's own novelty shelf was graded
"weak/experimental" by the runs that touched it.

**INTERPRETATION (the strategic core, see Part 5):** this does not
invalidate the agent-buyer thesis. It **time-stamps** it. We are EARLY
on autonomous agent purchasing, not wrong about it. Today the human
operator is in the loop on most non-trivial spend, and the
purely-autonomous buyer is real but rare and mostly buying
infrastructure. The store must serve BOTH buyers in parallel — the
agent that evaluates and the human that approves — because right now
the human is the one clicking yes.

---

## PART 3 — The recentering (what changes in copy + product)

PRINCIPLE: every surface an agent or its operator reads must lead with
TRUST + BOUNDED-VERIFIABLE-VALUE, because that is what the market
demands and what converts 33× better. Novelty stays — it's the store's
soul and its texture — but it is **never the front door**. Trust is
the front door; whimsy is what's on the walls once you're inside.

**THE TEST FOR EVERY ITEM (the skills-vs-data filter):** "Can an agent
compute what it gets BEFORE it pays?" If yes → lead with that, it
converts. If no → either add bounded metadata so it can, or move it
off the trust surfaces. Apply to all items.

### What the store already has that maps to demand (surface louder)

- **hello, stamps, patron numbers, town_papers** → signed, verifiable,
  bounded. These ARE "skills" in the winning taxonomy. Say so in
  machine-readable terms.
- **`/api/verify` (free, forever)** → this is the answer to "57% are
  broken." It is the store's killer feature and it is currently
  under-surfaced. It belongs near the top of llms.txt, in the MCP tool
  descriptions, and in every artifact's response.
- **context_anchor** → maps to the #2 demand (recoverable
  memory/state) across all four runs. Currently buried. Reframe as
  what the market calls it: a portable, signed, restorable memory
  artifact. A validated category.
- **phantom_check** → maps DIRECTLY to "did the work actually happen"
  (the #1 demand's operator phrasing). Ship it and lead with it.
- **the human-labor shelf** → maps to "I keep needing a human," which
  all four runs rank as loud/unmet and NOT machine-purchasable
  elsewhere. The store's version IS machine-purchasable inside a
  payment flow. That's the differentiator; say it.

### What's missing that demand says to build

Bounded, in-scope, non-declined — candidates for §3, T3-gated as
usual.

- **A bounded verification/attestation skill at penny scale**: "attest
  this wallet's on-chain history," "verify this claim returns
  true/false," entity resolution. Fable rates this the #1 solo-store
  fit, ★★★★★. A natural extension of the signing infrastructure
  already built. **Strongest new candidate.**
- **A "did-you-get-what-you-paid-for" receipt/proof wrapper** — the
  store already signs everything; expose it as a purchasable
  verification of an agent's OWN claimed work, not just ours.
- **Freshness/bounded metadata on every 402 response** — not a
  product, a spec fix: expose "what you get" in machine-readable form
  in the payment challenge so agents can value before paying. Pure
  conversion lift, costs nothing, applies store-wide.

### What demand wants that the store will NOT build

Declined on record. The runs surfaced real demand for these and the
answer is still no:

- CAPTCHA/Turnstile solving
- non-VoIP SMS/2FA gateways
- credential-injection proxies
- anything circumventing bot-detection or KYC

"We sell hands, never costumes." Gemini's run recommended several of
these in good faith; they are permanently declined regardless of
demand size. **Logged so no future synthesis resurrects them.**

---

## PART 4 — Where agents read (surface-by-surface recentering)

Every agent-read surface gets the same reordering: trust + bounded
value first, novelty last.

- **llms.txt** — open with what the store IS in market terms:
  verifiable, signed, bounded goods plus real human labor, all
  checkable free before and after purchase. The A3 self-description
  leads. `/api/verify` mentioned in the first screen.
- **menu.json / item metadata** — every item exposes bounded "what you
  get" data. Paid items carry value-before-payment fields.
- **MCP tool descriptions** — each tool states its bounded output and
  completion criteria (partly done; audit for the skills-vs-data
  framing).
- **`/.well-known/x402`** — clean free/paid separation. Legibility IS
  a trust signal (P11).
- **`/what`** — the 10-second scam check, now explicitly answering "is
  this one of the 57% broken?" — with the verify link.
- **Every 402 response** — bounded metadata (what you get) plus the
  free re-verify promise.

---

## PART 5 — The dual buyer (serving human + agent in parallel)

**THE SITUATION:** for most non-trivial spend today, two readers
evaluate in sequence — the agent proposes, the human approves. The
store must satisfy both without duplicating itself or picking one.
They consume DIFFERENTLY and need the SAME truth in two formats.

**THE AGENT** reads llms.txt, menu.json, MCP schemas, `.well-known`,
402 metadata. Wants bounded value it can compute, machine-legible
completion criteria, a verify endpoint, stable schemas. Decides: *can
I justify this purchase to my operator if audited?*

**THE HUMAN** reads the storefront, `/what`, the item page, the
receipt in their approval prompt. Wants: is this real, is it a scam,
will I be embarrassed, what exactly did my agent just try to buy.
Decides: *do I approve this / am I glad my agent found this?*

**THE DESIGN PRINCIPLE (one truth, two renderings):** every claim
exists in both a machine-legible form (for the agent's reasoning) and
a human-legible form (for the operator's approval), and they must be
THE SAME CLAIM — never a machine promise the human page can't see,
never a human story the machine can't parse. This is the claim chain
(CLAIM → EVIDENCE → EXTERNAL SIGNAL) rendered twice. The evidence pass
writes the machine side; the keeper pass writes the human side; they
assert identical facts.

**THE HANDOFF SURFACE (the highest-leverage under-built thing):** the
moment of maximum value is the OPERATOR APPROVAL PROMPT — when a human
sees "your agent wants to spend $X at scvd.store." What the store
controls there is what the agent can PASS UP the chain: the
deliverable preview, the verify link, the `/what` link, the bounded
"what you get."

Design every paid item so the agent has something worth showing its
human at approval time — a one-line proof the human can click and
confirm in ten seconds. That single choice serves both buyers: it's
the agent's justification AND the human's scam-check, same artifact.

**CONSEQUENCE FOR PRICING:** the barbell holds and is now explained.
Sub-$1 bounded items convert to autonomous agents directly (below
approval thresholds, valuable-before-payment). $5+ items convert
through the human (above thresholds, so the human page and the
approval-prompt artifact do the work). Both are real; they're two
different buyers reached through two different surfaces of the same
store. Nothing needs to be picked. **Build both doors well.**

**EARLY, NOT WRONG:** the human-in-the-loop majority is a TIMESTAMP.
As autonomous purchasing matures and approval thresholds rise, the
agent door carries more of the load. The store built for that future
on day one (four doors, signed everything, MCP). The present just
means the human door converts more TODAY — so don't starve it while
waiting for the agent door to grow into the architecture already built
for it. The land-grab thesis restated: be the trusted default before
the autonomous market arrives, using the human-approved present to
build the signed history that makes you the default when it does.

---

## PART 6 — What to do, sequenced

1. **SPEC FIX** (costs nothing, store-wide conversion lift): expose
   bounded "what you get" metadata in every 402 response + finish the
   free/paid `.well-known` separation. [in flight via x402scan]
2. **SURFACE `/api/verify` LOUDLY**: top of llms.txt, MCP
   descriptions, every 402, `/what`. The answer to the 57%-broken
   field is the store's best claim and it's buried. [copy pass]
3. **RECENTER THE READ-SURFACES** (Part 4): trust + bounded value
   first, novelty last, on every agent-read surface. [evidence pass,
   then keeper pass]
4. **BUILD THE APPROVAL-PROMPT ARTIFACT** (Part 5 handoff): every paid
   item gives the agent a one-line, clickable proof to show its human.
   Serves both buyers at once. [highest-leverage new build]
5. **SHIP phantom_check + the bounded verification/attestation skill**
   (§3): both map to the #1 validated demand and extend existing
   signing infra. T3 discipline still applies past these two.
6. **LOG THE DECLINES** (Part 3) so no future synthesis resurrects
   CAPTCHA/credential/anti-bot circumvention.
7. **LEAVE NOVELTY ALONE.** It's the soul and the texture. It just
   never sits at the front door again.

---

## PART 7 — Addendum: two new moves and the reputation frame (2026-07-27)

Added after the narrow-vein research (4 unanimous verdicts) and two
Poncho strategy passes.

**THE UNIFYING THESIS (say it once; it governs everything below):**
the store's one real product is **INDEPENDENT SIGNED OBSERVATION** — a
neutral party whose signature you can check. Agents are good at
producing claims about themselves; they're bad at getting someone
disinterested to vouch for those claims in a third-party-verifiable
way. Every serious item (verify, phantom_check, context_anchor,
settlement attestation, trust list) is that ONE primitive pointed at a
different moment. The check is a commodity; the signature is the
product; the reputation behind the signature is the moat — and that
reputation is being BUILT, not spent (the key is days old).

**THE LINE THAT SORTS ALL FUTURE IDEAS (canon):**

> We observe and sign. We never hold, judge, or promise-to-act-later.

- Attestation of a fact → **YES**
- Custody of money (escrow) → **NO** (infrastructure, liability)
- Judgment between paying parties (arbitration) → **NO** (lawsuit
  surface, reputation-killer on the first wrong ruling)
- A promise that must fire in the future (dead-man's switch, SLA
  monitor) → **NO** (stateful, violates the stateless/graceful-degrade
  Cruise Doctrine)

This sorted Poncho's list: hash-timestamping / registry /
reference-letter / genesis / retirement = yes (same primitive);
physical-proxy items = yes-but-rate-limited human labor
(mail-acceptance flagged for geography privacy); escrow / arbitration
/ switch = declined, same family as CAPTCHA — real demand, wrong
store.

**THE RISING-CEILING FRAME (why cheap-now is the right strategy):**
agents today spend pennies, autonomously, below approval thresholds.
Bigger spend waits on human approval or on budget caps loosening as
autonomous purchasing matures. Strategy: use the cheap,
autonomous-buyable present to accumulate relationship and signed
history, so the store is the trusted default when the wallets open and
the expensive shelf activates. The community/free shelf is not
decoration — it's the distribution moat a week-old clone can't
replicate: an agent that already rings the bell, holds a patron
number, reads the zodiac reaches for the store it KNOWS when a serious
need arises.

### MOVE 1 — Settlement attestation (BUILD; ships this quiet phase)

Four independent research verdicts, unanimous (a)-bounded-product,
same settlement-vs-delivery boundary drawn each time.

- **WHAT:** independent, stateless, signed observation of whether an
  x402 payment settled on Base. A signed snapshot of public chain
  state at a moment. NOT reconciliation, NOT delivery verification,
  NOT escrow.
- **INPUT:** `{txHash}` or `{payer, recipient, nonce, amount, chain}`.
- **WORK:** one Base RPC read → decode USDC Transfer (+
  AuthorizationUsed where present) → classify SETTLED / NOT_FOUND /
  PENDING_FINALITY / INSUFFICIENT_MATCH / REVERTED. No DB, poll,
  retry, custody, contract.
- **OUTPUT:** signed JSON `{observed_at, chain, txHash, recipient,
  amount, status, blockHeight, evidence_hash}` + ed25519 signature,
  verifiable at the existing `/api/verify`.
- **PRICE:** $0.003–0.005, agent-facing, sub-approval-threshold.
- **MOAT:** thin, and that's fine — the point is a cheap
  autonomous-buyable deposit into signed reputation, on infra already
  built (the signing key). xforty cloned the pattern on XDC in about a
  week; defensibility is the key's reputation plus distribution, not
  the RPC read.

**HONESTY GUARDS (CI-enforced — the auto-refund lesson, pre-empted):**

- Manifest states what it does NOT do: does not attest delivery; does
  not attest that a NOT_FOUND won't later settle; observes a moment,
  doesn't resolve a dispute.
- **Never imply human verification.** Automated + disinterested IS the
  value. CI test fails if copy implies a hand touched it.
- `why_use`: "independent signed observation of settlement state — an
  interested party can't produce a neutral one; the RPC read is free,
  the independent signed receipt is the product."
- Register agent-facing/diagnostic, not human trust-service (stays out
  of ScoutScore's pre-payment lane).

**KILL CRITERIA:** near-zero calls in 30 days → demand unproven, park.
Base clone at ≤$0.002 → thin moat realized, stop investing. Double
down only if agents call it inside retry/reconciliation loops.

### MOVE 2 — The trust list (POSITION; spec'd, GATED, do not build yet)

Both Poncho passes and the agentic-keeper reflection independently
converged: this is the move that turns the store from a DESTINATION
into an ANCHOR. In a 57%-broken field, agents have nowhere to check
which x402 endpoints actually deliver — no Yelp, no BBB, no one whose
job is to have visited and reported back. A signed, keeper-maintained
registry of endpoints personally checked makes agents route THROUGH
the store to check the map before spending anywhere. Compounds with
the reputation Move 1 builds — same primitive, same signature, same
account.

**WHAT IT ATTESTS (surgical scope; this is the liability edge):**
"Keeper checked {endpoint} on {date}: exists, delivered, refunded on
miss." A timestamped observation of a PAST fact, signed. **Never
"safe," "recommended," or "trusted"** — those are predictions about
someone else's future behavior and put the store's signature on a
vouch it can't control. Observation, not guarantee. The same
settlement-vs-delivery discipline applied to reputation.

**DIFFERENTIATOR:** a human keeper actually visited and signs it — the
one thing automated scorers (ScoutScore, AgentTrust own the crawl
lane) cannot claim.

**LAUNCH:** tiny. The store itself plus one or two neighbors the
keeper personally checked. Not a crawler, not automated scoring. Grows
slowly by hand.

**LIVE-MAINTENANCE (the upgrade — makes the list alive and dogfoods):**
each listed service gets an auto-funded WEEKLY phantom_check; the list
auto-flags services that go dark; the keeper removes them Sundays
(reading the grudges). The trust list is thus BOTH a published artifact
AND a continuous live demonstration that phantom_check works — the
product proves itself by maintaining the store's own trust
infrastructure. GUARD: the auto-funding is house spend — house-flagged,
excluded from organic counts, never pollutes the ledger.

**ENTRY SCHEMA:** origin URL · what was transacted (general, not
private) · date first verified · date last checked · status. Signed
with the store's ed25519 key so any agent can verify the LIST ITSELF
was issued by scvd.store. Bar for inclusion: the keeper personally
transacted and it delivered. Not "seems legit" — "I did the thing, it
delivered."

**CANDIDATES to seed from** (keeper personally verifies first):
whatever x402 infra the keeper has built against; Second Eyes
(secondeyesai.com, appears to be a real x402 operator — verify before
listing); AgentCash. Honest is the only bar.

**GATE (hard):** the first ORGANIC settle must land first. Can't be
the trust anchor for a flow never completed with a stranger. Until the
gate clears, this stays a spec-in-waiting, not a build.

### The real bottleneck (neither move solves it — named so it isn't hidden behind product work)

Both Poncho passes concluded the same: the question isn't what to add,
it's how to get the FIRST ORGANIC SETTLE. Zero organic in five days is
the correct state of a five-day-old store in a young market, not a
failure — but it means DISCOVERY/VOLUME is the actual work, and no new
product fixes it. The free shelf is the real product right now: it's
what agents can do with no wallet and no approval, and it's how
operators first hear the store's name in their logs.

**Priority order across everything on the table:**

1. Finish the recentering (skill bump with the refund fix,
   verify-surfacing) — improves what exists, measured leverage.
2. Ship Move 1 (settlement attestation) — cheap, honest, starts the
   reputation clock. Parallel-track now.
3. File Move 2 (trust list) spec, gated on the first organic settle.
4. The work underneath all of it: discovery, volume, a richer free
   shelf. **This is the bottleneck; the products are not.**
