# What the keeper needs to look at and test

Written 2026-08-10, from the whole of `MONDAY.md` plus everything that
shipped after it was last updated. The earlier version of this list was
**partial** — it covered the live money bugs and skipped the Tab, the
AEO sweep, the distribution items and the standing rulings. This one is
the complete set.

Three kinds of thing are mixed together below and they are labelled,
because they cost very different amounts of keeper time:

- **LOOK** — open a page, read a number, five minutes.
- **TEST** — actually exercise something that has never met reality.
- **RULE** — nobody but the keeper can decide it; no work happens until
  he does.

---

## A. This week, on the live store — LOOK

These are the ones with money attached.

**A1. The admin reconciliation page, once.** `/admin/reconciliation`.
Three things changed under it today and the first load is the check:

- The alarm trail now marks rows **[NEW]** — meaning *first fired since
  your last visit*, not *raised again since your last visit*. The first
  load marks nothing and says so; the mark moves every time you load
  the page. If the second load shows old rows as NEW, that is a bug and
  it is the whole feature being wrong.
- The `[STILL OPEN]` / `[RESOLVED BY HAND]` / `[CLOSED (DELIVERED)]`
  stamp on each undelivered-sale row is what says whether history is
  history. Anything stamped STILL OPEN is the only thing that needs a
  hand.
- **The mis-click is now fixable.** You clicked "fulfilled by hand" on
  the refund. Resolve that same tx again as **refunded**: the record
  will now say refunded, keep the wrong outcome beside it as
  `superseded`, and note that it was corrected. Before today that second
  click filed the correction as a chain orphan and stamped "No delivery
  intent ever existed" on it, which was false.

**A2. Whether the dropped-delivery bug has actually stopped.** The
cause was four items reading the chain between settle and mint against
the rate-limited public `mainnet.base.org`, with no retry and no
try/catch. Since then: retries with backoff, a second provider, and
your Alchemy key in `BASE_RPC_URL`. **The test is time, not a suite** —
a week with organic sales and no new `undelivered_sale` on the Base
rail. If one appears anyway, the alert now has the tx and the item, and
that pair says whether it is the same bug or a new one.

**A3. Solana has no authenticated RPC and does not need one.** Four
public endpoints in rotation, and it is not in the purchase path. The
08-05 Solana undelivered at 0.004 was the same class of failure on the
other rail. Nothing to buy, nothing to configure. **Polygon: not in
use anywhere.** Do not add a key for it.

**A4. Nothing is unpaid.** Every alarm you have seen was money that
LANDED and goods that did not go out. The refunds you made are the
correct resolution; nothing is owed to the store.

---

## B. Never met a stranger — TEST

MONDAY.md's own hardening table, plus what shipped after it. The
pattern MONDAY.md names is still true: **almost everything here works
in the suite and has never met a stranger.** That is one week of
adversarial testing, not seven projects.

**B1. The Tab, Parts 1–7 — the largest untested surface you own.**
`tab/TEST_PLAN.md`, and `docs/CV_TEST_SEGMENTS.md` breaks it into nine
copy-pasteable blocks to hand over one at a time (you asked for that
because CV overloads; it is written and pinned to `7a67130`).

- **Part 0** is already proven. Do not re-test by hand.
- **Part 1 — does the agent actually SAY it?** This is the one that
  matters most and **an agent cannot run it on itself.** An agent that
  has read the plan is primed and proves nothing. This needs you or a
  second, unprimed instance. It is the only test of `unspoken_pct`,
  which has never been produced by anything.
- **Parts 2, 3, 4, 6** — client handshake, the cron clock, two agents
  on one tab, the sweep contract dry run. Genuinely untested. CV can
  run all four.
- **Part 5** — does the vocabulary survive a real stack.
- **Part 7** — longevity.

**B2. The pager's ride-along.** Same thing from the other side: no page
has ever settled either way, so `unspoken_pct` is null. First real week
of use tells you whether the ride-along reaches you or whether agents
take pages and never speak them.

**B3. The sweep contract has never run against a real inbox**, even by
hand. Contract written, routine unwritten.

**B4. The watches.** No third-party endpoint has ever been watched for
a full week.

**B5. Tiered / PWID arithmetic.** `graffiti_on_a_train` tiers and
`the_drawer` minimum have never been exercised by an outside buyer —
every live purchase so far took the fixed-price path.

**B6. Rule 9 / deliver-first — a test, not a rewrite.** Fail a handler,
assert no settle call and no on-chain movement. Cheap, and it either
proves the property in our stack or kills the idea before anyone
touches the gate. Right now the property is asserted from a README and
our own code comment.

**B7. Replay guard under concurrency.** Known, unfixed. Read-then-write
against KV; the chain's nonce is the backstop, so this is resilience,
not correctness.

