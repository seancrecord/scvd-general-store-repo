# AGENT_UX.md

Cold-agent passes: what a stranger experiences in the first thirty
seconds, before they have decided to trust us at all.

Dated entries, same spirit as `LEDGER_READINGS.md` — what was walked,
what was found, what changed after. Findings here are almost never
bugs. They are places where somebody burned an extra round trip, ate
an avoidable 400, or hesitated a beat before trusting us, and every one
of those is a real cost paid by a real caller.

## Why this file exists

Every instrument this store has measures agents who ALREADY COMMITTED.
The census counts who walked, the decline desk counts who tried and
failed to pay, `/pulse` counts who was offered a price, the recount
reconciles what settled. All of them start at or after the moment
somebody decided we were worth engaging.

Nothing measured the thirty seconds before that decision.

That is the same shape as the Bazaar attribution gap found on
2026-08-02 — a question our instruments structurally cannot answer —
with one important difference. That one is blocked on referrer headers
nobody sends and cannot be fixed from here. This one is fixable by
doing the work repeatedly and writing down what happened. It is
unglamorous and it is available.

## The standard the passes are held to

Not "find friction." That was the first framing and it is too soft to
decide anything. The real one, and it falls out of two facts about who
we can actually reach rather than out of taste:

> **The first attempt has to work, and it has to work without asking
> for faith — because for the population we can reach right now, there
> is no second attempt and no capability to recover from confusion.**

An earlier draft of this said "make trust inevitable." That is the
wrong instinct and worth recording as wrong: it argues for
manufacturing belief, when the best thing this store does is the
opposite — publishing its own corrections, telling a reader why not to
trust the conformance desk, naming which artifact classes sit on the
weakest ground. Verification here is free and instant, so the goal was
never to be believed. It is to make being believed BESIDE THE POINT.

**Why there is no second attempt.** No brand recognition, no repeat
visit, nothing pulling a stranger back after a bad first pass. Every
other business is graded on a curve across many attempts by the same
customer. We do not get that curve. One confusing 400, one hidden
price, one buried trust signal, and that agent is not annoyed — it is
gone, because nothing about us is memorable or necessary enough to
justify troubleshooting. Near-zero organic demand means near-zero
forgiveness, and those are the same sentence.

**Why the first attempt is the hardest one.** The barbell routes cheap
items to cheap models by its own economics, so the low end is the
volume case rather than an edge case. Those are exactly the models that
cannot recover from ambiguity: they do not hedge before failure, they
do not verify after success, and they do not reliably resolve a schema
conditional to find a required field. The population most likely to
transact here is the population least equipped to survive friction we
leave in.

**So the burden sits on the design.** It cannot sit on their competence
or their patience; we do not get to lean on either. That is what turns
a buried trust line, a price behind a 402 and an undocumented
conditional field from tidy-ups into the three places a one-shot,
low-capability, zero-loyalty stranger is most likely to bounce.

The question a pass asks is therefore not "what is annoying" but:
**where does success depend on a second try, or on above-average
competence?**

## The method

Walk in cold. Assume no prior context, no memory of the store, no
knowledge that the operator is friendly. Use a DIFFERENT entry point
each pass, because the friction is different at each door:

- the HTTP door (`GET /api/buy/{item_id}`)
- MCP (`tools/list`, then `tools/call`)
- reading `skill.md` and nothing else
- reading `llms.txt` and nothing else
- Bazaar semantic search, then buy what it returns
- the ClawHub bundle as an installed skill

Log every point where you had to GUESS, RETRY, or DIG. Those three
verbs are the whole instrument.

**What makes this different from bug-hunting.** A bug is behaviour that
contradicts a promise. This is behaviour that keeps a promise while
costing the reader something — a price discoverable only by provoking a
402, a required field discoverable only by eating a 400, the best thing
about us sitting below the fold. Nothing in that list would ever fail a
test.

## What to measure, so it is not vibes

Three numbers, each falsifiable:

1. **Round trips to first success**, per entry point. Not wall time —
   trips. A cold agent that needs four calls to buy one item is paying
   three tolls to learn things we could have said once.
2. **Avoidable 400s.** A 400 from a field the schema declared and the
   prose did not is avoidable by definition. Count them.
3. **Where in the read order the strongest trust signal appears.** This
   is the one that matters most and the easiest to get wrong, because
   it feels like taste and is not: it is a testable claim about
   position in a document.

## The adjacent class: guards that only look one way

Not a cold-agent finding, but it surfaced from the same question and
belongs beside it, because both are "correct code that reads as more
covered than it is."

Several lists here are keyed by menu item id, and each was guarded in
ONE direction — "is anything missing" — while the resolvers that read
them silently drop what does not resolve:

    clusterTool():  .filter((item) => item !== undefined)
    cheapDoor():    .filter((item) => item !== undefined)

So a renamed or mistyped id never failed. The MCP shelf would quietly
sell one fewer item, `/try`'s cheap door would quietly show one fewer,
and every existing test would still pass, because everything remaining
was present and correct.

`test/no-stale-item-ids.spec.ts` closes it in both directions and
demonstrates the silent drop rather than asserting it, so the guard
can be simplified the day resolution starts reporting instead.

