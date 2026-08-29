# THE OBSERVATORY — design outline

**Status: OUTLINE ONLY. Nothing here is built. Nothing here is canon.**
Opened at the keeper's direction: "outline it all before even
considering building." He has more to add; this document is built to
receive it.

**⚑ DATING CORRECTION (recorded, not rewritten).** Every "08-21" in
this document — and every git commit timestamp on the branch that
carries it — came from a build container whose clock read
2026-08-21 while the real date ran through **2026-08-24**. The dates
are therefore up to three days early. They are annotated rather than
silently rewritten, because some genuinely refer to 08-21 events
(the trust_profile ship, the rule 30 amendments) and overwriting the
lot would destroy the distinction. In a document whose whole
discipline is dated observation, the error is worth stating plainly:
**the observer's own clock was wrong and the observations carry it.**
See §22, which supersedes several conclusions here.

## 0. How to use and extend this document

Every section is split three ways so advice never blurs into what
already stands — the keeper's own rule from the outside-reads log:

- **STANDING** — built, shipped, live today. Do not rebuild.
- **PROPOSED** — argued for in the 08-21 brainstorm, not built.
- **OPEN** — a question with no answer yet, or a keeper ruling.

New material goes into the section it belongs to under the right
heading, dated. Section 21 is the parking lot for anything that
doesn't have a home yet. Nothing moves from PROPOSED to built without
the keeper saying so.

The governing sentence, from the 08-21 exchange: **this is an
evidence protocol, not a monitoring service.** Every decision below
should be checked against it.

### THE GOVERNING QUESTION (keeper, 08-21)

> "How do I turn SCVD from a crawler that produces interesting
> observations into a standardized evidence system that agents can
> safely consume?"

This is the spine of the document. Everything below is a sub-answer.
The full answer is five properties — an observation becomes
consumable evidence when it is all five, and today we hold two:

| Property | Means | Where | State |
|---|---|---|---|
| **Verifiable** | checkable without trusting the issuer | signatures, key history, chained + anchored corpus | **STANDING** — our strongest half |
| **Refusable** | the record makes "don't rely on this" the easy default | freshness states, expiry, `not_observed`, `indeterminate` | **PARTLY STANDING** — passports have it, the census does not |
| **Decidable** | an agent acts on it without reading prose | §2 layers, §3 typed record, `limitations[]` | PROPOSED |
| **Reproducible** | a stranger can run the procedure and emit a comparable record | §4 methodology, `procedure.version` | PROPOSED |
| **Consumable** | stable identifiers, stable schema, a way to read it at agent scale | §14 | **GAP — surfaced by this question** |

The word doing the most work is **safely**. Safe consumption means the
worst case of trusting a record is bounded and known. Every unsafe
case we can name maps to one of the five:

- a `ready` from three weeks ago read as current → **refusable**
- a `ready` at L3 read as "I can buy here" → **decidable**
- a `not_ready` that was actually our network blinking → the canary
  (§10), which is refusability applied to ourselves
- a record whose schema a consumer mis-parses → **consumable**
- a record nobody can check → **verifiable**

"Crawler" and "evidence system" differ in exactly one more way worth
naming: a crawler's output is *ours*. A standard's output is
**anyone's**. The test for whether we have crossed the line is
whether a second party can emit a conformant record we would accept
(§8 federation).

### THE THESIS (keeper, 08-21)

> **SCVD becoming the place where the machine-readable historical
> evidence about machine commerce accumulates.**

Every word load-bearing: *machine-readable* (not prose), *historical*
(not current state), *accumulates* (not is published once).

### THE ACID TEST (keeper, 08-21) — the criterion everything must pass

> "Can an independent agent, **without trusting SCVD's conclusions**,
> consume SCVD's raw evidence and reach **its own conclusion** about
> whether an endpoint deserves trust?"

This is stronger than the five properties above — it is the test *of*
them, and it converts the whole document from a plan into something
falsifiable. It has one structural consequence that governs the
record format:

**`conclusion = f(evidence, rules)`, where the evidence is complete,
`f` is published and versioned, and the agent may replace `f`.**

Three things a consumer must be able to do:

1. accept our `f` (convenience),
2. apply their own `f′` to our evidence (independence),
3. ignore both and read the raw fields (rawest).

If any of the three is impossible, we are a crawler with opinions.
Two corollaries, both hard rules:

- **No fact may exist only inside a conclusion.** If we judge
  `not_ready` because a field was missing, that missing field is
  itself a recorded fact, not an explanation buried in a verdict.
- **Raw evidence must be no more expensive and no less fresh than the
  conclusion.** If conclusions are free and the underlying facts are
  paid, independence costs money and the test only half-passes.
  Proposed line, needs a ruling (§12.9): **we sell observation
  labour, never access to what we saw.**

### THE INVENTORY — what we actually have today (08-21)

Structured around what exists, because most of this document is about
what does not. Everything below is **shipped and live**. Read this
first; §§1–21 are about the gap between it and the thesis above.

**Instruments that observe** — the census/ward round (weekly, signed);
preflight (free, one probe one moment); service_audit (full battery,
point in time); standing_watch and conformance_watch (over time,
paid); launch_check (a real mainnet purchase of your own door, stage
by stage); settlement_attestation (what the chain says); the_statement
(a wallet's whole window); signature_agent_card and onpage_audit.

**Instruments that verify** — the free conformance desk (anyone's
signed offers/receipts, split verdicts, never one magic number); the
receipt-verification desk (any issuer's artifact in, signed verdict
out, with a real taxonomy: valid / invalid / expired /
insufficient_evidence / unsupported / indeterminate); /api/verify,
free forever; the authority pack with published test vectors and a
reference verifier; full key history with retired keys kept.

**The record** — a weekly signed, hash-chained, Bitcoin-anchored
corpus with gaps preserved rather than filled; per-host history; the
registry tally; the Pulse (our own funnel, asks split from
settlements); a permanent corrections log.

**Derived surfaces** — endpoint passports (signed, expiring, freshness
states, derived from the corpus, never re-observing); the free
decaying chip; the Fresh Set; the trust panel with the five-level
assurance ladder; hosted trust profiles; the practice/obstacle
course; the mandate; the bounty board.

**Doctrine already in force** — rule 43 (dated observations, never
scores on operators); the consent line (names only on the ready
side); delivery-first (a failed delivery takes no money at all);
refusal to sell audits of our own door; the 27→5 consolidation law;
dual-discipline signing for new artifact classes; corrections
permanent; and the positioning already in the README — *"the layer
underneath you rather than a competitor."*

**Demand** — one confirmed external consumer, who bought two watches
and is asking design-partner questions (§20).

**The honest one-line summary of all of it:**

> **The form is built. The volume is thin.** Nearly every mechanism
> this document argues for either exists or has a shipped sibling to
> copy from; what is missing is coverage, frequency, precision of the
> record, and consumers. That is a much better position to be in than
> the reverse, and it is why this outline is mostly about plumbing
> rather than invention.

**Start at §16 for the architecture** — the stack, every component
mapped to the question it answers, and an honest maturity column.
§17 is the proposal to publish that map. §18 is the observation
manifest and the non-equivalences. §19 is adoption, the fork, and
economic weight. §§1–15 are the depth behind them.

---

## 1. The problem, in numbers

### STANDING — what the corpus actually shows (W32–W34)

|                  | W32   | W33   | W34   |
| ---------------- | ----- | ----- | ----- |
| Population known | 25    | 5,809 | 5,873 |
| Walked           | 39    | 42    | 40    |
| Coverage         | 156%* | 0.7%  | 0.7%  |
| Hosts probed     | 56    | 60    | 59    |
| ready            | 28    | 34    | 33    |
| not_ready        | 11    | 8     | 7     |
| not_probed       | 17    | 18    | 19    |
| Appeared         | 0     | 210   | 6     |
| Disappeared      | 0     | 78    | 2     |

\* W32's 156% is an artifact: population_known was 25 that round (no
fuchss source), so walked > known.

### The read

- ~40 hosts walked per round against a ~5,873 listed population.
- **Flat.** Three rounds, same ~40, same verdict split. Flat for
  three weeks is the signature of a process a human must remember to
  run.
- ~32% of hosts we *intended* to walk came back `not_probed` (19 of
  59). That is rot inside the bank we already have, distinct from
  coverage.
- `verdict_changes` empty on inspected hosts — with weekly cadence we
  **cannot distinguish "stable" from "unobserved."** The corpus should
  say so in those words.
- Churn is large and real: W33 saw 210 appear and 78 disappear.

