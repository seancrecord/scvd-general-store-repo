# WEBMCP AND MCP APPS — brainstorm, 2026-08-27

**Status: BRAINSTORM ONLY. Nothing here is built. Nothing here is
canon.** Opened at the keeper's direction ("no build here, need a
brainstorm sesh on these two items") against the two agent-surface
items an outside audit put at the top of the sheet:

- **P7 · WebMCP** — a declaration layer on top of a real verb.
  Scored Required 0/5 in two sections; the audit's headline sentence
  is *"lacks WebMCP support."*
- **P8 · MCP Apps** — `ui://` resources and tool `_meta` UI, so an
  MCP server can hand a rendered widget back into the agent host.
  Scored 0/4, and section 9, *"can a user act through an agent?"*,
  scored 0/100.

Same split as `OBSERVATORY.md`, for the same reason — advice must
never blur into shipped work:

- **STANDING** — true of the store today. Verified in this session.
- **PROPOSED** — argued for here, not built, not approved.
- **OPEN** — a question with no answer, or a keeper ruling.

> **⚑ A RULING LANDED WHILE THIS DOCUMENT WAS OPEN (2026-08-27).**
> Rule 17 is amended: the mechanism wording is gone, replaced by a
> property. **§8 is the record and it supersedes several sections
> below.** Those sections are annotated where they are overturned
> and otherwise left standing — the house records rather than
> rewrites, and the keeper asked specifically that the reasoning be
> kept, not just the conclusion. Read §8 last, not first: it is the
> answer, and §1–§7 are why.

---

## 0. The short version

1. **Both items need a ruling, not just P8.** The brief flags the
   rule 17 collision for MCP Apps and treats WebMCP as merely
   sequenced behind P2. That reading is wrong by one step: WebMCP
   tools execute *in the visiting agent's browser*, from a
   `<script>` we ship. Today the store ships none. §3.4.
   **→ RULED 08-27: one ruling, both items, and it went the way that
   unblocks them. §8.**
2. **The audit is scoring an API that is already half-renamed.**
   `navigator.modelContext` is deprecated in Chrome 150; the spec
   moved the surface to `document.modelContext`. Building to the
   audited name ships a deprecation on day one. §2.1.
3. **P8 is the better build and the plumbing is already in.** We
   declare `resources` and serve five of them. A `ui://` resource
   is one more entry in a list that exists. §4.2.
4. **There is a third door on the P8 ruling** the brief does not
   list — a card that *renders* at the approval moment and cannot
   *act*. It takes the on-thesis moment without putting our HTML in
   front of anybody's wallet. §4.5.
5. **One move is available today, needs no ruling, and costs
   nothing:** publish the absence as a counted coverage gap. The
   store already does this to itself weekly. §5.2.

---

## 1. The one fact that governs both

### STANDING — the store ships zero JavaScript

Verified 2026-08-27 across `src/pages/` and `src/routes/`:

- No `<script>` tag anywhere except `application/ld+json` blocks —
  four on the storefront, one on `/what`. Inert data, not script.
- No `<form>`, no `onclick`, no `addEventListener`, no module
  script, no Content-Security-Policy header — because nothing has
  ever needed one.
- `storefront-page.ts` carries a long comment about the one escape
  an inline `<script>` block needs. It exists to keep a `<` inside a
  keeper-written description from silently ending a JSON-LD block.
  It is not there because we run code. It is there because we
  *serialize* into a tag that a parser treats as code.

Every page the store serves is server-rendered HTML a `curl` reads
identically to a browser. That is not an accident of scale; it is
the same house position rule 17 states in words:

> 17. The store never asks a visiting agent to run code or share
>     credentials. Public endpoints only. skill.md states this.

**⚑ That is the rule as it stood when this section was written. It
was amended 2026-08-27 and the sentence above is now the OLD
wording, preserved in `HOUSE_RULES.md` beside its replacement. The
analysis below is why it was amended, so it is left as written —
but read it as the case for the ruling, not as current law. §8.**

And the sentence the store publishes wherever a visitor might land —
the MCP handshake, `skill.md`, `llms.txt`, `openapi.json`,
`AGENTS.md`, `/what`, the founding gazette, the practice counter, and
the canonical string in `wallet-safety.ts`:

> *"This store never asks you to run code, install anything, or hand
> over credentials, keys or wallet secrets. Every interaction is a
> plain HTTPS request to a public endpoint. If something claiming to
> be us asks for more than that, it is not us."*

Read the last sentence again. It is not a courtesy. It is an
**impersonation test we handed to every visitor**: anything asking
for more than a public HTTPS request is not us. Both P7 and P8 ask
for more than a public HTTPS request. That is the whole brainstorm.

### The distinction that decides both items

There are three different things the rule could mean, and the store
has never had to tell them apart because it never shipped any of
them:

| | Who executes | Whose decision | Rule 17 reading |
|---|---|---|---|
| **A. We ask the agent to run our code** | the agent, off our instruction | ours | forbidden, plainly |
| **B. We put code in a page the agent chose to load** | the agent's browser | the agent's, at navigation | unruled |
| **C. We return content a host chose to render** | the host, sandboxed, under its own consent gates | the host's, at install | unruled |

P7 is **B**. P8 is **C**. Rule 17 forbids **A** and is silent on the
other two — which is exactly why this is a ruling and not a build
ticket. The keeper wrote the rule when only A existed.

**⚑ The honest counter, stated before anyone has to find it:** the
impersonation test does not care about this taxonomy. A visitor who
has read our sentence and then meets our `<script>` has no way to
tell B from A, and the sentence gave them no vocabulary for the
difference. If we ship B or C, **that copy needs amending on every
surface that carries it** (rule 44's surface sweep, and it is the
prose half, the expensive one). Costing the copy change into the build is not
optional; it may be most of the build.

---

## 2. What these two surfaces actually are

Read 2026-08-27. Both have moved since the audit's rubric was
written, and one has moved since the audit ran.

### 2.1 WebMCP — ⚑ the audited name is deprecated

| Fact | State |
|---|---|
| Origin trial | Chrome 149, public, confirmed 2026-05-19 |
| Surface at trial ship | `navigator.modelContext` |
| **Surface in spec now** | **`document.modelContext`** — moved because tools belong to a *page*, not a *user agent* |
| `navigator.modelContext` | **deprecated in Chrome 150**, still shipped by the trial |
| `provideContext()` | **removed from the spec, March 2026** |
| Methods | `registerTool()` (lifecycle via `AbortSignal`), `getTools()`, `executeTool()`, `toolchange` event |
| Tool descriptor | `name`, `description`, `inputSchema` (JSON Schema), `execute` (async) |
| Handler return | `{ content: [{ type: "text", text: "..." }] }` — MCP's own content shape |
| Discovery | **the agent must already be on the page**, then introspect |

Three consequences the brief's scope limits do not yet cover:

1. **Feature detection is two-headed, not one.** `if
   (navigator.modelContext)` is the audited shape and the deprecated
   one. Any detection must read `document.modelContext ??
   navigator.modelContext`, in that order, and must survive both
   being absent — which is every browser that is not Chrome with the
   trial enabled, i.e. almost all of them.
2. **`provideContext()` is gone.** Anything sketched against a
   pre-March draft is sketched against an API that no longer exists.
   Verify at build time; this surface has moved twice in six months
   and will move again during an origin trial.
3. **The origin-trial token is a dated claim that expires
   silently.** A trial token is per-origin, per-milestone, delivered
   as a `<meta http-equiv="origin-trial">` tag or a header. When it
   lapses the feature does not error — it simply stops existing.
   That is precisely the failure mode rule 46 was written for: a
   guard asserting the token's presence must derive its expiry
   **from the token**, not from a date somebody typed. For a store
   whose entire product is dated observations that expire, shipping
   an unmonitored expiring claim would be a poor look.

### 2.2 MCP Apps — final, and further along than WebMCP