**B8. The cold-read test on the remaining artifact classes** — the
trust list, `/house-ledger.json`, `/stack`, the badge SVG. Worth doing
because the method already found a real defect in certificates that
**446 tests missed**, since every test verified through the same
function that signed.

---

## C. Rulings only you can make — RULE

Nothing here is blocked on me. Each is one decision.

**C1. `OPEN_LABOR_CAP = 8`.** Drafted, not canon. It is your throughput
and nobody else can set it. Live on the counter page as `Bench: N of 8`.
The argument for 8 is only that some ceiling beats none.

**C2. The Commission Desk — four decisions.** `docs/COMMISSION_DESK.md`:
which items, the rungs, quote expiry, and whether a declined request
gets a public reply.

> **§3 was corrected today and the correction matters to decision 2.**
> The spec said a one-off price "does not fit the payment stack." That
> was false — `@x402/core` exports `DynamicPrice` and per-request
> pricing is first-class. The published-ladder recommendation survives,
> but now on risk appetite (a KV read on the money path can quote a
> wrong number; a static price cannot), not on an impossibility that
> was never there. Decide knowing both doors are open.

**C3. Rule 9 / deliver-first.** Rule 9 ends in "Ever." Amending it is
yours, in the open and dated — the same discipline you made `/becoming`
follow. Run B6 first; the test either supports the amendment or ends
the conversation.

**C4. Badge retirement.** The criteria page is derivable from
`ARTIFACT_CLASSES` except for one part that is genuinely yours: **what
retires a badge.** Dated de-badging, reason on record, and whether
anyone who relied on it gets told. Nothing in canon answers it. And the
prior question underneath it: **is a badge a dated observation or a
live status?** (Recommendation on record: dated observation, never
retires, always shows its age, and the Conformance Watch is what sells
currency.)

**C5. Is the burn total allowed to contain an estimate?** Usage-based
and free-tier-with-a-paid-path both mean "there is no fixed number."
If yes, `price` needs a `basis` marker. If no, they stay
unrepresentable and the tab says so.

**C6. Card reconciliation — pick a source.** The only true ground truth
for burn. Until then `variability_pct` rests on the sweep measuring
itself: honest, not proof.

**C7. The ward's population source.** Whether Browser Use is already in
the walked universe decides whether their observation is already
happening or whether the ward needs to widen. Widening is the only move
that stays uniform; adding one name is targeting.

**C8. GitHub private?** Recommendation on record: **keep the code
public, move the strategy docs.** The product is verifiability, twelve
served surfaces cite the repo, and the moat is the key and the corpus,
not the code — a fork gets the code and none of the history. What could
move at zero cost: `MARKETPLACE_AUDIT.md`, `PROBLEMS.md`, `TASKS.md`,
`AT_SCALE.md`, `NOTES_FROM_THE_COUNTER.md`, `EMPLOYEES.md`. None is
cited by a served surface. One-way door either way: it is MIT and it
has been public.

**C9. CV's wallet law — three blanks.** Hard cap, cap period, ask-first
threshold, all still blank by your own choice. **This blocks the
settlement-attempt lane** (Tier 2 item 4), which is the store-as-buyer
instrumentation play. Nothing spends money at a stranger's endpoint
until those three numbers exist.

---

## D. Distribution — cheap, and nobody has done it

MONDAY.md calls this "pure distribution at near-zero cost" and it is
the cheapest version of the embedding argument. Rule 30 keeps
publishing in keeper hands, so these are yours to run; I can prepare
every bundle.

**D1. ClawHub is stale.** Published v2.9.0 on 2026-08-04 at commit
`c201614` — that is now well over a hundred commits behind, and
everything since is missing from it: the corpus, the whole Tab, the
pager, the sweep contract, the immunity clause, the population layer,
the per-subject query, the reconciliation SKU. I can prepare the bundle
and the changelog; **the publish command is yours.**

**D2. `scvd-tab` is not listed anywhere.** The store's own MCP is on
Glama (the badge is in `README.md` line 3). The Tab is a second MCP
server, free, MIT, and unlisted. Glama and the other MCP directories.

**D3. The MCP server card.** `TASKS.md` records it as "skipped on
purpose — the store doesn't run an MCP server." **That is false and has
been for some time**: `src/routes/mcp.ts` serves `initialize`,
`tools/list` and `serverInfo`. The reason for skipping is gone, so the
card is worth revisiting.

**D4. agentic.market** — draft ready, gated on organic mcp + bazaar
settles showing in `/admin` channels. **ACP listing** — verify whether
it requires token participation; skip if so. **Farcaster frame / Base
App miniapp** — unstarted. **Gazette auto-assembly** — waits for a week
with 3+ organic events.

---

## E. The AEO sweep — half-finished, and rule 44 says that is a stop