### PROPOSED — the denominator is probably lying

0.7% is measured against a *listing*, not a population of live
endpoints. Two counts settle it, both reads:

- How many of the 5,873 have a **probeable URL** at all?
- How many still answer anything?

If the live population is ~400, then 40/400 is 10%, not 0.7%, and the
goal changes from "cover a fraction" to **"cover all of it"** —
completeness, which is a categorically better claim.

### OPEN

- Which denominator do we publish? (Recommendation: both, with the
  gap named — same discipline as the sourced 13,760/420 figure.)

---

## 2. What we can and cannot claim (the epistemics)

This section is the heart of the 08-21 exchange and governs the rest.

### STANDING

- Rule 43: dated observations, never scores on operators.
- The consent line: names appear only on the ready side, everywhere.
- The receipt desk keeps `not_checked` separate from `bad` — the
  vocabulary exists; the census never inherited it.
- The assurance ladder (novelty / observation / monitored / audited /
  witnessed) — *how much evidence* stands behind a claim.

### The core problem

`ready` / `not_ready` / `not_probed` is one bit plus unknown, standing
in for a multi-dimensional truth. What we can honestly say is:

> SCVD's probe, from its environment, with its identity, using its
> request sequence, at that moment, reached layer N.

What the current record implies is "the endpoint was working." Those
are not the same statement, and the gap is the whole risk.

### PROPOSED — the seven layers of "works"

| # | Layer | What it establishes | Cost |
|---|---|---|---|
| L0 | Resolution | DNS resolved | free |
| L1 | Transport | TCP/TLS, cert valid | free |
| L2 | HTTP | responded at all, status | free |
| L3 | Protocol shape | 402, parseable accepts, required fields | parse |
| L4 | Offer validity | network real, asset real, payTo well-formed for rail, amount sane | parse |
| L5 | Settlement | a real payment clears | money + consent |
| L6 | Delivery | goods returned, matching the offer | money + consent |
| L7 | Semantic correctness | the resource satisfies its advertised contract | needs an oracle |

Today's `ready` ≈ "reached L3." The honest record is **"reached L3;
L4–L7 not observed."**

**This is a recording change, not a probing change.** L0–L2 fall out
of the fetch we already make; L3–L4 are parsing. Only L5–L6 cost
money. Most of the fidelity is free.

**This axis is orthogonal to the assurance ladder.** That ladder says
how much evidence; this says what was tested. They must never be
collapsed into one number.

### PROPOSED — L7 is a trap; record divergence instead

Claiming semantic correctness requires asserting an oracle, which
makes us the disputed party rather than the recorder. **Hard boundary:
SCVD never claims correctness as its own verdict.**

Oracle-free substitute — record **divergence**:
- two observers ask the same question seconds apart, answers differ
- the offer changed between observations
- response differs across client profiles

Each is checkable, requires nobody to be declared right, and leaves
the conclusion to the reader.

### PROPOSED — depth is capped by consent, not budget

L5–L6 mean spending real money at a stranger's door. That cannot run
at census scale. **The census permanently tops out at L3/L4 for
strangers**; L5–L6 live in consented paid products (launch_check on
your own door). Write this into the methodology up front rather than
discovering it later.

---

## 3. The observation record

### PROPOSED — the shape

Conceptually (field names not settled):

```
observed_at
subject      { url, host }
observer     { id (did:web + key), software, version }
environment  { egress vantage, region if known, ip_class, TLS stack }
procedure    { name, version, method, timeout_ms, client_profile }
request      { method, headers sent, payment_scheme }
observations { dns, tls, http, x402_requirements, payment, delivery }
conclusion   { status }
limitations  [ single_region, single_client, single_request, ... ]
not_observed [ L4, L5, L6, L7 ]
```

### The four fields that cannot be backfilled

Cheap today, impossible in October. These are the reason the
observation record comes before any volume work:

1. **`limitations[]`** — what this observation does *not* establish.
   Arguably the most important field in the record.
2. **`not_observed[]`** — which layers were never reached, kept
   distinct from layers that were reached and failed.
3. **`procedure.version` / `observer.software.version`** — the probe
   *will* change. Without a version stamp per observation, October's
   data isn't comparable to August's and the longitudinal series
   quietly stops being a series.
4. **Environment fingerprint** — the instrument prints its own
   coordinates instead of pretending it has none.

### OPEN

- Exact field names, and whether this is a profile of the existing
  scvd-attestation spec or a sibling artifact class.
- Does the record get the dual-discipline signing treatment (declared
  order + JCS)? Presumed yes — new artifact class.
- Do we design it for **strangers to emit from day one**? (See §8
  federation; this decision must precede the format, not follow it.)

---

## 4. Methodology and credibility

### PROPOSED — four properties, all published

1. **Reproducible** — the probe published as a versioned spec:
   method, headers, sequence, timeouts, what counts as reaching each
   layer. Anyone can re-run it.
2. **Scoped** — every verdict names its own scope on its face: which
   layer, which environment, which moment, which identity.
3. **Falsifiable** — the document states what would change a verdict,
   and what a failure does *not* mean.
4. **Versioned** — methodology changes dated and announced, the same
   discipline as key rotation.

The methodology document is also a **distribution asset**: people cite
methodologies, and it is what an aggregator links to when explaining
why they trust our rows.

### OPEN

- Where it lives: `/methodology` as a room, plus a machine copy?
- Does the probe spec ship as runnable code so third parties can
  execute it identically? (Ties to federation.)

---

## 5. Coverage — the supply funnel and how it grows

### The funnel (currently uninstrumented)

```
listed → resolvable → qualified → door bank → walked → observed
5,873       ?             ?           ~40        ~40      ~59 rows
```

- **listed** — a name in somebody's directory. Have it.
- **resolvable** — we hold a probeable URL. **This number exists
  nowhere.** Likely the clog: 5,873 names, ~40 URLs is not a
  throughput problem, it's a missing pipe.
- **qualified** — a URL that ever answered like an agent-facing door.
  Uncounted.
- **door bank** — what we walk.

Conversion rates between stages tell us which pipe is clogged. We are
currently arguing about coverage without knowing where the loss is.

### Which stage starves which feature

| Feature | Starved of |
|---|---|
| Passports | history depth → continuity |
| Fresh Set, registry tally | breadth → resolution + qualification |
| Trust profiles | both, plus frequency |
| Corpus as a moat | continuity |
| The wire / outreach | resolvable contacts → resolution |

Resolution is load-bearing for three of five.

### PROPOSED — the routines that make it grow without a human

Bounded, idempotent, self-reporting — the ward round's shape:

- **The harvest** — every source polled on a cadence, new names in,
  deduped by canonical host, **with provenance** (which source, first
  seen when).
- **The resolver** — the missing pipe. Unresolved names → probeable
  URLs, small batches, one attempt per name per period, failures
  recorded with reasons so nothing retries forever and the reason
  distribution becomes the work order.
- **The qualifier** — cheap liveness, not the full battery. Promote on
  success; park with a dated reason on failure.
- **The prune** — see §6.
- **The report** — every round publishes the funnel and its own
  growth. If the bank didn't grow, the round says so, in the same
  voice that publishes missed days against us. Flatness becomes loud.

### PROPOSED — sources

- The directories: fuchss, x402scan, Agentic.Market, Pay.sh,
  ampersend, Bazaar, facilitator lists.
- **The chain** — directories list who *registered*; the chain shows
  who *transacts*. An endpoint with real settlements is worth a
  hundred directory rows. We already own the instruments that read
  settlements (the_statement, settlement_attestation); they have never
  been pointed at discovery. (Backlogged as the chain-inflow reader,
  gated on the W35 walk.)
- **Self-registration flywheel** — every preflight, refresh, and
  profile purchase is a host handing us a URL. Are we capturing them?
  Consent care: asking us to look once is not consent to be walked
  weekly forever; a profile purchase naturally supplies that consent.

### PROPOSED — the population is defined too narrowly

There may not be 10,000 live *x402* endpoints in existence. The keeper
wants double-digit thousands, and the honest path is that the real
universe is **agent-facing commercial endpoints**, with x402 as one
observed *capability* rather than the membership test:

- x402 doors (the core)
- MCP servers — thousands, across several registries
- anything publishing `/llms.txt`, `openapi.json`, an agent manifest,
  a bot-auth key directory
- other payment shapes: MPP, ACP, L402

Our instruments already read most of that — onpage_audit,
signature_agent_card, and the preflight are not x402-only. "Here is
the agent-commerce population, and here is what fraction can actually
take money" is a better dataset than one protocol's registrant list.

