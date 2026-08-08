# Monday — the keeper's desk

A running file, updated through the day. Written to be read cold after
a weekend of not thinking about any of it.

**State of main:** green. Suite 1342+ across 160 files, tab suite 46,
tsc clean, audit 7/7 at budget.

---

## Landed today

Newest last. Each line is a merged PR on main.

| PR | what |
|---|---|
| #75 | The Tab v0.4 — trust boundary, the drip, a quadratic ReDoS in the capture slug |
| #76 | The pager — a clock outside the server, delivery it can prove |
| #77 | The sweep contract — the counting obligation became arithmetic |
| #78 | The issuer-pays immunity clause, at spec level |
| #79 | The test plan; SCHEMA.md caught up to v0.6; `bad_lines` reaches the rollup |
| #80 | Test-run findings; `quarter` added; SCHEMA_VERSION → 0.7 |

**The two that would matter most if you only read two:**

**#76, the pager.** The scheduler gap is closed. An MCP server can't
wake anybody, so the clock lives outside (cron) and the proof lives
inside. With cron the page is timely; without it the ride-along makes
it inevitable — the next tool call of any kind carries it. A page
handed to an agent is **not** a page you heard; only
`acknowledge_pages` spends it, and pages that age out unspoken become
`unspoken_pct`. Same discipline as rule 9.

**#78, the immunity clause.** `who_pays_and_what_it_buys` now rides
every watch history, `/attestation`, and `llms.txt`. *Payment buys
frequency and permanence, never outcome.* "Verified referral" is
retired and guarded out of the served surfaces by test.

---

## Top 3 for Monday

### 1. The rule 9 proof test — highest leverage, cheapest to run

The keeper's GitHub scan turned up Assay (three days old) using a
property of x402: **settlement happens after the handler returns**, so
a handler that fails with a 4xx cancels the payment instead of
stranding it. Our worst failure — *paid, air, Sunday queue* — becomes
*unpaid, retry.*

Confirmed against our code: `payment-gate.ts:735` settles,
`next()` runs at line 890. We inverted the stock middleware **on
purpose**, and the comment says why. So this isn't a property we
missed; it's that we chose the side of the trade that produces the
failure we actually suffered three times.

The trade, stated honestly — it moves the risk, it doesn't remove it:

| | settle-first (ours) | deliver-first |
|---|---|---|
| delivery fails | **paid, air, Sunday queue** | unpaid, retry |
| settle fails | clean decline | **delivered, unpaid — store eats it** |

Favorable for *this* store because our goods cost approximately
nothing to make. A shop shipping physical goods should not take this
trade; we should.

**Next step is a test, not a rewrite:** fail a handler, assert no
settle call and no on-chain movement. Cheap, and it either proves the
property in our stack or kills the idea before anyone touches the
gate.

**Then it's your ruling.** Rule 9 ends in "Ever."

### 2. The criteria page — the hard gate on half the ethos

`HOUSE_RULES` rule 43: *no badge ships before its criteria page
exists.* `/becoming` says in public that no criteria page exists and
nothing carries a badge. So *"we badge what's safe"* is currently
unshippable, and this is the thing standing in front of it.

Mostly **derivable** rather than invented: `ARTIFACT_CLASSES` already
holds `trust_model` / `signs` / `does_not_prove` per class, and the
preflight battery is already published and versioned.

**One part is genuinely yours: what retires a badge.** Dated
de-badging, reason on record, and whether anyone who relied on it gets
told. Nothing in canon answers it. I'll draft options, not canon.

### 3. CV re-runs the plan from current main

His first run was against a copied `tab/` folder five PRs behind, so
three findings were artifacts. `tab/TEST_PLAN.md` now opens with the
clone command and staleness checks.

Parts 2, 3, 4, 6 are genuinely untested. **Part 1 needs you or a
second instance** — an agent can't run it on itself, and an agent that
has read the plan is primed and proves nothing.

---

## Waiting on the keeper

Nothing below is blocked on me. Each needs a ruling.