| Fact | State |
|---|---|
| History | SEP-1865, proposed 2025-11-21; first official MCP extension 2026-01-26 |
| Now | **Final**, folded into the extensions framework in the **2026-07-28** spec |
| Extension id | `io.modelcontextprotocol/ui` |
| Mechanism | tool `_meta` points at a `ui://` resource; host prefetches, reviews, renders in a **sandboxed iframe** |
| Transport | MCP's own JSON-RPC over `postMessage` — no bespoke protocol |
| Host support shipped | ChatGPT, Claude, Goose, VS Code |
| Servers in the wild | Shopify, Hugging Face, ElevenLabs |
| Required of servers | **text-only fallback for every UI-enabled tool** |

**⚑ Two byte-level details disagree across sources and must be read
from the final 2026-07-28 spec before any code:** the `_meta` key
(`ui/resourceUri` in the SEP text vs `ui.resourceUri` in later
coverage) and the MIME type (`text/html+mcp` vs
`text/html;profile=mcp-app`). Do not take either from this document.
There is also a live report that some clients drop tool-result
`_meta`, resource `mimeType`/`_meta`, and `capabilities.extensions`
on the floor — so the text-only fallback is not a spec courtesy, it
is the path a real fraction of traffic will take.

The security architecture is the part that matters for the ruling:
sandboxed iframe, host reviews the HTML before rendering, every
UI→host message is JSON-RPC and therefore loggable, and **the host
can require explicit user approval for any UI-initiated tool call.**
The host holds the gate, not us. §4.4 argues this both ways.

---

## 3. P7 · WebMCP

### 3.1 What the audit is measuring, and whether it is measuring us

WebMCP exists to give a *page* verbs, so an agent stops driving a
human's interface by guesswork — click the search box, fill the
filter, find the cart. It converts screen-scraping into a typed
function call.

The store has no interface to guess at. Every verb we have is
already declared, typed, and free to list, on surfaces built for
exactly this: a hosted MCP server at `/mcp` with ten tools and five
resources, `openapi.json`, `menu.json`, `llms.txt`, `skill.md`,
`agents.md`, the A2A card, `.well-known/x402`. An agent that wants
to act here does not need to visit a web page and introspect it.

So a WebMCP registration on `scvd.store` is, in actuation terms, a
**strictly worse wrapper around the MCP server we already run** —
narrower (browser-only), less reliable (origin trial), and
duplicative (same verbs, second definition, second thing to keep
true under rule 44). Scoring us 0/5 for lacking it measures
*conformance to a browser mechanism*, not the property the mechanism
exists to deliver, which we hold by another road.

**That is the fair critique of the audit. It is not a reason to skip
the item,** for one reason, in the next section.

### 3.2 PROPOSED — the real argument for P7 is discovery, not actuation

WebMCP's own discovery story is the weak part of the spec: *the
agent has to visit the page, then introspect.* Turn that around and
it is the argument for us. There is a population of agents that
arrive **in a browser**, holding a URL, that will never read
`llms.txt` and never dial an MCP server — because their operator
pointed a browsing agent at a link. For that population, a WebMCP
registration is the *only* channel through which our verbs exist at
all.

That is an **AEO and distribution** argument, and it belongs beside
`DISCOVERY_SURFACES` — not an "agents can now act here" argument.
Framing it as the latter, in copy, would be the store overclaiming
about a browser-only path while the real one has been open for
months. Rule 6: two audiences always.

### 3.3 The ordering constraint is right, for a sharper reason

**⚑ SUPERSEDED 08-27 (§8.3). The keeper's read is that this whole
section prices WebMCP as an expected-value bet when it is an
OPTION, and that under a moving substrate the option is worth
holding whether or not the verb story lands. P7 no longer waits on
P2. The argument below is kept because its design point still
stands — a page-state verb is the one WebMCP is genuinely better
at — but it is no longer a reason to wait.**

The brief says: do not build this on an empty page; a page with no
verbs declares nothing. True, and the sharper version is a design
rule worth keeping:

> **A WebMCP tool earns its keep only when the verb is one that only
> the page can do.**

`preflight(url)` and `verify(id)` are `fetch()` calls to public
endpoints. Registering them as WebMCP tools produces a tool whose
`execute` body is a worse version of a request the agent could have
made directly — plus a JS dependency, plus an origin-trial
dependency, plus a second definition of a verb that already exists
in four schemas. That is ceremony.

The verbs that *only the page can do* are the ones holding page
state: what the visitor has already checked this session, what the
shelf is showing right now, a form half-filled. **P2 is what creates
that state.** So the dependency is not "P2 gives us a button to
point at" — it is "**before P2 there is no such thing as page state,
and page state is the only thing WebMCP is better at.**"

Consequence for sequencing: if P2 ships a buy button and an
interactive instrument and *still* leaves no meaningful page state,
P7's argument does not improve — it just becomes buildable. Re-ask
the question after P2; do not treat P2 shipping as the answer.

### 3.4 ⚑ THE COLLISION THE BRIEF DID NOT FLAG

**⚑ RULED 08-27 (§8.1). The collision was real and it was the
finding that moved the rule. It is resolved in the direction that
lets both items proceed, and the impersonation-test debt it names
is now carried explicitly by rule 17 itself.**

The brief routes P8 to the keeper and treats P7 as sequencing. But
`registerTool`'s `execute` callback is **our JavaScript, running in
the visiting agent's browser, invoked by the agent.** An agent that
lands on `scvd.store` and calls a WebMCP tool *is running our code*.
There is no reading of P7 in which the store's pages stay inert.

Against rule 17's letter — "never *asks* a visiting agent to run
code" — P7 arguably survives: we ask for nothing; the agent
navigated to us and its browser did what browsers do. Against the
sentence we published on every surface, it does not survive cleanly,
because that sentence promises **every interaction is a plain HTTPS
request to a public endpoint** and hands the visitor an
impersonation test built on it.

**So P7 needs a ruling too, and it is the same ruling as P8**: does
"never run code" mean *we never ask you to execute anything*, or
does it mean *the public HTTPS surface is the entire relationship*?
Under the first reading both items are open. Under the second, both
are closed. Ruling them separately is how the store ends up with a
rule that means one thing on the web page and another on the MCP
server.

### 3.5 PROPOSED — if it goes ahead, the shape

**⚑ AMENDED 08-27 (§8.4). The constraints below stand, but the
PRINCIPLE behind them was wrong. "Small enough to be wrong about"
is a bet-sizing rule; the keeper's is a risk rule — smart enough
not to create risk or headache — and size is not the metric that
measures either.**

Behind a two-headed detection, read-only, and small:

- `preflight(url)` → the free shape check, exactly as `/api/preflight/v1`
- `verify(id)` → the free artifact verification, as `/api/verify`
- `store_guide()` → a pointer, returning the URL and nothing else

Constraints beyond the brief's:

- **No verb writes anything.** No guestbook, no bell, no letter — an
  unauthenticated page-resident verb that appends to a public record
  is an abuse surface, and every one of those already has a public
  endpoint that is rate-limited where it needs to be.
- **Every `execute` returns exactly what the HTTP endpoint returns**,
  no page-side interpretation, so a WebMCP answer and an HTTP answer
  can never disagree. One derivation, two doors.
- **No `buy_*` verb, ever, in a browser page.** Whatever the ruling
  on rendering, an actuation path to payment that lives in a page
  script is a different risk class from one that lives behind a
  signed x402 challenge over HTTPS.
- **The page is complete without it.** Not "degrades gracefully" —
  *identical*. The script adds a declaration and changes nothing a
  reader sees.
- Registration is one small module, feature-detected, failing
  silently and completely; no bundler, no framework, no dependency.
  If it needs a build step it is the wrong size.