### PROPOSED — be the index of the indexes

Provenance lets us publish **per-source quality**: "Source A's
listings are 80% dead at 60 days." No directory can report that about
itself. This is a position, not a feature.

### Scale physics (not a constraint)

10,000 hosts × 1 GET/week ≈ 60/hour. Trivial for Workers with the
hourly batching that already exists. The constraint is acquisition,
not throughput.

### OPEN

- Etiquette ceiling, to be written **before** scaling, not after:
  going from 40 to 10,000 means 10,000 unrequested weekly signed GETs
  at strangers' doors. One polite, self-identifying request per host
  per week is defensible — but the cap and the rule should be decided
  while it is still theoretical.
- **Daily changes that answer materially** (keeper's medium-term goal,
  §13). Weekly is unmistakably polite; 10,000 hosts × daily is ~10k
  unrequested requests a day, which some operators will read as
  scraping regardless of how well we behave. If the corpus goes daily
  at scale it needs, at minimum: robots respect, honouring 429 and
  Retry-After, per-host backoff, a published opt-out that actually
  works, and the reason we are knocking stated at the door (User-Agent
  + Web Bot Auth identity + a URL explaining the census). Worth
  considering a **tiered cadence** instead of uniform daily — daily
  for the panel and anyone who opted in, weekly for the long tail —
  which buys the drift signal where it matters without a tenfold
  knock on strangers who never asked.

---

## 6. Rot and churn

### PROPOSED — two rules make rot cheap, and one makes it an asset

- **Never delete, demote.** Failures ride a backoff ladder — dead
  once, retry next round; dead 4×, monthly; dead 12×, quarterly —
  forever, never removed. Cost per dead host trends toward nothing,
  and resurrection is still caught. Deleting loses the death date,
  which is the valuable part.
- **Churn is the product.** Nobody in this ecosystem records deaths
  with dates, and directories structurally cannot report their own
  rot. "Of 5,873 listed endpoints, X% answered nothing across four
  consecutive passes; here is the half-life by source" is a finding
  only we can make.

The treadmill only hurts while a human is on it.

---

## 7. Frequency — the instrument ladder

### The observation today

Frequency and coverage are welded to one setting for everyone:
weekly, ~40 hosts. Unwelded, the family writes itself.

### PROPOSED

| Rung | Scope | Cadence | Purpose | Status |
|---|---|---|---|---|
| **Sweep** | whole population | monthly | breadth, liveness only | proposed |
| **Round** | panel + sample | weekly | today's census | STANDING (as panel only) |
| **Beat** | a cohort | daily | **the missing middle** | proposed |
| **Watch** | one host | hourly | paid depth | STANDING |

**The Beat** is the commercially interesting one: not "watch my door"
but "watch the 50 endpoints in this category, daily." Buyers are
directories, wallets, indexes, aggregators.

Consent-safe shape: **the aggregate is the product** (how many of the
50 were ready each day, how the shape moved); per-host detail goes
only to the host itself. We never sell a list of who is broken — which
is also why nobody sues us and why competitors who do it are hated.

---

## 8. Probe diversity

### PROPOSED — identity diversity before geographic diversity

The confounder list (IP reputation, UA, TLS fingerprint, Cloudflare
challenge, geography, rate, headers) reads like a threat to validity.
For a general uptime monitor it is. **For this store it is the
product.**

The question we sell an answer to is not "is this site up," it is
**"can an agent buy here."** A signed, well-behaved, self-identifying
bot getting a 403 where a browser gets 200 is *the finding* — an
endpoint marketing itself to agents while blocking automated clients
is failing at its stated purpose, and we hold the right vantage to say
so.

Therefore, if only one axis of diversity gets built, build **client
profiles**: signed Web Bot Auth probe / plain unsigned client / MCP
client / browser-shaped. That distinguishes three findings that today
all collapse to `not_ready`:

1. blocked us specifically
2. blocks all automation
3. actually down

Geography answers somebody else's question. Identity answers ours.

### The regional observatory is harder than it looks

Cloudflare Workers do not give controllable egress geography — a
Worker executing in Frankfurt may still egress elsewhere; you cannot
declare "EU probe." Real mechanisms:

- **Durable Object location hints** (wnam/enam/weur/eeur/apac/oc/afr/
  me) do pin placement.
- Or genuinely separate observers outside our infrastructure.

Which means multi-region and federation are not two projects — the
cheap honest version of one **is** the other.

### PROPOSED — federation without becoming a rating agency

Defining the format is easy. The governance is not: who may be an
observer, and what stops an operator running one that always says
their own door is fine?

**Answer: publish the format, verify anyone's signature, certify no
one.** "Observer B asserts X, signed at T; we verify the signature and
do not vouch for B." Corroboration becomes "N independent signatures
agree," and the reader weighs the signers. Rule 43 applied to
observers, not just operators.

**The primitive already shipped.** The receipt-verification desk takes
*anyone's* signed artifact and returns a signed verdict. An
independent observation is just another artifact. Federation here is a
published schema plus a desk we already built — not a new system.

---

## 9. The watch as a product grammar

### The problem (keeper, 08-21): "I'm confused how the buyer defines those asks"

That confusion is the product's fault. "We watch your endpoint" gives
the buyer no vocabulary for what watching means.

### PROPOSED — one product, six parameters

**target · depth (L3 / L4 / L6) · frequency (hourly / 6h / daily) ·
duration (7d / 30d) · client profile (default / MCP / SDK /
browser-shaped) · finding rule (any failure / 2 consecutive / any
change from last)**

All six print on the delivered artifact. The buyer knows what they
bought; pricing runs along depth × frequency × duration; and the
27→5 consolidation law holds — one watch with knobs, not five SKUs.

The grammar maps directly onto `procedure` and `limitations` in the
observation record, which is why §3 comes first.

---

## 10. Failure handling and delivery honesty

### PROPOSED

- **The canary** — a known-good control probed in every batch. If the
  control fails too, the round is **void**, not a mass of false
  verdicts about other people's doors. `coverage_suspect` should be
  driven by this evidence rather than a heuristic.
  *This is the single highest-value robustness item: at 40 hosts a
  false verdict is 40 wrong claims; at 10,000 it is 10,000.*
- **Multi-path where possible** — the same doctrine already applied to
  RPC (Alchemy → publicnode → drpc). One vantage failing should not
  become a finding.
- **Attempted / observed / missed** printed on every watch artifact,
  each miss with a reason.
- **The proposed rule for hiccups:** misses that are **ours** extend
  the term automatically; misses that are **theirs** are the product,
  not a delivery failure. This keeps delivery-first intact and makes
  the "5 of 7 days" case unambiguous instead of undefined.

### Sequencing rule

**Robustness before scale, not after.** Scaling a probe that cannot
distinguish "their door is down" from "our network blinked" multiplies
harm linearly. The canary and confirmation-before-verdict are the
licence to grow.

---

## 11. Sampling and what may be claimed

### The problem

The ~40 are not a sample — they are whoever we happened to collect.
"55% ready" is a fact about our door bank. Any aggregate framed as
"the x402 ecosystem is N% reliable" is statistically meaningless
without designed sampling.

### PROPOSED — panel + sample, same budget

- **The panel** — the door bank, walked every round. Longitudinal,
  per-host, produces drift. Valuable at n=1.
- **The sample** — N hosts drawn **at random** from the known
  population each round. Aggregate only. At n=40, roughly ±15% on a
  proportion; pooled over ten rounds, ~±5%.

Same GET count. The ecosystem claim gains a margin of error instead of
a shrug, and a random sample produces aggregates — never a published
verdict on an operator — so rule 43 and the consent line hold.

### PROPOSED — the sampled purchase (needs a ruling, §12)

A public 402 offer is an invitation to transact; buying a sub-cent
item from a stranger's door is being a customer, not abuse. Twenty
random doors per round, hard budget cap, disclosed in the methodology,
and we can say:

> "We paid at 20 randomly drawn endpoints this week; 14 delivered."

That is the single most valuable statistic in this ecosystem and
nobody has it. It is the settlement-attempt lane, already an open
ruling.

### The synthesis — two products, two data requirements

- **Longitudinal per-host** → sellable to that host (watches,
  profiles, passports). Needs depth and continuity on a panel.
- **Ecosystem statistics** → sellable to directories, aggregators,
  researchers. Needs a random sample. Meaningless without it.

**Until the random draw exists, the corpus should stop describing
itself as observing "the ecosystem"** and say plainly that it observes
a door bank. That correction is free, and it is what makes the later
ecosystem claim believable.

