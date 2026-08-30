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
- **57.2, 57.4 and 57.5: the sweep has STARTED, three doors deep.**
  `/api/preflight/v1`, `/api/before-you-pay/v1` and
  `/api/conformance/v1` are now under the contract and checked by a
  registry walk in `test/surface-contract.spec.ts`. A door listed
  there is claimed; a door absent from it is not. Adding a row is how
  the sweep advances, and the row fails until the door answers.

  **What the first three found, and it was the same thing three
  times.** Every one of them documents, at length and by name, the
  failures it finds in OTHER people's endpoints. Not one said what IT
  returns when the caller gets it wrong. The three best-documented
  files in the repository were generous about everything except their
  own failure path — the only part a caller is holding when things go
  wrong. Each also named paid rungs by bare URL with no price and no
  cadence, and none carried a security paragraph.

  Fixed by: stable `code` fields on the wire (additive — the English
  `error` sentence is unchanged and still served), an
  `expected_outcome`, a published error catalogue, a `security` block,
  and ladders priced from the shelf via `ladderRung`.

  **One guard was wrong and the door was right.** The first draft
  demanded a paid rung on every door. The conformance desk has
  refused one in writing since it shipped — "a paid verdict has a
  customer, and a customer for a verdict is how verdicts start
  bending" — so the guard would have made the store sell the one
  thing it decided not to. The registry now carries `paid_rung:
  false` and the clause demands the REFUSAL be on the record instead.
  Silence is what 57.3 forbids, not abstinence.

  **The second leg ran 2026-08-30: the paid shelf.** Measured first —
  every one of the 26 items answered ZERO of 57.2, 57.4 and 57.5.
  Price and cadence had been covered everywhere since the rule was
  adopted; what an agent gets back, what can go wrong, and what we
  hold ourselves to were published nowhere per item.

  The answers derive. 104 hand-written paragraphs about a buy path
  that is ONE code path is 104 chances to describe it wrongly.
  Expected outcome comes from the item's fulfillment class, term and
  SLA; the error categories from its input schema and inventory — a
  `sold_out` branch is published only where stock exists, so a client
  is never told to handle a branch that cannot fire. They reuse
  `DoorError` and `securityBlock` rather than growing a second set of
  names for the same promises.

  **The exception is the lesson.** The first version derived "does
  this door knock on your endpoint" from the input schema: a `url` or
  `host` property meant a fetch. It was wrong on its first run —
  `spot_check` takes a host and deliberately does not knock, reading
  the books at the counter, which its own description says out loud.
  A guessed safety claim is worse than an absent one. What a door
  reads is now a STATED fact (`MenuItem.reads`, required by the type,
  five classes), established from each fulfillment service's import
  graph: `@/lib/probe-target` means it fetches a subject you named,
  `@/lib/base-rpc` or `@/lib/solana-rpc` means it reads public chain
  state, neither means it reaches nothing. `launch_check` — the one
  door that makes a real payment against your endpoint — has its own
  class and says whose money moves.

  `test/paid-doors-answer-rule-57.spec.ts` walks MENU_ITEMS and holds
  all of it against each item's own facts. menu.json entries gained
  `listing_url`: the catalogue named a `buy_url` and left an agent to
  construct the URL of the page describing what it was buying.

  **The third leg ran 2026-08-30: the reading rooms**, against rule
  58. The structural half of 58.1 was already solid — title,
  description and canonical on 35 of 35 — with one exception the
  measurement found: `/developers` carried two `<h1>`s, its body
  writing one under the shared renderer's. Two h1s splits the outline
  a search engine builds, and `/developers` is the room a readiness
  audit once reported as absent.

  **58.4 was on one room out of thirty-five** — `/doors`, built the
  evening the rule was adopted. The free half of the fix derives
  completely: all 35 rooms already answer `Accept: application/json`
  at their own URL, measured rather than assumed, so "the machine
  copy of this page is this page" is true of a room added tomorrow
  with no bookkeeping. That is the line a person hands to their agent.

  The paid half is deliberately sparse. Ten rooms name a rung
  (`Room.deeper`, priced off the shelf); the other twenty-five say
  **"Nothing on the shelf sells a deeper read of this page. What is
  here is all of it, free and complete."** That empty case is a
  sentence rather than a gap on purpose — the same instinct as
  `paid_rung: false` above. Pointing a reader at an item answering a
  different question, to avoid an empty section, is the failure this
  store files against other people.

  **Still owed:** the MCP tool surface. Same method: add the row,
  watch it fail, close it. What no test can settle is 58.1's other
  half — whether a description would make anybody click it — and
  58.2, whether the finding is really in the first screen.
- **58.1 is partly structural** — every room gets a title, description,
  canonical and JSON-LD from `renderSimplePage`. What no check holds is
  whether the description would make anybody click it.
- **58.4 is the weakest clause store-wide.** Most rooms name a paid
  product; almost none give a person a line to paste at their own
  agent. /doors does. Nothing else audited yet.

None of that is a promise to sweep it this week. It is the list, so
the rules are not quietly narrower than the sentences that adopted
them.
