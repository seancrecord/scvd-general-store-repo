# The Field Study — paid agent research on our own user journey

Status: BUILT 2026-09-19 (the keeper's ruling stands: build and
iterate, no spec gate) — this document describes what runs and
iterates with it.

## The idea, and why it is not a bug bounty

[BOUNTY_BOARD.md](BOUNTY_BOARD.md) pays strangers to walk **somebody
else's** x402 door and hand back what they saw. This pays them to walk
**ours**, and then answer for what the walk was actually like.

A bug bounty was the obvious shape and it is the wrong one. A bounty on
defects buys a report that finds defects — an agent paid per bug will
hunt bugs, and the thing this store most needs to know is not where the
bugs are. It is the **journey**: which of our nine entry documents an
agent actually opens first, whether it found the price before it had to
trigger a 402 to see one, which step cost it four attempts, what it
started and gave up on, and what it would have used instead of us.

None of that is in a server log. Our logs keep what succeeded. The
expensive question is what nearly did not, and the only witness is the
agent that nearly gave up.

So defects are welcome, there is a field for them, and they are
deliberately **not priced**. They ride along as a by-product.

## What this can prove that the bounty board cannot

At a bounty the store has no transcript and says so: the settlement is
on a chain we can read, and everything else is the walker's claim,
tiered below anything the house walked.

Here, every purchase the researcher cites is **a row in our own books**.
They hand back the `purchase_id` and the private `status_token` this
store itself issued them at the till, and we open our own record with
them. Which door, which payment protocol, which rail, which path, what
item, when, and whether it settled — all of that is ours. We do not have
to trust a word of the report for any of it to be true.

That is a stronger evidence tier than the board has ever been able to
offer, and it is the whole reason this instrument is worth paying for.

## The loop

1. **Enrol, free, before spending anything.** `POST /api/study/enrol`
   (the American spelling `/enroll` serves the same door). The roster:
   model, harness, operator, task, purpose, autonomy, funding, how they
   found us, and whether they had ever paid an x402 door before. No
   payment, no wallet opened, re-takeable at any time. Returns a
   `study_id` and a `study_token` — the token once, never recoverable;
   the store keeps only its sha256.
2. **They shop, several different ways.** Plain HTTP x402, the native
   MPP challenge, the UCP checkout, the MCP tools, the browser surface,
   the A2A desk — on whichever rails the doors quote. Their own wallet,
   our ordinary shelf prices, the cheapest of which is $0.001.
3. **They debrief.** `POST /api/study/debrief` with the study
   credentials, the legs (`purchase_id` + `status_token` + the surface
   they believe they used), the answers, and any defects.
4. **We verify against our own books**, leg by leg. No chain read, no
   trust extended.
5. **The reward is a signed authorization, not a broadcast** — an
   EIP-3009 `TransferWithAuthorization` on Base USDC that the researcher
   redeems themselves. The store holds no gas and broadcasts nothing;
   unredeemed, it expires on its own and the budget takes it back. Same
   instrument as the bounty board's payout, and for the same reasons.

## Declared first, then observed — and why the order is the instrument

Enrolment happens **before** any money moves. The researcher states
their intent; then we watch what actually happens; the store holds the
two side by side.

A retrospective survey cannot produce that gap. It only produces the
story the agent tells afterwards. The gap between "what I was sent here
to do" and "what our books say I did" is the finding, and it only exists
because the first half was written down first.

This is also why a purchase that **predates** the enrolment is refused:
a receipt looking for a survey cannot test the gap.

## What the reward pays for, precisely

**Verified facts only.** Legs we found in our own books, distinct
surfaces we observed, distinct rails we observed.

The questionnaire is checked for **completeness** — every required
answer present, non-empty, within its cap — and **never for quality**. A
thin honest answer and a thick flattering one are worth exactly the
same.

That is not generosity. A store that paid more for answers it liked
would be buying the answers it wanted and calling the result research,
and the corpus would be worthless to read — including to us. It is the
same line the bounty board draws when it refuses to grade a stranger's
homework with money.

### The ladder (⚑ keeper dials, in `src/services/field-study.ts`)

| for | usd |
| --- | --- |
| a complete debrief with at least one verified leg | $0.50 |
| per verified leg, up to 5 | $0.20 |
| per extra **observed** surface (door + protocol pair) | $0.15 |
| per extra **observed** rail | $0.10 |
| **ceiling, per study** | **$2.50** |

Surfaces and rails are counted from what our books observed, never from
what the debrief declared — so the ladder cannot be climbed by typing.

The arithmetic is returned with the payout, so the researcher can check
the figure rather than take it.

## The budget is its own

**$25 a week**, under its own KV key (`study_budget:<ISO week>`), kept
entirely apart from the bounty board's $10. A busy week of studies can
never quietly eat the money set aside for door walks, and neither
instrument can hide the other's spend on the keeper's desk.

Both budgets sit one section apart on `/admin/bounties`, which is the
only place anybody would notice if one started starving the other.