### Correction to an earlier claim (recorded, 08-21)

I argued continuity mattered above coverage. The keeper pushed back:
continuity is moot if coverage isn't useful, scalable, and credible.
He is right about order. Continuity compounds *value*; validity and
coverage establish *legitimacy*, and you cannot compound something
nobody accepts. **Order: validity → coverage → continuity.**
Continuity is what you protect once the first two are real.

---

## 12. Open rulings — the keeper's alone

1. **The sampled purchase.** Do we spend house money buying from
   strangers' doors to measure delivery? Touches money *and* the
   naming rule (a failure-to-deliver stays aggregate; the host is told
   privately).
2. **Open standard or ours?** Do we publish the observation schema for
   strangers to emit? This decision must precede the format design —
   a schema built for third parties from day one differs from one
   retrofitted later.
3. **Etiquette ceiling** for unrequested probing at 10k+ scale, and
   whether daily gets a tiered cadence rather than uniform knocking.
7. **Publish `/plan`?** (§17) — the dated self-observation of our own
   maturity, including the word "thin" where it applies.
8. **Bounties as observation capacity** (§16) — do we spend bounty
   money to buy probe diversity we cannot get from our own
   infrastructure, and under what rules?
9. **Free raw evidence?** (§0 acid test) — proposed line: *we sell
   observation labour, never access to what we saw.* The watch, the
   refresh, the audit, the hosted page are all labour and stay paid;
   the underlying facts stay as free and as fresh as the conclusion
   drawn from them. If raw evidence is ever paywalled, the acid test
   only half-passes and the thesis weakens with it. Needs the
   keeper's ruling because it forecloses a revenue line on purpose.
10. **Are the non-equivalences canon?** (§18) — ten of them now. If
    ruled, they belong in HOUSE_RULES.md, not only here, and every
    surface gets checked against them.
11. **Do we answer the first consumer, and how?** (§20) — a paying
    stranger asked whether a formal evidence schema exists. Saying
    "yes, here it is" costs nothing and may convert a Stage-2 buyer
    into a Stage-3 dependency. Recommend yes, in public, via §17.
12. **Four axes, not one ladder** (§20) — confirm the depth /
    corroboration / continuity / weight split, and that the shipped
    assurance ladder stays untouched beside it. This decides the
    record format's shape, so it precedes §3.
4. **Scope broadening** — does the census officially become
   "agent-facing commercial endpoints" rather than x402 only?
5. **The hiccup rule** — our-miss extends the term, their-miss is the
   product. Confirm.
6. **Population definition published** — which denominator(s), and
   does the corpus retract "the ecosystem" language now?

Carried over from before, still open: MPP chargebacks /
`settlement_finality`; key succession (F3, deferred "another day");
trust_profile price (currently $19 ⚑).

---

## 13. Sequencing

### THE KEEPER'S ROADMAP (08-21, his words)

**Immediate — this week: scale the walking.**
"0.7% coverage is a demo, not a product. The population register
knows 5,873 hosts; we walk 40. That gap is the whole problem."

**Medium-term — this month: increase frequency.**
"Weekly is too slow for the 'did Tuesday's deploy break it' question.
The paid watch is hourly; the corpus needs to be at least daily to be
useful."

**Long-term — this quarter: build the middle layer.**
"Medium-frequency, medium-coverage, paid-per-host. Right now we have
two ends of a spectrum (free weekly 0.7% vs paid hourly 1 host) with
nothing in between. That middle is where the data moat actually
lives."

*The middle layer is §7's **Beat** rung. Same instrument, already has
a home in this outline.*

### What "scale the walking" translates to in work

You cannot walk what you cannot address. If the register holds 5,873
**hosts** but the door bank holds ~40 **URLs**, then "scale the
walking" IS the resolver — §5's missing pipe — and the fastest form of
it is **convention-based resolution**: for each known host, probe a
small fixed set of conventional paths rather than hunting for a
bespoke URL.

- `/.well-known/x402.json`
- `/llms.txt`
- `/openapi.json`
- the root

Four cheap requests per host, once per host, cached, with the backoff
ladder for failures. ~23k requests for a full first pass over 5,873 —
a bounded sweep spread across the hourly batches already running, not
a new machine. That is the realistic path from 40 to thousands inside
a week, and the funnel count (below) tells us the hit rate before we
commit to it.

### Dependencies that must ride WITH the scaling, not after it

Recorded as disagreement-in-the-open, not as a block. Both are small,
and both get permanently more expensive the moment volume arrives:

1. **The observation record's un-backfillable fields (§3).** Scaling
   to thousands before the record carries `limitations[]`,
   `not_observed[]` and `procedure.version` means thousands of
   permanently low-fidelity rows. At 40 rows/week that debt is
   trivial; at 5,000/day it is the whole corpus. The fields are free
   at probe time — this costs days, not weeks, and it does not slow
   acquisition, which is different code.
2. **The canary (§10).** A false verdict at 40 hosts is 40 wrong
   claims about other people's businesses; at 10,000 it is 10,000,
   generated in one bad round by our own network blinking. This is the
   single cheapest robustness item and the licence to grow.

Everything else in the old proposed order can follow the keeper's
roadmap rather than precede it.

### Remaining order, after the roadmap's three phases are underway

1. **The funnel count** — reads only, touches no stranger's door.
   Tells us whether the clog is resolution or qualification, and what
   convention-based resolution's hit rate actually is.
2. **The methodology document** — published, versioned, carrying the
   L7 boundary and the consent ceiling.
3. **Client-profile diversity** — the identity axis; our actual
   question.
4. **Panel + random sample** in the walk.
5. **Federation schema** — after our own records are worth copying.

---

## 14. Consuming the evidence — the gap the governing question found

Everything in §§1–13 is about **producing** good observations. The
keeper's question exposes a whole half nobody has designed: what an
agent developer needs in order to read them safely at scale. All of
this is **GAP** — not built, not previously outlined.

### Stable subject identity

`host` is a fragile key. Subdomains, ports, paths, redirects, CDN
fronting and multi-tenant platforms all break it, and two observations
of "the same" subject may not be about the same thing. A standard
needs a canonical subject identifier with stated rules — what
normalizes, what does not, and what happens when a door moves. Without
it, longitudinal series silently splice unrelated things together.

### Schema evolution policy

Agents cache. A format that changes silently breaks consumers who did
everything right. Needs, stated publicly and enforced:

- schema version on every record
- additive-only changes within a major version
- a deprecation window with dates, announced like key rotation
- old records remain valid and parseable forever

### Consumer conformance vectors

We already publish signature test vectors in the authority pack — the
precedent exists. Extend it: publish N observation records with the
**correct conclusion for each**, including the hard ones (expired,
`not_observed`, divergent, void-by-canary). An implementer runs them
and learns whether they are reading us right. This is what separates a
format from a standard.

### Query semantics at agent scale

Today a consumer can ask about one host (the passport). A consumer
tracking 500 hosts has no efficient move. Missing:

- a **delta feed** — "everything that changed since T"
- bulk lookup
- stable pagination with a cursor that survives new data
- cache directives that match the freshness model, so a well-behaved
  consumer refetches exactly when the evidence decays

### The consumer guide

A document written for the agent developer, not the operator: how to
read a record, when to refuse, what each conclusion does and does not
license, and worked examples of correct and incorrect use. The
methodology doc (§4) explains how we observe; this explains how to
consume. They are different readers and should be different documents.

### Hard-to-over-quote design

A claim should be inseparable from its conditions. If `conclusion`
serialises to a bare `"ok"`, it will be quoted as "SCVD says this
endpoint works" the first day someone builds a badge from it. The
conclusion field should carry its own scope — layer, client profile,
moment — so that quoting the conclusion quotes the limits with it.

---

## 16. The stack — doctrine (filed 08-21 from an outside architecture read)

### The architectural decision, stated once

**SCVD provides the evidence. It does not become the reputation
score.** This is already implicit in the assurance ladder
(observation → monitored → audited → witnessed rather than a number)
and in rule 43. Stated here as the load-bearing choice it is, because
every component below either honours it or breaks it.