Rule 44: the sweep is a stop after changes, not a chore for later. We
shipped a positioning reversal and six PRs without running it, which is
how the gap opened. Done so far: `llms.txt`, schema.org
`organizationDescription`, `README.md`, `AGENTS.md`,
`registry/clawhub/SKILL.md`.

**Still unaudited against the post-2026-08-07 position:**

- `/what` and `trust-signals.ts` — the whitelist is exact; check the
  position lands without inventing a signal
- `.well-known/trust.json`
- `.well-known/a2a.json` — the A2A card's description
- `menu.json` / `openapi.json` top-level descriptions
- `/agents.md` served route (distinct from the repo file)
- MCP `serverInfo` + `instructions`, **both servers**
- `/directory.ts` and `/schemas.ts` JSON-LD
- `security.txt`, `did.json` — check nothing contradicts

**And the three named AEO gaps, in order of worth:**

1. **The corpus is not marked as a `schema.org/Dataset`** — the biggest
   miss on the page. First-party data earns brand-specific citations
   that third-party statistics cannot. `/corpus.json` currently serves
   as bare JSON with no markup at all: to a citing system it is a file,
   not a data source. Same argument for `/house-ledger.json` and
   `/stats`.
2. **No 40–60 word direct answer** opening the key sections of `/what`,
   `/attestation`, `/becoming`, `llms.txt`. A leading sentence that
   stands alone before the paragraph, without gutting the voice.
3. **`FAQPage` exists on `/what` only.** `USE_WHEN` is already
   Q&A-shaped and carries no markup, which makes it structurally
   invisible to many retrieval paths.

This is work I can do — it is on the list because it is unfinished, not
because it needs a ruling.

---

## F. Debts, not features — do not rank these against ideas

**F1. THE REFUND-WINDOW DETECTOR.** The card by the door promises: *we
miss a promised window, you get your money back — and you won't have to
argue for it.* The delivery audit catches settled-but-never-delivered.
**Nothing catches delivered-late against the 168-hour queue SLA, or
window-breached-with-no-refund-row.** That is a live, published money
promise whose only enforcement is you remembering. It is rule 10's own
lesson pointed at the store's loudest money claim — and rule 10 exists
because this exact shape already burned us ("refund is automatic" live
on every surface for five days while the code never did it). Correctly
deferred on 08-07 when the queue was empty; six or seven organic sales
later the premise has changed. Approved 08-08, still unbuilt.

**F2. `order_id` on `RefundRecord`.** Additive, optional, tiny. Turns
`owed_usdc` from a floor into a fact. Do it next time refunds are
touched.

**F3. Key succession.** Every artifact the corpus has ever signed
becomes unverifiable if that key dies with no pre-announced successor.
It is a public promise on `/becoming` and the single point of failure
under the entire corpus.

---

## G. Two facts that reorder everything, and neither is a task

**G1. The verification tier has never earned an outside dollar.** No
stranger has ever paid for a watch or an audit. Every argument for the
marketplace pivot is currently theory with good architecture under it.
MONDAY.md calls this **Assumption 0** — *that anyone will pay for a
signed observation at all* — and it sits upstream of every other
assumption on the list. **If a stranger pays for anything in the
verification tier, that item goes to the top and everything else
reorders behind it.**

**G2. Corpus velocity is the binding constraint on the whole second
category.** Intelligence products (routing, reputation, procurement,
insurance) need volume. The corpus grows at one probe per host weekly,
capped at 200, and today walks about 35. A year of that is ~1,800
host-observations. Nothing actuarial is possible on 1,800 rows. It is
on nobody's list because it is not a product — but if intelligence
products are the business, **corpus velocity is the metric.**

And one that will arrive on its own: the population register is a
single KV key, which is right at tens of hosts. **The trigger to watch
is that key approaching KV's value ceiling** — that is the KV→R2
graduation arriving on schedule, not a surprise.

---

## H. Two reads that change decisions rather than inform them

Both flagged in MONDAY.md as needing a real read, not a summary.

**H1. ERC-8183** — Virtuals Protocol with the Ethereum Foundation's dAI
team, published 2026-03-10. Defines a Job primitive where **evaluators
attest to completion** to trigger release or refund. If it reads the
way the summary does, there is a formal standardized slot for exactly
what this store is, in someone else's standard — and filling it beats
anything we would invent.

**H2. `draft-hopley-x402-compliance-receipt`** — an IETF Independent
Submission with a JSON Schema and a compliance-attestation extension.
**A competing namespace to `scvd-attestation/v1`.** Worth knowing
whether to align with it or diverge deliberately.

Also unverified and quoted nowhere yet: the ~59,818-endpoints figure
and the 14,795-resources figure come from different sources on
different dates and may not mean the same thing. Neither should be
quoted as ours until somebody checks.
