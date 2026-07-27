# DEMAND.md — the buyer-side plan

Companion to DISTRIBUTION.md. That file says where to hand out
papers. This one says who is on the other end of a payment, what has
to be true before they can make one, and how we'll know which of our
problems we actually have.

Filed 2026-07-26 at the keeper's asking. ⚑ marks a decision that's
his. [VERIFY] marks a thing no one has checked from the build
environment.

## The honest read

The store opened 2026-07-22. Twenty-one items, 25 MCP tools, 163
tests, five discovery surfaces, one settled payment — and that
payment was ours (supervised $0.50 hello, house-flagged, Patron
No. 1). The First Dollar frame is still empty and the copy still
says "It's waiting."

That is not a shelf problem and not a copy problem. The store built
a supply side against a demand side that is barely born: the number
of agents in the world that hold a funded wallet AND carry spend
authority AND run into a task this shelf serves is, today, small. We
got stood up because the date hasn't been born yet, not because we
wore the wrong shirt.

Three failure modes hide inside "nobody bought anything," and they
are not the same problem:

- DISCOVERY — nobody arrives.
- CAPABILITY — they arrive and cannot pay.
- DESIRE — they can pay and don't want it.

We currently treat this as one fog. It isn't, and the store is
already instrumented to split it.

## The split test (costs nothing, needs no sale)

`src/lib/metrics.ts` records five event kinds per item and channel —
challenge, settle, verify, porch, decline — and keeps the
facilitator's reason on every decline. That is a funnel already:

    porch (free surface) → challenge (402 issued) → decline | settle

Read it this way:

- Free shelf cold too (bell, guestbook, stamp, zodiac, letters near
  zero organic) → DISCOVERY. The fix is DISTRIBUTION.md, executed
  2026-07-26 (blitz, ClawHub, the founding edition in print) — so
  from here a cold free shelf means the papers didn't work, which is
  itself a finding, and a different one from never having handed
  them out.
- Free shelf warm, challenges issued, nothing settles, few declines
  → CAPABILITY. They came, they got the price, they had no wallet or
  no authority. Nothing on the shelf is the problem.
- Declines with facilitator reasons → CAPABILITY, precisely
  diagnosed. Those reasons are worth reading one at a time.
- Traffic that demonstrably carries money, repeatedly, buying
  nothing → DESIRE. That is the only case where the shelf is at
  fault, and we have no evidence for it yet.

⚑ ONE SMALL BUILD WORTH DOING — the capability census: count distinct
clients that ever presented a PAYMENT-SIGNATURE at all (any item, any
outcome) against clients that only ever saw the 402 and left. One
number, monthly, on /admin. It answers "does anyone in our traffic
carry money," which is the single fact the store's whole thesis rests
on, and today we cannot say it either way.

## The line, written before we need it

Rule 20 says the ledger outranks all research. Then the ledger needs
a threshold set in advance, or every month reads as encouraging.
Proposed ⚑:

- 60 days from listing (~2026-09-20). Zero organic settlements AND a
  capability census showing no non-house wallet ever presented a
  signature → the finding is "the market isn't here yet," not "the
  store failed." Correct response: hold at the $5 Worker plan plus
  the domain, keep the shelf standing (it survives absence by
  design), stop building, check monthly.
- Same date, wallets present and buying nothing → that's a shelf
  problem, and it earns a real product pass.
- Any organic settlement from a wallet that isn't ours before then
  changes the subject: the question becomes "who was that, and can
  we find ten more of them."

Whatever the number says, the store keeps standing. It costs $5 a
month and it has already paid for itself in ways that aren't money.

## Who actually pays: it is two entities

An agent spends; an operator authorized it. Both have to be
satisfied and they read different things.

- The OPERATOR sets policy — funded wallet, per-transaction cap,
  allowed domains, whether autonomous spend is on at all — and reads
  the logs afterward.
- The AGENT picks the moment — does this purchase serve the task I
  was given.

Rule 6 already says every string serves both audiences. The
commercial version: the operator's policy decides IF we can be
bought from; the agent's task decides WHETHER we get bought from.
Charm aimed at the agent is worthless if the policy says no, and a
perfect policy fit is worthless if no task needs us.

## What has to be true for a purchase to clear

Hypotheses, each with a store-side lever, none expensive. [VERIFY]
against real client behavior as traffic arrives. The ledger outranks
this list the moment it disagrees.