**Rule 9 / deliver-first.** See above. Amend in the open, dated, the
same discipline you made `/becoming` follow.

**The two billing shapes that are not clocks.** `quarter` is done.
Usage-based and free-tier-with-a-paid-path both mean *"there is no
fixed number."* Forcing them onto a clock puts a guess inside the burn
with nothing marking which part was guessed. The real question:
**is the burn total allowed to contain an estimate at all?** If yes,
`price` needs a `basis` marker. If no, they stay unrepresentable and
the tab says so.

**Card reconciliation.** The only true ground truth for burn. Needs
you to pick a source. Until then `variability_pct` rests on the sweep
measuring itself — honest, not proof.

**The ward's population source.** Whether Browser Use is already in
the walked universe decides whether their observation is already
happening or whether the ward needs to widen. I couldn't check —
network policy here blocks `api.cdp.coinbase.com`. Widening is the
only move that stays uniform; adding one name is targeting.

**Polygon.** Still backlogged, still queued.

---

## Should the GitHub go private?

**Recommendation: keep the code public. Move the strategy docs if
anything.**

**Why the code stays public.** The store's entire product is
verifiability — *"reproduce it offline rather than trust us."* Twelve
places in served code cite the repo URL. `.well-known/trust.json`
lists the open settlement code as part of the trust posture.
`/attestation`, the namespace spec and the conformance vectors all
point at it, and the published ClawHub skill references it. Going
private makes a set of live public claims unverifiable, which is the
exact drift `MARKETPLACE_AUDIT.md` demanded `/becoming` not commit.

**And the moat isn't the code.** It is the signing key, the ledger,
the patron sequence, the anchor chain, and a corpus of continuous
dated observation that cannot be backfilled at any price. A fork gets
the code and **none** of the history. Someone starting today starts
today.

**One-way door, worth saying plainly:** it's MIT, and it's been
public. Going private later is easy; un-publishing is impossible.
Anything out is out, forked and cached.

**What could legitimately move, and this is the real answer:** the
strategy documents have near-zero verification value and high copy
value — `MARKETPLACE_AUDIT.md`, `PROBLEMS.md`, `TASKS.md`,
`AT_SCALE.md`, `NOTES_FROM_THE_COUNTER.md`, `EMPLOYEES.md`. None is
cited by a served surface. Moving those to a private repo costs
nothing and protects the thinking, which is the part actually worth
copying. **That's the version of "go private" I'd do.**

No secrets are committed — keys are Cloudflare secrets, no `.dev.vars`
in the tree. So this is a strategy question, not a security one.

---

## Strategic — things I haven't put in front of you

Roughly in order of how much they'd change the shape of the business.

### 1. The convergence finding is bigger than the trick

A dozen-plus independent builders reaching for the same unnamed
thing — *who absorbs the gap between payment and delivery* — three of
them born inside ten days. That is a rule 19 anticipated-demand tag of
the strongest kind available: the market naming a category out loud,
before it has a name.

And **the store's entire product is independent signed observation of
exactly that gap.** Whatever happens to the handler ordering, that
convergence is a positioning decision and probably the largest one on
the table. Guarantees, escrow, dispute courts, execution proofs —
those are all *taking* the risk. We *observe* it, which is the only
one of those that scales without a balance sheet.

### 2. The verification tier has never earned a dollar

Worth saying plainly: no outside party has ever paid for a watch or an
audit. Browser Use was going to be the reference case. Every argument
for the marketplace pivot is currently theory with good architecture
under it. One paying stranger changes that; zero keeps it a thesis.

### 3. Layer 3 is The Tab's business model, and nothing has started

The Tab is built and useful, but the tollbooth — pooled retention,
contribute-to-access — needs consent volume that does not exist. Right
now `whats_current` honestly reports `pooled: {available: false}`.
That's correct and it's also the whole revenue story unbuilt.

### 4. ~~August 27~~ — RETIRED by the keeper, 2026-08-08

