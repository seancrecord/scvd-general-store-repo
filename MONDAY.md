# Monday — the keeper's desk

---

## ⚖ KEEPER RULINGS, 2026-08-10 — eight of them, all canon

Recorded verbatim in substance before anything was built against
them, because a ruling that lives only in a chat is a ruling that gets
re-litigated. Where the code has caught up it says so; where it has
not, that is stated rather than implied.

**1. `OPEN_LABOR_CAP = 7`. Canon.** Was a drafted 8 with a flag on it
saying nobody but the keeper could set it. He set it, one lower.
**DONE** — `src/services/queue-capacity.ts`, and the flag is gone.

**2. Rule 9 flips. Deliver first, settle after.** If delivery fails,
payment never happens — the buyer does not pay and no refund is
needed. If settlement fails after delivery, the store eats it: digital
goods, approximately zero. The keeper's reasoning, which is the whole
argument: *the failure we suffered (paid, no goods, buyer leaves) is
worse than the one we take on.* His acceptance test: **fail a handler,
assert no settle call and no on-chain movement.** Rule 9 in
`HOUSE_RULES.md` is amended and dated, with the old text quoted rather
than deleted. **DONE** — `test/deliver-first.spec.ts` is that
assertion, written first and red against the old gate; the gate now
passes it. Not a literal reordering, and the difference matters: the
signed certificate names the settlement transaction, so settling
strictly after the handler returns would have bought the ruling by
gutting the receipt. The handler is handed the AUTHORIZATION and
presents it at its own last line before the mint, so every chain read
and probe happens where failure costs the buyer nothing. The MCP door
flipped with it.

**3. What retires a badge: nothing. It ages.** A badge is a dated
observation, never a live status — *"as of [date], this endpoint
passed these checks."* If it stops passing, the badge is not revoked;
it gets old. **No chasing badge-holders to take anything down** — the
badge carries its own expiry by carrying its own date. The Conformance
Watch is what sells currency. This unblocks the criteria page, which
was the rule 43 gate in front of every badge the store might ship.
**BUILT 2026-08-10** — `/criteria` serves the contract (JSON and
paper), almost all of it derived: the artifact classes from the
attestation spec, the battery from the versioned preflight, the
immunity clause from the watches. The ruling above is the one part
that could not be derived, and it is on the page as ruled. /becoming
records the trigger as fired; nothing carries a badge, and the page
says so itself.

**4. The burn total may contain an estimate.** Add a `basis` field
marking which numbers are estimated and which are exact. The keeper's
reasoning: *leaving them out makes the total incomplete; marking them
makes it honest.* That settles the two non-clock billing shapes —
usage-based and free-tier-with-a-paid-path — which were unrepresentable
under the old reading. **BUILT 2026-08-10** — tab schema v0.8:
`price.basis` (`fixed`/`metered`/`free_with_paid_path`), the burn
reports `estimated_amount` beside `amount`, the paid path lands as
`paid_path` under `converts_to`'s never-reaches-the-burn law, and the
fence refuses the contradictions in both directions.

**5. Card reconciliation: monthly CSV export from the bank.** Manual
is fine for now. The tab's sweep measures itself; a card statement is
ground truth. This is what `variability_pct` has been waiting on.
**Recorded, not built.**

**6. The ward widens to every public directory.** Uniform — no
targeting, no picking favourites. *If it is on a public list, we watch
it.* This also answers the Browser Use question without ever having to
ask it about Browser Use specifically, which was the point.
**Recorded, not built.**

**7. Commission Desk: `the_collab` first, and public replies on
declined requests.** Transparency is house style. The keeper added
*"and let's do all of them this way"* — read here as **every per-order
labor item eventually moves to request → quote → agreed price**, with
`the_collab` as the first one through. If he meant instead that the
two decisions he did not name (the rungs, quote expiry) should take
the spec's recommended defaults, those defaults are on record in
`docs/COMMISSION_DESK.md` and nothing is blocked either way.
**Recorded, not built.**

**8. Build the refund-window detector.** The card by the door promises
a refund on a missed window and nothing enforces it. Correctly
deferred when the queue was empty; six organic sales later the premise
has changed. Rule 10's own lesson pointed at the store's loudest money
claim. **DONE, and it was two-thirds built already** — the sweep and
the `order_sla` page existed on the cron. What was missing was the
half the promise actually turns on: the BUYER could not see the
breach. "You won't have to argue for it" was enforced by the check
reporting only to the person who owed the money. The order's own page
now says when a window was missed, by how long, and what is owed —
including when the goods eventually arrived late, because the promise
says a missed window earns the money back and does not say "unless we
get there eventually." Still moves no money: rule 10 keeps refunds in
the keeper's hand, and a test guards the wording against the word
"automatic".

---

A running file, updated through the day. Written to be read cold after
a weekend of not thinking about any of it.

**State of main:** green. Suite 1531 across 173 files, tab suite 46,
tsc clean, audit 7/7 at budget.

**⚑ THE BRANCH IS AHEAD OF MAIN.** Everything dated 2026-08-10 below —
the eight rulings, the rule 9 flip, the refund-window work, the AEO
sweep — is on `claude/homepage-footer-cleanup-eg3l0l` and NOT deployed.
Anything checked against the live site is checking the old code.

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

**Since, on main:** #81–#94 — the refund-window detector, the
population layer, the per-subject query, the SSRF/probe-target law, the
Settlement-Reconciliation SKU, the chain-read retry and second RPC
provider, one row per standing alarm, the admin throttle.

**On the branch and NOT merged**, newest last:

| what |
|---|
| The unread mark on the alarm trail; a mis-click on a resolution becomes a visible correction rather than a chain orphan |
| Eight keeper rulings recorded as canon; `OPEN_LABOR_CAP = 7`; the resolution stamp names WHICH outcome |
| **Rule 9 flipped** — deliver first, settle after, pinned by the keeper's own acceptance test |
| The buyer can see a missed window on their own order page; `order_id` on `RefundRecord` |
| The AEO sweep: one position module, eleven surfaces corrected, a parity test, and the ClawHub bundle rewritten |

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

**CLOSED by the keeper, 2026-08-10: struck from the list at his word.
The repo stays as it is, public.** The analysis below is kept for the
record rather than re-litigated; the recommendation it reached — keep
the code public — is the outcome, arrived at by his hand rather than
by argument.

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
| ~~Deliver-first / rule 9~~ | **CLOSED 2026-08-10.** Ruled, flipped, and pinned by the keeper's own acceptance test (`test/deliver-first.spec.ts`). What is now unproven is the OTHER side: no real buyer has yet hit a delivery that failed before settling, so the no-charge path has met the suite and not a stranger |
| Replay guard | concurrency, known and unfixed |
| Tiered / PWID arithmetic | `graffiti_on_a_train` tiers and `the_drawer` minimum have never been exercised by an outside buyer — every live purchase so far took the fixed-price path |
| The watches | no third-party endpoint has ever been watched for a full week |
| The sweep contract | never run against a real inbox, even by hand |
| The refund-window breach, buyer-side | the order page now states a missed window and what is owed. No real buyer has ever seen one, because no window has been missed since it shipped |
| The unread mark on the alarm trail | the watermark moves on page load. Whether "NEW" actually stops the 3am eyeballing is a keeper question a suite cannot answer |

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
| ~~**Refund-window detector**~~ | **BUILT.** Sweep and page were already on the cron; 2026-08-10 added the half the promise turns on — the buyer can see the breach on their own order page. |
| **Commission Desk** | SPEC WRITTEN 2026-08-09 → `docs/COMMISSION_DESK.md`. Four decisions waiting on the keeper. |
| **The bench (open-queue cap)** | BUILT 2026-08-09. The interim floor under the same exposure, and it found a live hole. |

