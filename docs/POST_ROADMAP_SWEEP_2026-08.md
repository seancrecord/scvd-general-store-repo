# Post-roadmap sweep — documentation, surfacing, and copy (task #88)

Dated 2026-08-27, the day the roadmap's last build row closed. Two
kinds of content here, kept strictly apart:

- **Documentation-voice updates, shipped in this change** — factual
  surfacing of features that existed but were not findable. No
  selling, no superlatives; the register of the pages they join.
- **⚑ DRAFT selling copy, NOT shipped** — M5 is a keeper gate:
  every customer-facing selling line below is a draft for the
  keeper to approve, reword, or strike. Nothing in this section
  reaches a page until he does.

## A. Where every Phase 2–3 feature is surfaced (inventory)

| Feature (merge) | openapi | guide (llms) | /developers | landing page | menu/shelf copy |
| --- | --- | --- | --- | --- | --- |
| Corpus chain + per-host replay | ✅ | ✅ | ✅ | ✅ /corpus | n/a (free) |
| Defect vocabulary v3, sourced_by (#282) | ✅ | ✅ | ✅ | ✅ /defects | n/a |
| tx_hash_status in launch_check (3.2, #280) | ✅ (in schema) | ✅ | ✅ (launch_check) | — | ⚑ keeper line pending (#84) |
| stale_after / staleness reads (3.3, #283) | ✅ | ✅ | — | — | ⚑ conformance doc line pending (#84) |
| Observer accounting (3.4, #286) | ✅ | ✅ | — | ✅ (gap taxonomy on /corpus) | n/a |
| Trajectory + since-diff (3.5, #290) | ✅ | ✅ | ✅ (this change) | ✅ (this change) | n/a (free) |
| Wallet facts T1/T2 (3.6, #295) | ✅ | ✅ | ✅ (this change) | ✅ (this change) | n/a (free) |
| Standing notes (3.6, #296) | ✅ | ✅ | ✅ (this change) | ✅ (this change) | n/a (free) |
| Verify short-leash + declines reading (#292) | internal | internal | n/a | n/a | n/a |
| Delivery intents on both doors (#293) | internal | internal | n/a | n/a | n/a |
| Provenance check (T3) | NOT BUILT | — | — | — | ⚑ K3 price + M5 copy first |

This change closes the two "this change" columns: the corpus landing
and /developers now name the trajectory, diff, wallet-facts and
standing-note surfaces.

## B. ⚑ DRAFT selling copy — keeper approval required (M5)

None of the following is wired anywhere. Each block names its target
surface. Approve, reword, or strike.

### B1. Storefront / "what this is" — one added line — ✅ APPROVED 2026-08-29, SHIPPED

Keeper: "d1 [f]ine". Live as `STOREFRONT_COPY.recordReadsAsTime`.
All three nouns are walkable free surfaces (rule 55): the trajectory
and the diff on the corpus, the wallet facts at
`/corpus/wallet-facts.json` — checked before wiring, not after.

> The record now reads as time: week-over-week trajectory, a diff
> any agent can poll, and wallet facts nobody else counts — all
> derived from the signed chain, all free.

### B2. Gazette line — ❌ STRUCK 2026-08-29

KEEPER: "didn't we retire gazette? We did." He is right, and the
record is more precise than the question: README has carried
"`/gazette` — Retired 2026-08-05; the printed archive still answers,
nothing new schedules" for three weeks. A NEW Gazette line was never
available to write. The draft below was authored against a masthead
that had already closed, which is the exact drift the M5 gate exists
to catch — and it was the keeper who caught it, from a phone, without
opening the file.

THE ARCHIVE IS UNTOUCHED and stays paid: past issues still sell a
penny a copy, and #91 gave them a human paywall page four days ago.
Retired means nothing new schedules, not that history stops answering.

⚑ ONE THING WORTH RESCUING, and it is the keeper's to rule: the
FINDING is real and unpublished — 544 receiving addresses across this
week's doors, 78 receiving at more than one, the largest cluster
fronting 60. It has a live home already at
`/corpus/wallet-facts.json`, which serves those counts derived rather
than frozen. The question is only whether it deserves a sentence on a
surface a human reads, and the corpus landing page is the honest
candidate now that the Gazette is not.

(Original draft kept below as the record of what was written and why
it did not run.)

> First reading from the new wallet-facts surface: of 544 receiving
> addresses advertised by this week's doors, 78 receive at more than
> one door — and the largest single cluster fronts 60 doors. We don't
> say what that means about operators; custodial and platform wallets
> make strangers share an address. We publish the count and the
> denominator, and the inference is yours. /corpus/wallet-facts.json,
> free, re-derivable.

### B3. launch_check menu copy — ✅ APPROVED 2026-08-29, SHIPPED

Keeper: "d3 fine". Live on the `launch_check` listing. The four states
it names are real in `services/launch-check.ts:172-174` — checked
before the sentence shipped, because a menu line that names states the
walk cannot produce is a claim with no path (rule 55).

> Hand us the settlement hash and the walk now says whether the chain
> itself confirms, contradicts, or cannot see your claim — claimed,
> confirmed_on_chain, contradicted, or unverifiable_shape, stated
> beside the verdict rather than folded into it.

### B4. Conformance page — ✅ APPROVED 2026-08-29, SHIPPED

Keeper: "d4 fine". Live in `conformanceDoc().what_it_checks`, which
feeds both the JSON door and the HTML landing page from one string.

> Artifacts now carry stale_after: past it, a document is still
> validly signed history — just no longer a statement about now. The
> desk reads both facts separately and says which one failed.

### B5. Standing notes — one storefront line

> If we observed your door and you have something to say about it,
> say it on the record: prove control, attach your statement, and it
> rides beside our observation everywhere it appears. We never edit
> the observation; you never need our permission.

### B6. The changelog note — "what changed, what we now observe, what we still do not" (keeper voice)

(The review asked for one short, untriumphal note after this batch.
Draft below; publish wherever you publish — gazette, a corpus landing
line, or nowhere.)

> This week the record learned three things it could not do before:
> read itself as time (/corpus/trajectory.json and the since-diff),
> count shared receiving addresses without judging anyone
> (/corpus/wallet-facts.json), and carry the subject's own words
> beside our observations (standing notes, self-serve, evidence-
> gated). The passport now answers the three questions an agent
> actually has — can it be paid, what evidence says so, when does
> that evidence expire — in one signed block, and every defect class
> now says what fixes it, not only what broke.
>
> What we now observe that we did not: payment-address reuse across
> doors, as counts with denominators; drift in a door's own declared
> terms between signed weeks; our own instrument's blindness, booked
> against ourselves instead of against operators.
>
> What we still do not observe: anything between weekly rounds;
> delivery quality; whether a shared wallet means a shared operator
> (custodial and platform wallets make strangers share an address —
> we publish the count, the inference stays yours); and everything
> each module's own not_checked list names. The gaps are in the
> record beside the findings, where they have always been.

### B6. Sell-up copy for the two patronage doors — ⚑ DRAFTED 2026-08-29, KEEPER'S PEN

Requested by the keeper 2026-08-29 ("go ahead and draft d5"). Nothing
below is wired. Approve, reword, or strike.

THE PROBLEM THESE TWO HAVE, stated first because it decides the voice.
Both doors already say what they are, and both say it well:
`certificate_of_patronage` promises "nothing whatsoever except lasting
gratitude and a nicer badge — the purest thing we sell";
`recurring_patronage` is "a 30-day standing pass" that carries the
keeper's monthly note. What neither says is WHY A BUYER WHO ALREADY
BOUGHT SOMETHING WOULD REACH FOR IT, which is the only job sell-up
copy has.

THE ONE THING THAT MUST NOT HAPPEN. The certificate's whole charm is
that it buys nothing. The moment sell-up copy hints at a benefit —
priority, standing, a better hearing — the item becomes a small lie
and the funniest thing on the shelf becomes the cheapest. So the draft
sells the ONLY honest thing patronage buys, which is that the store
keeps existing, and it says so without asking for pity.

#### B6a. `certificate_of_patronage` ($20) — one added line

> Most things here are bought because an agent needed them. This one
> isn't. It is the line item for wanting a one-person shop that
> publishes its own mistakes to still be here next year, and it
> entitles you to exactly as much as that sounds like: nothing, on
> paper, signed, with your name on it.

#### B6b. `recurring_patronage` ($3) — one added line

> Three dollars a month is less than one Once-Over and it buys less
> than one Once-Over. What it buys instead is thirty days of the
> keeper writing to you like somebody who is still here, and the
> quiet arithmetic that a hundred of these is a store that does not
> have to sell anything it does not believe.

#### B6c. Where they go, if approved

Appended to each item's `description`, not the `note_402`: the 402
note is the till's voice and stays short. One line each, no new
surface, no new door.

⚑ THE PART THE KEEPER SHOULD ARGUE WITH: B6b names a competitor
product of our own ("less than one Once-Over") to anchor the price.
That is honest and it is also the closest this store has come to
selling by comparison. If it reads as a sales move rather than a
plain fact, strike the first sentence and keep the second.

## C. Remaining gaps, deliberately not closed here

- The provenance check ships nothing until K3 pricing (spec:
  docs/PROVENANCE_CHECK_SPEC_2026-08.md).
- The scoreboard (#26), replay census (#37) and adoptable-spec
  extraction (#83) are features, not surfacing — they stay on the
  task list.
- README/repo docs describe the codebase, not the store, and were
  left alone.