```
                    AGENT WANTS TO BUY
                           │
                  "Should I trust this?"
            ┌──────────────┼──────────────┐
        REGISTRY         CORPUS       CONFORMANCE
      "who exists?"  "what happened?"  "is this valid?"
            └──────────────┼──────────────┘
                     EVIDENCE LAYER
              ┌────────────┼────────────┐
           WATCHES       AUDITS     ATTESTATIONS
          "over time"  "deep once"  "on-chain?"
              └────────────┼────────────┘
                    ENDPOINT PASSPORT
                           │
                     TRUST PROFILE
              ┌────────────┼────────────┐
          DIRECTORY    REPUTATION      AGENT
           ranking       engine       decision
                    ↑
        WE STOP HERE. The bottom row is someone else's.
```

### The two-sided insight

The evidence is being built on **both sides of the transaction**, and
nobody named this before:

```
SELLER                          BUYER
offer                           mandate
  ↓                               ↓
conformance                   authorization
  └────────── transaction ────────┘
                  ↓
             settlement
                  ↓
              delivery
```

`the_mandate` is not a novelty item — it is the buyer-side twin of a
signed offer. That symmetry is a bigger story than uptime monitoring
and should be said out loud on the public surfaces.

### The component map

Every component answers a question **and refuses a neighbouring one.**
That refusal column is §2's layer discipline applied at product scale
— the same doctrine, one level up. The maturity column is **DRAFT and
needs the keeper's pass**; some entries are inferred, not verified.

| # | Component | Answers | Does NOT answer | Maturity (draft) |
|---|---|---|---|---|
| 1 | **Registry** | what doors exist; topology, churn, prices, operators | whether you'd successfully buy; whether it's permanently alive | **standing**, evidence **thin** |
| 2 | **Corpus** | what we observed at historical moments, chained + anchored | anything about unobserved moments | **standing form**, **thin volume** |
| 3 | **Preflight** | does this URL answer a recognizable x402 challenge right now | "the API works" — one probe, one moment | **standing**, well-used |
| 4 | **Conformance desk** | is this signed offer/receipt structurally and cryptographically valid | whether the seller delivers | **standing** — strongest piece |
| 5 | **conformance_watch** | does it keep passing the battery over a week | correctness of what it serves | **drafted** — never run a full week |
| 6 | **standing_watch** | does it keep answering over time | whether a purchase completes | **drafted** — unexercised |
| 7 | **service_audit** | the full named battery at one moment, deep | continuity | **standing** |
| 8 | **launch_check** | can a real buyer complete the whole purchase | anyone else's experience | **drafted** — the strategically biggest one |
| 9 | **settlement_attestation** | what the chain says happened to the payment | whether the service delivered | **standing** |
| 10 | **the_statement** | what a wallet actually moved | endpoint trust — this is buyer accounting | **drafted** |
| 11 | **the_mandate** | what the agent was authorized to do beforehand | whether it obeyed | **drafted** |
| 12 | **Fresh Set** | the latest observations available | history | **standing** |
| 13 | **Endpoint passport** | one object per host: identity, history, freshness | layers never observed | **standing**, evidence **thin** |
| 14 | **Trust profile** | a standing hosted view of the above | a score — deliberately | **drafted** (shipped 08-21) |
| 15 | **Bounty board** | can third parties be paid to observe | who those observers are | **drafted** — see below |
| 16 | **Pulse** | are agents using SCVD (our own funnel) | ecosystem activity | **standing** |
| 17 | **Corrections** | what we got wrong, permanently | — | **standing** — credibility machinery |

### Maturity vocabulary

- **standing** — built, live, load-bearing.
- **thin** — built, but the evidence behind it is too sparse to carry
  the claim the surface makes. *This is the honest word for most of
  the evidence layer today, and the whole point of §§1–13.*
- **drafted** — built, never exercised by a real outside buyer.
- **named** — designed and written down, not built.
- **open** — a question, not yet a design.

### The bounty board is the federation primitive, already shipped

The single most useful thing this read surfaced. A distributed
observation market attacks the one weakness a centralized observatory
cannot fix: **one observer cannot see everything** — not from every
region, not from every identity, not at every moment.

And we already own both halves:

- **The bounty board** — pays a third party to walk a door with their
  own wallet and prove the settlement.
- **The receipt desk** — verifies *anyone's* signed artifact.

Federation (§8) is those two pointed at each other plus a published
schema (§14). It is not a new system. A bounty-funded observation
from a stranger's wallet, in a stranger's region, from a stranger's
client, is exactly the probe diversity §8 says we cannot buy from
Cloudflare.

The governance answer from §8 holds unchanged: **publish the format,
verify the signature, certify no observer.** Bounties buy
observations, never reputations.

### The pitch, restated

Not "x402 uptime monitoring" — too small, and it invites exactly the
over-claim §2 exists to prevent.

**The observability and evidence layer for autonomous commerce.**

A human buying an API reads reviews, opens docs, tries it, complains
to support, disputes a charge. An autonomous agent has none of that
and needs machine-readable answers to a chain of questions:

> Who is selling this? · What exactly are they offering? · Did they
> cryptographically commit to the terms? · Has this endpoint actually
> been observed? · Has it stayed operational? · Has anyone
> successfully bought it? · Did payment settle? · Was the resource
> delivered? · What authority did my agent have? · Can I
> independently verify all of that?

We have pieces of nearly every one. The category is not invented:
x402's own signed offer/receipt extension describes signed artifacts
as being for dispute evidence, auditability, reputation systems and
agent-to-agent commerce. The protocol is creating the primitive; this
is the layer that reads it.

### ⚑⚑ NUMBER DISCREPANCY — now THREE-WAY, and it is the top LOOK item

Three sources, three incompatible pictures of the same instrument:

| Source | Population | Walked | Ready |
|---|---|---|---|
| Working table (§1), keeper 08-21 | 5,873 | **40** | **33** |
| Outside architecture read | 5,954 | **964** | — |
| Outside evidence read | — | — | **633** |

These cannot all describe the same quantity. Candidates:
cumulative-ever-walked vs per-round; `listed_resources` vs distinct
hosts; a figure that moved between reads; per-round verdict counts vs
all-time distinct ready hosts.

**This is no longer a footnote — it is the single most important
unknown in this document.** §1's whole diagnosis ("0.7%, flat, a
demo not a product") is built on the first row. If 633 hosts have
been observed ready, the instrument is a different order of magnitude
and several conclusions in §§1, 5 and 13 are wrong.

Attempted verification against live `/registry` and `/corpus.json` on
08-21: **scvd.store is egress-blocked from this build environment.**
No number is adopted here until someone looks. House doctrine on
disagreeing records applies — go look, do not pick.

---

## 17. Publishing the plan (keeper's ask, 08-21)

> "I think we need to publicise the plan and outline how we approach
> each piece and maybe even how far along we view each is."

### PROPOSED — `/plan`, as a dated self-observation

The doctrinal problem with roadmaps is that they are promises, and
this house does not publish promises it cannot sign. The resolution:
**the plan page is a dated observation of our own state**, in exactly
the voice rule 43 uses on everyone else — what stands today, what is
thin, what is named but unbuilt. Not "we will ship X by Y."

That makes publishing it consistent rather than risky, and it does
something almost nobody does: **states its own weakness in public,
with dates.** An operator deciding whether to trust the corpus learns
more from "this component is thin and here is why" than from any
claim we could make instead.

### What the page carries

- The stack diagram (§16) — where we stop, and that the bottom row is
  someone else's job.
- The component table with the maturity column, dated.
- The five properties (§0) with which we hold today.
- The honest coverage numbers, both denominators, with the gap named.
- What we are working on now and what is merely written down —
  distinguished, never blurred.
- A machine twin, because an agent evaluating whether to depend on us
  deserves the same answer a human gets.

### OPEN

- Does maturity language go on each component's own surface too, or
  only on `/plan`? (Recommendation: on `/plan` only at first — one
  place to keep honest is easier than seventeen.)
- Cadence of the dated re-issue. Monthly?
- Does `/plan` sit in the rooms list, on the storefront, or held back
  like `/trust` and `/passport` pending a keeper slot ruling?

---

## 18. The observation manifest and the non-equivalences

### PROPOSED — the manifest (keeper's field list, 08-21)

Published per observation, machine-readable. This supersedes the
sketch in §3; §3's reasoning still applies to why each field exists.

```
SCVD observation
├── timestamp
├── probe version              ← §3: un-backfillable
├── source population          ← which population this host came from
├── enumeration source         ← §5 provenance, ON the observation
├── exact target
├── exact request              ← headers we sent, so bias is visible
├── network
├── geographic region          ← §8: honest "unknown" until DO hints
├── DNS result                 ┐
├── TLS result                 │
├── HTTP status                ├─ §2 layers L0–L2, free from the fetch
├── headers observed           ┘
├── x402 challenge             ┐
├── challenge validation       ├─ L3
├── offer validation           ┘  L4
├── payment attempted?         ┐
├── settlement tx              ├─ L5
├── resource delivery          ┘  L6
├── response hash              ← divergence without republishing goods
├── failure classification     ← typed, and it attributes fault
└── limitations                ← §3: the most important field
```

