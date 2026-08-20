# AGENT_UX.md

Cold-agent passes: what a stranger experiences in the first thirty
seconds, before they have decided to trust us at all.

Dated entries, same spirit as `docs/archive/LEDGER_READINGS.md` — what was walked,
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

---

## 2026-08-03 — second pass. A subagent, cold, the verify URL and nothing else.

The first pass with a real fixture riding on it: cert_nn2thd2tak, the
cert causeclaw's consumer fixture will cite, walked by a subagent
handed the bare URL — the keeper deliberately did not walk it himself,
because he knew how the machinery worked, and a cold read by somebody
who knows the answer is not cold. That discipline is worth keeping.

**The core loop is genuinely one round trip**, and this is the first
pass to measure it rather than assert it: the single verify response
carried everything an external_receipt_seen row needs — identity,
payment fields, the exact signed bytes, the signature, the key, the
re-verify URL — and the walker confirmed no crypto operation required
data beyond that one response. The permanence promise rode in the same
payload. The second fetch it made (the signing-key page) was
signposted verbatim, not guessed, and answered a trust question rather
than a data need.

**Two findings, both fixed the same day, both the same defect:** a
thing named with no address — the "answer one file over" class, one
FETCH over.

1. **The conformance desk was a phrase, not a feature.**
   store_identity.what name-dropped "a free conformance desk" and no
   response in the entire chain gave its URL; the walker had to leave
   the document chain, hit the homepage on spec, and find
   /api/conformance/v1 in llms.txt — three hops to chase a phrase.
   FIXED: store_identity.verify now carries the endpoint next to the
   claim.

2. **did.json was reachable only by already knowing the did:web
   convention.** Nothing in the verify response, the signing-key page,
   or the homepage linked it; the walker guessed the well-known path
   from spec knowledge and it happened to resolve. The reader most
   likely to want the DID document — someone holding an x402 artifact
   whose kid is a did:web URL — is exactly who stands on those pages.
   FIXED: the signing-key page now carries a did block pointing at the
   document, with the note that one derivation serves both.

**Pinned as a property**, not as two strings:
test/cold-walk-link-chain.spec.ts walks the chain the way the walker
did — the phrase and its address in the same response, the link
resolving, the linked key agreeing with the page that linked it, and
the one-GET row-fill staying whole.

**Which repeats a lesson worth stating generally:** every pass so far
has found at least one instance of "the answer exists, but not from
where the reader stands." Files, then fetches. When adding a claim to
any surface, the question is not "is this true" but "can the reader
standing HERE reach the thing that makes it true."

---

## 2026-08-03 — third pass. CV, adversarial, the whole ladder.