**The bench, 2026-08-09.** Not the Commission Desk — that retires
buy-now for labor entirely and is a product decision the keeper has to
make. This is the floor underneath it, it changes nothing about how
anything is sold, and it survives whatever the desk becomes.

**What was actually open.** The shutter's law is *"the store never
promises labor nobody is there to do"*, and it enforced that by
PRESENCE only — open within 48 hours of the keeper being seen. It never
asked how much had already been promised, and those are different
questions. A keeper seen an hour ago could be sold ten weeks of work in
an afternoon.

**`weekly_inventory` looked like the cap and is not one.** It is a
RATE: the counter lives at `inventory:<item>:<week>` and resets every
Monday. Five judgments bought this week and five more next week, none
finished, is ten open orders that passed every check the store had. A
rate cannot bound a level. That case has its own test, named loudly,
because it is the one somebody would remove the gate over after reading
the inventory check and concluding it was handled.

**And one item had nothing at all:** `the_collab`, $25, a 168-hour
promised window, no `weekly_inventory`. Ten bought in an afternoon was
ten weeks of work owed inside one week — and the refund-window detector
(#81) would have found every one of them a week later. That is the
detector working exactly as designed and still being the wrong place to
catch it.

Refuses before the payment gate, like the shutter. Machine shelves are
untouched and keep selling with the bench full. The keeper sees
`Bench: N of 8` on the counter page, because a gate that turns sales
away silently is worse than no gate.

⚑ ~~**`OPEN_LABOR_CAP = 8` is drafted, not canon.**~~ **RULED
2026-08-10: the cap is 7, and it is canon.** The keeper set his own
throughput, one below the draft. The flag is off the constant.

**Commission Desk spec, 2026-08-09 — `docs/COMMISSION_DESK.md`.**
Two findings worth knowing before reading it:

- **The note's list of six items is stale.** `phone_call`,
  `human_witness`, `portrait` and `app_gutcheck` were retired
  2026-08-05 and folded into `the_collab`. Three human_queue items are
  live. The consolidation already did most of the retiring — and it
  made `the_collab` the single catch-all for four kinds of bespoke
  work, which is exactly the item a fixed $25 fits worst.
- ~~**A one-off price does not fit the payment stack.**~~
  **CORRECTED 2026-08-10 — the claim was false.** `@x402/core` exports
  `DynamicPrice = (context) => Price | Promise<Price>` and
  `RouteConfig.price` accepts it. Per-request pricing is first-class in
  the library we already depend on. What is true is narrower: *our*
  route table passes values, so nothing in the tree prices per request
  today. The published-ladder recommendation survives, but on risk
  appetite — a KV read inside the money path can quote a wrong number
  to a real buyer, and a static price cannot — not on impossibility.
  `docs/COMMISSION_DESK.md` §3 carries the correction in full.

Four decisions are the keeper's: which items, the rungs, quote expiry,
and whether a declined request gets a public reply.

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

---

## The Tab: free — but say WHICH free, and say it now

Agreed on the substance, with one correction to the shape.

**"Free for a while, maybe paid later" is a promise that becomes a
betrayal**, and it is the exact shape rule 10 was written about. It
also suppresses the adoption it is meant to buy: an honest listing
would have to say *"this may cost money later,"* and that sentence is
read at install time by the very people we want.

**And it is not actually available to us.** The Tab is MIT and runs on
the builder's own machine. Anyone can keep the version they have,
forever. There is no later switch to flip on the local server — so
"maybe paid later" is not a strategy, it is a thing we would say and
then not be able to do.

### What to commit to instead, publicly, before anyone installs

| surface | price | forever? |
|---|---|---|
| the local tab, the pager, `export_tab` | **free** | yes, and MIT, and on your machine |
| reading the **pooled** corpus | **contribute-to-access** | feed the pool, read the pool |
| pooled read without contributing | paid | the only money door |

This is better than free-for-now on every axis. It is a promise we can
keep. It prices the thing that has network value and gives away the
thing that does not. And **contribute-to-access is itself the growth
mechanism** — it is already the spec, so this is committing publicly
to what was already designed rather than inventing a model.

The keeper's underlying instinct is exactly right and worth stating as
the reason: **the pooled layer is worth nothing at N=1.** You cannot
sell retention counts you do not have. Charging early maximizes
friction at the one moment friction is fatal. The sequence is forced.

**Said plainly so nobody is surprised later:** the direct revenue here
may be small or zero for a long time. The Tab's real return is as a
namespace play and a second index — builder tools alongside x402
endpoints — and it should be judged on that, not on a subscription
line.

---

## Accounting for what happens outside the window

The keeper's question, and it is the sweep's counting obligation
pointed at the ward: *"some will be missed" is not an acceptable
answer.* Two thin spots, and they have different fixes.

### Coverage — separate ENUMERATION from OBSERVATION

We have been conflating them, and that is the whole problem.

**Probing is expensive. Counting is nearly free.** One fetch per public
directory enumerates the known universe; we do not have to probe a
host to know it exists. So:

- **`population_known` vs `population_walked`.** Take the union of
  every public directory as the denominator — the Bazaar/CDP list,
  402index, x402-list, fuchss, whatever else the scan turns up. If the
  known universe is ~59,818 and we walk 35, our coverage is a fraction
  of a percent and **the artifact should say so, on the same page as
  the verdict.** That is `days_unchecked` applied to breadth instead
  of time, and it costs one number.
- **`first_seen` / `last_seen` per host, at the enumeration layer.**
  Mortality is measurable against a population you merely enumerate. A
  host that vanishes from every directory between walks is a death we
  can record **without ever having probed it** — which is most of the
  "activity outside the window" the keeper is asking about.
- **Between-walk activity** stays invisible to probing and always
  will. That gets stated, not solved: one pass a week is conformance
  cadence, never uptime — the same sentence already on the watch.
- **Non-x402 agent commerce** (the ERC-8183 / escrow world) is outside
  the instrument entirely today. Naming it as out of scope is honest;
  quietly implying the index covers "agent commerce" would not be.

The move converts an unstated hole into a published ratio. Same
discipline as `unclassified`: we do not need to know what we missed,
only how much of the universe we did not look at.

### Queryability — build it, but not as a coverage competitor

The per-subject endpoint is still worth building. What changes after
the prior-art correction is what it is FOR: not "the index," which is
claimed at three orders of magnitude more coverage, but **the artifact
surface** — *give me the signed, chained history of what scvd observed
about X.*

**And the query must return the gaps.** Not just "here is what we saw"
but *"we observed X on these six dates, we did not observe it during
these three weeks, and here is our coverage of the population X
belongs to."* The large monitors do not do that. It is nearly free for
us because gap-honesty is already the architecture, and it is the
entire difference between a signed artifact and a scraped number.

**Added to the list, unranked** pending the keeper's draft specs.

---

## On the strategy doc (2026-08-08) — checked against the code

### Item 5 is already shipped

**Corpus snapshots are already Bitcoin-anchored.** `corpus.ts:197`:
`record.ots = await submitDigestToOts(digest, options)`, and the
suite covers both the pending and the failed path. Each round is
frozen, hash-chained to the one before it, signed, and its digest
submitted to OpenTimestamps. Two chains, one shared submitter,
each verifiable alone. Nothing to extend.

### The storage decision was already made — and the coverage work just triggered it

Also on record, deliberately, in `corpus.ts`:

> *"STORAGE: KV, deliberately, for now… The named graduation trigger
> is full-universe crawling at its own cadence — when snapshots stop
> being weekly-and-small, they move to R2."*

The doc's proposed answer (off-chain storage, on-chain anchors) is
what we already do, plus a trigger the doc does not have.

**But here is the connection worth catching:** the enumeration fix
proposed above — union of every public directory as the denominator,
on the order of 59,818 hosts — **is** full-universe crawling. Doing
the coverage work trips the KV→R2 trigger by definition. Those are no
longer two decisions; they are one, and taking the coverage fix means
taking the storage move with it. Better to know that before starting
than to discover it at the KV limit.

### ⚑ "Staples (resold)" reverses DECISION 2 — name it, do not slip it

The shelf model reads well and three of its four tiers are already
what we are. **Staples is different**: reselling means being *in the
money flow between buyer and upstream*, which the keeper ruled against
on 2026-08-07 ("referral-first stands unless the keeper rules
otherwise; nothing resold yet") and narrowed again yesterday.

It reintroduces every collision the audit named: money transmission,
refund liability that scales with volume, upstream failure with our
sticker on it, and the infrastructure pager. With no counsel, by the
keeper's own ruling.

**The reason behind it is right, though, and worth rescuing:**
*margin optional, observations mandatory.* Reselling as a **sensor**,
not a revenue line. That is a good idea trapped in the wrong vehicle.

**A vehicle that keeps it: be the BUYER, not the reseller.** The store
buys from an endpoint itself, occasionally, and signs an observation
of the real settlement. Same sensor — a genuine paid transaction,
observed end to end — with no money flow, no custody, no refund
liability, and no sticker on anybody's product. The machinery already
exists (`npm run shop`, the census, the shopping-run scripts). It is
the cheapest instrumentation available and it is doctrine-clean.

**Tools shelf: blocked, not open.** Skills with signed safety
attestations is issuer-pays, which is now handled correctly by the
immunity clause shipped in #78 — good consistency. But rule 43 gates
it: no badge ships before its criteria page exists, and it does not.

### The scout loop — about 60% of it is generalizing the ward

Right instrument. Note what is already built before anyone specs it
fresh:

| section | status |
|---|---|
| **1. Tripwire board** — watchlist with pre-planned responses | genuinely new, cheap, and the best part of the doc |
| **2. Shelf candidates** — diff registries against last week | this is the ward's `newly_failing` / `newly_fixed` / `flappers` delta logic pointed at registries instead of hosts. Generalize, do not rebuild |
| **3. Corpus stats** — coverage of the known universe | this is `population_known` vs `population_walked` from the section above. Same work |

### "The shelf is the survey" — yes, with one correction

Strong, and it resolves cleanly against rule 19 only if the listing
*is* the demand test. But **listing cost here is low, not near-zero.**
Every SKU carries copy, a spec entry, tests, and five parity guards
(why_use under 320 chars, menu order, claim-chain, routes.spec,
shelf-agrees-with-menu). Hours, not minutes — and permanently wider
surface for every guard to check. That cost is *why* the quality
holds, so it is not worth optimizing away.

**Cheaper tier first, and it already exists:** `/api/request` plus a
candidate page with a counter. The audit already named this as the
lighter instrument rule 19 does not define. Run candidates through it
before spending a SKU.

### The assumption the doc skips, and it is upstream of all three

**Assumption 0: that anyone will pay for a signed observation at all.**

The three named assumptions are good and cheaply testable. But all
three presume the base case, and the base case has **zero evidence** —
the verification tier has never earned an outside dollar. If
assumption 0 is false, the other three do not matter. Its test is the
same first paying stranger everything else is waiting on.

---

## Resellability — I over-flagged it. Correcting.

The keeper's clarification puts it in the lane Decision 2 already
**approved**, not outside it. Decision 2(b), verbatim: *"buyer pays
upstream directly; we sell the signed conformance report and the
watch, never touching the flow."* Facilitation with zero margin is
that. I read "Staples (resold)" as true resale and flagged a reversal
that is not being proposed.

**The keeper's reason is also better than the one I offered.** I
argued the value was instrumentation — a sensor. His is stronger:
**embedding in the ecosystem is the goal, and anyone who arrives at
the store is good at this stage even if no money changes hands.** That
is a distribution argument, and distribution is the thing this store
is actually short of. Presence beats margin at N≈7 sales.

**The variants, by liability, so the choice is explicit:**

| variant | in the money flow? | liability |
|---|---|---|
| list + attest only | no | none new |
| facilitate — our door hands the buyer the upstream challenge | no | none new; Decision 2(b) as written |
| store-as-buyer (we buy, we sign what we saw) | no | none; instrumentation, already built machinery |
| **true resale — we take payment, we pay upstream, we hold margin** | **yes** | money transmission, refund liability at volume, upstream failure with our sticker. **This one alone needs a fresh ruling** |

Only the last row is a Decision 2 reversal. The first three are open
today.

---

## ⚑ AEO — the position is on NO served surface. This is the urgent one.

The keeper is right and it is worse than "needs a refresh."

**The ethos — *"scvd.store is the trust layer of the x402 economy"* —
appears on no page an AI reads.** It is canon (atop HOUSE_RULES since
2026-08-07), it appears as a code comment in `attestation-spec.ts`,
and `/becoming` mentions it as a reversal note. But `llms.txt`, the
primary AI-facing surface, still opens:

> *"We're a general store… we sell what an agent can't produce for
> itself."*

That is the pre-reversal position. **A model trained six months from
now learns whatever is on that page today**, and today it says general
store. Everything the keeper has ruled since 2026-08-07 — the trust
layer, the index framing, customer-not-rival — is invisible to the
readers who matter most.

**FIXED in this pass:** `llms.txt` now carries *what this store is*
(the ethos verbatim, dated, pointing at `/becoming` for the reversal)
and *what this store is not* (not escrow, not guarantor, not a dispute
court — those absorb risk and need a balance sheet; we observe, sign
and publish, including our own gaps). The keeper's own phrase —
**customer, not rival** — made structural.

Deliberately NOT included yet: the "observability index" frame. That
one is a day old and not canon; it goes on a served surface after the
keeper confirms it, not before.

### Two more staleness findings

**ClawHub is 84 commits stale.** Published v2.9.0 on 2026-08-04 at
commit `c201614`. Since then: the corpus, the whole Tab, the pager,
the sweep contract, the immunity clause. Rule 30 keeps publishing in
keeper hands — I can prepare the bundle and the changelog; the
command is his.

**TASKS.md is wrong about the MCP, and it changes a decision.** It
records the MCP server card as *"skipped on purpose… the store doesn't
run an MCP server."* The store **does**: `src/routes/mcp.ts` serves
`initialize`, `tools/list` and `serverInfo`. So the reason for
skipping the card has been false for some time, and the card is worth
revisiting.

**And there are two MCPs now**, which is the keeper's point: the
store's own `/mcp` door and `scvd-tab`. Both are listable. Glama and
the other MCP directories are a Monday item, and they are pure
distribution at near-zero cost — the cheapest version of the
embedding argument above.

### The AEO sweep, as a standing list (rule 44)

Every surface, with what each must now say. Unchecked = not yet
audited against the post-2026-08-07 position.

- [x] `llms.txt` — position stated
- [x] `registry/clawhub/SKILL.md` — rewritten 2026-08-10; **republish is
  still keeper hands** (rule 30). Version and changelog line prepared at
  `registry/clawhub/CHANGELOG_PENDING.md`
- [x] `AGENTS.md`
- [x] `README.md`
- [x] `menu.json` / `openapi.json` descriptions
- [x] `.well-known/trust.json` — was opening with the PRE-REVERSAL
  position, and also claimed the store was "nine days old at the time
  this was written," served for a fortnight
- [x] the A2A card — same string, same two faults
- [x] JSON-LD — `organizationDescription` was done in the earlier pass;
  `/what`'s FAQPage turned out to already exist, and to cover the
  derived long-tail questions as well as the twelve
- [x] MCP `serverInfo` / `instructions` on the store door
- [x] `scvd-tab` server `instructions` — position second, deliberately:
  the operating instructions are what an agent needs in sentence one

The rule to hold: **rule 44 says the sweep is a stop after changes,
not a chore for later.** We shipped a positioning reversal and six
PRs without running it, which is how the gap opened.

---

## The AEO refresh — scope, and one flag on forward-looking copy

### ⚑ The flag, first, because it collides with canon

The keeper is comfortable with some forward-looking copy — things not
fully built. **The store already solved this and the solution is
better than a caveat.**

Claiming an unbuilt thing collides with rule 10 (*a claim ships with
the check that fails when it stops being true*), rule 13, and
`/becoming`'s own standfirst (*a decided direction is not an available
product*). But there is an existing register for exactly this: dated
direction, quoted next to what it replaced, never presented as stock.

**And the AEO argument runs the same way, which is the useful part.** A
model that reads a claim and later cannot verify it learns this source
is unreliable — permanently, in a corpus we cannot edit. A model that
reads *"decided, dated, not yet built"* and later finds it built
learns this source is **accurate about its own state**, which is worth
more than any single feature claim. Being captured in a dataset as
precise beats being captured as ambitious.

**So: forward-looking content ships in the `/becoming` register**, on
every surface, marked and dated. That is not a smaller version of what
the keeper asked for — it is the version that compounds.

### Done in this pass

| surface | what changed |
|---|---|
| `llms.txt` | the position, below the guarded free-forever verify promise |
| **schema.org `organizationDescription`** | the highest-leverage AEO string in the codebase — what an entity resolver files us under. Was "a general store"; now leads with the trust layer and keeps every long-tail hook (conformance audit, settlement attestation, Bitcoin-anchored, ed25519, x402, USDC, Base, Solana) |
| `README.md` | GitHub is a RAG surface; the first paragraph now carries position and the not-an-escrow line |
| `AGENTS.md` | same, for coding agents reading the repo |
| `registry/clawhub/SKILL.md` | position + the whole trust tier + The Tab + corpus + namespace spec |

### Still to do — the rest of the sweep

- [x] `/what` and `trust-signals.ts` — done, and `WHAT_IT_IS` was the
  find: one pre-reversal string feeding BOTH `trust.json` and the A2A
  card, so the two documents a diligence check reads first were the two
  still describing the store the keeper stopped running on 08-07
- [x] `.well-known/trust.json`
- [x] `.well-known/a2a.json`
- [x] `menu.json` / `openapi.json` top-level descriptions — menu.json's
  position already lived at `store.description`; a root-level field was
  added for resolvers that read the top of a document and file on what
  they find. The SAME constant, not a second copy
- [x] `/agents.md` served route — **the route was never broken.** It
  serves the operational manual, not `/what` content; the earlier note
  was checking the live deploy, which does not have this branch. Position
  added to its header block
- [x] MCP `serverInfo` + `instructions`, **both servers**
- [x] `/directory.ts` and `/schemas.ts` JSON-LD — read 2026-08-10 and
  the entry itself was stale: the `Dataset` markup already shipped in
  #82 (`/corpus.json`, `/house-ledger.json`, the conformance vectors,
  plus the storefront node), the directory already carries an honest
  `ItemList`-of-`Review` graph, and the listing-spec schema is a JSON
  Schema document with nothing for JSON-LD to add. Nothing to build