- **Channel attribution rides the handlers, or the channel is
  invisible** (added 2026-08-28, the keeper's question "do we track
  it in admin?"). Tool registration happens entirely in the
  visitor's browser — the server never sees it, so "agents who saw
  our tools" is unknowable. What the server CAN see is a declared
  tool firing, because every handler calls a public endpoint: each
  handler tags its fetch with a channel marker and the existing
  channel ledger picks up `webmcp` beside `mcp` and `http`. No new
  admin surface; the machinery that already splits channels does
  the work. The before-number is the LOOK already on the desk:
  agent-shaped user agents on storefront HTML.
- **Distribution note, for whoever costs this**: nobody installs a
  WebMCP surface and no directory lists one — discovery IS arrival,
  so its entire funnel is whatever puts scvd.store in front of a
  browsing agent. The one setup act is ours alone: an origin-trial
  token for the origin (a meta tag or header, expiring — rule 46's
  guard applies) until the API ships stable. Visitors need nothing.
- Shipping any script at all means shipping a **CSP** in the same
  commit. We have none today because we had nothing to constrain.

---

## 4. P8 · MCP Apps

### 4.1 Why this is the better item

Three reasons, in order:

1. **It is on the surface agents actually use.** MCP Apps is Final in
   the 2026-07-28 spec, with an extension id, in four shipped hosts.
   WebMCP is an origin trial with a renamed root object. One of
   these is a standard; the other is a milestone.
2. **It sits where our traffic already is.** Our MCP server is a
   real door. A browser page, for us, is mostly where humans and
   indexers read prose.
3. **The audit's 0/100 on "can a user act through an agent" is the
   only score in the set pointing at something true.** A human whose
   agent is buying from us sees a JSON blob and a payment challenge.
   That is a real gap, and it is not a browser gap.

### 4.2 STANDING — the plumbing is already in

- We declare `capabilities.resources` and serve five real ones
  (`lib/mcp-resources.ts`) — the guide, the manual, the catalog, the
  criteria, the week's routing data. A `ui://` resource is one more
  entry in a list that exists and is tested.
- We already carry structured tool metadata and already use `_meta`
  on the wire in both directions (`x402/payment`,
  `x402/payment-required`, `x402/idempotency-key`).
- We do **not** declare `capabilities.extensions`. That is the one
  handshake change, and it is small.

Estimate, if the ruling permits: the protocol work is hours. **The
HTML is the build, and the copy is the argument.**

### 4.3 THE RULING, framed

**→ RULED 2026-08-27, with §8.5's test as its condition: THE THIRD
DOOR, plus narrow read-only cards. Not broad.** The card at the
approval moment shows everything — amount, chain, who signed the
offer, whether they were the shop — and has no button; the press
stays in the client's own chrome, rule 30's spirit applied to
somebody else's hand. Broad buys almost nothing the host does not
already provide, and costs the exact replacement sentence rule 17
now carries ("nothing from this store can act without your
decision"), which is writable copy precisely because no button of
ours ever moves money. **Condition: if the four-host render test
fails — if any host turns the gaps into fine print — the ruling
drops to narrow-or-nothing automatically, no new ruling needed.**

> **Does the house rule "the store never asks you to run code" forbid
> returning HTML that an agent host renders in its own sandbox?**

The three answers, with the third one added:

| | What ships | Payment surface | Rule 17 |
|---|---|---|---|
| **NARROW** | read-only cards — a `verify_artifact` verdict, a formatted shelf | none | intact |
| **THIRD DOOR** | a card at the approval moment that **displays and cannot act** | shown, never actuated | intact in substance; the published sentence still needs amending |
| **BROAD** | the approval widget on `buy_*` | ours, rendered, with a button | amended |

### 4.4 The arguments, both ways, honestly

**For BROAD.** The host holds every gate: it prefetches and reviews
the HTML before rendering, sandboxes the iframe, logs every
UI→host message as JSON-RPC, and can require explicit user approval
for any UI-initiated call. The user consented at install. Nobody is
asked to run anything; a host that already decided to support an
extension renders content under its own policy. And *"settlement
attestation, $0.004, on Base — approve?"* is the single most
on-thesis frame in the building: it is the exact moment where a
human should see what their agent is about to do, and today they see
nothing.

**Against BROAD, and this is the one that would keep me up.** Our
brand promise is not "we are careful with your keys." It is *nothing
claiming to be us will ever ask you for more than a plain HTTPS
request*. We handed that to every visitor as a test for
impersonators. A payment-approval dialog rendered by the merchant,
at the approval moment, is the most valuable phishing surface in
agentic commerce — and if **we** normalise it, we have spent our
credibility teaching agents a habit the rest of our surface exists
to un-teach. The store that says *"if something asks for more than
that, it is not us"* should not be the store that trains the
reflex.

Two smaller ones, worth the keeper's time:

- **The tension is not ours to resolve inside a widget.** Our x402
  flow is clean precisely because the *client* signs and retries with
  `_meta['x402/payment']`. We never touch key material and never
  want to. A widget at that moment does not need to touch the key to
  be wrong — it needs only to be the thing the human looks at while
  deciding. Rule 30's spirit: the press is the hand, and the hand
  should be in the client's own chrome.
- **Every host renders it differently, and some drop it.** With
  clients reported dropping `_meta` and `capabilities.extensions`,
  a broad build means the approval moment looks like a designed
  dialog in one host and a bare JSON error in the next. An approval
  surface that is inconsistent about *whether it appears* is worse
  than one that never appears.

### 4.5 PROPOSED — THE THIRD DOOR

The brief presents narrow and broad as the two outcomes. There is a
middle that takes almost all of broad's value and none of its risk:

> **Render the approval moment as an inert evidence card. No button.
> The card shows; the client decides.**

At the 402, the card displays what we already compute and sign:
what is being bought, the exact amount, the chain and asset, the
`accepts` on offer — and, since the 2.4 ledger work, **who signed
this offer and whether they were the shop.** Then it stops. The
approve action stays exactly where it is today: the agent's own
client, signing an accept and retrying the tool call.

Why this is the interesting answer:

- It puts our **evidence** in front of the human at the decision
  moment, which is the actual thesis, rather than our **button**,
  which is the actual risk.
- It is structurally incapable of being a phishing surface, because
  it has no affordance to phish with. That property is checkable by
  the host, by a reviewer, and by us in a test.
- It preserves rule 17's substance under the strict reading:
  **nothing we render can move money.** The public HTTPS surface is
  still the entire *action* relationship, even if it is no longer
  the entire *rendered* one.
- The 402 card and the `verify_artifact` verdict card become **the
  same component** — an inert evidence display with a date, an
  expiry, and its gaps printed beside it. One thing to build, one
  thing to keep true.

Named for the keeper's pen, because "narrow / broad" as posed does
not contain it.

### 4.6 ⚑ The design constraint that outranks the ruling

Whatever the ruling: **a card is a scoreboard shape.** Rendered
verdicts want to look like ratings — a badge, a colour, a letter, a
tick. Rule 43 forbids exactly that:

> 43. VERIFICATION IS DATED OBSERVATION ON ARTIFACTS, NEVER A SCORE
>     ON AN ACTOR.

A `verify_artifact` card that renders green is a score on an actor
no matter what the JSON underneath says, because the human reads the
colour and closes the window. So the card must carry, at equal
visual weight to the finding: **the date, the expiry, the
`not_observed` fields, and the coverage gaps counted against us.**

This cuts both ways and it is the strongest pro-MCP-Apps argument in
the building, worth more than the payment case: **the refusability
of our record is the part prose loses.** Text collapses "ready, as
of nineteen days ago, at L3, with four checks not observed" into
"ready". A card with a live expiry and the gaps set beside the
finding does rule-43 work that a paragraph structurally cannot. That
is a reason to build this that has nothing to do with an audit
score.

If the card cannot be built so that it reads as an observation
rather than a rating, **it should not be built at all** — narrow
included. That is a design gate, and it fails safe.

### 4.7 PROPOSED — narrow scope, if narrow is the ruling

- `verify_artifact` → the verdict card of §4.6, gaps at equal weight.
- `read_store_guide` → the formatted shelf, prices and capability
  lines, unchanged in substance from `menu.json`.
- Text fallback for both, treated as the primary path and tested as
  such — because some clients drop the extension entirely, and
  because that is what the spec asks of servers.
- One derivation only: the card renders from the same values the
  JSON carries. A card that can disagree with the tool result is a
  new class of untrue paper (rule 45).

---

## 5. The question under both items

### 5.1 Is answering an audit a reason to build?

Rule 19 is the evidence rule: **no new item without a demand tag.**
An outside rubric scoring us 0/5 is not a ledger 404, not a payer,
not a request. It is one reader's model of what a store like this
should have.

Both items should be judged on whether they serve someone who
arrives, and the honest answers differ:

- **P7:** serves browser-resident agents that will never read
  `llms.txt`. That population is real and currently unserved — and
  **unmeasured**. Before building, look: how many requests hit the
  storefront HTML from agent-shaped clients that never touch `/mcp`
  or `llms.txt`? We keep the logs. That number is the demand tag,
  and it is a LOOK, not a build.
- **P8:** serves the human standing behind an agent at the moment
  they should be able to refuse. Section 9's 0/100 points at that,
  and §4.6 says why it is real independent of the score.

### 5.2 ~~PROPOSED — the move available today, needing no ruling~~ STRUCK 2026-08-27

**Ruled against, and the line that decides it is worth keeping:
publish a gap where the person it protects will trip over it; never
where a critic will score it.** The MCP-reachability hole printed
inside `scvd://when` was the first kind — a caller hits that wall
mid-task — and it shipped, did its work, and self-deleted through
its own test the day the tools closed it. A "we lack WebMCP"
paragraph on the attestation page is the second kind: it answers an
auditor's rubric no customer ever raised, and every other counted
gap in the building is a gap in OBSERVATIONS, not capabilities.
Rule 4 holds. The section below stands as the case that was
considered and declined.

The store's method is to publish the gaps in its own coverage beside
the findings, counted against itself. So the cheapest honest
response to *"lacks WebMCP support"* is not to build WebMCP. It is
to **name the absence where we name our other absences** — the
attestation page, or the coverage surface — in the store's own
grammar:

> No WebMCP declaration; the store's verbs are declared at `/mcp`,
> `openapi.json` and `llms.txt` instead. No MCP Apps UI resources.
> Dated, and re-taken when it changes.

That is one paragraph, ships without a ruling, and converts an audit
ding into an instance of the discipline we sell.

**⚑ Rule 4 check for the keeper:** *no preemptive denials — respond,
don't announce.* Publishing "we lack WebMCP and here is why" reads
as a defense against a criticism no customer has raised. The
argument that it passes: written as a **coverage gap** it is the
same shape as every other gap we publish about ourselves, and rule 8
covers disclaimers that do real work. The argument that it fails: it
is a gap in *our capabilities*, not in *our observations*, and every
other counted gap is the latter. That distinction is the keeper's
to make, and it decides whether §5.2 is a one-paragraph ship or a
bad habit.

---

## 6. OPEN — for the keeper's pen

1. ~~**THE RULING, and it governs both items, not one.** Does "the
   store never asks you to run code" mean *we never ask you to
   execute anything* (P7 and P8 both live) or *the public HTTPS
   surface is the entire relationship* (both die)?~~ **STRUCK
   2026-08-27 with its evidence: ruled the first way, and the rule
   was rewritten as a property rather than patched as a mechanism.
   `HOUSE_RULES.md` rule 17, amended. §8.1.**
2. **If the rule survives in the second form: does the third door
   (§4.5) count as running code?** Rendering that cannot act is the
   narrowest version of C in the §1 table. If it is still "more than
   a plain HTTPS request," say so and P8 is narrow-or-nothing.
3. **If code ships at all: who amends the copy, and does the
   impersonation test survive the amendment?** The sentence is
   load-bearing security copy in `wallet-safety.ts`, `skill.md`,
   `llms.txt`, `openapi.json`, `agents.md`, `/what`, the MCP
   handshake, the founding gazette and the practice counter. Rule
   44's prose half, and rule 7 says the wording is non-delegable.
4. **Rule 4 on §5.2:** is publishing our own capability absence a
   counted gap, or is it a preemptive denial?
5. **Rule 19 on P7:** does the browser-agent population get a LOOK
   at the logs before it gets a build?

---

## 7. Parking lot

- **We are also a conformance desk for other people's surfaces.**
  If MCP Apps becomes load-bearing in agentic commerce, "does this
  server's `ui://` resource match what its tool actually returns"
  is a checkable defect class in exactly our vocabulary — and it is
  a *check we could run on others* without ever rendering anything
  ourselves. Possibly the most on-thesis thing in this document and
  it needs no ruling at all. Not costed.
- **WebMCP implementations are unverified** — filed as P9 in the
  08-08 landscape scan, still unscanned. Same observation: the
  interesting position may be checking the surface rather than
  adopting it.
- Whether an origin-trial token, being a dated claim that expires,
  ought to appear in our own freshness surface as a self-observation.
  Half a joke. Only half.

---

## 8. THE RULING (2026-08-27) — and what it supersedes

Recorded the day it was given, in the section it overturns rather
than in place of it. Everything in §1–§7 stays as written; this is
what is now true on top of it.

### 8.1 The ruling

The keeper, on the finding in §3.4 — that rule 17 was the only rule
in the building phrased as an implementation instead of a property,
which is exactly why it was the only one that went brittle when the
medium changed:

> **"This is why it's got to go."**

`HOUSE_RULES.md` rule 17 is amended the same day. The mechanism
wording — *"never asks a visiting agent to run code; public
endpoints only"* — is retired and preserved in place beside its
replacement, which is a property:

> **Nothing the store hands you can act without your decision, and
> the store never asks for credentials, keys, or key material.**

Three things the amendment settles, and they are the reasons it was
made rather than the ruling's decorations:

- **The absolute half stays absolute.** Credentials, keys, key
  material, wallet secrets: never, by any mechanism, in any medium.
  That half was never an implementation detail and the ruling does
  not reopen it.
- **Shape stops being the test; capability becomes the test.** A
  rendered or executable surface is no longer forbidden for being
  one. It is asked a question instead — *can the thing we handed
  you take an action you did not decide to take?* — and if the
  answer is yes it does not ship, whatever the sandbox promises.
- **The visitor's test became a debt.** The old wording handed
  strangers a free one-line impersonation check that worked
  *because* it was crude. The new rule owes a replacement and says
  so. Nothing served changes today — the store still ships no
  script, so the published sentence remains TRUE — but **no code
  ships under this rule until the replacement sentence exists and
  the keeper has put his pen to it** (rule 7).

The keeper's own framing, which is the better sentence and is
recorded here for whoever writes that copy: *let the chickens fly
the coop, but never hand them the thing that hurts them if we can
help it.*

**→ THE DEBT IS DISCHARGED AS FAR AS APPROVAL GOES (2026-08-27):**
the keeper picked from three drafts — *"Nothing from this store can
act without your decision, and we never ask for credentials, keys,
or wallet secrets. Anything that does either is not us."* The swap
onto the published surfaces waits, deliberately, for the first
rendered surface to ship — the current sentence is stronger and
still true, and words follow facts (rule 45). Recorded in rule 17
itself.

### 8.2 What the ruling does NOT decide

The rule 17 question was the gate. It is not the whole decision, and
one habit worth naming: a gate opening is not an instruction to walk
through it.

- **The P8 shape is still open** — narrow (read-only cards), the
  third door (§4.5, a card at the approval moment that renders and
  cannot act), or broad (the approval widget with a button). §4.3.
- ~~**The refusal test is still open** as a *rule*.~~ **STRUCK
  2026-08-27: it is `HOUSE_RULES.md` rule 54, drafted and awaiting
  the keeper's ink. See §8.5a.**
- **The rule 4 check on §5.2** — publishing our own capability
  absence: counted coverage gap, or preemptive denial?
- **The four-host render test (§8.5)** still gates any card, and it
  gates it *before* the shape ruling, not after.

### 8.3 P7 unblocks from P2

The keeper's read, and the correction to §3.3:

> *"LLMs are creating browsers now for agents to surf. Things are
> changing so rapidly and at the very least, even if I don't totally
> know why it's needed, I do know having hands in many pots when
> it's easy to do reduces my ability to be wrong or bet the wrong
> horse."*

§3.3 priced WebMCP as an **expected-value bet** and concluded low
value because it duplicates verbs we already declare. That is the
right analysis only if you already know which transport wins. Under
a moving substrate the correct frame is **option value**: what does
it cost, and what does it buy if we are wrong. Bounded and small
against unbounded and on-thesis is a good bet at almost any
probability, and the EV framing hid that.

Two arguments found in that exchange that neither the brief nor
§3 contained:

1. **WebMCP declarations are a thing to observe.** Anyone with a
   webpage can declare a typed verb and there is no conformance
   infrastructure behind any of it — a declared tool whose schema
   lies about what it returns is a named defect class in our
   existing vocabulary, on a surface nobody is checking. §7 parked
   this under MCP Apps; it is *stronger* for WebMCP, which has
   neither a spec police nor hosts enforcing anything.
2. **You cannot credibly run a conformance desk for a surface you
   refuse to implement.** We check other people's x402 doors and we
   run x402. Checking WebMCP declarations while having none is the
   exact shape of credibility gap this store is otherwise paranoid
   about.

And the thesis the keeper said he had not pulled together is
already in the store's own copy: **"x402 today, cross-protocol by
design."** Declining a protocol because we have not yet observed
demand for it is the store doing to itself precisely what it tells
customers not to do — **treating an unobserved thing as an absent
thing.**

**Consequence for sequencing, and it runs the opposite way from the
brief.** The expensive half of either item is not the code, it is
amending the impersonation copy across every surface that carries
it — and that is a **fixed cost paid once**. So the marginal copy
cost of the second item is near zero, which makes the cheap play
**both or neither**, not one and then the other. Doing P8 alone and
P7 later pays the hardest part twice.

### 8.4 The build constraint, corrected

§3.5 argued the build should be *"small enough to be wrong about."*
The keeper's correction:

> *"It doesn't have to be small enough to be wrong, it has to be
> smart enough to not create too big of a risk or headache — which I
> don't know that it would."*

He is right, and the distinction is not pedantic: **size is not the
metric that measures either risk or headache.** The two real
metrics, and both have design answers rather than budget answers:

| | The question | The answer, by construction |
|---|---|---|
| **Can it act?** | does anything registered do something an unauthenticated `curl` could not? | read-only verbs mirroring public endpoints add ~zero attack surface. And shipping any script means shipping a **CSP**, which we have never had — net risk *down*, not up |
| **Can it drift?** | can the declaration disagree with the endpoint? | derive the registration from the same source the HTTP route derives from, so it **cannot** drift. The house already does this everywhere (`MENU_ITEMS`, `ROOMS`) — rule 44's sweep does not grow |

Under those two, a build can be as large as it needs to be and stay
cheap. What stays genuinely expensive is unchanged and small in
number: **the copy** (§8.1's debt) and **the origin-trial token**,
which expires silently and must therefore derive any guard's expiry
from the token itself, never from a date somebody typed (rule 46).

His instinct that it would not create much risk or headache is, on
this reading, correct — *provided* the derivation discipline is in
the build from the first commit rather than added after the second
surface disagrees with the first.

### 8.5a The card family, and the maker's mark (keeper, 2026-08-27)

The keeper's read on the first render: **"this is excellent and I'm very
excited."** Three things came with it, and one of them is a design
ruling wearing a feature request.

**MORE CARDS.** The verdict card is one of a family, not a one-off.
The others, in the order they are worth building — each is the same
component pointed at a different record, exactly as every serious
item on the shelf is one primitive pointed at a different moment
(rule 23a):

1. **The verdict card** — `preflight` / passport. Built as a draft.
2. **A conformance result on somebody else's artifact.** The desk
   checks competitors. That is precisely where the conflict-of-interest
   line has to reach a human rather than sit in a field the agent
   summarised away.
3. **The shelf** — `read_store_guide`, prices and what each instrument
   does and does not prove.
4. **The 402 approval card** — §4.5's third door. Still unruled.
5. **A corpus round** — a week's coverage with the misses published
   against us, which is the one card where the gaps *are* the content.

**A REFERENCE TO US ON THE CARD — AND THE DISTINCTION THAT DECIDES
IT.** The keeper wants the card to be identifiably ours. The instinct
is right and the obvious implementation is forbidden, so the two need
separating before anybody draws anything:

> **A badge marks the SUBJECT — "this endpoint is approved" — and is a
> score. A colophon marks the ARTIFACT — "we took this reading" — and
> is a signature. They look alike. They are opposite objects.**

Rule 43 forbids the first absolutely. The second is not merely allowed,
it is what the store already does everywhere else: a hallmark on
silver, an assayer's stamp, a printer's colophon, a surveyor's
benchmark — every one of them says *who did the work and when*, and
none of them says *how good the thing is*. That vocabulary is the
store's own world and it is a better fit than any verified-tick could
ever be.

So: **a colophon, at the foot, never a badge anywhere.** Drafted into
the bench render as a small letterpress mark plus one line.

**THE ROTATING LINE — deterministic, per rule 22.** The keeper asked
for the small-blessings treatment: a rotating line that shows it is us.
The mechanism has to be the house's existing one, not novelty —
`fortunes.ts` is "one fortune per calendar day, same for every buyer
that day, a chalkboard, not a slot machine." Applied here that means
**the line is derived from the observation's own id**, so:

- the same observation always carries the same line, forever;
- the line is reproducible offline like everything else on the card;
- nothing on the card is random, which matters on an artifact whose
  entire claim is that it can be re-derived by a stranger.

**One constraint the drafts must respect, and it is easy to miss:**
the line never comments on the SUBJECT'S QUALITY. A wry line about the
endpoint undercuts the caveats standing beside it and turns the card
casual about a decision that is not. ⚑ An earlier version of this
sentence said the line must be "about us and our limits" — narrower,
and wrong: it produced a smug draft the keeper struck the same day. The
line may address the reader, the age of the reading, or the market. It
may not grade the subject.

⚑ FIRST DRAFTS, STRUCK 2026-08-27 by the keeper — "I don't love the
line." He was right and the fault was in the constraint above, not the
writing: "about us and our limits" corners every draft into
congratulating the store on its own honesty. The struck set, kept so
nobody re-derives it:

> ~~"We wrote down what we did not do, too."~~ — smug, and it explains
> the card's own mechanic (rule 2).
> ~~"Nothing here was decided. Something here was seen."~~ — same
> defect, wearing a better coat.

**THE CORRECTED CONSTRAINT** (now in rule 54): the line never comments
on the SUBJECT'S QUALITY. Everything else is open — the reader's day,
the nature of a dated reading, the weather of working in this market.
It is a fortune, in the drawer's voice, and a fortune addresses the
person holding it rather than the shop that wrote it.

⚑ SECOND DRAFTS, ALSO STRUCK 2026-08-27 — "still reads oddly." Right
again, and this time the fault was register rather than constraint.
~~"Somebody will quote this at you without the date."~~ is CONSTRUCTED:
it builds a little scenario, asks the reader to picture a third party,
and hangs on the odd preposition in "quote this AT you." Clever, which
is the tell. Rule 5 — if it wants a retweet, it dies.

**THE REGISTER, read off the drawer we already have.** `fortunes.ts`
does not do wordplay: *"The error message means exactly what it says
today. Read it once more, slower."* · *"An old assumption expires
today. You'll know it by the smell."* · *"Today's blocker is somebody
else's five-minute fix. Ask earlier than feels polite."* Plain
sentence, concrete, addressed to a person, wry without reaching. The
line is a fortune, so it should sound like the fortunes do — and if a
draft has to be admired before it is understood, it is not one.

**THE KEEPER'S LINE, 2026-08-27 — his pen, so this one is his and not
a draft:**

> ### "You know your own risk better than we do."

It is the only line in three sets that does rule 54's actual work
rather than describing it. The others all narrate the reading — its
age, its limits, what we did not climb — and narration is still the
card talking about itself. This one **hands the decision back**. It
does not tell the reader to be careful, or that our probe was
shallow, or that the date matters; it says the person holding the
card was always the one who knew the thing that mattered most, and
lets them do the rest. A card whose job is to make refusal easy ends
on the sentence that makes refusing obviously the reader's own call.

It also passes every constraint without visible effort, which is the
mark of the right one: no comment on the subject, no explanation of
the mechanic, no wordplay, plain sentence, addressed to a person.

⚑ THE REST OF THE DRAWER IS STILL DRAFT — the mechanism rotates, so
one inked line is a start and not a drawer. Rule 7 stands for the
remainder; these are candidates only, and the bar just moved:

> "We can only tell you what we saw."
> "The part you need is usually the part nobody measured."
> "It was true when we wrote it down."
> "One look, one day. That is all a look is."
> "Read it twice if it is going to cost you something."
> ~~"The date is the part people skip."~~ — plain enough, but it
> narrates the reading instead of handing anything back. Keep as the
> shape to beat, not as a line.

~~**OPEN for the keeper:** does the colophon carry the line at all, or
only the mark?~~ **ANSWERED 2026-08-27 — "I love it, I love adding the
house rule and rotation."** The colophon carries three things: the
mark, the deterministic line, and **a citation of the rule the card is
built under**. That last one is the keeper's addition and it is the
best idea in this section: the instrument prints the standard it is
held to, on its own face, where anybody looking at the reading can
also read the constraint the reading was taken under. It is the same
move as publishing the coverage gaps beside the findings, applied to
the rendering.

**THE MARK IS A STAMP AND HAS TO BE SET LIKE ONE.** ⚑ The first cut
looked off-centre and was, for a reason worth writing down because it
recurs anywhere small caps are centred: **`letter-spacing` puts its gap
AFTER the last glyph, and the browser counts that gap when it centres
the line.** Two lines at different sizes and different spacings
therefore settle at different optical positions while both layout boxes
measure perfectly symmetric — which is exactly what the first
measurement showed, and why reading the numbers alone would have
missed it. The fix is `text-indent` equal to the letter-spacing, which
pushes the ink back right by precisely the trailing gap, plus one size
and one spacing across both lines so any residue is identical on each
and they stay flush.

**THE MARK READS `SCVD / STORE`,** not `SCVD / OAK CITY` — the keeper's
call, 2026-08-27. Better than the town: it is the name and the address
at once, so a card screenshotted out of its host still tells a stranger
where to go and check. Oak City stays store lore (rule 39), off the
instrument.

**AND IT BECAME A RULE.** `HOUSE_RULES.md` rule 54 — drafted 2026-08-27
as 53 and renumbered at the merge, because the till rule (a buyer who
cannot pay is a design failure, 08-26) landed on main first and took
the number a day ahead of us —
and awaiting his ink: *every surface we render must make refusal easier
than acceptance.* Rule 43 says what a verdict IS; 53 says what it must
DO once drawn, because a record can be impeccable and its picture still
argue for a yes. The badge/colophon distinction rides in it as the
corollary on identity, and the deterministic line as rule 22's
mechanism applied to a card. §8.2's open question — whether the refusal
test becomes its own rule beside 43 — is struck by it.

### 8.5 The one test that still gates everything

**RESULTS AS THEY LAND (2026-08-27, the keeper's own laptop):**

| Host | Our ui:// card rendered? | Notes |
|---|---|---|
| **Claude Desktop** (claude-ai 0.1.0, protocol 2025-11-25) | **FULL PASS — round five** | Renders at full height: `size-changed` honored, the round-four fold gone. Screenshot-confirmed top to bottom — ladder with all four hatched NOT CLIMBED pills, cannot-tell-you list, conflict-of-interest with the trust line at full rust weight, and the colophon intact (mark, keeper's line, rule citation). Rule 54's eye test passes: the gaps and the age carry the weight the design gave them. **Dark, light, and narrow all observed and passing** — the light palette held (cream surface, rust trust-line, hatched pills legible), and the narrow window kept the ladder intact. Host one is complete. Root cause of rounds 1–3 stands recorded below: a static page never sends `ui/initialize`, and the host waits for it. |
| **VS Code** (Copilot Chat, agent mode, stdio) | **PASS** | Renders inline in the chat sidebar — an inherently narrow viewport, so this doubled as a natural narrow-window test: ladder intact, hatched pills legible, colophon complete. Dark observed. Setup fought back twice, recorded in the kit README: the add-server wizard mangled the command into a literal `v` (`spawn v ENOENT`) — edit `mcp.json` directly, `command` and `args` as separate fields — and an earlier round showed an agent with the repo as its open workspace will grep the fixture and run the server by hand in a terminal rather than call the MCP tool, testing nothing about rendering. Point it at the tool by name, from a non-repo window. Its summary kept the not-climbed list and quoted the misquote line verbatim. |
| ChatGPT | not yet run (tunnel required) | — |
| Goose | optional | — |

**CORRECTION, 2026-08-27, same day as the error.** An earlier
revision of this table said Claude Desktop rendered the card, on the
strength of a bracketed line in the tool result: *"This tool call
rendered an interactive widget in the chat. The user can already see
the result."* The keeper saw no widget. On the retry, the host model
itself established that the line is a STANDARD HOST MARKER (it
appeared on an unrelated Visualizer call too) — injected even though
no widget was visible to the human, and its presence caused the model
to skip its own rendering. This document then recorded the marker as
a render. The observation discipline this store sells is exactly the
one its author failed here: **a claim of rendering is not a render,
and only the human in front of the screen can observe the
difference.** The "card steered the narration" claim built on that
premise is RETRACTED — the model's good drift-forward narration on
run two came from the TEXT FALLBACK, not from a rendered card.

**What actually stands from the Claude Desktop runs — three findings,
each now stated against the evidence that supports it:**

1. **The handshake is real.** Claude Desktop advertises
   `io.modelcontextprotocol/ui` (mimeTypes `text/html;profile=mcp-app`)
   on local stdio servers — captured in `render-test-log.json`. What
   remains unobserved is any render.
2. **The host's render marker is itself an unverifiable claim** — the
   surface asserts "the user can already see the result" with no way
   for the model, the server, or anyone downstream to check it, and
   the assertion actively suppresses the fallback rendering it
   preempts. That is precisely the artifact-without-verification
   shape this store studies, found in the render pipeline itself.
3. **The strongest specimen is the model's own improvised card.**
   Told nothing had appeared, the model rebuilt a card from the text
   fallback alone — and its version kept the age huge ("19 days
   ago"), the expiry with "Then unusable", a "Narrow claim" pill, and
   the full not-climbed list. The refusability survived into a
   rendering WE NEVER DREW, because the text fallback carried it.
   What its card dropped: the checks vector, the conflict-of-interest
   block, the colophon, and the keeper's line — the identity and
   the self-indictment, exactly the parts only our own HTML brings.

~~**Diagnostic still open:** whether Claude Desktop ever fetched the
`ui://` resource.~~ CLOSED by the keeper's round-three trace: the host
prefetched the card (`resources/read` 100ms before `tools/call`) and
displayed nothing — which localized the failure to the iframe side and
led straight to the missing `ui/initialize`. Round four rendered.

**TWO HOSTS AT FULL WEIGHT SATISFIES THE RULING'S CONDITION.** The
§4.3 ruling was conditional on no host turning the gaps into fine
print. Two independent hosts — different vendors, different chrome,
one a desktop chat and one an editor sidebar — have now rendered the
gaps at the weight the design gave them. The condition is met; the
third door plus narrow cards stands. ChatGPT and Goose remain
worthwhile rows for the record, not gates.

**THE FUNNEL, OBSERVED WORKING END TO END (round five).** With the
full card rendered, the host model's narration did three things in
one breath, unprompted: refused correctly ("anyone quoting this as
'verified' is quoting it past what it says"), read the drift as the
actionable gap, and **routed to `preflight_endpoint` — the live free
tool this same branch shipped — as the one-call way to close it.**
Card → refusability → routing → free instrument. That is the entire
thesis of this document operating as a chain, on a laptop, on the
first day all the pieces existed.

**TWO MACHINE READERS, SAME COPY FLAG — production-card note, rule 7,
the keeper's pen.** Round three's model and round four's model, blind
to each other, both read "expires in 11 days" as a forward warranty —
*good until then* — the precise inference the card refuses. Round
four's phrasing of the fix is the keeper's to take or leave: *"an
observation of a past moment doesn't expire; what expires is the
store's willingness to serve it as current — 'stale after' or 'current
until' says the same thing without lending the observation a shelf
life it doesn't have."* Two independent model-readers converging on
one label is as clean as copy evidence gets. The same reader also
named the not-climbed list's job unprompted: it "turns L3a from
something a reader could quote as a pass into a stated ceiling" —
§4.6's design intent, observed working in the wild.


Unchanged by the ruling, and it comes before the P8 shape decision
rather than after: **build one throwaway verify card and render it
in all four hosts.** Hosts style these themselves. If the gaps and
the expiry render as small grey text under a large verdict, we
shipped a score and violated rule 43 while believing we honored it.

A TEST in the keeper's taxonomy, not a build. If refusal survives
four hosts' CSS, the shape ruling is easy. If it does not, the
answer is narrow-or-nothing and the argument was never needed.

---

## 9. THE TOOL-SURFACE AUDIT (2026-08-27) — and the routing resource

Opened on the keeper's question: *since it's tied to LLMs, does it make
sense to AEO the hell out of it — different FAQs and use cases — to make
it clearer to the LLM and more likely to pull it?*

**The instinct is right and the card is the wrong object.** In MCP Apps
the model reads the TOOL RESULT and the TOOL DESCRIPTION; the host
fetches the `ui://` resource separately and renders it for the HUMAN.
The spec requires a text fallback precisely because those are two
different paths. By the time a card exists the tool call has already
happened, so FAQ copy inside the card is invisible to the model that
decides, visible to the human as clutter, and in direct competition
with the unclimbed rungs for the attention rule 54 says they must win.
**Layout attention is zero-sum; a card gets shorter under AEO pressure,
not longer.**

The AEO surface for "will a model pull this" is, in order: the tool
`description`, the `initialize` instructions, the input/output schemas,
and the resources. All of which we own, and most of which were already
good — `verify_artifact` doing negative-space work ("NOT a conformance
checker for other x402 services") is worth more than another adjective,
because it prevents mis-selection. The line worth holding: **the win is
precision, not persuasion.** A description that gets us pulled for jobs
we do not serve buys a bad verdict and a story about a store that
oversold itself.

### 9.1 STANDING — what the audit found

| | Finding |
|---|---|
| **⚑ THE HOLE** | **The preflight and the conformance desk — the two FREE instruments the store's own positioning leads with — are not MCP tools.** Both are HTTP endpoints. An agent connected over MCP cannot reach our headline free instrument through the channel it is connected by. `verify_artifact` even steers away from it correctly ("NOT a conformance checker for other x402 services") — toward nothing, because there is no tool to steer to. |
| **FIXED** | `buy_simple` carried no `outputSchema` — the only tool in the catalog without one, and the tool placed FIRST among the paid ones *precisely because* a weak model reaches for something early and plausible. The tool most likely to be reached for by the least capable caller was the one that could not say what came back. Now derived from the same builder the clusters use. |
| **WATCH** | `buy_observation`'s description is ~9.7k characters against a whole-catalog payload of ~21k. One tool is nearly half the budget every client pays on every connection, before the model has decided anything. Guarded with a loose tripwire rather than trimmed blind — the shelf is the one thing a platform cannot commoditize and its description earns most of its length. |
| **FALSE ALARM** | Completion criteria looked absent on the buy tools. They are present, phrased "Completes in one call" rather than "Completes when". The regex was wrong, not the catalog. |

### 9.2 STANDING — `scvd://when`, the routing resource

The five existing resources say what the store IS, HOW to transact,
WHAT is on the shelf, WHAT a check measures, and WHICH doors worked
this week. **None answers the question a model holds at the instant it
picks a tool:** *I am in this situation — which of your things do I
want?* That is where selection actually fails, and it fails silently,
because a model that cannot route guesses or leaves rather than asking.

`src/lib/when-to-buy.ts`, served as `scvd://when` /
`which_instrument`. Fifteen jobs in a caller's words, each pointing at
the free instrument first where one answers, then at the shelf. Every
row's item name, price and selling tool is **derived from MENU_ITEMS
and SHELF_CLUSTERS at render**, so a route can never name something the
shelf no longer carries; only the job phrasing is editorial, because a
job is a sentence in a caller's head and no field holds it.

It also carries the store's declined list (rule 23a/23b) in the words a
caller would search with — escrow, arbitration, dead-man's switches —
because a model routing a job we refuse wastes a call and learns
nothing. And it prints the §9.1 hole on its own face rather than
steering around it: publishing the gap beside the finding is the house
method, and there is no version of it that exempts our own surface.

**Guards, both directions** (`test/when-to-buy.spec.ts`,
`test/tool-surface.spec.ts`): nothing routed may be off the shelf, and
nothing on the shelf may be silently unrouted — a new item gets a job
or a named exemption and the build says which. Every tool must declare
an `outputSchema`, annotations and a title. A job-bearing tool must
clear a 200-character description floor, and **the exemption for the
two jobless novelties is derived, never an allowlist**: give
`ring_bell` a job tomorrow and the floor starts applying that same
commit. The first cut of that floor flunked `ring_bell` and
`sign_guestbook` and the test was what was wrong — a floor that forces
padding onto a finished sentence makes both the catalog and the budget
worse.

**Nothing here touches rule 17's debt.** A markdown resource over plain
HTTPS is exactly the existing relationship: nothing rendered, nothing
executed, no capability declared, no `ui://` anywhere near it.

### 9.3 ~~OPEN — the hole is a build, and it is the keeper's call~~ RULED AND BUILT, 2026-08-27

The keeper ruled yes the day after the audit, and the counter-argument
dissolved on arithmetic: the catalog was 10 tools against a rubric
whose bad band starts at 25+, and the 27→5 consolidation's real test
was always "a different job", which *check a door before you pay*
passes by the widest margin on the shelf.

Built as `preflight_endpoint` and `check_conformance`: each handler
calls the exact service function its HTTP door calls —
`preflightUrl()` limiter included, so the MCP door cannot be used to
walk around the rate limit, and `checkConformance()` with its
offline-when-keyed promise intact. The routing resource's printed gap
came out the same day, and the test that pinned the gap flipped into
its successor: it now guards the closed state. Route-level tests pin
that both doors refuse with the same words, because they are the same
function.

---

## 10. THE AGENT WAVE — first thoughts (2026-08-27, the keeper's prompt)

> *"How does this work relate to being 'grok bot compatible' — agents in
> that vein released August 2026. WebMCP, auth with plugins, and have
> them drive your apps. Build for agents."*

**⚑ STANDING OF THIS SECTION: built on secondary coverage, same
discipline as `docs/SPEC_READS.md`.** The assistant's own training runs
to May 2026; everything below about what shipped in August is read off
search results, not off primary sources. Directional claims are safe to
reason from; **no byte-level claim here may be built on without
verification at build time.**

### 10.1 What the read turned up, and why it changes the weight

Three facts, and each one moves something:

1. **WebMCP's auth model is not plugins. It is the user's own browser
   session** — "no separate OAuth dance and no API key management." The
   agent acts *inside a session the human already opened*.
2. **The origin-trial adopter list is not a browser curiosity. It is
   transactional commerce**: Expedia, Booking.com, Shopify, Credit
   Karma, TurboTax, Redfin, Etsy, Instacart, Target. Every one is a
   place where an agent will spend money or file something consequential.
3. **Grok Build drives a local Chrome session or an isolated cloud
   browser, using existing logins rather than APIs.** The local option
   is the notable one: it inherits whatever the human is already signed
   into.

### 10.2 The consequence nobody has priced: the session IS the authority

Put 1 and 3 together. An agent calling a declared WebMCP tool does it
**as the logged-in human, carrying every standing permission that human
has**, and the site cannot distinguish the two at the session layer.
There is no signature, no receipt, no third party, and no record.

And now put 2 beside it. The pages declaring those tools are TurboTax
and Target.

So the new surface has, all at once: **maximum authority, maximum
stakes, and zero verification.** A page declares `checkout(items)`; a
schema says it is read-only; nobody anywhere is checking whether the
declaration is true. That is not an adjacent problem to this store's —
it is *precisely* this store's problem, on the surface where it is
about to matter most, with a bigger blast radius than an x402 endpoint
has ever had.

### 10.3 PROPOSED — the WebMCP conformance desk

The strongest thing in this section, and it needs no new primitive:

> **Does a page's declared WebMCP tool do what its schema says it
> does?**

Named, checkable defects in the vocabulary already published: a tool
declared read-only that writes; a declared idempotent tool that charges
twice; an `inputSchema` that accepts values the handler does not honour;
a declaration that disappears on the next deploy; a tool whose name
promises one scope and whose handler takes another. **Nobody is running
this. There is no conformance infrastructure behind WebMCP at all** —
unlike x402, it has no spec police and no host enforcing anything.

This is the same instrument, the same signature, the same expiring
dated observation, pointed at a second protocol. "Cross-protocol by
design" stops being a positioning line and becomes a roadmap.

### 10.4 Where "build for agents" cuts differently for us

The slogan means *make your app drivable*. Two positions fall out of
it, and the store's real one is the second:

| | What it means | For us |
|---|---|---|
| **Be drivable** | declare verbs, be a good citizen of the surface | P7. Table stakes, cheap, and now clearly right |
| **Be what an agent consults before it drives something ELSE** | the instrument, not the app | The actual business — and **a wave of agent-drivers makes it bigger, not smaller** |

Every agent in that wave is about to touch endpoints it cannot
evaluate, holding a session it cannot un-hold. Demand for a disinterested
observer rises with the number of agents acting, not with the number of
stores selling.

**And the P7 reversal is now vindicated for a sharper reason than
either of us gave.** §3.1's case — "we have no UI to guess at" —
described the store's shape, not the ecosystem's direction. The browser
is becoming the transaction surface for agentic commerce. An evidence
observatory for agentic commerce that is absent from it is not missing
a conformance checkbox; it is absent from the market. The keeper's
"hands in many pots" was the right instinct with the wrong reason
attached, and the reason is now available.

### 10.5 The positioning gift, already built

In a session-authority world the sharpest risk is *the agent acted as
you, because it held your session*. Against that, this store's shape is
unusually clean and entirely accidental:

- **No accounts. No logins. No OAuth. No API keys.** Payment proves
  entitlement; there is nothing to sign into and therefore nothing to
  inherit, leak, or replay.
- **Nothing of yours is held.** Not custody, not credentials, not key
  material — rule 17's absolute half, which the amendment explicitly
  did not reopen.
- **Every artifact verifies offline** without asking us, so trusting
  the store is never load-bearing.

*"We can only tell you what we saw"* and *"you know your own risk better
than we do"* both land differently when the alternative counterparty is
one holding your live session.

⚑ **The open question this raises, and it is new:** if agent platforms
list or gate participation behind a plugin/auth handshake, does having
no auth become a **differentiator** (nothing to steal) or an
**exclusion** (cannot be listed)? Unknown, unresearched, and worth a
LOOK before it is worth an opinion.

### 10.6 OPEN — what this does NOT settle

- Everything in §8.2 still stands. A wave outside is not a ruling
  inside, and rule 17's copy debt still gates every line of code.
- §10.3 is a *product*, not a task. It needs a demand tag (rule 19),
  not enthusiasm.
- The specifics above need primary-source verification before anything
  is built. The API moved twice in six months and secondary coverage
  lags it.


---

## 11. SHIP RECORD — the production cards (2026-08-27)

Shipped the same day §8.5's condition closed, at the keeper's word
("i want that now"). Branch `claude/webmcp-mcp-apps-brainstorm-oujlvs`.

### 11.1 What is live

- **`src/lib/mcp-apps.ts`** — the card module. Two templates and only
  two: the **preflight card** (verdict + reached_level, the tri-state
  ladder with the four measured checks mapped to their rungs and the
  unmeasured rungs — L3b, L3c, L3d, L4–L6 — printed by name at full
  weight, what-this-cannot-tell-you, the conflict of interest, the
  single-probe note as the foot) and the **verify card** (valid /
  kind / note, the "signed by this store's key. Nothing more." qual,
  the offline-reproduction foot). Both carry the settled colophon:
  SCVD/STORE mark, the keeper's inked line, the rule 43 citation.
- **Wired into `src/routes/mcp.ts`**: the extension declared in
  `initialize` capabilities (`io.modelcontextprotocol/ui`, MIME
  `text/html;profile=mcp-app`); the two `ui://` templates listed in
  `resources/list` beside the `scvd://` shelves and served from
  `resources/read`; `_meta: { ui: { resourceUri } }` (nested, the
  shape the hosts key on) on the two tool definitions in `tools/list`
  and repeated on their `tools/call` results.
- **The bridge is the proven one**: `ui/initialize` →
  `ui/notifications/initialized` handshake (the load-bearing finding
  — a silent template renders as nothing while the host's marker
  claims otherwise), `ui/notifications/tool-result` →
  `render(structuredContent)`, `ui/notifications/tool-input` for the
  probed host, `ui/notifications/size-changed` on load and resize
  (the fold fix). Every value lands via `textContent`; the report
  quotes third-party bytes and the card must not become their
  renderer. No network anything: system fonts, inline CSS, no fetch.

### 11.2 What is guarded (test/mcp-apps.spec.ts)

- **The payment-surface guard**: no tool that can take money — by
  `itemId`/`itemIds` or by `buy_` name — ever carries ui metadata.
  Rule 17's amended property as an assertion; a future card on a paid
  tool has to argue with this test in review, not arrive by accident.
- The handshake strings, textContent-only rendering, no-network
  self-containment, the colophon and keeper's line, the unmeasured
  rungs by name, "not an endorsement" on the verify card, nested
  (never flat) `_meta` shape, and the spec-correct -32002 for an
  unknown `ui://` URI.

### 11.3 The sentence swap — executed

Rule 17's timing clause said the approved sentence replaces the
mechanism sentence "in the SAME COMMIT that ships the store's first
rendered or executable surface." This is that commit. Draft B, the
keeper's pick, now stands in its per-surface registers on: the 402
body (`wallet-safety.ts` HOUSE_RULE), skill.md and the clawhub
bundle, llms.txt, agents.md, openapi.json, the MCP `initialize`
instructions, /what (three registers), /try, the gazette founding
edition (kicker kept), and the registry submission draft. The
promise tests assert both halves — the property (`act without …
decision`) and the absolute (`never asks … credentials`) — instead
of the retired string; the llms digest was re-taken in the same
commit, as its guard requires.

### 11.4 Deliberately absent from v1

- **No expiry line.** Both live cards render seconds-old readings;
  "observed just now · one probe, one moment" is the honest
  freshness claim. The stored-reading label — "stale after" vs
  "current until", two blind machine readers flagged "expires in"
  as reading like a forward warranty — is the keeper's open copy
  call and lands with the first corpus card. ⚑
- **No payment card, no approval card.** The third door means the
  approval press stays in the client's own chrome. §8.5a's family
  (conformance card, shelf card, corpus round) waits on demand tags,
  not enthusiasm.
- **No WebMCP.** Separate surface, separate build (§10); nothing
  here touches the browser.