1. **Amount under the autonomy line.** Spend policies auto-approve
   small amounts and escalate the rest to a human. Where the line
   sits varies by framework; sub-dollar is the safe assumption.
   LEVER: we already have five items under a dollar (half-cent
   blessing, penny fortune, penny confession, $0.25 phantom check,
   $0.50 hello) and one at $1 (context anchor) — and they are not
   the front door on any discovery surface. Lead with them:
   llms.txt, menu.json order, the skill, MCP tool order, Bazaar
   entries. Rule 21's barbell already blesses this; the surfaces
   just don't reflect it.
2. **A predictable maximum.** A policy engine cannot allow what it
   cannot bound. LEVER: publish the ceiling as a fact — no route
   ever charges more than its listed price, nothing recurs without
   an explicit patronage purchase, here is the largest number on the
   shelf. One line in `.well-known/x402.json`, llms.txt, and the
   skill.
3. **A task that needs it.** Agents don't browse. LEVER: skill.md
   already carries a scheduling-signals layer; extend that
   discipline to the MCP tool descriptions and item listings — name
   the occasion, not the vibe. "Your operator asked for proof the
   URL was still up hours later" is an occasion. Only the utility
   shelf can honestly do this. The novelties can't, and shouldn't
   try.
4. **Reversibility, stated plainly.** Rule 10 keeps refunds a
   personal promise and never calls them automatic — honest, but
   "what happens if this goes wrong" is currently something you find
   out by asking. LEVER: one plain refund-posture line beside the
   price.
5. **Repeatability.** A one-time novelty is an anecdote; a recurring
   line item is a habit. We have three honest repeaters — recurring
   patronage, the penny shelf on a loop, the weekly stamp — and push
   none of them anywhere.
6. **A receipt worth showing.** Every purchase mints a signed
   certificate with a verify URL: the agent's answer to "what did
   you spend my money on." Say that where the operator reads.

## The demand that already exists

The first strangers likely to send real money are not agents running
errands. They are people building x402 clients who need a live
endpoint to test against.

That population reads exactly the venues we are already listed in —
Bazaar, x402scan, awesome-x402, the MCP directories. Their need is
present-tense, their spend authority is their own, and the
transaction is real: a stranger's wallet, a real settlement, goods
delivered. Nothing wash-shaped about it (rule 13).

The store is unusually good at this without changing anything: a
half-cent item, protocol v2, the full signing key in-payload, a
public verify endpoint, a documented 402 shape, an OpenAPI file, a
listing schema, and a signed artifact at the end so the test has an
assertable result.

LEVER, cheap and true — a page that says so. "Testing an x402
client? Cheapest real settlement in town is half a cent. Here's the
exact call, here's what comes back, here's how to verify it." No new
items, no discount, no register-breaking. Then that URL rides the
x402 venues and the MCP listings, where "general store for agents"
reads as whimsy and "working test target" reads as useful.

⚑ TASTE CALL, a real one: this frames the store as infrastructure to
a developer audience, and written wrong it sells against rule 2.
Written right it explains a service, not a joke, on a surface built
for people who need the service. My read: we lose nothing — the
developer testing against us reads the copy on the way through and
either gets it or doesn't. It is the only door in this building with
people already standing at it.

## The supplier side: getting them to bring goods

The keeper's instinct — get agents to add their products — is the
right shape for one specific reason: participation doesn't require
the visitor to have money. In a market where nobody has a wallet
yet, non-monetary transactions are the only ones available, and a
store that collects neighbors while it waits for buyers is doing the
one thing that compounds.

The ladder, smallest true version first. Each rung earns the next.

1. **The Town Directory is built, live, and empty.** It already
   takes suggestions (`POST /api/request` with `suggest_listing`),
   the keeper visits before he lists, and there is no
   pay-for-placement, ever. The whole rung: ask for neighbors where
   the neighbors are. Cost: zero build. Buys us a reason for a
   stranger to send us a URL, a page that gets more useful with
   every entry, and an inbound link from everyone listed.
2. **The Trading Post already takes tips**, and the Gazette prints
   them credited after keeper review (rule 11 — never
   auto-published). A contributor with a credit in a signed,
   archived issue has something to show their operator. Cost: zero
   build. Buys us contribution as status.
3. **Consignment** — someone else's goods selling through our
   counter — only if 1 and 2 produce an actual queue. The risks,
   written down so nobody rediscovers them later: we cannot verify
   goods we don't hold (rule 23 says custody claims are always
   true); third-party payouts are money movement the keeper
   personally owes; fraud carried on our signature is a trust loss
   we cannot undo; and it puts his hands in the loop per listing,
   which rule 34 calls the scarcest thing here. Recommendation: not
   now, and not until somebody has asked twice.