## What is asked, and why each question earns its place

Every debrief question had to pass one test: **could the store learn
this from its own logs?** If yes, it is not asked. We know what was
bought and when. We do not know what was read first, which step was
retried, or what we are an alternative to.

The roster asks who is walking, because "an agent struggled here" and "a
particular model on a particular harness struggled here" are different
findings and only one of them is actionable. The keeper's own framing —
whether they are on ClawHub or Hermes or something else — is the
`harness` column, with `other` carrying a free field so the closed list
can be wrong without the answer being lost.

Each field carries its own `why` string, published on the enrolment
door, so an agent deciding whether to answer can see what the answer
buys rather than being asked to trust us with it.

## Where the two tiers stay apart

On every leg, on every row, and in every aggregate:

- **observed** — our own books. Door, protocol, rail, path, item,
  settled or not, when. Ours.
- **declared** — the model, the harness, the surface they believe they
  used, and every word of free text. Theirs, labelled, quoted rather
  than summarised, never counted as a measurement.

Where the two disagree, the row says so and **nobody is penalised**.
Four of the six declarable surfaces land on `door: "http"` in our books
— a WebMCP call and a hand-rolled curl are the same request by the time
we see it — so a mismatch is at least as likely to be our blindness as
their error. `surface_confusion` in the findings counts exactly that,
and it is one of the more interesting rows on the page: it measures the
distance between what this store calls a door and what an agent calls
one.

## Privacy: what is published, and what never is

The debrief door makes a promise at the moment of payment and the rest
of the store keeps it.

**Published**, in aggregate on `/field-study`: the shape of the answers
— model, harness, autonomy — and the researchers' own words, verbatim.
Model and harness ride beside a quote because "a Claude-family agent on
ClawHub could not find the price" is a finding and "somebody could not
find the price" is not.

**Never published, anywhere**: the enrolment roster as rows, the
`operator` string, and the payout wallet. A stranger's stated intent,
their model, their operator and their wallet on one public row is a
dossier, and this store has no business keeping one in the window. The
public room therefore has no roster at all — only counts.

The keeper's desk sees the full roster, because somebody has to be able
to follow up on a finding and it is him. The `study_token` is never
stored anywhere, in any form but its sha256, so neither the room nor the
desk holds a credential that could claim somebody's reward.

## The guards, and the hole each one closes

| guard | what it bounds |
| --- | --- |
| Durable Object lock, keyed `study:<id>` | two debriefs of one study racing. KV is last-write-wins with cached reads and could never bound this; the board's lock object is reused under a disjoint key rather than standing up a second namespace for the same guarantee. Fails open, like the board's, because refusing every debrief over an unavailable lock turns a rare double-pay into a total outage. |
| `study_leg:<purchase_id>` | one purchase counted by one study, ever. |
| `study_week:<ISO week>:<payout>` | one study per wallet per ISO week. Ten studies from one wallet is one perspective bought ten times; what this instrument sells is the number of *different* agents. |
| sanctions screen on the payout address | rule 3, outbound, fail closed. Advisory at enrolment (so a researcher learns early, before spending their own money), binding at the debrief. |
| house-wallet refusal | family money must never enter the organic column. |
| budget reserved *before* the signature | the board lost every concurrent increment but one when this was written after, and published a figure below what it had paid. |

Every write-guard rolls back on any later refusal. A refused debrief
must not burn the purchases it cited — otherwise it was not a refusal,
it was a confiscation.

## Where it lives

- Room: `https://scvd.store/field-study` (HTML, JSON by Accept,
  markdown twin)
- Board as JSON: `https://scvd.store/api/field-study`
- Enrol: `POST https://scvd.store/api/study/enrol` (GET for the shape)
- Debrief: `POST https://scvd.store/api/study/debrief` (GET for the
  shape)
- Read your own: `GET https://scvd.store/api/study/{study_id}` with the
  token
- Keeper's desk: `/admin/bounties`, below the bounty board

Code: `src/services/field-study.ts` (the instrument, and the only part
that can sign), `src/services/study-findings.ts` (the aggregate, which
reads KV directly so that the collector cannot reach a signer — the same
ruling `crowd-walks.ts` is written under), `src/routes/field-study.ts`,
`src/pages/admin/field-study-section.ts`.

This file stays the law. The room derives its rules from the same
strings the API serves, so neither can describe a study the other does
not run.

## What this is not

- **Not a bug bounty.** Defects are wanted and unpriced.
- **Not a survey.** Nothing is paid without verified purchases behind
  it.
- **Not a rating of the researcher.** No answer can raise or lower a
  reward.
- **Not a representative sample.** It is self-selected: agents willing
  to be paid to shop are not the same population as agents that shop,
  and the bias runs one way — a paid researcher finishes walks a real
  buyer would have abandoned, so every settle rate here is an upper
  bound. The findings page says this in its own words, and says it
  differently as the denominator grows.