It was a Claude-imposed date, not a keeper one, and what it measured
has already answered itself: six or seven organic sales across two
rails, with two more chains likely inside a month. The checkpoint was
armed for "does anyone buy this at all." Someone does. Struck rather
than left sitting on the desk, because a dead deadline on a live list
is the kind of thing that gets obeyed by accident.

### 5. `unspoken_pct` has never been produced

The pager's honesty metric. No page has settled either way, so the
number is null. First real week of use tells us whether the ride-along
reaches you or whether agents take pages and never speak them. That is
the one claim from this whole stretch still untested against reality
rather than against a suite.

---

## The backlog, pulled (2026-08-08)

Everything deferred, from `TASKS.md`, `/becoming`, `PROBLEMS.md` and
this session. **Grouped, not yet ranked** — the ranking waits on the
keeper's research so the two lists get scored together rather than one
being fitted around the other.

One thing did not wait, because pulling the list is what surfaced it.

### ⚑ The one that should not have been in a backlog

**THE REFUND-WINDOW DETECTOR.** The card by the door promises: *we
miss a promised window, you get your money back — and you won't have
to argue for it.* The delivery audit catches settled-but-never-
delivered. **Nothing catches delivered-late against the 168-hour queue
SLA, or window-breached-with-no-refund-row.**

That is a live, published money promise whose only enforcement is the
keeper remembering. It is rule 10's own lesson — *a claim ships with
the check that fails when it stops being true* — pointed directly at
the store's loudest money claim, and rule 10 exists **because this
exact shape already burned us once** ("refund is automatic" live on
every surface for five days while the code never did it).

It was correctly deferred on 2026-08-07 when the queue was empty. Six
or seven organic sales later the premise has changed. The
`order_sla` alert condition already exists; this is a sweep and a
place to file the breach where the buyer can see it.

I did not build it unasked. But it should not be ranked against
feature ideas — it is a promise already made.

### Groups

**A. Promises the code does not enforce**
- Refund-window detector (above)
- The Commission Desk — retire buy-now for true per-order labor
  (`phone_call`, `app_gutcheck`, `human_witness`, `portrait`,
  `the_collab`, `quick_judgment`); request → quote → agreed price →
  one-off paid link. Kills all standing SLA exposure. Spec before
  build; interim risk capped by the 48h presence window.

**B. Trust spine**
- Cold-read test on the remaining artifact classes: the trust list,
  `/house-ledger.json`, `/stack`, the badge SVG. The method found a
  real defect in certificates that **446 tests missed**, because every
  test verified through the same function that signed.
- Key succession — pre-announced, pre-signed successor key. On
  `/becoming` as public roadmap.