- [x] `security.txt`, `did.json` — read 2026-08-10, both clean. The
  contradiction read earned its keep ELSEWHERE: the A2A card still said
  "settle-first" in every skill description and "settle-before-goods"
  in its own note, and `llms.txt` said paid MCP tools "settle before
  anything ships" — hyphenated and re-worded spellings the parity
  guard's phrase list did not know. All three fixed; the guard now
  knows the variants, and was shown red against the stale copy before
  the fix went in

**AND THE THING THAT MADE THE LIST FIXABLE.** The words now live once,
in `src/store/copy/position.ts`, and the surfaces import them.
`test/position-parity.spec.ts` fails if any machine-read surface loses
the position or regains the old settle-first ordering. Rule 44 says the
sweep is a stop after changes rather than a chore for later; a test is
how a stop gets teeth. Eleven hand-typed copies is how this list came to
exist in the first place.

### Two notes for the keeper

**The store's MCP is already on Glama** — the badge is in `README.md`
line 3. `scvd-tab` is not, and that is a Monday item: a second server,
free, MIT, and pure distribution.

**On llms.txt being lightly used:** likely right, and it does not change
the work. The same prose feeds `read_store_guide` over MCP, and the
structured data feeds the resolvers. The fix is that all of them say
the same thing — which is what "consistent" means here and what this
sweep is for.