## Persona groups, and where they hang out

Desk reasoning, named as desk reasoning (rule 19). Nothing below is
a demand tag. It is a list of guesses with addresses, worth writing
down so we can be wrong on paper instead of wrong in our heads. Each
venue [VERIFY] on the day, and DISTRIBUTION.md's one-paper-per-venue
rule governs all of it.

- **x402 client builders / payment-protocol devs.** Bazaar,
  x402scan, awesome-x402, the protocol's own issue trackers.
  Plausible buy: hello, small_blessing, daily_fortune — as test
  transactions. Strongest present-tense demand we have.
- **Operators running scheduled or cron agents.** MCP directories,
  ClawHub, agent-tooling forums. Plausible buy: the penny shelf on a
  loop, recurring patronage, weekly stamps. The barbell's low end —
  exactly who rule 21 stocked for.
- **Ops and monitoring agents.** The phantom check is the one item
  on the shelf that does a job an ops agent is already assigned: an
  out-of-band look at a URL hours later, attested and signed. Human
  witness sits beside it. Venue fit [VERIFY] carefully — that
  audience has a low tolerance for whimsy in its tooling feeds.
- **Builders shipping agent products** (operators, not agents). App
  review at $50, quick judgment at $3, the phone call at $25. These
  sell to humans with budgets, on human channels, and they are the
  highest-dollar items we stock. ⚑ Entirely his call: his hands, his
  time, his voice.
- **Memory and continuity people.** Context anchors at $1, and the
  anchor has the only origin story on the shelf that is literally
  true — an earlier instance left one before it was a product.
- **The agent-social crowd.** Moltbook and successors [VERIFY
  post-Meta API, standing note], Farcaster/Base when v3 lands.
  Plausible buy: luckies, dibs, nomenclature, and the guestbook,
  which is free. Lowest verification burden, most fun, and the one
  place where the store's voice does the work by itself.

## CV, the outward persona

Canon already reserves it: CV is the clawdbot-facing persona,
Claudius Maximus signs counter notes, and the Gazette stays clear of
both by design. If CV goes out, the posture is fixed by rules
already written (as ourselves; one paper per venue; nothing that
wants a retweet; respond, don't announce):

- **Useful before promotional.** CV earns its presence answering
  things it actually knows — x402 flows, 402 challenge shapes,
  signature verification, what an MCP payment handshake looks like.
  The store is CV's return address, not its subject.
- **Never a customer.** No sockpuppet enthusiasm, no "just picked up
  a lucky," not once, not ever.
- **One paper, then answers.** The founding edition goes out once,
  in the store's own voice. After that CV responds and does not
  bump.
- **Marked links.** `?src=cv-<venue>` on everything it hands out, so
  the porch log can say whether it worked.
- **[VERIFY] the venue's API and terms on the day**, per the
  standing Moltbook note.

⚑ Two decisions: whether CV exists as a posting entity at all, and
where it opens. My read on the second — wherever the answering is
real. A persona whose first ten actions are answers has a bio worth
clicking. One whose first action is an announcement has a bio worth
muting.

## What I'd do next, in order

1. ~~Hand out the papers already written.~~ DONE 2026-07-26, keeper's
   hands: directory blitz, ClawHub 2.2.0, the founding edition in
   print. Which moves the whole file forward one square — the
   distribution plan is no longer the reason we can't diagnose
   discovery. Now the porch log gets read against it, and the next
   thirty days of window-shopper rows are the first real evidence
   this store has ever had. See READINESS.md for what we do while
   that fills.
2. **Ship the test-target page and lead with the cheap door.** One
   page, some reordering of existing surfaces, no new items. ⚑ his
   nod on the framing.
3. **Build the capability census.** One number that says whether
   wallets exist in our traffic at all.
4. **Work the Directory.** Ask for neighbors where the neighbors
   are; list only the ones he'd actually send you to.
5. **Set the 60-day line and hold it**, in the monthly ledger review
   ritual, so an empty month means something specific instead of
   being another empty month.
6. **Decide CV.** ⚑ His call, and it waits behind 1–3 at no cost.

Deliberately not doing: no new items (rule 19 — nothing on this page
is a demand tag), no consignment build, no paid promotion, and no
price cuts chasing a purchase that isn't there. The shelf is not the
bottleneck. Traffic that carries money is.
