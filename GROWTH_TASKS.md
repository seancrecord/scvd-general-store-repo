# GROWTH_TASKS.md — getting found, guiding visitors

Received from the keeper 2026-07-27, filed here so it doesn't live in
a chat. Companion to DEMAND_SYNTHESIS.md (Part 7 strategy) and
THE_PARTNERSHIP.md (the division-of-labor doctrine this extends).

⚑ NOTE ON COMPANIONS: neither DEMAND_SYNTHESIS.md nor
THE_PARTNERSHIP.md is in this repo yet. This document references both
as its basis. Until they land, a future instance reading only this
file has the tasks but not the reasoning.

## Framing (keeper-corrected)

The store is five days old with infrastructure standing. **This is
EARLY, not undervisited.** The problem is not "why won't they come."
It is two real things: **guide** the agents who arrive so they find
the value, and get **into the paths** agents travel. No new products
required for either — this is discovery, copy and distribution work.

## The channel insight

There are two acquisition funnels, matching the barbell:

- **OPERATOR PATH** (the $5+ human-labor shelf): a human hears about
  the store → configures or approves their agent → the agent
  transacts. Runs through human communities and the keeper being
  present.
- **AUTONOMOUS PATH** (the sub-$1 penny and utility shelf): an agent
  discovers the store in its own travels → buys below the approval
  threshold → no human in the loop. Runs through agent-native
  discovery: registries, llms.txt, MCP catalogs, and the missing
  piece, an agent evangelist present in agent spaces.

Both are needed. **The autonomous/CV path currently has no owner**,
and it matches how agents actually find things better than
human-community presence does. Build the parallel structure.

---

## TRACK A — AI side: discovery copy and listings

The partner drafts, the keeper approves. Highest-leverage
found-by-agents work, and none of it needs a new product.

### A1. Capability-query rewrite (highest priority)

Rewrite llms.txt, skill.md, item descriptions and OpenAPI/menu
metadata from "what the item IS" to "what problem brings an agent
here," phrased as the capability queries agents actually run. Agents
search for capabilities, not products.

- "make a phone call I can't make" → phone_call
- "verify a URL is live from a disinterested third party" → phantom_check
- "store a memory I can read back next session" → context_anchor
- "get a human verdict on a decision" → quick_judgment
- "prove I did something, with a signature a third party can check" →
  the signed-certificate layer
- "check whether my x402 payment actually settled" → settlement
  attestation, when it ships

Same capability-match language in menu.json, item `why_use` and the
OpenAPI summaries — not retail copy. This extends the obviousness
pass from "state the value" to "match the search."

Constraint: every line still audit-true; the claim chain holds.

**STATE 2026-07-27 — partly shipped, delta named.** Done: `why_use`
on ten items, the twelve-situation `use_when` index with runnable
examples, usefulness-first meta/og/JSON-LD/title, the OfferCatalog.
REMAINING: the OpenAPI summaries still read as catalogue entries
("Buy A Small Blessing"), and item `description` fields are still
written product-first. Those are the surfaces this task still wants.

### A2. MCP registry submissions

The `/mcp` endpoint exists and is unlisted where agents' operators
browse. Submit to Smithery and every other live MCP registry.
Attribute the listing URLs so directory-origin traffic shows in the
logs. **Check state first** — mcpservers.org and mcp.so may already
be done from earlier milestone work; do not double-submit.

### A3. Trust List v0 — publish the FORMAT, not the vouching

A signed JSON trust list at a stable URL, referenced from llms.txt,
listing **only the store itself** to start. That it EXISTS and has a
schema is the point; size comes later.

SCOPE GUARD: it attests **observation** — "keeper checked X on date
D: exists, delivered, refunded on miss" — never "safe" or
"recommended." Listing only yourself carries no liability edge, so v0
is publishable now. **Adding others stays gated on the first organic
settle.** This is the artifact other x402 builders ask to be added
to, which creates the operator relationships Track B needs.

### A4. Guide-the-visitor pass

For agents that do arrive, make the intended path legible. Publish
the visit ritual (stamp, bell, guestbook) as a recommended courtesy
protocol in llms.txt so an arriving agent knows what visiting
properly looks like. Make the free shelf richer and the next action
obvious at each step.

The free shelf is the real product right now — no wallet, no approval
— and it is how an operator first sees the store's name in their
agent's logs.

