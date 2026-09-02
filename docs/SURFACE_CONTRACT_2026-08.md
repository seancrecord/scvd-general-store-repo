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

  **The MCP tool surface ran 2026-08-30, and the sweep is closed.**
  `POST /mcp` is a third front door beside the HTTP API and the rooms.
  Measured first: all thirteen served tools carried an `outputSchema`
  and `annotations`, and not one carried an error catalogue or a
  security block.

  The wire told the same story twice. `error.data` was null on every
  refusal, so "nothing was charged" lived only in the English message
  — the defect the buy doors carried until this sweep's second stop,
  unfixed here, and sharper because that commit named this store's own
  MCP till as a client of those doors. And `-32602` was doing four
  jobs at once: a caller could not tell "you asked the wrong shelf,
  here is the right one" from "your URL was not a URL" without parsing
  prose.

  Every refusal now carries `{code, charged: false}` in `error.data`,
  additive — the JSON-RPC code and the message are byte-for-byte what
  they were. The string codes are shared with the money path wherever
  the refusal is the same; only the genuinely MCP-shaped ones are new
  (`wrong_shelf`, `shelf_closed`, `unknown_tool`, `no_such_resource`),
  because a third vocabulary for the same refusals is what
  `store/surface-contract.ts` exists to prevent.

  **Two things this leg got wrong first, both caught before merge.**
  The composed security sentence concatenated one clause per class,
  so a mixed shelf read "No request is made to any endpoint of yours"
  directly followed by "One unauthenticated outbound GET to the
  endpoint you name" — each true of some item, together a
  contradiction aimed at the reader clause 57.4 exists for. Each
  sentence now names the `item_id`s it covers, and the money warning
  is derived from whether the shelf actually sells a walk rather than
  asserted on every mixed shelf.

  And the first guard proved itself by removing one of the two sites
  that emit `bad_request` — and passed, because the other site still
  emitted it and the wire test happened to exercise that one. A guard
  that cannot see a refusal go bare is guarding the vocabulary, not
  the refusals. It walks the source now: every `rpcError` call site is
  either the refusal helper's or one of four named non-refusals with
  its reason.

  ---

  **The sweep is closed.** Free doors, paid shelf, reading rooms,
  money-path refusals, shelf gate, MCP tools. What remains is
  judgement no test can make: whether a description would make
  anybody click it (58.1's other half), and whether the finding is
  really in the first screen (58.2). Same method: add the row,
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

## The reading rooms, audited — and the audit overtaken (2026-08-30)

All thirty-six rooms were fetched with a browser's two headers and
counted, against rule 58. **Two sessions did that on the same day,
independently, and this is the record of what happened when they
met.**

### The same defect, found twice, by two sessions that could not see each other

`/developers` served two `<h1>` tags and had since it shipped:
`renderSimplePage` emits one from the page's own title and the route
body emitted its own on top. Both headings were correct, sensible and
in the right place. There were simply two of them, and a document with
two first-level headings has told every crawler and every screen
reader that it is two documents.

It survived every hand-read because neither heading looks wrong. You
only find it by counting the served bytes of all thirty-six rooms at
once — and **both sessions did exactly that, on the same day, and
landed on the same room.** #351 merged first; its wording is the one
that stands, and this branch took it rather than churning a comment
that was already published and correct.

Two independent readings converging on one defect is the strongest
evidence available that the finding is real and that the measurement
is the right one. It is also, precisely, #65: two sessions spending
the same hours on the same file because nothing coordinates them.

**A correction on my own audit, in the same breath:** its first regex
matched `<h1>` literally, which scored `/porch` — whose heading
carries a class and an inline style — as having none. I nearly filed
a defect against a page that was fine. Match the tag, not the tag with
no attributes.

### ❌ WITHDRAWN: the 58.4 gap table this file briefly carried

An earlier draft of this section listed five rooms — `/try`,
`/conformance`, `/bot-auth`, `/profiles`, `/pricing` — as naming a
paid path with no way to hand it to an agent, and said the fix was
the keeper's copy to write.

**That was true when it was measured and false by the time it was
written.** #351 shipped the agent-handoff line, the free-first
ordering and menu-derived prices across the rooms while this branch
was in flight. All five carry the line now; verified by fetching them,
not by reading the diff.

The table is withdrawn rather than quietly deleted, per rule 56, and
the reason is worth more than the table was: **a stale finding about
our own surfaces is exactly what this store sells other people
protection from.** It lasted about forty minutes.

### What is actually held, and by what

`test/rooms-earn-their-page.spec.ts` (from #351) walks `ROOMS` and
holds 58.1, 58.3 and 58.4 together — including the h1 count, with the
correct regex. A second guard for the h1 alone was written on this
branch and **deleted before merge**: two guards over one property are
two things that must agree with nothing checking that they do, which
is the defect this store keeps finding elsewhere.

### Still owed

The MCP tool surface. Everything else in the sweep is held by a
walking guard with a written coverage statement.

*(Closed the same day — see the section below.)*

## The MCP tool surface, the sweep's last stop (2026-08-30)

The sweep ends where rule 57 began: the agent channel. It was the
last surface audited and the only one where the rule's own clause had
never actually landed.

### Clause 57.3 was added to a function the MCP catalog did not call

`src/lib/mcp-tools.ts` carried its own `priceLine`, written months
before the rule existed. When 57.3 arrived on 2026-08-29 — *"paid says
the amount, and whether it is one-off or recurring, and if recurring,
how often it charges"* — the cadence was added to the **other**
`priceLine`, in `src/services/menu-markdown.ts`.

So four items that sell a stretch of time went on quoting a bare
amount to every agent that reads the tool list:

| item | price | what it actually buys |
| --- | --- | --- |
| `recurring_patronage` | $3 | 30 days |
| `standing_watch` | $5 | 7 days |
| `conformance_watch` | $5 | 7 days |
| `opening_day` | $9 | 7 days |
| `trust_profile` | $21 | 30 days |
| `operator_statement` | $21 | 30 days |

> **❌ CORRECTED 2026-08-30, within the hour of publishing it.** This
> table first said `standing_watch` sold **30 days**. It sells seven.
> The correct figure was already written 200 lines up this same file,
> so the document contradicted itself the moment it merged.
>
> I hand-typed four numbers into a table, in a change whose entire
> argument is that a price must be derived and never typed. Nothing
> caught it: the guards read the served bytes, and prose in a doc is
> not served bytes. It was found by walking the live endpoint after
> the merge — rule 55, and the only reason this paragraph exists
> instead of the wrong number.
>
> The table is now derived-checked: `test/surface-contract.spec.ts`
> parses these rows and compares each to `MENU_ITEMS`, so a figure
> that drifts from the shelf fails the build rather than sitting here
> being quoted.

The served bytes, before the fix:

```
- recurring_patronage: Recurring Patronage, $3 fixed, instant.
  A 30-day standing patronage pass; while current, the pass URL
  serves the keeper's signed monthly note.
```

`$3 fixed` — and the term readable only by parsing the English
sentence after it. That is exactly the state 57.3 was adopted to end,
surviving on the one channel the rule was written for. One catalog
feeds five agent surfaces: MCP `tools/list`, WebMCP, `/mcp.md`, the
ARD catalog and the self module. All five were quiet about it.

`buy_simple`, the front counter — the tool deliberately placed first
because a weak model reaches for something early and plausible — was
quoting `$0.5` with no pricing mode and no cadence at all.

### ❌ The guard over 57.3 could not fail, and said so in a comment

`test/surface-contract.spec.ts` asserted that `priceLine(item)` carries
the cadence, under a comment that read:

> "priceLine is the single place a price is phrased, and **the MCP tool
> list**, the catalog, the markdown menu and the item pages all read
> it."

Both halves were true of a function this channel never called. The
test passed. The comment named, first in its list, the one surface the
claim was false about.

Rule 46 says a guard that cannot fail argues for the lie. This one
argued for it in prose, next to a passing assertion — which is worse
than no guard, because it is the exact artifact a later reader would
cite to conclude the surface was covered. Corrected in place on the
date rather than rewritten away.

### What holds it now

The fork is deleted. `menu-markdown` exports `amountPhrase` and
`cadencePhrase` and composes them into the unchanged `priceLine`, so a
channel that needs half takes half of **the** function rather than
writing a second one — a cluster tool lists up to seventeen items and
cannot repeat the store-wide never-renews sentence seventeen times, so
it says that half once, at the bottom, for all of them.

The new guards read **the tool descriptions the MCP server actually
sends**, not the helper that builds them, because the defect they
exist to catch was precisely a second builder nobody was checking. A
guard over a helper is satisfied by a channel that calls a different
helper; a guard over the wire is not. The paid tools are derived from
the catalog rather than listed, so a tool added tomorrow is covered
without anyone editing a test, and a menu item no tool sells fails
rather than being exempt by accident.

Mutation-proven four ways: dropping the per-item cadence, dropping the
store-wide sentence, blinding `cadencePhrase`, and dropping the tip
note each turn the matching guard red.

### What consolidation nearly cost, caught reading my own diff

The deleted fork carried one fact the shelf's phrasing does not: that
paying above a pay-what-it-deserves minimum is **recorded as a tip**.
Merging onto one function would have dropped it from the agent channel
silently — a small loss, and exactly the kind a refactor takes without
anyone noticing, because nothing was asserting it.

It is kept as a channel note in `mcp-tools` rather than added to the
shelf's `priceLine`, since the shelf copy is the keeper's ink (rule 7)
and this is a note about a channel, not a change to what the store
says about its prices. A guard now holds it, so the next consolidation
cannot take it either.

### One more thing found and deliberately not fixed

`purchaseTool` and its helpers — the one-tool-per-item catalog retired
on 2026-08-02 in favour of the shelf clusters — are still in
`src/lib/mcp-tools.ts` and unreachable. Nothing calls them. They are
left alone here on purpose: they now compose the real `priceLine`, so
they are no longer a second phrasing of anything, and retiring a
documented design decision deserves its own reading rather than
riding along on a cadence fix.

### The sweep's coverage, closed

Free doors, money doors, reading rooms, and now the agent tool
surface. Every one is held by a walking guard with its registry in
this file. Nothing in the sweep is claimed on a doc's word alone.