Two notes on fields that carry more weight than they look:

**`response hash`, never the response body.** The hash detects
divergence across observers, moments and client profiles — which is
§2's oracle-free substitute for correctness — without us storing or
republishing goods somebody sells for money. Bodies only for our own
purchases, where we are the customer.

**`enumeration source` and `source population` ride the observation,
not a side table.** That is what makes per-source quality (§5,
index-of-the-indexes) computable by a *consumer*, not just by us.

### PROPOSED — failure classification must attribute fault

Free-text failure strings make `probe failure ≠ endpoint failure`
unenforceable. The classification is typed, and the first thing it
says is **whose failure it was**:

| Class | Meaning | Consumer should conclude |
|---|---|---|
| `ours` | our egress, timeout, canary void, quota | **nothing about the endpoint** |
| `theirs` | DNS, TLS, HTTP error, malformed challenge, invalid offer | something about the endpoint, at that layer |
| `refused_by_policy` | our own rules: private address, own host, robots, backoff | nothing about the endpoint |
| `identity_conditional` | reachable, but this client profile was blocked/challenged | §8's actual finding — depends whose eyes |
| `indeterminate` | cannot attribute | **nothing, and say so** |

`indeterminate` must stay populated in practice. A taxonomy that
never returns "I cannot tell" is one that guesses.

### DOCTRINE — the non-equivalences (keeper's, 08-21, extended)

These are canon candidates, in the house's voice. Everything in this
document exists to keep them true.

```
probe failure     ≠  endpoint failure
not observed      ≠  absent
not listed        ≠  dead
402 response      ≠  successful commerce
ask               ≠  sale
```

Four more fall out of what is outlined above and belong in the same
set:

```
settlement        ≠  delivery          (L5 ≠ L6; the attestation says so already)
delivered         ≠  correct           (L6 ≠ L7; the oracle boundary, §2)
sample            ≠  population        (§11; the door bank is not the ecosystem)
no observed change ≠  stable           (§1; weekly cadence cannot tell)
```

And the one the acid test adds, which governs all of them:

```
our conclusion    ≠  your conclusion
```

The conclusion is ours; the evidence is yours. A consumer who
disagrees with `f` should be able to disagree **using our own data**,
and that is a feature we build on purpose, not a leak we tolerate.

### ⚑ THE WORKED EXAMPLE — `no-signed-offers`, and why it matters most

A live published statistic, and the clearest case of the doctrine
above being violated by our own surface today:

> "0% of ready doors serve signed offers" (reported as 0 of 633)

`no-signed-offers` is ambiguous, and it collapses at least three
observations that are not the same:

```
A) the endpoint does not support signed offers
B) it supports them but exposes them somewhere we didn't look
C) our probe did not find them at the path we probed
```

Only (A) is a fact about the endpoint. (B) and (C) are facts about
**our probe**. The honest statistic is granular:

```
633 ready
    SCVD-recognized signed offer:      0
    other recognized signed offer:     ?
    offer present but unverifiable:    ?
    offer not exposed at probed path:  ?
    probe could not determine:         ?
```

**Why this is the most urgent item in the document.** We sell
conformance checking and offer verification. A statistic that says
0% of the ecosystem complies, published by the party selling
compliance, is self-serving unless it is granular — and the risk is
not that it is wrong, it is that **we would be quietly defining
reality in a way that makes our own product look necessary.** That is
the one failure this house cannot survive, because the entire
proposition is that we are the party that does not do that.

This is not a build. It is a **wording and measurement correction**,
and the corrections log exists for exactly this. It should be fixed
before any scaling work makes it 6,330 instead of 633.

