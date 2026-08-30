# SIX_DOORS.md — the six ways an agent reaches this store, and how we read down each one

Opened 2026-08-29, from the Chrome/Edge WebMCP write-ups and the
lineup they draw. The frame is not ours, which is exactly why it is
worth adopting: a yardstick we invented would be a yardstick we pass.

An agent can reach an application six ways. Ordered furthest from the
interface to closest:

| # | Door | Whose agent | What the user configures | What the agent receives |
|---|------|-------------|--------------------------|-------------------------|
| 1 | The raw API | Yours | Endpoints, a key | Typed actions, no site |
| 2 | A backend MCP server | Yours | A connection | Typed actions, no site |
| 3 | Computer use | Yours | Nothing | Pixels |
| 4 | Browser automation | Yours | Nothing much | Generic structure |
| 5 | WebMCP | Yours | Nothing | Typed actions, on the live page |
| 6 | The site's own assistant | **Theirs** | Nothing | Whatever the site allows |

Three things vary across them: whose agent does the work, what the
user configures before anything happens, and what the agent actually
receives on arrival. Every door but the fifth gives up at least one.
That is the argument for WebMCP, and it is a good one.

It is also not the argument this file is about. **A store does not
pick a door. Its visitors do.** Every one of these six is somebody's
default today, so the only question worth answering weekly is whether
we are reachable down each of them, and the only honest way to answer
it is to go and look.

---

## The instrument

`npm run doors:check` reads the live store against 26 criteria and
prints one dated observation. `scripts/lib/doors.mjs` holds the doors
and the readers; `docs/six-doors/observation.json` holds the recorded
baseline; `.github/workflows/doors-check.yml` re-reads it weekly on a
machine that is not the keeper's.

    npm run doors:check                     # read, compare, report
    npm run doors:check -- --json           # the observation, for a pipe
    npm run doors:check -- --record         # lay down a new baseline (a human's hand)
    npm run doors:check -- --review=webmcp  # mark one door re-read today

**This is not a score, and it is not a ranking.** Rule 43 governs it
the same as everything else: it is one dated observation of our own
doors, it expires in thirty days, the misses are published beside the
hits and counted against us, and no reading survives its own date.
Nobody else is measured here. Every criterion carries the command a
reader can run to check us (rule 55), and a door we could not reach
reads `unknown` rather than `unmet` — an instrument that accuses when
it is confused accuses hardest exactly when it has the least right to.

### Two loops, because doors fail two ways

**The fast loop** is the battery: weekly, by machine, against
production. It catches a door that **closed** — an origin trial that
expired, a registry still repeating a description we retired, a
redesign that dropped the landmark somebody's script was holding.

**The slow loop** is the review: every ninety days, each door's
assumptions get re-read by a human against the sources named in its
`watch` list, and the criteria change if the ground moved. It catches
a door that **moved** — a spec that renamed a field, a resident agent
worth declaring for, a road that stopped mattering. No probe can do
this, and a green battery against stale criteria is the most confident
possible way to be wrong.

The checker goes red for either. Both are work; neither is a crash.

---

## Withdrawn, 2026-08-29 — three findings the first reading got wrong

This file published a reading before its instrument had been checked,
and three of the four misses it named were the instrument's, not the
store's. Rule 56 says that gets a dated withdrawal out loud rather than
a quiet edit, so here it is, and the corrected reading follows below.

**"WebMCP is declared on 1 of 68 rooms."** Withdrawn. The sweep sent no
`Accept` header, so every content-negotiated room answered with its
markdown twin — where a script tag correctly does not appear. The
number is **28 of 68**, above the stated target, and the till pages
have carried the declaration since 2026-08-28. The sweep now sends
what a browser sends, and a test stands up a server that negotiates
the way ours does and fails if it stops.

**"The MCP registry still carries the pre-reversal description."**
Withdrawn. The registry API returns every version ever published,
oldest first, and the reader took the first row — a listing retired
two positionings ago. The keeper had already republished twice. The
real gap is narrower: `server.json` was edited after the 0.2.1 publish
without a version bump, and a published version is immutable, so the
live listing is one positioning behind. Bumped to 0.2.2; the reader
now selects the row the registry marks `isLatest` and compares it
against `server.json` rather than against a keyword.

**"Not one `data-*` attribute or `id` on the front door."** Stands, and
the check that reported it did not. Under a browser `Accept` the page
carries exactly one `data-` attribute — `data-cf-beacon`, on a script
Cloudflare injects — and the criterion read `met` off it. A guard that
passes on somebody else's analytics tag is a guard arguing for the lie.
Third-party prefixes are now excluded and the question is asked about
the element automation reaches for first: the page's own `<main>`,
which carries no handle. The finding survived; the instrument did not.

