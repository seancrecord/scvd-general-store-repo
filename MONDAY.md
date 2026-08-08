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

### 4. August 27 is nineteen days out

The kill checkpoint is armed. Worth knowing before it arrives what
answer would trip it, while there's still time to move the number.

### 5. `unspoken_pct` has never been produced

The pager's honesty metric. No page has settled either way, so the
number is null. First real week of use tells us whether the ride-along
reaches you or whether agents take pages and never speak them. That is
the one claim from this whole stretch still untested against reality
rather than against a suite.