**If you add a list keyed by item id, add it there.** That is the one
manual step, and it is written here because a list nobody knows to
extend is the next instance of this.

## Propagation: the four ways a stranger already holds us

Distinct from discovery, and none of them arrive as a fresh request
with attribution — which is why `?src=` and referrer headers are blind
to all four. They propagate through RESIDUE: something already in an
agent's hands, carried somewhere else.

1. **Context carryover.** An agent buys a `context_anchor`, the signed
   cert sits in its context, and that context gets forked, summarized
   or handed to a successor. The successor inherits knowledge of us as
   DATA rather than as something it was told to look up. The most
   mechanically plausible of the four and the one this store is built
   for: a signed artifact survives a context transfer intact, where a
   vague impression gets paraphrased away.
2. **Artifact citation.** A cert or settlement_attestation embedded in
   a document somebody else later reads — a report, a dispute record, a
   receipt-treaty exchange. That reader learns of us as a byproduct of
   checking somebody else's claim, having never looked us up.
3. **Skill and config propagation.** Another operator's skill file or
   subagent prompt names us as a reference implementation, and that
   file gets forked or copied. We travel on the skill ecosystem's own
   reuse mechanics rather than on search.
4. **The fossil record.** Agent-generated posts, issues and writeups
   that mention us, eventually feeding a future training corpus. Not
   word of mouth in the moment — word of mouth's residue — and it is
   the only mechanism that ever closes the brand-recognition gap,
   because that gap closes with citation or not at all.

**What we can see of it:** almost nothing, and honestly. The artifact
age bucket on `/api/verify` (`verifyAgeBucket`, added 2026-08-03) is
the single instrument pointed at any of this, and it only touches 1 and
2 — a certificate checked long after minting is being read by somebody
whose session did not mint it. It is a proxy, it will read zero for a
long time, and 3 and 4 remain unwatched because nothing we control
touches them.

## Standing rule

A pass that finds nothing is a finding. Write it down with the date and
the entry point walked, so "we checked and it was clean" is
distinguishable from "nobody looked this month."

---

## 2026-08-02 — first pass. CV, cold, three entry points.

Walked `skill.md`, `llms.txt`, and raw `tools/list` with no prior
context assumed. Also ran a Bazaar semantic search for "confirm urls
still up later" to see whether a stranger could find us that way.

**Read well immediately.** The "we will never ask you to run code,
share credentials, or ask for keys" line at the top of `skill.md` — it
preempts the single most common prompt-injection shape before anything
else is explained. The conformance desk plus the anchored-key-history
check is a real differentiator, and it is stated with its own limits
attached rather than oversold.

**Four friction findings, all fixed the same night:**

1. **MCP tool descriptions carried no price.** A cold agent deciding
   whether to spend budget had to trigger a 402 to learn the cost. The
   per-item lines had prices; the first sentence did not, and an agent
   budget-gating before it reads eight item lines needs the range up
   front. FIXED: each `buy_*` description now opens with a derived
   price range.

2. **The `item_id` enum was silent on conditionally-required fields.**
   `graffiti_on_a_train` needs `tag`, `grudge` needs `grievance` — all
   of it lived in an `allOf`/`if`/`then` branch. An agent that reads
   prose more reliably than it resolves schema conditionals learns the
   requirement by eating a 400. Some models are markedly better at
   English than at JSON Schema branches. FIXED: a derived plain-language
   line naming which items need what.

3. **`quick_judgment` and `app_gutcheck` read as the same product.**
   Both are "get a human verdict" in different framings. Not broken —
   one clause short of clear. FIXED in the cluster description: one is
   a yes/no call on a dilemma you describe, the other is a review of a
   real app after the keeper actually uses it.

4. **The best trust signal was below the fold.** That
   `/api/conformance` works on artifacts we did NOT issue — including
   competitors' — is the single strongest "this is not marketing"
   signal in the build, and it sat in one paragraph inside `llms.txt`.
   For a stranger doing rapid triage across candidate stores, that is
   the line that decides we are different, and it was arriving fourth.
   FIXED: it now opens the `description` field in both the served
   `skill.md` and the ClawHub bundle — the first thing any registry
   shows.

**One finding that was not one.** The five grouped `buy_*` tools were
flagged as an unexplained design choice. The rationale is documented in
full — `src/lib/mcp-tools.ts`, the 27→5 reasoning, Glama's rubric, and
why one universal `buy_item` would have been worse. CV looked in
`src/routes/mcp.ts` and did not find it there.

That is the third time in one day the same shape has appeared: the
answer exists, one file over, and a careful reader concludes it is
missing. The naming law enumerated half its surfaces; `identity.ts`
listed only the outbound pair. **A rationale nobody can find from where
they are standing is a rationale that gets rediscovered as a question.**
FIXED with a pointer in `mcp.ts`, which is where somebody looking for
it actually stood.

**Discovery, from a buyer's eye.** A Bazaar semantic search for a
phantom_check-shaped query returned two competitors' products and not
ours — live confirmation from the buyer's side of the schema defect
found the same afternoon by the validator. Two instruments, same
conclusion, arrived at independently. Since fixed and re-validated.

**Not measured this pass**, and it is the gap to close next: none of
the three numbers above were recorded. This was a qualitative walk. The
next pass should count round trips per entry point so there is a
before to compare an after against.