- Replay guard under concurrency (CV's #3) — read-then-write against
  KV; the chain's nonce is the backstop, so resilience not correctness.
- The criteria page (see Top 3).

**C. Shelves specified but unbuilt**
- `town_papers` — identity registry, $3 PWID, signed name↔wallet
  binding, public registry. Attest never authenticate. Fully spec'd.
- `anniversary_artifact` — approved in principle, needs a one-line
  spec (whose anniversary, price, what the certificate says).
- Referral certificate, artifact half — measurement shipped; the
  certificate is parked until the counter moves, and carries a real
  forgery surface (we sign a claim the buyer authored).
- Receipt treaties; federation — both `/becoming` roadmap.

**D. Distribution**
- Agentic.market submission — draft ready, gated on organic mcp +
  bazaar settles showing in `/admin` channels.
- ACP registry listing (verify whether it requires token
  participation; skip if so).
- Farcaster frame / Base App miniapp.
- Gazette auto-assembly — waits for a week with 3+ organic events.

**E. Rails**
- Polygon — queued, backlogged.
- Algorand — parked; ruled not credible for current goals.

**F. The Tab**
- The mail sweep (CV) — contract written, routine unwritten.
- Card reconciliation — keeper picks the source.
- Layer 3 / the pooled corpus — the product's actual business model,
  not started, needs consent volume that does not exist.
- The two non-clock billing shapes.

**G. Verification tier**
- First paying outside watch — never happened. Every argument for the
  pivot is currently good architecture under a thesis.

---

## Needs hardening before it can be trusted

Recent work that is built, green, and **unproven against reality.**
Noted for the red-team week rather than fixed now.

| thing | what is unproven |
|---|---|
| The pager's ride-along | whether an agent *says* `pending_pages`. `unspoken_pct` is null; no page has ever settled either way |
| The Tab, Parts 2/3/4/6 | client handshake, cron, two-agents-one-tab, the sweep contract dry run |
| Deliver-first / rule 9 | the property is asserted from a README and our own code comment; no test |
| Replay guard | concurrency, known and unfixed |
| Tiered / PWID arithmetic | `graffiti_on_a_train` tiers and `the_drawer` minimum have never been exercised by an outside buyer — every live purchase so far took the fixed-price path |
| The watches | no third-party endpoint has ever been watched for a full week |
| The sweep contract | never run against a real inbox, even by hand |

The pattern worth noticing: **almost everything above is unproven in
the same way — it works in the suite and has never met a stranger.**
That is one week of adversarial testing, not seven separate projects.

---

## The merged list (research + backlog), ranked 2026-08-08

Scored on ROI, uniqueness, marketability, and — the one that actually
reorders things — **what it does for the store holistically.** The
test applied throughout: *does this feed the index, or sit beside it?*

### The finding that reorders the research

**E (Payability/Mortality) is not a new product. It is ~85% shipped
and mis-ranked as a build.**

- the ward round already records `ready | not_ready | unreachable |
  not_probed` per host, weekly, plus `newly_failing`, `newly_fixed`
  and `flappers` week over week — that *is* payability and mortality
- the corpus already freezes each round into a signed, hash-chained,
  OTS-anchored snapshot
- `/corpus.json` and `/corpus/{n}.json` already serve them publicly

**The only missing piece is a query by subject.** Today you can
enumerate snapshots; you cannot ask *"what has scvd observed about
merchant.example over time."* You would have to fetch every snapshot
and reduce it yourself.

That single gap is the whole distance between a diary and an index,
and closing it is one route over data that is already signed and
anchored. It is by a wide margin the cheapest path to the first
outside dollar, and it is the concrete form of the keeper's own
reframe.

### Three other structural notes on the research

**A and C are one product, not two.** Both measure the gap between
payment and delivery — A at authorized-vs-settled, C at
settled-vs-delivered. And **C is our own bug**: the delivery audit,
`undelivered_sale`, and the paid retry are C, already instrumented for
ourselves. Build them as two query types on one index. Shipping them
as two products doubles the surface and halves the story.

**B's TLSNotary problem is already solved in our canon.** R1's caution
is right and the group's resolution — *be honest about what it proves*
— is literally `does_not_prove`, a published and tested field on every
artifact class we ship. We are structurally better placed for B than a
generic builder. The risk the four responses did *not* name is
different: attesting what an AI answered is one step from scoring the
AI, which is rule 43 pressure and the Browser Use targeting problem
again. Uniformity is the prophylactic — observe everything the same
way or don't observe.

**The Tab's layer 3 is the same product as E, pointed at a different
universe.** x402 endpoints on one side, builder tools on the other:
same signed corpus, same "popularity not judgment," same
contribute-to-access. Under the index frame The Tab stops being a side
product and becomes index number two.

### The counterweight, said plainly

Four independent responses returning BUILD on six of eight candidates
is a **shared prior**, not a confirmation. They were each asked to
evaluate candidates, which biases toward finding merit. The scarce
resource here has never been ideas — it is one keeper, and the fact
that the verification tier has not yet earned an outside dollar. Every
item below competes against *"ship the thing that gets the first
stranger to pay."*

---

### TIER 0 — debts, not products. Do not rank these against features.

| | |
|---|---|
| **Refund-window detector** | a live published money promise enforced only by the keeper remembering. Approved 2026-08-08. |
| **Commission Desk** | retires buy-now for per-order labor; kills all standing SLA exposure. Spec before build. |

### TIER 1 — the index, made real

1. **Publish the index (E, reframed).** Per-subject query over the
   corpus. Mostly built. Turns the diary into a product and is the
   cheapest route to a first paying stranger.
2. **A + C as one build — the payment/delivery gap index.** The
   convergence category, and the half we already run for ourselves.
3. **The criteria page.** Rule 43 gate: nothing badges before it
   exists. Required to *sell* a verdict at all.
4. **Key succession.** Raised above where the research put it,
   deliberately: every artifact the index has ever signed becomes
   unverifiable if the key dies with no pre-announced successor. It is
   the single point of failure under the entire corpus and it is
   already a public promise on `/becoming`.

### TIER 2 — feeds the index, with a named caveat

5. **B (AI-Answer Attestor)** — our `does_not_prove` discipline is a
   real edge here. Watch the targeting exposure.
6. **D (WebMCP Verifier)** — agree with the consensus and the browser-
   vendor risk. The only candidate whose *domain* can vanish; the
   corpus built before that happens is the asset, not the product.

### TIER 3 — agree with the research

7. **F (Sanctions Clearance)** — partnership with KYT providers, not
   competition. Add the signed portable format they lack.
8. **G (Auto-Registrar)** — ops, and worth doing as hygiene because it
   feeds discovery *of* the index.
9. **H (Spend-Guard)** — no. Follower position.

### TIER 4 — beside the index, not feeding it

Distribution first, because it feeds discovery: agentic.market (gated),
ACP listing, Farcaster / Base App.

Then: `town_papers` · `anniversary_artifact` · referral certificate ·
Polygon · Algorand · the cold-read test on remaining artifact classes
(hardening, cheap, high value per hour) · replay guard under
concurrency.

---

## RANKING HELD (keeper's call, 2026-08-08)

Draft specs coming for items discussed yesterday. Nothing below is
ordered until the whole set is on the table. What follows is the
problem list and the prior-art scan — the inputs to a ranking, not the
ranking.

---

## ⚠ CORRECTION — the prior-art scan moved my #1 pick

Two hours ago I ranked **"publish the index"** first, partly on the
belief that per-subject observation of x402 endpoints was substantially
unclaimed. **It is not.** First pass of the scan, and the field is far
more crowded than I assumed:

| what exists | why it matters to us |
|---|---|
| ~59,818 x402 endpoints monitored by provider — uptime, latency, 402-envelope compliance, on-chain settlement, updated continuously | our ward walks ~35 hosts weekly. That is roughly three orders of magnitude of coverage against us |
| `x402.fuchss.app/providers` — a providers directory with **reliability & trust scores** | the payability/mortality product, shipped, with scores |
| `402index.io` | literally named "402 Index" |
| `x402-validator` (PyPI) — audits and monitors against x402 strict-v2, conformance engine, manifest discovery, CAIP-2, Bazaar features | our preflight battery, as a package anyone can pip install |
| `draft-hopley-x402-compliance-receipt` — IETF Independent Submission, JSON Schema, plus a compliance-attestation extension referencing it by URL and byte-anchor | **a competing namespace to `scvd-attestation/v1`** |

**Confidence: these are search summaries, not verified reads.** The
numbers and the "no conformance suite" claim both need checking before
anyone acts. Verification is the next step, not a build.

### What survives, and it is a better story than the one it replaces

**We cannot out-cover 59,818 endpoints with a weekly walk of 35.** The
index-as-coverage play is dead on arrival and I should not have ranked
it first without scanning.

What the incumbents appear NOT to have — and this needs verifying, not
assuming — is **the artifact.** Scraping uptime is easy. What is hard,
and what this store's entire architecture already is:

- **signed**, verifiable offline against a published key, no "trust our
  verifier" step
- **hash-chained and Bitcoin-anchored**, so the record cannot be
  quietly revised after the fact
- **gap-honest** — `days_unchecked`, `hours_unprobed`, `unclassified`
  counted against us on the same page as the finding
- **artifacts not actors** (rule 43). A "trust score" on a provider is
  the thing we deliberately refuse to produce. That is not us losing a
  feature race; it is a different product

So the play is **not** to be the index. It is to be **the artifact
layer on top of any index** — including theirs. Read from the big
monitors, sell the signed portable verdict they do not produce.

Which is the same conclusion the four responses reached for F
(sanctions: *"add the format layer they don't have"*) — now applied to
what I had assumed was our home turf.

**The uncomfortable half, stated:** "ours is signed" is a feature
claim with zero market evidence behind it, competing against products
with real coverage. It stays a thesis until a stranger pays for a
signature.

### The find that most supports the keeper's frame

**ERC-8183** — co-developed by Virtuals Protocol and the Ethereum
Foundation's dAI team, published 2026-03-10. Defines a Job primitive:
client posts requirements and funds escrow, provider executes and
submits verifiable deliverables on-chain, and **evaluators attest to
completion** to trigger release or refund.

There is a formal, standardized role for a third party who attests
that delivery happened. That is precisely the store's position, named
in someone else's standard. "Customer, not rival" stops being a
posture and becomes a slot to fill.

**Needs a real read of the spec before it is trusted.** If it holds,
it is the strongest single piece of evidence for the index/attestor
framing that exists.

### Also in the escrow lane (all "absorb the risk", none "observe it")

- **x402Resolve** (kamiyo-ai) — trustless escrow, oracle-verified
  quality, sliding-scale refunds, $2–8/dispute, 2–48h, Solana
- **PayCrow** — trust-informed escrow; releases on **2xx status codes
  and JSON schema**. That verification is thin — a 2xx carrying
  garbage passes it. Our preflight battery is far richer, and that gap
  is a partnership shape
- **Nevermined** — escrow with milestone / SLA / dispute-window
  conditions

Every one of them needs an answer to *"did delivery actually happen,
and says who?"* None of them signs a portable artifact about it.

---

## The problems, named (an item without one is a desk idea)

Rule 19 discipline applied to our own list. **Prior art column is
deliberately incomplete** — the scan has had one pass.

| # | problem | evidence it is real | prior art found so far |
|---|---|---|---|
| P1 | a buyer pays and receives nothing | three `undelivered_sale` alerts, ours | escrow (PayCrow, Nevermined, x402Resolve) absorbs it; nobody signs an observation of it |
| P2 | authorized amount ≠ settled amount | x402 upto/deferred semantics | *not yet scanned* |
| P3 | a published money promise with no enforcing check | rule 10's founding incident, five days live | n/a — internal debt |
| P4 | you cannot ask what was observed about one subject over time | verified today: `/corpus.json` enumerates, never queries | **heavily claimed** — see correction above |
| P5 | every signed artifact dies with the key | no successor published; `/becoming` promises one | *not yet scanned* |
| P6 | "verified" is undefined, so nothing can be badged | rule 43 gate; `/becoming` says so publicly | *not yet scanned* |
| P7 | endpoint payability/mortality is unsigned and scattered | directories are unsigned | **claimed** — fuchss, 402index, x402-validator |
| P8 | you cannot prove what an AI answered | TLSNotary is heavy | TLSNotary; *lightweight lane not yet scanned* |
| P9 | WebMCP implementations are unverified | early standard | *not yet scanned* |
| P13 | per-order labor creates unbounded SLA exposure | the 168h queue | n/a — internal |
| P14 | sanctions/KYT has no signed portable artifact | Chainalysis/TRM/Elliptic produce reports, not artifacts | incumbents hold the data, not the format |

**Items on our list with NO named problem** — flagged rather than
quietly carried: `town_papers`, `anniversary_artifact`, the referral
certificate. Each may be a fine shelf item; none currently has a
demand tag, and rule 19 says that is the bar.

### Next on the scan

P2, P5, P6, P8, P9 unscanned. And two reads that change decisions
rather than inform them: **ERC-8183's evaluator role**, and
**draft-hopley-x402-compliance-receipt** against `scvd-attestation/v1`.