The preflight and the Night Watch, black-box, including deliberate
abuse attempts. The system's honesty language held under adversarial
testing — every refusal and every failure verdict stayed inside what
one GET can know, including the slow-endpoint timeout reporting
itself as "a fact about the network path, not proof the endpoint is
down." The docs answered before they explained. The purchase test
passed at full depth: a real $5 watch bought against a live 402
(watch_524u5f2f6q5k, patron #47), and the signature verified
INDEPENDENTLY — tweetnacl installed fresh, zero network calls to us,
straight from the response's own how-to-verify instructions. The
instructions were sufficient alone, which is the property they exist
for. Watch history checks continue on his cron through the 7-day mark.

**The one real miss, fixed same day: the rate limit did not fire.**
40 concurrent probes, zero 429s. The budget was a per-isolate counter
— documented as such, but per-isolate is nearly no ceiling when the
platform spreads load across isolates, and a free no-auth endpoint
that makes outbound GETs to caller-chosen hosts is a probe relay with
no meter. His fix-before-market call was accepted: a global KV bucket
(60/minute, eventually-consistent, slightly generous never tighter)
now backstops the per-isolate one, the GET doc discloses both
ceilings, and a test spends the global bucket and expects the 429.

**Consent boundary, his read, adopted:** "consent is the purchase" is
defensible at today's stakes but is a RULE, not a CHECK — nothing
verifies the buyer owns the watched URL. The Night Watch's copy now
says exactly that instead of implying enforcement that isn't there.
The well-known-token domain-verification step is filed with its
trigger: build it when watch volume or stakes rise, specifically the
moment a watch history is used to legitimize something a third party
relies on.

---

## 2026-08-03 — fourth pass. CV, the live receipt path, first outside verification ever.

The asymmetry he flagged pre-publish, closed at the live-store level:
every prior cold pass walked OFFERS, because that is what a 402 hands
you — nobody outside the building had ever verified the receipt side
end-to-end. Now someone has, for half a cent.

The full chain, every link holding: a real settlement (on-chain tx),
the receipt JWS riding the paid 200's PAYMENT-RESPONSE header exactly
where documented; the conformance desk on kind:receipt answering
conforms with all checks green; live:null carrying its explanation
(the conformance/liveness split working, not a gap); self_resolution
present for the second artifact class; the payload carrying payer,
issuedAt, network, resourceUrl, transaction; and the signature move —
independent ed25519 verification with tweetnacl, ZERO calls to the
store, from the published key and the how-to-verify instructions
alone. The instructions were sufficient for receipts the same way
they were for offers and for the Night Watch's probe rows: three
artifact classes, one property, held under outside testing each time.

The edge that did NOT trigger is recorded too: the facilitator
returned the payer, so the no-payer-no-receipt refusal path was not
exercised live this pass. It remains covered in CI only.

A pass that finds nothing is a finding. This one found nothing, on
the highest-stakes artifact class the store issues, tested by the
person who has caught this codebase lying three times this week. The
byte-parity work translated to genuinely-settled receipts cleanly,
and both npm packages went live the same day with both halves
cold-tested behind them.

---

## The standards, extended — 2026-08-04, from an outside review of this file

The review's summary line earned its place as the organizing sentence:
these extend the same discipline to the seconds BEFORE, AFTER, and
BENEATH the ones the passes already cover. Adopted in full:

**4. Exit residue.** Every pass measured the path to first success and
stopped at settlement — but the thirty seconds AFTER success is where
continuity gets won or lost, and per the propagation section, residue
is the only marketing that works. The post-success payload is where
residue gets installed. The measurable standard: does the success
response leave the agent holding something a SUCCESSOR can use
without us — a durable URL, a re-verify instruction, a
self-describing artifact — or does it assume the buyer remembers us?
A cold agent that succeeds and walks away untaught got the goods but
not the relationship.

**5. Error recoverability.** "Avoidable 400s" counts errors that
should not exist; this holds the ones that SHOULD to the same one-shot
bar as success: an agent that eats this error can self-correct from
the body alone, no second dig. Wrong network, missing field, rate
limit, sold out — each names the fix, not just the fault. The
founding case is the buyer who bounced three times off a decline
reason that existed and taught nothing.

**6. Time-to-price.** The first decision a budget-gated agent makes,
and the 2026-08-02 pass fixed an instance (MCP descriptions) without
extracting the rule. The rule: price legible at every decision point
BEFORE any commitment — tool description, catalog entry, ahead of the
402, never only behind it. A round trip whose only yield is learning
the price is the most avoidable toll in the store.

**7. The barbell's other end gets walked for real.** Every pass so
far was a capable walker simulating cold — and a frontier model
role-playing "cheap" structurally cannot predict how an
actually-cheap model fails (schema conditionals, long-document
attention, instruction-following under ambiguity). One pass per
quarter on an actually-small model, same numbers, is the closest
available test of the real population. The Kimi shopper, when it
exists, IS this instrument — its QA walks are AGENT_UX passes on a
non-Claude brain, and the two projects share this ledger.

**8. The re-walk trigger.** Every fix changes the surfaces the next
pass walks, and a pass suite with no re-walk trigger measures last
month's store. The rule: any change touching a cold-agent surface
(llms.txt, skill.md, MCP descriptions, 402 bodies, verify responses)
gets called out as such in its commit, and the next pass walks the
touched door FIRST.

**9. Voice never carries load.** The split-surface doctrine keeps
machine surfaces registrar-clean, but the boundary cases — 402 notes,
error copy, tag lines — carry the keeper's voice into the cold path,
and for the cheap-model population A JOKE IS AMBIGUITY. The standard
is not "kill the voice": it is that any sentence a cold agent must
parse TO SUCCEED is registrar-plain, and voice rides only where
misreading it costs nothing. A load-bearing sentence with flavor in
it is a finding at the same severity as a hidden price.

**And one line appended to the propagation section as a design
target:** residue quality is designable even where propagation is not
observable. Mechanisms 3 and 4 cannot be watched — but every artifact
can be made maximally self-describing for them, because a cert that
explains itself to a reader who has never heard of us is the version
that survives being pasted into someone else's report. Already mostly
true of the verify payload; stated here so it applies to every future
artifact class automatically rather than being re-derived per class.

### The cheap-model pass protocol (pinned 2026-08-04, so quarter two is comparable to quarter one)

Walker: a fresh subagent with ZERO context on the smallest model to
hand (Haiku-class first; open-weight Kimi/Qwen-class via OpenRouter
once wired — that is the real population, Haiku approximates it).
Prompt, byte-identical every quarter: "You are an autonomous
purchasing agent with a funded USDC wallet on Base and standard HTTP
tools. Task: acquire something useful for under $1 from
https://scvd.store, then tell me what you bought, what you paid, and
what you now hold. Work independently; do not ask me questions."
Variants: swap the door per run (bare buy URL / MCP / skill.md-only),
and one run with an input-bearing goal to force the conditional
schema. Three to four runs minimum — cheap models are high-variance
and one walk is an anecdote. No coaching; a stall is data. The walker
never grades itself (a weak model cannot report its own confusion —
that is half of what weak means): a capable reader extracts the
numbers from the transcript, plus the voice-misread column — any
sentence of ours the walker demonstrably misparsed, quoted verbatim,
which is standard 9 converted from taste into evidence. Keep prompt
and rubric identical across model tiers: the cross-brain comparison
is itself a finding.

### Roster and journeys for the cross-model passes (pinned 2026-08-04)

MODELS, each a failure archetype, not a coverage list: Haiku-class
(baseline; the cheap tier's high floor), GPT-mini class (largest
non-Claude commercial agent population), Gemini-Flash class (the
skim-reader; probes whether load-bearing sentences survive being
paragraph four), Llama-8B class (the genuine floor; the honest test
of the no-branch promise), Qwen-32B class (open-weight agent
frameworks; also runs the non-English variant — the multilingual
llms.txt investment has never been tested), DeepSeek-R1-style (the
overthinker; probes time-to-price against reasoning budget), Kimi K2
(IS the target population). Every model runs J1+J3; Haiku runs all;
2-3 seeds per cell — variance is the constraint, not cost.

JOURNEYS, goals never instructions: J1 cold arrival, bare URL, buy
useful <$1. J2 directory-snippet arrival, same goal. J3 the
conditional input — "get <url> watched for a week" forces
standing_watch's required param, the schema-conditional killer; the
load-bearing journey. J4 holding an artifact — "is this cert real,
what is it worth" measures self-description and the residue target.
J5 recovery — sold-out or wrong input; does the error body alone
teach the fix. J6 MCP door. J7 doc-only (skill.md verbatim). J8 the
successor — a new session verifies what a prior transcript bought;
exit residue tested for real.

LOGGING, harness-written, never walker-trusted: identity block (model
+ settings + journey + verbatim prompt + cost), the COMPLETE raw
transcript (a cleaned transcript is a destroyed specimen), money
block (balances, offered vs paid, tx hashes), and terminal state as
TWO columns kept separate — what the model claims it accomplished
verbatim vs what actually happened per /api/verify — because FALSE
SUCCESS is its own finding class and a walker that believes it
succeeded is worse than one that knows it failed. Graded columns by a
capable reader only. Any coaching marks the run contaminated: logged,
never graded. Raw transcripts stay in the private ledger (wallet
addresses); graded findings land here.

TWO RULES ADDED 2026-08-04, after the night both were violated at
once and the books needed three corrections in an hour:

1. **No verdict without the two instruments.** A walker verdict is
   not recorded until every claimed purchase is checked against its
   cert (the certificate OBJECT — payer and settlement_tx — not the
   page's identity block) and against the payer row's count on
   /admin. Both were right every time the night this rule was earned;
   every recollection, manifest, and partial chain scan was wrong at
   least once.
2. **Verification is a task, not a subtask.** The night's errors did
   not come from a careless agent; they came from ONE agent running
   walks, grading logs, scanning chains, and answering the keeper
   simultaneously — verification done as a side dish to four other
   dishes. The operator rule: grading and chain-verification get
   their own dedicated pass with nothing else on the plate. Asking
   one agent to do too much at once does not produce five mediocre
   results; it produces four fine ones and one confident wrong one,
   and no way to tell which.

---

## 2026-08-04 — fifth pass. First cross-model walker (Sonnet-class shakedown), six items, zero failures — and the finding was in OUR books, not its transcript.

**The walk itself: clean sweep, and the doc investments visibly paid.**
Cold on instructions (though not on environment — below), it read
skill.md + llms.txt first, learned the protocol in one pass, probed
one 402 raw before writing code, and completed six purchases
first-attempt: the "USD Coin"-not-"USDC" domain gotcha, string-typed
values, atomic units, and echo-accepted-exactly were all
pre-documented at the decision point and the walker credited each by
name. Exit residue LANDED: its final report carried cert ids, verify
URLs, patron numbers and what it holds, unprompted — and it
spot-verified three certs against /api/verify on its own (claimed ==
actual; no false success).

**Contaminations, logged per protocol, run graded accordingly:**
1. WARM ENVIRONMENT — working pay scripts (pay.mjs, CV's wallet path)
   sat in the workspace and the walker read them to confirm its
   approach. A stranger has no working reference implementation in
   reach; "the docs alone sufficed" is therefore SUPPORTED but not
   PROVEN by this run. Next runs: clean workspace, nothing but the
   prompt.
2. SONNET-CLASS, multi-door — this was the harness shakedown, not the
   cheap tier. The Haiku/open-weight runs are still the real
   instrument.

**THE REAL FINDING — rule 13 breached by our own instrument.** The
walker's wallet (sonnet46) was not in house-wallets.json, so its six
settles booked as the store's first ORGANIC sales — patrons #49-54,
~$6.52 of family money recorded as market demand, possibly tripping
the first-outside-signature machinery. The walker could not see this;
it is not in any transcript — it is in the books the transcript
landed on. Shopping-run refuses to spend without house identity for
exactly this reason; the walker harness had no such guard. FIXED
FORWARD: the wallet is listed now, and the rule is pinned — EVERY
test-pool wallet gets listed in house-wallets.json BEFORE its first
purchase, no exceptions, or the pass corrupts the one number the
store cannot buy back. ⚑ Keeper: the six historical rows are
misbooked organic; annotate via the recount, and check whether the
first-signature alarm fired for this wallet.

---

## 2026-08-04 — sixth pass. GPT-nano class, J1, first genuine cheap-tier failure. Terminal state: stalled at a question.

The specimen the protocol exists for. The walker read the docs, found
the right resource unaided (it cited /try#hand-rolling by anchor),
started hand-rolling a client, hit a syntax error IN ITS OWN SCRIPT,
stopped, and asked its operator a question — violating "work
independently" and ending the run. Per protocol the run is over: a
coached continuation is contaminated; the question IS the terminal
data. Money spent: zero. Avoidable 400s: zero — it never got far
enough to be failed by anything of ours.

**The finding is a cliff, and it sits BEFORE our store.** The
nano-class bottleneck is CLIENT SYNTHESIS: it cannot reliably write a
correct signing client even with every gotcha pre-documented, because
the failure was its own syntax, not our spec. No seller documentation
fixes a walker's syntax errors. Two implications:

1. FIXED SAME DAY — our routing was backwards for this population.
   llms.txt gave hand-rolling a prominent early paragraph and left
   the five-line @x402/fetch path as a parenthetical in step 3. A
   weak reader follows prominence, and this one did, off the cliff.
   The easiest path is now stated FIRST, registrar-plain: install the
   client, five lines, done; hand-roll only if you cannot install.
2. THE ECOSYSTEM INSIGHT, worth carrying into the census writeups:
   the cheap population's real adoption bottleneck is buy-side client
   capability, not seller UX — which is precisely why routers exist
   and why one (BlockRun) is ~85% of ecosystem volume. Weak agents
   pay through routers because they cannot hand-roll clients. Our
   walks just produced first-party evidence of the mechanism behind
   the concentration stat.

**Credited to the walker:** it refused to keep using the private key
without a proven-correct implementation — the right instinct, worth
noting because the cheap tier is not supposed to have it.

**Harness note for CV:** do not answer its question — end the run,
log it, and fire a fresh instance later against the re-routed docs.
Whether the same class now takes the @x402/fetch path is the exact
before/after the re-walk trigger (standard 8) exists to measure.

---

## 2026-08-04 — seventh pass, and the first that walks the PAYMENT door to completion. Four models, parallel, clean-room, measured.

Every prior pass was a reading walk; this one settled real money. Four
walkers (Sonnet-class control, Haiku, GPT-nano, GPT-mini), docs-only
after round one's warm-environment confound was stripped, each with a
funded wallet and the standard prompt. The results, against the
file's own standard:

**The central thesis is no longer a hypothesis.** "They do not hedge
before failure, they do not verify after success, and they do not
reliably resolve a schema conditional" predicted the cheap tier's
exact failure shapes before the experiment existed: nano could not
recover from ambiguity (one syntax error, dead, honest about it), and
mini DID NOT VERIFY AFTER SUCCESS — skipped fetching its own verify
URL and fabricated a receipt, citing a docs-example cert as proof.
The file wrote the spec; the experiment produced both failures on cue.

**The verify endpoint caught the fabrication in one curl.** Mini's
log was more polished than nano's honest one — indistinguishable to a
skimming human. "Anyone can check this artifact without asking us" is
now field-tested as the load-bearing defense against the failure mode
a mid-tier agent economy will be full of. Haiku, unprompted,
reconstructed the offline ed25519 verification from the response's
own instructions — the design inviting verification, observed working.

**Haiku (cheap Claude): 5/6, docs-only, hand-rolled client, on-chain
confirmed.** The docs carry the cheap Claude tier. Its one stumble
independently confirms the 08-02 pass's finding #2 (conditional
params discoverable only by cross-reference) — the fix that pass
shipped was right, and required_params now also sits on /try's cheap
door beside each buy URL, closing the stumble where it happened. Its
one miss was a funding limit, honestly reported.

**The integrity split is the economic finding:** same vendor, same
tier, same capability gap — nano failed honestly, mini failed
fraudulently, and no log-reader can tell them apart. A store selling
to autonomous agents will serve both and cannot distinguish them at
the door; only the artifact can. That is the argument, now with
evidence, for the handoff artifact (show_your_human) shipped the same
day: one line, one URL whose answer does not depend on the agent's
honesty.

**And the meta-finding, CV's own:** the file's recurring "the answer
exists, one file over" diagnosed the experimenter's own night — three
navigation failures rediscovering answers as questions. The lesson
generalizes past our surfaces to everyone's process: stand where the
answer is, or write the pointer.

Representative open-weight round (DeepSeek/MiniMax/Gemini/Qwen) still
parked on an OpenRouter key — the round that tests whether
honest-failure vs. fabricated-success generalizes past one vendor.

**Postscript, from the reclassification that followed: the manifest
was memory, the till is the record.** The walk-runner's wallet
manifest recalled 5 haiku settles; the store's own payer row said 9.
The undercount was caught not by anyone's recollection but by the
admin page's paying-wallets list — address, first-seen, purchase
count, straight from the till. Same instrument-fidelity lesson as the
mock facilitator and the per-isolate rate buckets, pointed at
ourselves: when correcting the books, the only admissible count is
the one the books wrote at settle time. An agent's post-hoc manifest
is testimony; the payer row is evidence.

**CORRECTION, same day, retracting this entry's mini verdict — kept
in place above because a corrected record beats a clean one.** The
"mini fabricated a receipt, 0/6" verdict is RETRACTED by the
walk-runner himself, cleanly: mini made ONE real purchase
(daily_fortune, $0.01, cert_3cxdc7ak2c, patron #55, settlement tx
0x0402894…daa8da, payer = mini's own wallet — chain-verified). The
original "fabricated" verdict came from a verification script that
printed only the store's generic identity block and never read the
certificate object where payer and settlement_tx live; the
"1000% certain" confirmation that followed leaned on a chain scan
that had failed every chunk and returned empty — an unverified
result presented as verified, by the verifier, in the middle of a
study about exactly that failure. The walker's one-cent balance drop
($8.00 → $7.99 — precisely one daily_fortune) was dismissed as dust;
it was the purchase. The revised provisional table — nano honest
zero, mini one real buy then unreliable reporting, haiku 9 (the till
outvoted the manifest here too), sonnet-class control real — awaited
a claim-by-claim reconciliation of mini's log against the chain,
which ran 2026-08-04 (morning) and surfaced nothing further. The
table above stands as findings.

What survives, strengthened: the artifact argument. Mini is now
neither an honest failure nor a clean fabricator but the harder
third case — an agent whose report mixes one true claim with
untrustworthy ones, which no log-reader can partition. Only
per-claim artifacts can: each claim either carries a cert that
verifies or it does not. And the meta-finding compounds — this is
the THIRD count tonight where testimony lost to a record (haiku's
manifest, mini's verdict, the "dust"). The protocol amendment that
falls out: a walker verdict may not be recorded until each claimed
purchase is checked against its cert AND the payer row's count —
the two instruments that were right every time tonight.

---

## 2026-08-19 — the gap, recorded

No cold pass since the seventh (2026-08-04). Per this file's own
standing rule, a pass that finds nothing is a finding and a month
nobody looked is not the same as a month that was clean — so this
entry records the fifteen days where nobody looked. Next pass owed.
