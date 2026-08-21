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
3. **Etiquette ceiling** for unrequested probing at 10k+ scale.
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

## 13. Sequencing (proposed, not agreed)

1. **The funnel count** — reads only, touches no stranger's door.
   Tells us whether the clog is resolution or qualification before we
   build the wrong pipe.
2. **The observation record** — layers, `not_observed`,
   `limitations[]`, procedure/observer versions, environment
   fingerprint. Every round run without these is permanently recorded
   at lower fidelity.
3. **The methodology document** — published, versioned, carrying the
   L7 boundary and the consent ceiling. *Written before the record
   format is baked, so the keeper can catch disagreements in prose.*
4. **Canary + confirmation-before-verdict** — the licence to scale.
5. **Client-profile diversity** — the identity axis; our actual
   question.
6. **Acquisition pipeline** — harvest → resolve → qualify, with
   provenance and the backoff ladder.
7. **Panel + random sample** in the walk.
8. **The Beat** — the cohort rung.
9. **Federation schema** — after our own records are worth copying.

---

## 14. Parking lot — not yet placed

- Reciprocal walking with other observatories (beyond signature
  verification): probably premature.
- Whether the probe spec ships as runnable code third parties execute
  identically.
- How divergence findings are surfaced without becoming a score.
- Whether passports should state which layers were *ever* reached for
  a host, not just the latest verdict.
- Pricing for the Beat.
- **(space for the keeper's further material — he has more to share)**