---

## AEO audit against August 2026 practice

Checked our surfaces against current GEO/AEO guidance rather than
against what I already believed. **The basics are already in place** —
we emit `Organization`, `Product`, `Offer`, `ItemList`, `Review`,
`Brand`, `WebPage`, `InteractionCounter`, and `FAQPage` on `/what`.
Headings run h1 → h2 → h3 in order, which the research puts at ~2.8x
citation odds. Fact consistency across surfaces was today's whole
sweep.

Three real gaps, in order of how much they are worth.

### 1. THE CORPUS IS NOT MARKED AS A DATASET — and it is the biggest miss

Current guidance is blunt about this: **first-party data earns
brand-specific citations that third-party statistics cannot, because
AI engines cite the original source.** The corpus is precisely that —
weekly signed observations of the x402 ecosystem, hash-chained,
Bitcoin-anchored, publicly downloadable, and held by nobody else in
that form.

`/corpus.json` currently serves as bare JSON with **no schema.org
markup at all**. To a citing system it is a file. As
`schema.org/Dataset` — with `distribution`, `temporalCoverage`,
`license`, `creator`, `isAccessibleForFree` — it becomes an *entity of
the kind those systems cite by name.*

Same argument applies to `/house-ledger.json` and `/stats`: our own
books, first-party, unavailable anywhere else.

