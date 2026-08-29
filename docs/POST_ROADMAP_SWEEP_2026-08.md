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
| Provenance check (T3) | NOT BUILT | — | — | — | price ruled $5/free 2026-08-29; ⚑ M5 copy drafted at B7, keeper's pen |

This change closes the two "this change" columns: the corpus landing
and /developers now name the trajectory, diff, wallet-facts and
standing-note surfaces.

## B. ⚑ DRAFT selling copy — keeper approval required (M5)

None of the following is wired anywhere. Each block names its target
surface. Approve, reword, or strike.

⚑ A NUMBERING COLLISION, RECORDED RATHER THAN TIDIED (2026-08-29):
there are two blocks numbered **B6** — the changelog note and the
patronage sell-up copy. The keeper has ruled on "B6" meaning the
sell-up copy, so renumbering now would move a heading he has already
cited. It is noted here instead, the same way HOUSE_RULES' numbering
gap was investigated and written down rather than closed. Cite the
sell-up block as **B6 (D5)**, which is how it was ruled on.

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

### B7. Provenance check shelf copy — ⚑ DRAFTED 2026-08-29, KEEPER'S PEN

The last thing standing between the provenance check's spec and a
build (docs/PROVENANCE_CHECK_SPEC_2026-08.md). Price is ruled: **$5**
for a query about somebody else's address, **free** for an operator
who proves control of their own, consent offer in v1. What is not
ruled is what the shelf calls it and how it asks.

**THE HARD PART, AND IT IS NOT THE PROSE.** This is the only thing on
the shelf that answers a question about a third party. Every honest
version has to sell the evidence and refuse the inference in the same
breath — because the inference is what a buyer actually wants and the
inference is the thing this store does not sell. A line that oversells
here does not just embarrass us; it makes us the reputation bureau the
whole design refuses to be. All three drafts carry that refusal. They
differ in how much of the buyer's real question they are willing to
say out loud.

Shared facts, not selling copy, common to all three (these go in
`constraints[]` and are stated rather than drafted):

- Give the address in the `address` query parameter, or a door's
  hostname to cover every address it has advertised.
- Free for an operator who proves control (EIP-191 signature, or the
  sha256 of the request served at your own `/.well-known/`).
- Covers only signed weeks the chain holds; weeks we did not observe
  are named as gaps, never omitted.
- Every line names the snapshot digest it derives from; the whole
  artifact re-derives from `/corpus.json` without trusting us.
- The subject's standing note, if they have filed one, rides on the
  artifact verbatim.
- One address or one host per purchase. One-off; nothing renews.

#### B7a. "The Provenance Check" — keep the working name

> Name a receiving address and this reads the signed chain back to
> you: every door that advertised it, in which week, with that week's
> verdict and any drift in the door's own declared terms — each line
> naming the snapshot digest it came from, so the whole artifact
> re-derives from the public record without trusting us. It is an
> account of what was publicly advertised, dated and signed. It is not
> a risk score, not an identity claim and not a compliance verdict,
> and the artifact says so on its face. Asking about your own address
> is free once you prove it is yours; five dollars is the price of
> asking about somebody else's.

> **402:** That'll be five dollars to ask about an address that isn't
> yours. Yours is free — prove it and ask.

*Plainest, and the name is the one the spec and the ruling already
use, so nothing has to be renamed downstream. Costs the most in
legibility: "provenance" is a word a buyer has to already know, and it
promises rather more than an advertisement history delivers.*

#### B7b. "The Wallet's Other Doors" — name the buyer's question

> One question, answered out of the signed record: what else has this
> receiving address been behind? Every door that advertised it, week
> by week, with that week's verdict and any change in the door's own
> declared terms, and the digest of the snapshot each line came from —
> so you can check the answer against the chain rather than against
> us. Custodial and platform wallets put unrelated doors behind one
> address all day long; we serve the observation and the inference
> stays yours. Not a score, not an identity, not a clearance. An
> operator asking about their own address pays nothing.

> **402:** Five dollars, friend. That buys the doors, the weeks and
> the digests. It does not buy an opinion about whoever is behind
> them.

*The most legible of the three — a buyer knows in six words whether
this is the thing they wanted. Also the most dangerous: the name is
the accusation, and an operator who finds their door named by it will
read the shelf as pointed at them. The body works hard to take that
back, which is a sign the name is doing something the body has to
undo.*

#### B7c. "The Company an Address Keeps" — the store's own register

> A dated, signed answer to the question the free surfaces count but
> never name: which doors have advertised this receiving address, and
> when. You get the hosts, the signed weeks, that week's verdict, the
> drift in the door's own terms, and the snapshot digest behind every
> line — enough to rebuild the whole thing from the public chain
> without taking our word for any of it. What you do not get is a
> judgment. Shared addresses are ordinary, custodians are common, and
> this store does not grade operators. An operator asking about their
> own address pays nothing.

> **402:** Five dollars for somebody else's address. Nothing at all
> for your own, once you have proved it is your own.

*Closest to the house voice, and the only name of the three that is
neither jargon nor an accusation. Costs legibility in a machine
listing: an agent scanning `menu.json` for wallet tooling will match
on the description, not on this. Rule 57.2 says the description
carries that load — but it is a real cost and it is being paid on
purpose.*

#### B7d. What I would pick, and the one line I would argue with

**B7c**, with B7b's second sentence grafted in if you want the
buyer's question said plainly inside the body. B7a's name is the
safest and the least honest: "provenance" implies origin, and what
this artifact holds is advertisement history, which is a narrower and
more checkable thing.

⚑ **THE PART TO ARGUE WITH:** all three say "an operator asking about
their own address pays nothing," and none of them says that the free
self-audit ends with an offer to publish the result. That is in the
v1 ruling and it is the funnel. Leaving it out of the shelf copy is
defensible — the offer appears at the moment it applies, not on the
shelf — but it is also the store selling a free thing without
mentioning what the free thing asks for afterward, and that is close
enough to the line to be your call rather than mine.

## C. Remaining gaps, deliberately not closed here

- The provenance check ships nothing until K3 pricing (spec:
  docs/PROVENANCE_CHECK_SPEC_2026-08.md).
- The replay census (#37) and adoptable-spec extraction (#83) are
  features, not surfacing — they stay on the task list. (#26 SHIPPED
  2026-08-29 as /doors, and not as the scoreboard its title asked
  for; this line named it as open until then.)
- README/repo docs describe the codebase, not the store, and were
  left alone.