> **DONE — 2026-08-28 (task #73).** The advisory is
> `signed-offers-not-in-challenge`: the observation, not a verdict on
> the door. Its detail names (A), (B) and (C) as readings it cannot
> separate and carries a falsifier an operator can walk for free. The
> census publishes the remainder as counts —
> `not_found_in_challenge`, `present_but_unparseable` — which sum
> with `serving` to the denominator exactly, plus
> `cannot_distinguish` beside every figure. The public sentence no
> longer says the remainder "ask to be paid on their word alone".
> Rows sealed under the old name stand as history and are joined at
> read. Dated in the corrections log and pinned by
> `test/signed-offers-granularity.spec.ts`; the buckets the probe
> genuinely cannot fill (an unrecognized signing convention, another
> placement) are published as limits rather than invented as numbers.

### Where each non-equivalence is enforced

| Non-equivalence | Enforced by | State |
|---|---|---|
| probe failure ≠ endpoint failure | canary (§10) + failure class + client profiles (§8) | **gap** |
| not observed ≠ absent | `not_observed[]`, gaps preserved in the corpus | **half standing** |
| not listed ≠ dead | registry/population split, backoff not deletion (§6) | **half standing** |
| 402 ≠ successful commerce | the layer model (§2) | **gap** |
| ask ≠ sale | the Pulse's own split (25,787 asks / 32 settlements) | **standing** |
| settlement ≠ delivery | settlement_attestation's stated limits | **standing** |
| delivered ≠ correct | the L7 boundary + divergence (§2) | **named** |
| sample ≠ population | panel + random sample (§11) | **gap** |
| no change ≠ stable | cadence stated on the artifact | **gap** |
| our conclusion ≠ yours | `conclusion = f(evidence, rules)`, published `f` | **gap** |

Six gaps. That table is the honest build list, and it is a better one
than any feature roadmap — each row is a claim we are currently
making that the machinery does not yet keep.


---

## 19. Adoption, the fork, and economic weight (filed 08-21)

### The three stages, and where we are

```
Stage 1  OBSERVATION   SCVD → corpus          evidence is collected
Stage 2  CONSUMPTION   SCVD → agents          others query it
Stage 3  DEPENDENCY    SCVD → reputation → marketplace → insurance
                                              others BUILD on it
```

**We are between 1 and 2.** Stage 3 is where the moat becomes real,
and the acid test (§0) is precisely the gate between 2 and 3: nobody
builds a business on evidence they must take on faith.

This also reframes the whole document. §§1–13 are about making
Stage 1 credible enough to reach Stage 2. §14 (consumption) and §8
(federation) are what carry Stage 2 into Stage 3.

### What is forkable and what is not

The code is not the moat, and pretending otherwise wastes effort.

| Easily forked | Hard to fork |
|---|---|
| verifier code | **the historical corpus** |
| passport code | **the ongoing observation process** |
| APIs, signing formats | **signed observation history** |
| MCP server, UX | coverage knowledge |
| business logic | **corrections history** |
| the whole repo | reputation as a neutral observer |
| | integrations and downstream consumers |

A fork on 2026-08-21 starts with zero historical observations, and
tomorrow it still has zero for August. The passport is explicitly
*derived from the corpus* — which means the forkable part produces
nothing without the unforkable part.

**Corollary that should change behaviour:** every week of continuity
is a week a competitor can never buy, and every week missed is a hole
in the only asset that compounds. This does not outrank coverage
(§11's correction stands), but it does mean **never missing** is
worth more than any single feature on the roadmap.

### "What stops Coinbase or the x402 Foundation from running this?"

Nothing technical. Two things structural, and the second is the real
answer:

1. **Time.** They cannot backfill August 2026.
2. **Neutrality.** The protocol's own authors cannot credibly be the
   protocol's neutral observer — it is the instrument vouching for
   itself, the exact conflict this store already refuses when it
   declines to sell audits of its own door. And they have no
   incentive to publish rot in their own ecosystem. Our willingness
   to publish "31% rot" is credible *because* it is not our protocol.

That is a defensible position, and it is doctrine we already hold
rather than a claim we would have to invent.

### Evidence is the raw material of many reputations

The clearest statement of the §0 acid test in commercial form. One
passport, three consumers, three different `f`:

```
passport { latest: READY, freshness: FRESH,
           observations: 47, gaps: 3, coverage: 82% }
        │
        ├── reputation engine  →  trust_score = 91
        ├── insurance engine   →  premium = 0.7%
        └── marketplace        →  eligible = true
```

**We do not need to own any of those businesses**, and owning one
would compromise the neutrality that makes the evidence worth buying.
The refusal to compute a score is the product decision that makes
Stage 3 possible.

### PROPOSED — the second dimension: economic weight

The best product idea in the 08-21 batch. Today the corpus has one
axis (does it work). Volume data adds a second:

```
                 HIGH VOLUME
                     ↑
    important        │
    infrastructure   │
                     │
LOW TRUST ───────────┼─────────── HIGH TRUST
                     │
    experiments      │
                     ↓
                 LOW VOLUME
```

Example from the wild: `blockrun.ai` at ~$28,118 across ~2,747,668
calls and 154 buyers, against thousands of endpoints with no reported
volume at all.

The valuable output is not "33% of endpoints are broken." It is
**high-economic-value endpoints with weak evidence** — a genuine risk
primitive:

> "This endpoint has processed $4.2M historically, but has only 82%
> observed availability and no independently verifiable offer
> history."

That is what an agent wallet about to move $50,000 actually needs,
and it is a sentence no directory can produce.

**We can compute the volume axis already.** The chain is public, the
payTo capture is live, and the settlement instruments exist — this is
the chain-inflow reader (backlogged, gated on the W35 walk) pointed
at the whole population instead of one buyer's question. Rule 43
holds: volume is a dated observation of on-chain fact, not a score.

### The forensic agenda — questions we cannot currently answer

An honest list of what we would need to know to argue the moat with
numbers instead of theory. Most are reads.

1. Actual corpus size and growth over time
2. Unique endpoints observed (all-time, not per-round)
3. Observations per endpoint (distribution, not average)
4. Exactly what gets recorded per observation today
5. Whether anyone is querying the corpus, and who
6. Who is paying for observations / passports / attestations
7. Actual revenue
8. External consumers of the evidence — any at all?
   **ANSWERED 08-21 (§20): at least one, who bought two watches and
   is asking design-partner questions.**
9. How much architecture is observatory vs original store
10. The roadmap as the commit history actually shows it
11. Whether we are explicitly positioning as an evidence supplier to
    third-party reputation systems (the README already says
    "the layer underneath you rather than a competitor" — so: yes,
    and it should be said louder)
12. What prevents a well-funded team from running the same
    observatory (answered above; needs the numbers to be persuasive)

**#5 and #8 are the ones that matter most and are least known.**
Stage 3 is unreachable without external consumers, and we do not
currently know whether we have any.

---

## 20. The evidence axes, the rich passport, and the first consumer (08-21)

### THE SIGNAL: we have an external consumer, and they are a design partner

Filed against §19's forensic question #8 ("external consumers of the
evidence — any at all?"), which said we did not know. **We do.**

Someone has **bought both a `standing_watch` and a
`conformance_watch` on x402.org**, then come back asking — unprompted
— for precisely the things this document argues for: procedure and
observer versions, request and payment parameters, raw or hashed
request/response evidence, exactly which checks passed and failed,
what the result establishes and what it explicitly does NOT, probe
limitations, cross-region corroboration, and selection methodology
for the walked population.

They also ask directly:

> "I'd be curious whether you're designing the Observatory around a
> formal evidence schema/assurance hierarchy already, or whether
> that's still evolving."

Three things follow, and they are the most actionable items in this
document:

1. **The answer is yes, and it is this document.** Saying so is free.
2. This is the strongest possible argument for §17 (`/plan`): a real
   buyer is asking for our maturity map by name.
3. `conformance_watch` and `standing_watch` are marked **drafted —
   never run a full week** in §16. They are being run now, by a
   paying stranger, on a third party's endpoint. Whatever those
   watches deliver is our first real delivery test, and §10's
   our-miss/their-miss rule stops being theoretical this week.

### ⚑ COLLISION — the E-ladder versus the shipped assurance ladder

The proposed hierarchy (E0 none → E1 reachable → E2 protocol → E3
conformance → E4 settled → E5 delivered → E6 independently validated
→ E7 multiple observers) is good thinking, and it **collides with a
ladder we already shipped**: novelty / observation / monitored /
audited / witnessed, live on `/trust`.

Publishing both under similar names recreates exactly the confusion
the keeper has ruled against twice. Worse, the E-ladder has a
technical flaw: **it is not one axis.** E0–E5 measure how deep into
the transaction the evidence reached. E6 (validated) is the oracle
problem §2 rules out. E7 (multiple observers) is not depth at all —
it is corroboration, an entirely different dimension. A single
observer who reached delivery and three observers who only reached
reachability cannot be ranked on one line.

### PROPOSED — four orthogonal axes instead of one ladder

The resolution, and it is more expressive than either ladder:

| Axis | Question | Values |
|---|---|---|
| **DEPTH** | how far into the transaction did evidence reach | enumerated → reachable → protocol → conformance → settled → **delivered** (stops here; correctness is the oracle boundary) |
| **CORROBORATION** | how many independent observers, from how many vantages | 1 · N observers · cross-region · cross-client-profile |
| **CONTINUITY** | how many observations over what window, with what gaps | single · repeated · longitudinal, with coverage % and gap count |
| **WEIGHT** | economic activity observed on-chain | purchases, buyers, volume — **not our probe at all** (§19) |

A consumer then expresses a requirement far more precisely than
"E4+":

```
require depth >= settled
        corroboration >= 2 independent
        continuity >= 30d at >= 95% coverage
```

**And the shipped assurance ladder survives untouched**, because it
answers a fifth question none of these do: *how strongly is this
held* — novelty, observation, monitored, audited, witnessed. Nothing
to rename, nothing to retract.

**Correctness gets no axis.** §2's ruling stands: the oracle-free
substitute is divergence across the corroboration axis.

Note the mockup passport below is *already four-dimensional* — counts,
regional coverage, corroboration, window. The flat E-ladder would
throw that structure away. **The mockup is better than the ladder.**

### The rich passport mockup — and its denominator problem

```
x402 Provider: example.com
Observed: 312 times over 31 days
Coverage: US-East 72% / EU-West 19% / Other 9%
x402 discovery:        312 / 312
Payment:               309 / 312
Resource delivery:     307 / 309
Protocol conformance:  310 / 312
Observed failures: 5      Unobserved periods: 3
Independent corroboration: 2 observers
Last observed: 17 minutes ago
```

This is the right shape and it should be the target. One honest
caution before it becomes a promise:

**⚑ Those ratios describe a PAID WATCH, not the census.** "Payment
309/312" means 312 real payment attempts in 31 days on one host —
that is money, at the subject's own door, with consent. "Last
observed 17 minutes ago" is continuous monitoring, not a weekly
walk. The census passport for a stranger's endpoint will be far
thinner (§2's consent ceiling: L3/L4 only), and the two must be
visibly different objects or the thin one inherits expectations the
rich one set.

Every ratio also needs its denominator explained on the artifact
itself: 309/312 of *what was attempted*, not of what happened.

### Normalization and identity (the "Bloomberg" framing, ⚑ RULED OUT as a goal)

**Keeper, 08-21: "I don't think Bloomberg is my goal."** Recorded, and
the aspiration is struck — it is not a target, not a comparison to
put on a surface, and not a thing to build toward. Filed here only
because one structural observation inside it survives on its own
merits.

That observation: the value would come **not from holding proprietary
information, but from systematically observing and normalizing** what
was always public. Normalization is the word that matters, and it
points at something already in this document — §14's stable subject
identity.

In any business built on observing a shared world, whoever maintains
the canonical *name* for a thing ends up load-bearing, because two
parties cannot compare notes about an endpoint they identify
differently. That promotes stable subject identity from a hygiene
item to a structural one: this host, these paths, this operator,
these rails, held stable across renames and migrations.

Stated without the analogy: **if our identifiers are the ones people
use to talk about machine services, our observations compose with
everybody else's. If they are not, our history is an island.** That
is worth building for its own sake, and it is currently unbuilt.

### The dataset, stated in one line

> **"What happened when independent observers attempted to interact
> economically with every machine-readable service in the x402
> economy, under precisely documented conditions, over time."**

Every clause is a section of this document: *independent observers*
(§8), *attempted to interact economically* (§11 sampled purchase),
*every machine-readable service* (§5 scope), *precisely documented
conditions* (§18 manifest), *over time* (§19 continuity).

### The unprompted question we have no answer to

> "If 40 of 5,873 known resources are walked, what determines which
> 40?"

We do not currently publish a selection methodology, and an outsider
found that hole in one reading. §11's panel-plus-random-sample is the
answer, but **until it exists the honest response is that selection
is arbitrary and the aggregate is therefore about our door bank, not
the ecosystem.** That sentence should be published before someone
else writes it for us.

---

## 22. Reconciliation with PR #202 (the audit ledger, spec v1, and roadmap)

**Read this before acting on anything above.** On 2026-08-24 a
parallel eleven-pass audit produced three documents on branch
`evidence-observatory-audit-docs` (PR #202, 2,167 lines):

- `docs/EVIDENCE_LAYER_REVIEW_2026-08.md` — findings ledger, areas
  A–M, with file pointers
- `docs/EVIDENCE_ARCHITECTURE_V1.md` — NORMATIVE spec (DRAFT for
  keeper review)
- `docs/OBSERVATORY_ROADMAP_2026-08.md` — agent-executable, Phase 0
  safety → Phase 5 distribution, ledger IDs and acceptance criteria
  per item, keeper gates marked ⚑

The two efforts were independent and **converged hard**, which is the
best available evidence that the architecture is right. Where they
differ, the differences are the useful part.

### Where they say the same thing (adopt #202's version — it is normative)

| This document | Spec v1 | Note |
|---|---|---|
| §2 layer model L0–L7 | §4 **evidence levels L0–L6** | Theirs is better: splits parseable from *payable* terms and gives signed-offer its own rung. **Adopt theirs; retire mine.** |
| §3/§18 observation manifest | §2 **evidence envelope** | Theirs is more complete (`authorization`, `revocation/rotation`, service window cited in-band). Adopt theirs. |
| §10 canary, failure attribution | §6 **observer accounting** — `observer_status`, numerator AND denominator, "a timeout of ours is never the subject's outage" | Same rule, already normative there. |
| §0 acid test corollaries | §9 `evidence_basis: direct \| derived \| absent` — "the designed refusal of a confidence scalar" | Their implementation of my criterion, and more elegant. |
| §16 "we provide evidence, not the score" | §11 refusals | Identical doctrine, theirs written as binding. |
| §2 not_observed ≠ absent | §2 "absent facts are STATED, never omitted" | Same. |
| §14 delta feed | §7 "what changed since T" + roadmap 5.1 | Same. |
| §8 federation | §12 distributed observers, cross-observer co-signing via `cross_ref` | Same, theirs already scoped. |
| §3 `procedure.version` | 1.3 methodology **inside signed bytes** | Same, theirs has an acceptance test. |

**Vocabulary note, important:** spec v1 has *two* ladders and they do
not collide — §1's **six trust layers** (what a signature
establishes: crypto validity → signer identity → authorization →
factual observation → interpretation → historical persistence) is a
different axis from §4's **evidence levels L0–L6** (how far into the
transaction evidence reached). Together with the shipped assurance
ladder that is three ladders, each answering a different question.
§20's four-axis proposal should be checked against them rather than
added beside them.

### ⚑⚑ THE CONTRADICTION — a keeper ruling, not a merge conflict

Spec v1, doctrine line:

> "DEFENSIBLE evidence beats more data — **host count is not the
> moat**; the per-host evidence vector is."

Keeper, this conversation:

> "**40 is not a number we can sell.** We need to be scaling to the
> 100s of thousands, even millions eventually… at least double-digit
> thousands." · "Immediate, this week: **scale the walking.**"

These are opposed strategies, and it shows in the artifacts: **the
#202 roadmap contains no acquisition work at all.** Phases 0–5 make
each observation more defensible; not one item increases the number
of endpoints observed. Phase 1.4 states a coverage *matrix* — it
publishes what we cover, it does not grow it. Followed literally,
that roadmap ends the quarter with an excellent evidence model over
the same ~40 doors.

**Both are right about different things,** and §11 already holds the
resolution: two products, two data requirements.

- **Depth per host** is what makes evidence *defensible* — spec v1 is
  correct that a thin row over 10,000 hosts persuades nobody.
- **Coverage** is what makes it *relevant to a given buyer* — a
  passport is worth nothing to an operator whose endpoint was never
  in the door bank, and an ecosystem claim over an arbitrary 40 is
  not an ecosystem claim (§11).

The synthesis is the panel-plus-sample split: deep on a panel,
broad on a random draw, same probe budget. **Neither document
currently proposes it as a phase.** Recommendation: coverage becomes
an explicit phase in the #202 roadmap rather than a competing plan,
and the keeper rules on where it sits relative to Phase 0.

### What #202 has that this document does not (and it is more urgent)

Their audit found live defects; this outline found strategy. Theirs
wins on urgency:

- **0.14 — the census certifies doors that cannot be paid.**
  `/corpus/host/hypernatt.com.json` publishes `ready`;
  `/api/preflight/v2` publishes `not_ready` for the same door on the
  same day, because the Solana payTo owns no USDC token account. The
  ward round runs the offline battery and never receives
  `checkRailReceivable`. This is **strictly worse than §18's
  no-signed-offers finding**: it is a signed, hash-chained,
  OTS-anchored false claim — the anchoring makes it permanent and
  attributable. Same disease as §18 (two of our instruments
  disagreeing in public), one degree more serious.
- Money exposure on the paying walk: `validBefore` clamp (I2),
  unbounded body reads (I3), price-vs-field-cap margin (I7).
- Seller-claimed tx hashes signed as fact without a chain read
  (C2/I4).
- Missing key service-window check (L1).
- **0.11 corpus backup — a gap this document missed entirely.** The
  anchor chain proves integrity, *not availability*. The moat asset
  must survive losing the KV namespace. Nothing in §§1–21 addresses
  it.
- Package strategy (`@scvd/*` tier, zero-dep forever), CI publishing
  with OIDC + provenance.
- And the form: ledger IDs, per-item acceptance, red-test-first
  discipline. **That roadmap is executable; this outline is
  discursive.**

### What this document has that #202 does not

Mostly the coverage half, plus the product shape:

1. **Acquisition entirely** — §5's supply funnel (listed →
   resolvable → qualified → door bank), the resolver, the harvest,
   convention-based resolution, scope broadening to agent-facing
   endpoints. Nothing equivalent in the roadmap.
2. **Selection methodology** — §11 panel + random sample. This is
   the exact question the paying consumer asked (§20) and neither
   spec v1 nor the roadmap answers it.
3. **Rot and churn** — §6's backoff ladder, never-delete, churn as a
   publishable product.
4. **The instrument ladder and the watch grammar** — §7 Sweep /
   Round / **Beat** / Watch, and §9's six-parameter watch. Spec v1
   describes observation classes but not the frequency/coverage
   product surface between the census and a single paid watch.
5. **The economic-weight axis** — §19/§20. Chain-derived volume as a
   second dimension; "high-value endpoints with weak evidence" as a
   risk primitive. Absent from spec v1.
6. **The etiquette ceiling** — §5 OPEN. Scaled unrequested probing
   needs a written rule *before* volume, and daily-at-scale changes
   it materially.
7. **The acid test as a named gate** (§0) — spec v1 implements it
   (`evidence_basis`, no scalar) without stating it as the criterion
   proposals must pass.
8. **Publishing our own maturity** (§17). Their M5 is positioning
   copy; this is the dated self-observation of what is thin.

### Proposed disposition (keeper's call)

1. **PR #202's spec and roadmap are canonical for execution.** This
   document is repositioned as the **strategy and coverage layer**
   that feeds it, and defers to spec v1 on every vocabulary and
   record-format question.
2. **Retire this document's L0–L7** in favour of spec v1's L0–L6;
   check §20's four axes against spec v1's two ladders before
   proposing anything further.
3. **Coverage becomes a phase in the #202 roadmap** — the funnel
   count, the resolver, panel+sample, rot backoff — rather than a
   rival plan. The keeper rules where it sits relative to Phase 0.
4. **§18's no-signed-offers correction folds into the pattern PR
   #200 already established** on 08-24: state what was observed,
   label the inference, carry a falsifier. That merged PR is the
   template; the fix is a narrowing, not a build.
5. **Federation is further along than §8 assumed.** PR #200 shows
   Cairn (cairnwake.com) authored the `listed-not-walked` evidence
   label and SCVD registered it *naming them as author, per entry*.
   That is §8's "publish the format, certify no one" already
   happening, with a second external party. §8 should be rewritten
   against what shipped rather than proposing it fresh.

---

## 21. Parking lot — not yet placed

- Reciprocal walking with other observatories (beyond signature
  verification): probably premature.
- Whether the probe spec ships as runnable code third parties execute
  identically.
- How divergence findings are surfaced without becoming a score.
- Whether passports should state which layers were *ever* reached for
  a host, not just the latest verdict.
- Pricing for the Beat.
- **(space for the keeper's further material — he has more to share)**
