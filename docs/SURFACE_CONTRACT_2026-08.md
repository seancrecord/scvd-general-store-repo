# The surface contract — house rules 57 and 58

**Adopted 2026-08-29, from the keeper, in two sentences on a phone.**
This file records what he ruled, what shipped with the ruling, and what
the rules now demand that the store does not yet do. The rules
themselves live in HOUSE_RULES.md; this is the working record beside
them, and the list at the bottom is a sweep somebody has to run.

## What he ruled

On #26, the "public scoreboard" task, having been given three shapes
and a recommendation:

> Almost a combo of a and c if it is human facing it needs to be
> compelling readable and scannable with clear meaning while also able
> to drill deeper into full data (paid) . Everything should be
> consumable readable and findable to an agent as well and we need a
> house rule in that too around anything in this site needs to be 1.
> Discoverable from any access point to an agent 2. It needs to be
> easily understood what it is and what it can potentially be used for
> without limiting the use case 3 it should be clear if it's free or
> paid and if so how much qt what frequency and if recurring or one odd
> 4 it need 3 it needs to provide clear instruction down to something a
> haiku model can perform and not get confused or fail at with clear
> faq error categories and expected outcomes 5 needs to note how secure
> it is and the precautions and standards we hold

> Then a rule if anything is human facing it should have good seo, be
> easily understood summarized and valuable with clear outcomes and
> clear ability to either pay to dive deeper or direct an agent to pay
> and dive deeper

Those became rules 57 (the five agent questions) and 58 (anything a
person reads earns its page), quoted verbatim inside each.

## The correction that came with the build

The draft he was answering told him "every endpoint we checked,
machine-readable" was already shipped, and pointed at /corpus.json,
the per-host reads, trajectory, diff, wallet facts and battery delta.

**That was wrong.** /corpus.json indexes SNAPSHOTS — sequence, week,
digest, host counts. /corpus/host/{host}.json is a TEMPLATE that
requires a hostname you already have. Nothing anywhere answered "which
hosts do you have?" A caller could fetch every snapshot and union the
rows, which is a real path and is why nothing was hidden — but rule
57.4's own test is whether a small model completes the call on the
first try, and "download the whole chain and fold it" is not that.

The census had hundreds of subjects and no index of them. Recorded
here rather than quietly fixed, per rule 56.

## What shipped with the rules

- **`/doors` and `/doors.json`** — every host the chain has carried,
  one entry each, alphabetical, with the most recent dated verdict,
  the week it was taken, `rounds_present`, `rounds_scored`, and the
  URL of the full history. `?verdict=` filters; anything else is a 400
  that names the four values. Derived at read from signed rows; the
  recipe to rebuild it rides on the document. **No ratio, no standing,
  no ranking** — held by a test that fails on a fractional number in
  any host row, because a ratio can arrive under an innocent name.
- **`cadence` on every menu item**, required by the type system, with
  `term_days` where a purchase buys days. Four items sell a term
  (standing_watch 7, conformance_watch 7, recurring_patronage 30,
  trust_profile 30); the other twenty-two are one-off. `priceLine` now
  carries the cadence in the same breath as the amount, so every
  surface that quotes a price — MCP tool list, catalog, markdown menu,
  item pages — got the missing half at once.
- **The flat answer to "is this recurring"**: nothing at this store
  charges again by itself, and there is no mechanism that could. That
  is a fact about the architecture, not a promise about intentions,
  and it now travels with every price.

## What the rules demand that we do not yet do

Rule 57 is now house law for **anything on this site**, and /doors is
one room. The honest state of the rest:

- **57.3 is closed shelf-wide** — cadence is required and checked.
- **57.1 was already held** by test/no-orphan-capability.spec.ts.
- **57.2, 57.4 and 57.5 were held against /doors and nowhere else.**
  Most API doors describe themselves in OpenAPI and llms.txt; few
  publish their error categories BY NAME with what a caller should do
  about each, and almost none carry a security paragraph.

  **The first leg of the sweep ran 2026-08-29**, in the order named
  here — the free doors an agent meets before it pays. The preflight,
  the conformance desk and the buyer's dry run each gained
  `what_you_can_use_it_for`, `expected_outcome`, `errors` (named
  categories about THIS call, distinct from the failures each tool
  reports about its subject), a `price` block that says free with its
  cadence and prices any paid rung off the menu, and a `security`
  paragraph. The house-wide safety clauses live once in
  `src/store/surface-contract.ts`; everything door-specific is
  required by the type, so an instrument cannot import the shape and
  leave the substance blank.

  Two things the sweep turned up. `/api/before-you-pay/v1` was absent
  from the atlas's free-door roster — on llms.txt and in the OpenAPI
  contract, missing from the one surface arranged by the goal a reader
  arrives with. And the conformance desk has no paid rung selling the
  same reading signed; rather than point at an item answering a
  different question, its price block says the rung is absent and why.

  `test/free-doors-answer-rule-57.spec.ts` holds all of it, walking
  the atlas's own FREE_DOORS rather than a list written in the test,
  so an instrument added to the atlas tomorrow is held tomorrow.

  **The second leg ran 2026-08-30: the paid shelf.** Measured first —
  every one of the 26 items answered ZERO of the four. Price and
  cadence had been covered everywhere since the rule was adopted (the
  type system requires them); what an agent gets back, what can go
  wrong, and what we hold ourselves to were published nowhere per
  item.

  The answers derive. 104 hand-written paragraphs about a buy path
  that is ONE code path is 104 chances to describe it wrongly, and a
  stale safety paragraph is worse than a stale item count. Expected
  outcome comes from the item's fulfillment class, term and SLA; the
  error categories from its input schema and inventory — a `sold_out`
  branch is published only where stock exists, so a client is never
  told to handle a branch that cannot fire.

  **The exception, and it is the lesson.** The first version derived
  "does this door knock on your endpoint" from the input schema: a
  `url` or `host` property meant a fetch. It was wrong on its first
  run — `spot_check` takes a host and deliberately does not knock,
  reading the books at the counter, which its own description says
  out loud. A guessed safety claim is worse than an absent one. What
  a door reads is now a STATED fact (`MenuItem.reads`, required by
  the type, five classes), established from each fulfillment
  service's import graph: `@/lib/probe-target` means it fetches a
  subject you named, `@/lib/base-rpc` or `@/lib/solana-rpc` means it
  reads public chain state, neither means it reaches nothing. The
  method is written into the type so the answers can be re-checked
  rather than trusted, and `launch_check` — the one door that makes a
  real payment against your endpoint — says so in its own class.

  `test/paid-doors-answer-rule-57.spec.ts` walks MENU_ITEMS and holds
  all four against each item's own facts. menu.json entries gained
  `listing_url`, because the catalogue named a `buy_url` and left an
  agent to construct the URL of the page that describes it, and a URL
  a reader has to guess is not findable.

  **Still owed:** the reading rooms.
- **58.1 is partly structural** — every room gets a title, description,
  canonical and JSON-LD from `renderSimplePage`. What no check holds is
  whether the description would make anybody click it.
- **58.4 is the weakest clause store-wide.** Most rooms name a paid
  product; almost none give a person a line to paste at their own
  agent. /doors does. Nothing else audited yet.

None of that is a promise to sweep it this week. It is the list, so
the rules are not quietly narrower than the sentences that adopted
them.
