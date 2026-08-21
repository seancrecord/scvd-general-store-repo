# THE OBSERVATORY — design outline

**Status: OUTLINE ONLY. Nothing here is built. Nothing here is canon.**
Opened 2026-08-21 at the keeper's direction: "outline it all before
even considering building." He has more to add; this document is
built to receive it.

## 0. How to use and extend this document

Every section is split three ways so advice never blurs into what
already stands — the keeper's own rule from the outside-reads log:

- **STANDING** — built, shipped, live today. Do not rebuild.
- **PROPOSED** — argued for in the 08-21 brainstorm, not built.
- **OPEN** — a question with no answer yet, or a keeper ruling.

New material goes into the section it belongs to under the right
heading, dated. Section 14 is the parking lot for anything that
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

**Start at §16 for the architecture** — the stack, every component
mapped to the question it answers, and an honest maturity column.
§17 is the proposal to publish that map. §18 is the observation
manifest and the non-equivalences. §§1–15 are the depth behind them.

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

### ⚑ NUMBER DISCREPANCY — a LOOK item, unresolved

The outside read cites **"5,954 known / 964 walked"** (≈16% coverage).
Our working table (§1) says **5,873 known / 40 walked** (0.7%). Those
cannot both describe the same thing, and the entire coverage argument
turns on which is right. Candidates: cumulative-hosts-ever-walked vs
per-round walked; `listed_resources` vs distinct hosts; a figure that
moved between reads.

Attempted to verify against the live `/registry` and `/corpus.json`
on 08-21 — **scvd.store is egress-blocked from the build environment,
so this could not be checked from here.** Neither number is adopted
in this document until someone looks. House doctrine on disagreeing
records applies: go look, do not pick.

If 964 is real, §1's diagnosis softens considerably and the keeper's
"scale the walking" is a shorter climb than either of us thought.

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

## 19. Parking lot — not yet placed

- Reciprocal walking with other observatories (beyond signature
  verification): probably premature.
- Whether the probe spec ships as runnable code third parties execute
  identically.
- How divergence findings are surfaced without becoming a score.
- Whether passports should state which layers were *ever* reached for
  a host, not just the latest verdict.
- Pricing for the Beat.
- **(space for the keeper's further material — he has more to share)**
