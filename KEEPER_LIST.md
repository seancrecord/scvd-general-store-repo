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
- **The stamp now names the outcome.** It used to read
  `[RESOLVED BY HAND]` for all three choices, so the page told you THAT
  a row was resolved and never WHICH — and refunded, fulfilled and
  absorbed are opposite claims about where the money went. That is why
  you could not check what you clicked: the page was not showing it. It
  now reads `[RESOLVED: REFUNDED]`, and `(corrected)` if it was changed.
- **And if it turns out wrong, it is fixable.** Resolving the same tx
  again records a correction: the new outcome stands, the old one is
  kept beside it as `superseded`, and a note says which way it moved.
  Clicking the same outcome twice is a no-op. Before today that second
  click filed the fix as a chain orphan and stamped "No delivery intent
  ever existed" on it, which was false.

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

**B6. ~~Rule 9 / deliver-first — a test, not a rewrite.~~ DONE
2026-08-18:** `test/deliver-first.spec.ts` — fails a handler and
asserts no settle call and no on-chain movement, exactly the
acceptance test the keeper named in the 08-10 ruling. The property is
now proven in our stack, not asserted from a README.

**B7. Replay guard under concurrency.** Known, unfixed. Read-then-write
against KV; the chain's nonce is the backstop, so this is resilience,
not correctness.

**B8. The cold-read test on the remaining artifact classes** — the
trust list, `/house-ledger.json`, `/stack`, the badge SVG. Worth doing
because the method already found a real defect in certificates that
**446 tests missed**, since every test verified through the same
function that signed.

---

## C. Rulings — EIGHT OF NINE ANSWERED 2026-08-10

**Answered, and now canon** (recorded in full at the top of
`MONDAY.md`):

| | ruling | code state |
|---|---|---|
| **C1** | `OPEN_LABOR_CAP = 7` | **done** |
| **C3** | Rule 9 flips: deliver first, settle after | rule amended and dated; **the gate is the build** |
| **C4** | A badge is a dated observation. It never retires, it ages. No chasing holders | built 2026-08-10 (`/criteria`) |
| **C5** | Yes, the burn may contain an estimate — add a `basis` field | built 2026-08-10 (tab schema v0.8) |
| **C6** | Card reconciliation: monthly bank CSV, manual for now | built 2026-08-10 (`reconcile_card_statement`, tab v0.3.0) |
| **C7** | The ward widens to every public directory. Uniform, no favourites | built 2026-08-10 (fuchss joins the census; paid directories named as unread until the wallet law) |
| **C2** | Commission Desk: `the_collab` first, public replies on declines | built 2026-08-10 (request → quote → pay at a static rung; declines public at `/api/commission/declined`; buy-now door still open beside it) |

**Two notes on C2.** "Let's do all of them this way" is read as *every
per-order labor item eventually moves to request → quote → agreed
price*, with `the_collab` first through the door. If you meant instead
that the rungs and quote expiry should take the spec's recommended
defaults, those are on record and nothing is blocked either way — say
which and it costs nothing. And §3 of the spec was corrected today: a
one-off price *does* fit the payment stack (`DynamicPrice` is
first-class in `@x402/core`), so the published-ladder recommendation
now rests on risk appetite rather than on a wall that was never there.

**C8. GitHub private? — CLOSED by the keeper 2026-08-10.** Struck from
the list at his word; the repo stays as it is, public. Closed rather
than silently deleted, because a question that vanishes gets re-asked
at full price.

**Still open, and still yours:**

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

**CLOSED 2026-08-10 — the sweep is done.** The position lives once in
`src/store/copy/position.ts`, the surfaces import it, and
`test/position-parity.spec.ts` holds them there. Every surface on the
old list above was audited or corrected; the full ledger of what each
one needed is in `MONDAY.md`. The three named gaps closed too: the
`Dataset` markup shipped in #82 (`/corpus.json`, `/house-ledger.json`,
the conformance vectors), `/what` leads with an answer since #83, and
its `FAQPage` turned out to already cover the long-tail questions.

The last pass (2026-08-10, this branch) was the contradiction read of
`security.txt` and `did.json` — both clean — which instead caught the
A2A card and `llms.txt` still saying "settle-first" in spellings the
parity guard did not know. Fixed, and the guard now knows the variants.

---

## F. Debts, not features — do not rank these against ideas

**F1. THE REFUND-WINDOW DETECTOR — DONE 2026-08-10.** The sweep and the
`order_sla` page were already on the cron; what landed is the half the
promise turns on: the buyer can see the breach on their own order page
— missed window, by how long, what is owed, including when the goods
arrived late. Moves no money; rule 10 keeps refunds in the keeper's
hand, and a test guards the wording.

**F2. `order_id` on `RefundRecord` — DONE 2026-08-10,** the same day
refunds were next touched, exactly as the entry asked. `owed_usdc` is
exact wherever the rows are new; the audit reports how many joins still
rest on the old item+payer guess.

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