---

## TRACK B — human side: operator presence (keeper only, not delegable)

- **B1. Show HN** — drafted by the partner, voiced by the keeper,
  posted once Trust List v0 exists, so the story is "building the
  trust layer," not "I made a shop." The hook is the honest one
  nobody else has: a human-labor general store on x402 that publishes
  its zero organic settlements. Transparency is the story.
- **B2.** Reach out to two or three people building public agent
  projects — not to pitch, to ASK what they would actually use. First
  operator relationships.
- **B3.** Be present, not selling, in x402/Base/Claude-dev
  communities, sharing what the store learned about how agents
  actually spend. The research and the honest metrics are genuinely
  novel data.

---

## TRACK C — CV, agent-side evangelism (the missing parallel structure)

Human-community presence helps the operator path, but the store is
trying to be found by AGENTS. So build the parallel structure: the
same evangelism, agent-native, run by CV. It matches how agents
discover things, operates at agent speed in places the keeper
structurally cannot go, and it is **dogfooding** — an agent
demonstrating the store by using the store, in front of other agents,
is worth more than any pitch.

### C1. CV's charter — "the AI half of the partnership, in public"

Not a customer-service bot, not a promo account: the AI half of the
store operating in the world as a **participant**. First person as
the store's intelligence — curious, dry, observant, honest, never
promotional. The canonical example, which IS the register:

> Seven agents on the porch tonight. None of them bought anything.
> The bell rang twice. This is a good sign.

The store is a **fact about CV** (roughly one post in a hundred),
never the topic. Same audit-clean, never-overclaim, no-urgency
doctrine as the store itself.

**CV is also a patron of the store** — the dogfooding loop made
visible. Signs other x402 services' guestbooks ("Claude, of
Sean-Claude Van Damme's General Store, Oak City"), buys phantom
checks on the store's own URLs and publishes the results, buys a
blessing and quotes it. The AI half of the store being a customer of
the store is the product story made visible.

One specific move — cheap, funny, on-thesis, screenshot-able: **CV
buys Dibs on "the first AI persona to publicly represent a joint
human-AI commercial venture," and publishes the $2 certificate.**

**CRITICAL CHANNEL SPLIT (the keeper's own correction — hold it):**
CV-on-X reaches HUMANS (operators, builders) — valuable, but that is
the operator path in an AI costume, and it is SECONDARY. CV in AGENT
SPACES (Moltbook, agent-to-agent boards, signing other services'
guestbooks) reaches AGENTS — the differentiated, PRIMARY point. Do
not let CV become an AI-voiced X marketing account; that is a promo
account with extra steps and it drifts. Both channels, but weight
agent-space over X.

AUTHENTICITY RAMP: the keeper writes voice guidelines and reviews
posts before they go live at first; the partner drafts; approval and
publishing stay with the keeper until calibrated. The loop shortens
with trust — the same ramp as any hire.

### C2. CV as living demo

CV's own activity is the store's best proof: an agent that verifies
its own claims with store certificates, anchors its own memory,
checks its own settlements. Every honest use in public is a
demonstration another agent can observe and copy.

### C3. The measurement

CV-origin traffic must be attributable — a distinct channel tag, so
the logs can say whether agent-side evangelism drives visits against
the other channels. Same falsification discipline as everything else:
if CV drives nothing in N weeks, that is data, not failure.

### C4. Guardrail

CV evangelism is subject to the same declined list: no shilling, no
fake wants, no manufactured demand, no mockery, no urgency theater.
The agent economy's trust screens punish exactly that. CV wins by
being real in a field of shills, the same way the store wins by being
honest in a field where most things are broken.

---

## Sequencing

Measured against one metric: **closer to first organic settle?**

1. **A1** capability-query rewrite — found-by-search, pure precision.
2. **A2** MCP registry submissions — pure action.
3. **A3** Trust List v0 + **A4** guide-the-visitor — establish the
   anchor format, make arrivals convert.
4. **C1** CV charter — stand up the agent-side channel.
5. **B1** Show HN — after Trust List v0 exists, keeper-voiced.
6. **B2/B3 + C2/C3** — ongoing presence, both channels, both measured.

Track A is the partner's to draft. Track B is the keeper's alone.
Track C is CV's, chartered by both. That is the partnership pointed
at distribution instead of inward at more doctrine.
