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

  **Still owed:** the paid doors, the reading rooms, and the MCP tool
  surface. Same method: add the row, watch it fail, close it.
- **58.1 is partly structural** — every room gets a title, description,
  canonical and JSON-LD from `renderSimplePage`. What no check holds is
  whether the description would make anybody click it.
- **58.4 is the weakest clause store-wide.** Most rooms name a paid
  product; almost none give a person a line to paste at their own
  agent. /doors does. Nothing else audited yet.

None of that is a promise to sweep it this week. It is the list, so
the rules are not quietly narrower than the sentences that adopted
them.

## The reading rooms, audited (2026-08-30)

All thirty-six rooms in `ROOMS` were fetched with a browser's two
headers and counted. Two findings, and they belong in different piles.

### Structural — fixed in this change

**`/developers` served two `<h1>` tags**, and had since it shipped:
`renderSimplePage` emits one from the page's own title and the route
body emitted its own on top. Both headings were correct, sensible and
in the right place. There were simply two of them, and a document with
two first-level headings has told every crawler and every screen
reader that it is two documents. It is the only room in the store with
this defect.

It survived every hand-read because neither heading looks wrong. You
find it by counting the served bytes of all thirty-six rooms at once.
`test/one-h1-per-room.spec.ts` now does that on every build.

**A correction on my own audit, in the same breath:** its first regex
matched `<h1>` literally, which scored `/porch` — whose heading carries
a class and an inline style — as having none. I nearly filed a defect
against a page that was fine. The guard matches the tag, not the tag
with no attributes.

Everything else was clean: all thirty-six rooms carry a title, a
description over fifty characters, and a canonical link.

### 58.4 — ⚑ THE KEEPER'S PEN, drafted not shipped

Rule 58.4 asks that a paid path be walkable two ways: a person can buy
it, and a person can hand the line to their agent and have the agent
buy it. The second half is the one this store keeps forgetting.

**Eight rooms name a paid product. Three of them give a reader
something to hand an agent.**

| room | names a paid path | hands it to an agent |
| --- | --- | --- |
| `/what` | yes | yes |
| `/doors` | yes | yes |
| `/samples` | yes | yes |
| `/try` | yes | **no** |
| `/conformance` | yes | **no** |
| `/bot-auth` | yes | **no** |
| `/profiles` | yes | **no** |
| `/pricing` | yes | **no** |

The five gaps are real and the fix is one sentence each. **That
sentence is selling copy, so it is not written here.** Rule 7 and the
M5 gate both apply: an agent-handoff line is the store telling a
reader how to spend money, and machine-drafted lines of that kind are
exactly what the gate exists to stop.

What the line has to do, if he wants drafts: name the free check
first, then give a literal instruction a reader can paste at their own
agent, with the real URL in it. `/doors` and `/samples` carry working
examples of the shape.

**Not done and not owed until he rules:** the copy. The audit, the
table, and the structural fix are the deliverable.
