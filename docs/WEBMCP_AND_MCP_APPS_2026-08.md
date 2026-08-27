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

---

## 0. The short version

1. **Both items need a ruling, not just P8.** The brief flags the
   rule 17 collision for MCP Apps and treats WebMCP as merely
   sequenced behind P2. That reading is wrong by one step: WebMCP
   tools execute *in the visiting agent's browser*, from a
   `<script>` we ship. Today the store ships none. §3.4.
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

### 5.2 PROPOSED — the move available today, needing no ruling

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

1. **THE RULING, and it governs both items, not one.** Does "the
   store never asks you to run code" mean *we never ask you to
   execute anything* (P7 and P8 both live) or *the public HTTPS
   surface is the entire relationship* (both die)? §1, §3.4.
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