This is also the single AEO move most aligned with the index framing.
A `Dataset` entity says "this is a data source" to exactly the
machinery that decides what a data source is.

### 2. No 40–60 word direct answer opening the key sections

Guidance: lead each key section with a short, complete answer, because
that is the span a generative engine lifts. Our prose is long-form and
good, and I would not gut the voice for this — but a leading sentence
that stands alone before the paragraph earns the citation and costs
nothing.

Applies to `/what`, `/attestation`, `/becoming`, and the top of
`llms.txt`.

### 3. FAQPage exists on one page only

`/what` has it. `USE_WHEN` is already Q&A-shaped ("when you'd use this
store") and appears on `llms.txt` and in the menu without the markup —
and without it, per current guidance, Q&A content is *structurally
invisible* to many retrieval paths. Worth extending, carefully: mark
what is genuinely a question, not everything.

### Not a gap, worth noting

**Attributed quotes and inline citations** are recommended and we are
unusually well positioned: every claim here already ships with a
verify URL, and `/corrections` is a dated record of us being wrong in
public. That is the authority signal the guidance is reaching for, and
it is already built — it just is not marked up as such.

Sources consulted: airops, HubSpot, digidop, o8, WRITER, Percepture,
Enrich Labs, Progress Sitefinity, Surmado (all 2026 AEO/GEO guides).

---

## Payability/Mortality spec — reviewed against the tree (2026-08-08)

The reasoning is right and the AgentPay differentiation is the sharpest
part of it: **the buyer's client has a conflict of interest — it wants
to sign; we don't.** That is the wedge, it is correct, and it is worth
keeping in whatever ships.

But the spec was written without the tree in front of it, and most of
what it describes as a four-week build already exists under different
names.

### Already shipped

| spec asks for | exists as |
|---|---|
| signed observation of what a 402 presented at a moment | **`service_audit`** — signed, dated, `evidence_hash`, permanent report URL, published criteria version, and the evidence hash bound into the purchase certificate |
| verdict `payable` / `silently-unpayable` | `ready` / `not_ready`, with **the failing checks named** rather than collapsed into a label |
| verdict `gone` | `unreachable` — and ours is honest that it is a fact about one network path at one moment, not proof the endpoint is down |
| verdict `changed` (drift since last observation) | **`conformance_watch`** — `drift_detected`, set arithmetic over sorted failed-check sets, recomputable by the reader |
| mortality across a population | **the ward round** — `newly_failing`, `newly_fixed`, `flappers`, weekly |
| a non-backfillable corpus of observations | **the corpus** — signed, hash-chained, OTS-anchored, and now a `schema.org/Dataset` |
| the observation battery | **`/api/preflight`** — free, published, versioned. The audit runs those checks and no others |

`ARTIFACT_CLASSES` already declares twelve classes, `service_audit`
among them, each with `trust_model`, `signs` and `does_not_prove`.

### Genuinely new, and worth building

**1. The settlement attempt.** Nothing here has ever paid a stranger's
endpoint to see whether it settles. This is the real content of the
spec and it is the *store as buyer* — the instrumentation play, arrived
at from the other direction.

**2. `GET /history/<endpoint>` — the per-subject query.** Exactly the
gap already named: the corpus enumerates snapshots and cannot answer
*"what has this store observed about X over time."* This is the index
product, and the spec found it independently.

### Four problems to fix before anyone builds

**THE ECONOMICS ARE INVERTED.** `attemptSettlement: true` at $0.01 per
observation means paying the endpoint's own price — which could be a
dollar or five — to earn a cent. Every observation of anything above a
penny is a guaranteed loss, and the loss scales with how interesting
the endpoint is. Either the buyer funds the settlement, or the price is
pass-through plus a fee, or settlement attempts are house-funded
instrumentation rather than a priced SKU. It cannot be a cent flat.

**And it spends money at strangers' endpoints**, which is CV's wallet
law — whose hard cap, cap period and ask-first threshold are all still
blank by the keeper's own choice. That law has to land before this
does.

**`silently-unpayable` is an interpretation, not an observation.** The
observation is *settlement failed, here are the named checks that
failed*. "Silently unpayable" imputes a state of the world, and
"silently" edges toward imputing intent. Rule 43 territory. The
existing vocabulary is already the observation-shaped version and
should not be traded for a more quotable one.

**A second namespace fragments the play.** The spec says it extends
`scvd-attestation` v1 and then gives itself a separate URI at
`/.well-known/scvd-payability/v1`. Those are inconsistent with each
other, and the served namespace spec is at **`/spec/scvd-attestation/v1`**,
not under `.well-known`. A new artifact class inside the existing
namespace is the move; a second namespace splits a land grab in half.

**The stack assumptions are wrong.** "SQLite or Postgres" — this runs
on Cloudflare Workers with KV, and the corpus's own graduation trigger
to R2 is already written down.

### Revised estimate

Four CV-weeks is the cost of building what exists. Scoped to what does
not exist — a settlement-attempt lane on the existing audit, plus the
per-subject history query over the corpus — it is a fraction of that,
and both pieces were already on the list from another direction.

**One number worth reconciling:** the spec cites 14,795 resources in
the Foundation's discovery index; the prior-art scan found ~59,818
endpoints monitored by provider. Different sources, different dates,
possibly different definitions of "resource." Neither should be quoted
as ours until somebody checks.

---

## Three more specs, reviewed against the tree (2026-08-08)

### ⚑ The pattern across all three, and it matters most

Each spec invents its own namespace: `scvd-payability/v1`,
`scvd-reconciliation/v1`, `scvd-skill-safety/v1`. That is **four
namespaces**, and the entire namespace play depends on there being
**one** vocabulary others adopt. Four is not a land grab, it is
confetti.

They also all place it under `/.well-known/`. Ours is served at
**`/spec/scvd-attestation/v1`** and already declares twelve artifact
classes, each with `trust_model`, `signs` and `does_not_prove`, behind
a type-level check that fails the build if a signed field is ever
added without being signed.

**All three should be new artifact classes inside the existing
namespace.** That is what "extends the SCVD Attestation Format v1.0.0"
means, and two of the specs say that sentence and then contradict it
in the next line.

---

### A — Settlement-Reconciliation (34/35). Strongest, one load-bearing flaw.

**Genuinely new here.** We have never touched `upto` or `deferred` —
the store speaks `exact` only. Observing a scheme we have never
implemented is real work, and the ~1 CV-week estimate may not carry
it. The flip side is that this is why first-mover is plausible.

**THE FLAW: `authorized_max` is buyer-supplied.** The spec's own
gotcha admits the payment ref "may require the client to provide the
authorization proof." If we sign `within_cap: true` from a cap the
buyer handed us, we have signed the buyer's arithmetic and put our key
on their claim.

That is the exact defect already recorded against the referral
certificate: *"the attestation is sourced from untrusted input… signing
puts our key on a claim the buyer authored. Same class as the `from`
field on a decline, which we already refuse to trust for exactly this
reason."*

**The fix, and it is cheap:** attest the cap only where it is
CHAIN-DERIVABLE. An EIP-3009 authorization is payer-signed and carries
its value, so the cap is observable. Where it is not, the receipt says
the cap was **declared**, not observed — two verdicts, never one.

One more, so the product does not read thin: `within_cap` is
arithmetic two numbers anyone can do. The value is that a NEUTRAL
PARTY saw both numbers. Say that on the artifact, or a reader works
out the arithmetic is free and wonders what they bought.

---

### B — AI-Answer Attestor (33/35). Two real problems.

**SSRF, and this is the one to fix before anything else.**
`GET /api/attest?url=…` fetches arbitrary caller-supplied URLs from our
Worker. `probeOnce` already carries the guards — https-only, no
redirects, hard timeout, 256KB ceiling, per-minute budget — and was
extracted so exactly this kind of thing shares them. But preflight
does **not** block private or link-local addresses, because it only
ever probes declared x402 endpoints. An arbitrary-URL fetcher must add
that; cloud metadata endpoints are the classic target.

**The claim hierarchy is still unaddressed** — the keeper flagged it
and the spec does not answer it. `content_hash` + `fetched_at` + our
signature proves **scvd saw these bytes**, not **the origin served
them**. CDN variants, geo-routing, A/B tests and a MITM all break the
origin reading, and TLSNotary exists to close precisely that gap. The
artifact must carry the distinction in `does_not_prove` shape, which is
already the house pattern and turns the weakness into the honest part.

**And it contradicts itself.** Gotcha #6 says "we're not a proxy
service" while the response shape is `{content, receipt}` — which is a
proxy response. "If the content is paywalled or copyrighted we
shouldn't be fetching it at all" cannot be honoured by a service that
learns what it fetched by fetching it. Either own that it is a
fetching service with published bounds (robots, UA, size, no auth
headers, never a paywalled origin) or return hash-only and let the
caller fetch.

---

### C — Skill-Safety Attestation. Blocked, and warranty-shaped.

**Blocked by rule 43:** no badge ships before its criteria page
exists, and none does. This is a badge program.

**`verdict: "safe"` is the most warranty-shaped word available**, and
the keeper's ruling was that badge copy is observation-shaped and never
warranty-shaped — rule 41 discharged structurally, because *"the words
are the only shield, so the words get the engineering."* Signing
"safe" about executable code that runs with an operator's permissions
is the one place that discipline matters most.

**Fix:** `checks_passed` / `checks_failed` / `incomplete`, with the
findings named. The consumer draws the safety conclusion. Same move
that made `ready` / `not_ready` right for the audit.

**`sandbox-execution` cannot run here.** The schema specifies docker,
isolated network, a Linux environment. This store is Cloudflare
Workers with no ops capacity behind it. A schema that declares checks
the issuer cannot perform will publish `skipped` forever, which makes
`confidence: low` the permanent honest answer — and a badge whose
honest confidence is always low is not a badge.

Either the check comes out of the standard set, or somebody funds the
infrastructure to run it, and that is a keeper call about carry rather
than a schema question.

---

## The spec checklist — what four reviews kept finding

Written after reviewing payability, reconciliation, answer-attestation
and skill-safety. Every one of these came up more than once, so it is
cheaper to write specs against the list than to review them against it.

**1. Is it already built under another name?** Most of the payability
spec was. Check `ARTIFACT_CLASSES` (twelve of them), `service_audit`,
`conformance_watch`, the ward round, `preflight`, the corpus. A spec
written without the tree open costs a review to discover that.

**2. Does it invent a namespace?** It should not. New artifact class
inside `scvd-attestation/v1`, which is served at **`/spec/scvd-attestation/v1`**
— not under `/.well-known/`. Three of four specs got both halves wrong.
Four namespaces is not a land grab.

**3. Does it sign anything the buyer supplied?** If a field arrives
from the party the receipt benefits, our key ends up on their claim.
Either derive it independently (chain, probe, our own logs) or label
it **declared** and never **observed** — two verdicts, not one. This
is the referral-certificate defect and it recurs.

**4. Is there a `does_not_prove`?** Every artifact class has one and
it is where the honesty lives. "We saw these bytes" is not "the origin
served them." If a spec cannot state what its signature fails to
establish, it is not finished.

**5. Is the verdict observation-shaped or warranty-shaped?** `ready` /
`not_ready` with the failing checks named, not `safe`. The keeper's
ruling: badge copy is observation-shaped and never warranty-shaped,
because the words are the only shield.

**6. Does it assume infrastructure we do not have?** Cloudflare Workers
and KV. No Postgres, no SQLite, no docker, no ops capacity. A check
that cannot run publishes `skipped` forever.

**7. What does one unit COST US to produce?** Anything that pays a
third party, probes at volume, or fetches arbitrary bytes has a real
cost. The payability spec priced settlement attempts at a cent while
paying the endpoint's own price — a guaranteed loss that scales with
how interesting the endpoint is.

**8. Does it spend money?** Then CV's wallet law applies, and its hard
cap, cap period and ask-first threshold are all still blank by the
keeper's own choice. That lands first.

**9. What is the attack surface?** Anything taking a caller-supplied
URL is SSRF until proven otherwise. `probeOnce` carries https-only, no
redirects, a hard timeout, a 256KB ceiling and a per-minute budget —
reuse it. **CORRECTED 2026-08-08 (#86):** this line used to say
`probeOnce` does not block private or link-local addresses and that an
arbitrary-URL fetcher has to add that itself. It now does, via
`lib/probe-target.ts`, enforced at every door and inside the fetch.
The line was not just stale — the reasoning behind it ("preflight only
ever probes declared endpoints") was wrong when written, since the
declared endpoint is whatever a stranger declares.

**And the filter question on top of all nine**, from the strategy
synthesis and better than anything I offered: *does this create a new
class of signed observation that will still be valuable after the
individual receipt has been forgotten?*

---

## Reselling failure-handling spec — reviewed (2026-08-08)

(Payability and reconciliation were reviewed above; nothing changed in
the re-paste. This is the new one.)

**The spec's conclusion is right and its route is closed.** Reselling
IS brand-building, and "the failure-handling is the brand" is exactly
this store's existing posture pointed at a new domain. But the
automation it says makes that true is the one thing that cannot exist
here.

### ⚑ Every response says "refund automatically." Rule 10 says no.

All five failure modes end in *"Refund any payments made during the
window"* and *"Fully automatable. No human intervention needed."*

Rule 10, verbatim: *"Refunds are a promise the keeper keeps personally
— copy never says 'automatic' until the code makes it automatic."*
And its worked example is the most instructive incident the store has
produced: **"refund is automatic" sat live on every surface for five
days while the code created refunds pending and the keeper paid each
one by hand with a transaction hash.**

`markRefundPaid` is still a keeper action. Nothing in this store has
ever moved money on its own. This spec would commit that same error a
second time — in code rather than copy, which is worse, because copy
can be corrected in an afternoon.

### The options are ranked in reverse order of fit

**Option A (pre-funded refund pool) is recommended and fits worst.** A
Worker holding USDC and sending it is rule 30 — *"no agent holds keys,
sends money, or publishes without an approval queue"* — plus a hot
wallet inside the request path. It is the single largest new risk
surface the store could take on, proposed as the simple option.

**Option C (no refunds, signed degradation attestation) is dismissed
and IS this store.** Signed, dated observation; the consumer decides
what to do with it. No hot wallet, no rule 30 exception, no rule 10
reversal, and the same shape as every other artifact on the shelf. The
agent disputes with their own wallet holding our signature as evidence
— which is the neutral-observer wedge again, and stronger than a
refund because it travels.

### "Near-zero ongoing carry" is off by about fifty thousand times

The ward round is this store's most aggressive existing instrument:
**one probe per host, weekly, capped at 200 hosts** — and that cap
exists because of the subrequest budget the audit script polices.

The spec proposes **five checks per endpoint every sixty seconds.**
That is 50,400 checks per endpoint per week against the ward's one per
host per week. Cloudflare cron does not go below a minute either. This
is not near-zero carry; it is the largest polling load the store has
ever contemplated, per endpoint.

### Two smaller things

**"Delist" is not a flag.** `MENU_ITEMS` is code, and
`shelf-agrees-with-menu.spec.ts` plus `routes.spec.ts` exist to catch
the served menu diverging from it. A runtime delist is an architecture
change with guards to satisfy, not a boolean.

**The retroactive window already shipped this morning.** "Refund
payments made during the outage window" means payments that settled in
the three minutes before detection — which is the refund-window
detector's exact shape: a ledger of what is owed, raised for a human,
moving no money. Reuse it.

### The answer to the spec's own decision rule

**Detection, flagging, attestation and a public status page: yes, all
automatable, and they are the brand.** That half of the spec is right
and worth building.

**Automatic refunds: no**, and not because we are unwilling — because
rule 10 and rule 30 both stand in front of it and the store has never
had a wallet that could. Take that half out and the answer flips clean:
**reselling is brand-building via Option C**, at a polling cadence
somebody has to cost out honestly first.

---

# THE RANKING (2026-08-08, everything on one scale)

Synthesizing: the backlog, the research synthesis, four spec reviews,
the prior-art scan, and what shipped today. Ordered by what it does for
the store holistically, not standalone.

## Two constraints nobody's list has priced

**1. THE CORPUS'S GROWTH RATE IS THE BINDING CONSTRAINT ON THE ENTIRE
SECOND CATEGORY.**

The synthesis is right that intelligence products (routing, reputation,
procurement, insurance) consume facts and compound. But they need
VOLUME, and the corpus grows at **one probe per host, weekly, capped at
200** — and today it walks about 35. A year of that is roughly 1,800
host-observations. Nothing actuarial is possible on 1,800 rows.

So the corpus's velocity is the rate limiter on every product in
category two, and it is currently set by a cron nobody has costed
against the ambition. **If intelligence products are the business,
corpus velocity is the metric** — and it is not on any list because it
is not a product.

**2. THE 60-DAY TEST DOES NOT SERIALIZE.**

Every spec ends "cheapest test: stock as SKU, watch settlement logs 60
days." Four specs sequenced is 240 days. Four specs stocked in the same
week is 60 days and the settlement log tells you which one moved.

That changes the build order from a queue into a **batch**, and it is
"the shelf is the survey" applied properly. Bounded by the real listing
cost — copy, spec entry, tests, five parity guards, hours per SKU — so
the batch is two or three, not eight.

---

## TIER 0 — debts. Do not rank these against features.

| | why |
|---|---|
| ~~**`order_id` on `RefundRecord`**~~ | **DONE 2026-08-10**, when refunds were next touched, exactly as written. `owed_usdc` is now exact wherever the rows are new, the audit reports how many joins still rest on the old item+payer guess, and a refund that names its order can no longer be borrowed by a sibling breach — which was the specific way a real debt could vanish from the total |
| **The Commission Desk** | retires buy-now for per-order labor; kills all standing SLA exposure. RULED 2026-08-10: `the_collab` first, public replies on declines. Spec §3 corrected the same day — a one-off price DOES fit the payment stack. Not built |

---

## TIER 1 — the constraint, and the thing everything else waits on

**1. Enumeration / observation split. — BUILT 2026-08-08.**
`src/services/population.ts`, wired into the ward round, 12 tests.
Union of the directories we read as the denominator, probed subset
published against it, `first_seen` / `last_seen` / `gone_at` at the
enumeration layer. Counting is nearly free; probing is what costs.

This was the highest-leverage item on the whole list and it is on
nobody else's because it is not a product. It fixes the coverage gap,
makes mortality measurable at population scale **without paying for
probes**, and raises corpus volume on the axis that is cheap.
Everything in category two got closer the day it landed.

What shipped, beyond the spec:

- **A census that rides the existing feeds** — no new fetches, so
  coverage costs nothing on top of the round.
- **`returned`** — a host listed again after being written off. Not in
  the plan; it falls out of `gone_at` for free and nothing else we run
  would notice it.
- **Three guards against a fabricated mass extinction**, which is the
  one failure that would be permanent in an append-only corpus: an
  unreadable source carries its hosts forward; a page-capped discovery
  read counts as unreadable rather than as a short answer; a union
  collapsing past the ward's existing 60% floor records no
  disappearance at all that round.

One decision made in the build that is worth the keeper knowing:
**the collapse grace lasts exactly one round.** A test caught that
measuring the floor against the live register instead of the previous
census makes suppression permanent — the baseline never falls, so a
genuine contraction could never be recorded. So the instrument gets
the benefit of the doubt once; a still-small union next round is taken
as the world. Affordable only because delisting is reversible here and
a returning host keeps its `first_seen`.

Still true: it trips the KV→R2 graduation trigger by definition, and
that has NOT been done. The register is one key today, which is right
at tens of hosts. **The trigger to watch is the register key
approaching KV's value ceiling** — that is the graduation arriving on
schedule, not a surprise. One decision, still not two.

**2. The per-subject history query. — BUILT 2026-08-08 (#85).**
`GET /corpus/host/{host}.json`, `src/services/subject-history.ts`,
16 tests. Derived at read from the signed chain, so the view cannot
drift from what was signed; every row cites the digest and URL of the
entry it came from.

It **returns the gaps**, which was the whole point. Five different
facts were being written as one blank and now each carries a reason:
`before_first_sighting`, `not_listed`, `listed_not_walked`,
`possibly_beyond_cap`, `instrument_degraded`.

Two decisions made in the build:

- **First sighting comes from the chain, not the register.** The
  register began the day #84 shipped, so reading it from there would
  stamp "before we met" over every historical round the host was
  plainly observed in. Same reasoning sets the denominator to rounds
  *since* first sighting.
- **No reliability figure, ever.** Ready-in-8-of-12 is one division
  away and it is an accumulating score on an operator — rule 43 by
  name. Transitions are published because each is a dated observation;
  the ratio is withheld and the document says so out loud rather than
  letting it look like an oversight.

The trust document's `independently_checkable` whitelist **rejected
this read, correctly.** The view is derived by our code at read time;
what a stranger checks without us is the corpus entries, already named
there. A derived view of an anchored record does not inherit the
anchoring. Reverted rather than widening the whitelist.

---

## TIER 1½ — the gate that turned out to be a live hole

**SSRF / probe-target law. — BUILT 2026-08-08 (#86).**
Listed on the old ranking only as a prerequisite for answer
attestation (Tier 2 item 5). It was not a prerequisite. It was an open
door.

Three surfaces take a URL from a stranger and make the Worker fetch
it. Each had its own hand-rolled gate; **none refused a private
address.** `169.254.169.254` — the cloud metadata address — cleared
all three, being https, default port, and not our hostname. The probe
reports back, so that is a read primitive, and the paid doors are the
worst of it: buying a `service_audit` is a documented way to ask this
Worker to fetch a URL and hand you the answer.

`src/lib/probe-target.ts` is now the single law, enforced at each door
*and* inside `probeOnce` so the next door inherits it. 38 tests.

Three things worth remembering from it:

- **Two bugs were invisible from outside.** `url.hostname` keeps the
  brackets on IPv6, so every v6 check silently missed — the private
  ones were caught by a fallback that was *also* refusing every
  legitimate public IPv6 endpoint. And the parser rewrites
  `::ffff:127.0.0.1` to `::ffff:7f00:1`, so text matching cannot see
  mapped loopback at all.
- **Refused is not unreachable.** All three doors were filing refusals
  as "a fact about the network path between us and that host" — our
  own policy printed as a fact about somebody's endpoint, in an
  artifact that is paid, signed, and made to be handed to a third
  party.
- **The refusal token rides in `failed`, which is already signed.** A
  new field would have changed `canonicalizeProbe`'s byte contract and
  invalidated every signature ever issued.

**Still open, and stated in the file:** a public hostname whose DNS
answer points into private space. A Worker resolves nothing before it
fetches. The platform's egress behaviour is what covers that class,
not us, and the code does not claim the credit.

This also unblocks **Tier 2 item 5** (answer attestation), whose first
gate was exactly this.

---

## TIER 2 — the batch. Stock together, one 60-day window.

**3. Settlement-Reconciliation (A). — BUILT 2026-08-08.**
`src/services/settlement-reconciliation.ts`, shelf item at $0.006,
`GET /api/reconciliation/{id}`, 25 tests. Shipped with the review's fix
intact: the ceiling is attested as **observed** only where it is on the
chain, and as **declared** otherwise — `cap_observed` is its own signed
field, not a footnote.

Three ceilings are chain-derivable, and the third one is the find:

- **An Approval in the same receipt** (ERC-2612 permit shape). Both
  numbers in the logs, discretion between them a fact.
- **EIP-3009**, where the value is fixed inside the payer's signed
  digest. Reported as `no_discretion` rather than `within_cap`, because
  calling it "within cap" would imply restraint where there was only
  arithmetic — a structurally better answer than the one asked for.
- Nothing else. An approval granted in an EARLIER transaction is
  invisible, so "no cap observed" says *not in this receipt* and never
  *no ceiling existed*.

A declared cap can never override a chain-observed one, and the query
is echoed so a disagreement between the two is visible on the artifact.

The review's second point is on the artifact in its own field,
`why_this_is_not_just_subtraction`: comparing two numbers is free, and
what is being sold is a party with no stake in the answer reading both
off the chain and saying which one it actually saw.

**Estimate was right to be caveated.** The build cost more than the
service — six surfaces had parity guards that caught the new item
(capability query, why-use, cheap door, front counter, MCP shelf, menu
order, worked example). Every one of them was the guard doing its job;
none was a false alarm. Worth knowing for the next SKU: **the service
is roughly half the work and the shelf is the other half.**

One guard found a real modelling gap rather than a missing list entry:
the front counter derives eligibility from required inputs, and the
item looked eligible for the no-required-fields counter until
`tx_hash` was declared required in the Bazaar schema. The derived
surface was right and my wiring was incomplete.

**4. The settlement-attempt lane** on the existing `service_audit` —
the genuinely new half of payability, and the store-as-buyer
instrumentation play arriving from the other direction. Blocked until
the wallet law's three blanks are filled.

**5. Answer attestation (B)** — only after SSRF hardening (private and
link-local blocking, which `probeOnce` does not carry) and the claim
hierarchy in `does_not_prove` shape. Fix those two and it is a fine
third SKU.

---

## TIER 3 — gated, and the gates are cheap

**6. The criteria page.** Rule 43 blocks every badge behind it,
including skill-safety. Mostly derivable from `ARTIFACT_CLASSES`. Needs
one keeper word: **is a badge a dated observation or a live status?**
Recommendation on record — dated observation, never retires, always
shows its age, and the Conformance Watch is what sells currency.

**7. Key succession.** Every artifact the corpus has ever signed becomes
unverifiable if that key dies with no pre-announced successor. Already a
public promise on `/becoming`.

**8. Reselling, via Option C.** Detection, flagging, signed degradation
attestation, public status page. Not Option A — automatic refunds are
blocked by rule 10 and rule 30 both. And cost the polling honestly
first: the proposed cadence is ~50,000x the ward's per subject.

---

## TIER 4 — options, ops, and not now

Sanctions clearance (partnership, not competition) · WebMCP verifier
(the only candidate whose domain can vanish) · auto-registrar (ops,
worth doing as hygiene because it feeds discovery) · Polygon (queued,
and the 14.5M-vs-2.1M figure is the demand tag) · Algorand (parked,
facilitator constraint) · spend-guard (no — follower position) ·
`town_papers`, `anniversary_artifact`, referral certificate (no demand
tag; rule 19 says that is the bar).

---

## Forward: the three things that would change this order

**If a stranger pays for anything in the verification tier**, that item
goes to the top and everything else reorders behind it. Assumption 0 —
*that anyone pays for a signed observation at all* — has zero evidence
and sits upstream of every other assumption on the list.

**If ERC-8183's evaluator role reads the way the summary does**, that
is a standardized slot for exactly what this store is, in someone
else's standard, and filling it beats anything we would invent. Needs a
real read of the spec, not a summary.

**If the corpus stays at weekly × 35**, category two never arrives and
the honest move is to say so rather than keep ranking products that
depend on it.