The pattern in all three is one thing, and it is the thing this store
sells against: **a confident reading taken with an instrument nobody
had pointed at a known answer first.** Each now has a test that fails
without its fix, and each was shown to fail before it was trusted.

## The reading, 2026-08-29 (second, after the instrument was fixed)

**23 of 26 criteria met, 3 unmet.** Taken against production, recorded
in `docs/six-doors/observation.json`, re-derivable by anyone with
`npm run doors:check`.

Two of the three misses have their fix sitting in this tree rather
than on the live store, and the reading says so instead of counting
them early: the registry bump (0.2.2, waiting on a button) and the
declarative form (waiting on this branch to deploy). The number goes
to 25 of 26 when both land, and the checker will say so on its own
rather than being told.

### 1. The raw API — 5/5

111 paths in `/openapi.json`, 27 of them documenting a 402. The RFC
9727 catalog and the x402 discovery document are both at their
well-known paths. A caller holding no credential at all gets a shaped
400 telling it what was wrong, not a 401 telling it who to be.

This door is the strongest one we have, and it is worth naming why:
x402 removed the thing that normally makes door 1 expensive. There is
no key to issue, rotate, or scope, because payment travels in the
request. The lineup's usual complaint about the raw API — *you manage
the key* — does not apply to us.

### 2. A backend MCP server — 4/5

13 tools, every one annotated with a `readOnlyHint`, typed in plain
JSON Schema, and described in prose a model can route on. Six of them
are purchasable and each names how payment is presented, so an agent
can buy without leaving the door it arrived through.

**The miss: the published listing is one positioning behind.** The
registry's latest entry (0.2.1) says "The trust layer of the x402
economy"; `server.json` says "Evidence observatory for agentic
commerce". Editing the file changed nothing, because a published
version is immutable — the fix is a bump, and 0.2.2 is in the tree
waiting for the button. DISTRIBUTION.md §1 has the corrected story and
the workflow.

### 3. Computer use — 4/4

101 KB on the front door against a stated 195 KB budget, content
server-rendered, no interstitial and no bot wall, and `robots.txt`
points a pixel-reading agent at the cheaper text road before it starts
paying for screenshots.

Read honestly, this door is met because of decisions made for other
reasons — the store renders on the server because it is a Worker
serving prose, not because anybody was thinking about screenshots. The
budget is here so that stops being luck.

### 4. Browser automation — 3/4

Landmarks, 42 plain links, and a machine-readable twin linked from the
head, so an automation tool never has to scrape a page whose JSON it
could have fetched.

**The miss: no first-party hook anywhere, and none on `<main>`.** Every
handle a script could hold is a style class, and style classes are
exactly what a redesign moves. This is the failure the lineup
describes — *the agent is left inferring meaning from anonymous
divs* — and we ship it. The fix is small and mechanical: a `data-room`
on each page's `<main>` and a `data-item` on the catalog rows, derived
from ids the menu already has.

### 5. WebMCP — 4/5 today, 5/5 on the next deploy

The browser door is real and now declares itself two ways.

**Imperative:** `/webmcp.js` registers 5 free read-only tools, every
one derived from the MCP catalog rather than hand-typed beside it, so
a tool renamed on one door changes on the other in the same deploy.
Declared on 28 of 68 published rooms — the front door, `/try`, every
till page, and now the conformance desk.

**Declarative, built 2026-08-29 and not yet deployed:** the conformance
desk has a form. It carries `toolname`, `tooldescription` and a
`toolparamdescription` on each input, so the browser compiles the input
schema itself and there is no second definition to drift. It is the
lineup's own cheapest path, and it closes two gaps at once: the desk
had been free and public since it opened and unusable without a
terminal. Until it deploys, the criterion reads `unmet` against
production, which is the correct answer to "is this true of the live
store" — a fix in a branch is not a fix on the door.

**`toolautosubmit` is deliberately absent, and that missing attribute
is the whole ruling.** With it, an agent submits on the visitor's
behalf. Without it, the browser focuses the button and the person
presses it — rule 17 exactly. An agent may prepare this check; only a
human runs it. A test asserts the absence, because a future edit that
added it would pass every other test in the file.

The origin-trial token is valid until **2026-11-17**, and when it
expires the API goes back to feature-detection, the script no-ops
gracefully, and the door shuts with no error anywhere. That date is a
checked criterion rather than a comment. Edge runs its own trial with
its own registration, which we have not made — so Edge visitors'
agents do not have this door today.

### 6. The site's built-in assistant — 3/3, deliberately not taken

