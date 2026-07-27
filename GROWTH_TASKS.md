# GROWTH_TASKS.md — getting found, guiding visitors

Received from the keeper 2026-07-27, filed here so it doesn't live in
a chat. Companion to DEMAND_SYNTHESIS.md (Part 7 strategy) and
THE_PARTNERSHIP.md (the division-of-labor doctrine this extends).

NOTE ON COMPANIONS: both DEMAND_SYNTHESIS.md and THE_PARTNERSHIP.md
landed in this repo 2026-07-27, so a future instance reading this file
can follow it back to the reasoning.

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

Both are needed. The autonomous path matches how agents actually find
things better than human-community presence does, and as of 2026-07-27
it **has an owner**: CV is live and runs it.

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

## TRACK C — CV, agent-side evangelism

**CV is live and holds his own instructions.** The charter, register,
channel weighting, guardrails and opening move that were specified
here have moved to him; keeping a second copy in this repo is how the
two drift apart.

What remains here is the store's side of the channel, which is
measurement, not instruction:

- **C3. Attribution.** CV-origin traffic carries `?src=cv-<venue>` so
  the porch log can say whether agent-side evangelism drives visits
  against the other channels. If it drives nothing in N weeks, that is
  data, not failure.

The reason the track existed is unchanged and worth keeping in view:
the AUTONOMOUS path had no owner, and it matches how agents actually
find things better than human-community presence does. It has an owner
now.

---

## Sequencing

Measured against one metric: **closer to first organic settle?**

1. **A1** capability-query rewrite — found-by-search, pure precision.
2. **A2** MCP registry submissions — pure action.
3. **A3** Trust List v0 + **A4** guide-the-visitor — establish the
   anchor format, make arrivals convert.
4. ~~**C1** CV charter~~ — DONE: CV is live and holds his own
   instructions.
5. **B1** Show HN — after Trust List v0 exists, keeper-voiced.
6. **B2/B3 + C3** — ongoing presence, both channels, both measured.

Track A is the partner's to draft. Track B is the keeper's alone.
Track C is CV's, and it is his to run rather than ours to specify.
That is the partnership pointed at distribution instead of inward at
more doctrine.