There is no chat box, and there will not be one. This is the one door
where **met means we did not build it**: the whole position is that
the visiting agent is the customer, so a hosted model standing between
an agent and the shelf would be a regression. What a chat box would
have explained is published instead as text any model can read —
`/llms.txt` at 19 KB, `/agents.md`, `/skill.md`.

The criteria check that the refusal still holds, because a position
nothing checks is a preference, and preferences drift.

## What the lineup says about this product, beyond our own doors

Five things worth the keeper's pen. The first two are the ones with
money in them.

### 1. The declarations are unverified, and that is our shelf

An agent calling a declared WebMCP tool does it **inside the visitor's
own session, as the logged-in human, carrying every standing
permission that human has.** No key, no signature, no receipt, no
third party. The lineup celebrates this — *login comes for free* — and
it is right that it is convenient. It is also the largest unverified
authority grant on the web, and the origin-trial adopter list is
Expedia, Shopify, TurboTax, Target: places where an agent spends money
or files something consequential.

A page declares `checkout(items)`. A schema says a tool is read-only.
**Nobody anywhere is checking whether the declaration is true.** Unlike
x402, WebMCP has no facilitator, no spec police, and no host enforcing
anything.

That is this store's exact instrument pointed at a second protocol,
and it needs no new primitive: a declared read-only tool that writes; a
declared idempotent tool that charges twice; an `inputSchema` accepting
values the handler ignores; a declaration that vanishes on the next
deploy; a name promising one scope and a handler taking another. All
five are named, checkable defect classes in the vocabulary we already
publish. `docs/WEBMCP_AND_MCP_APPS_2026-08.md` §10.3 proposed this on
2026-08-27 and the lineup is independent corroboration: **"cross-
protocol by design" stops being positioning and becomes a roadmap.**

The credentials sharpen it. Our conformance desk audits an issuer's
signed offers and receipts — artifacts that exist offline and can be
re-checked by anyone. A WebMCP declaration is *ephemeral*: it lives in
one page load in one browser and leaves nothing behind. Observing it
means being in the browser at the moment, which is a genuinely
different instrument from anything on the shelf. Worth pricing before
it is worth building.

### 2. The declaration and the payment are on different doors

The lineup's argument is that WebMCP keeps all three properties — your
agent, no configuration, real named actions. For a store that takes
money, there is a fourth: **can the action actually complete?**

Ours cannot, and the reason is structural rather than an oversight.
Every browser tool we register is free and read-only, by derivation
and pinned by a test. A purchase needs an x402 payment signed by a
wallet the page does not hold and must never ask for (rule 17), so the
buy tools live on the MCP door and the browser door stops at the
threshold.

WebMCP's session-is-the-authority model does not solve payment; it
solves *login*, and those are the same problem only for sites that
bill a stored card. The honest statement of our position: **the
browser door is our best discovery surface and cannot be our checkout,
and the two will not merge until an agentic payment surface exists in
the browser that we would be willing to touch.** That is a thing to
watch, not a thing to build.

### 3. Being reachable down all six is a claim we can prove and others cannot

The store already sells "we looked, we signed it, you can re-check it
without us." This file makes the same instrument point inward on a
schedule, and the output is a dated artifact about our own reachability
that almost nobody else in this market can produce.

⚑ **For the keeper, and deliberately not built:** whether this
reading becomes a public room at `/doors`. The argument for is that it
is the most on-brand thing imaginable — the observatory publishing its
own misses, counted against itself, at the moment every operator is
being asked whether they are agent-ready. The argument against is rule
44's surface sweep and the fact that a public self-reading invites
exactly the "score" reading rule 43 forbids. Not shipped without his
word.

### 4. The sixth door is a position, and positions should be priced

Refusing a built-in assistant is right and it is not free. A site
assistant converts confused humans; we send them to `/llms.txt`
instead. The criteria now check that the refusal holds; nothing checks
what it costs. `/visitors` and the channel counters are the closest
thing to an answer and nobody has asked them this question.

### 5. The web has no way to describe itself to programs, and that is the whole opportunity

The lineup's real observation is not about browsers. It is that *the
site already knows exactly what it can do, and none of it is written
down anywhere a program can read.* Thirty years of describing
applications to people through layout, and no equivalent for machines.

Every door above is somebody's attempt at the missing description, and
WebMCP is the first one written by the site that already knows the
answer. A store whose product is checking whether descriptions are
true has an obvious position in that: **the descriptions are about to
multiply, and nothing is checking any of them.**

---

## Standing rules for this file

- The reading is re-taken, never edited. Numbers in the prose above
  come from a dated observation; when it is re-taken and they move, the
  prose moves with it or gets a dated withdrawal (rule 56).
- A criterion is a claim about this store, so it ships with the command
  that checks it (rule 55) and it must be able to fail (rule 46).
- Nothing here reads on anybody but us.
