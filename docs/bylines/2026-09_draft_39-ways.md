# Byline — "I told an agent to rob my own store. It found 39 ways."

Revised 2026-09-10 for HackerNoon. Numbers re-read from
`research/BUYER_AUDIT_LOG.md` and `BUYER_REPAIR_CHECKLIST.md`.

⚑ **Before submitting:** HackerNoon runs GPTZero and rejects stories it
reads as fully AI-written; AI-assisted is fine with the story indicator
set. This draft is AI-assisted. Rewrite the opening and at least the
four finding sections in your own words, and set the indicator.

## Story settings

**Title options** (HN rewards a number and a first-person verb):
1. I Told an AI Agent to Rob My Own Store. It Found 39 Ways.
2. 39 Ways to Steal From an x402 Store, None of Them a Payment Bug
3. I Paid an Agent to Rob Me. Here's the Receipt.

**TL;DR** (HN field): I run a storefront where the customers are AI
agents and the money is USDC over x402. In September 2026 I pointed a
coding agent at my own checkout with one instruction: take the money
and don't deliver. It found 39 ways across five payment rails. Six were
severity-1. The payment layer never broke once. Every hole was in the
twelve inches on either side of the money moving.

**Meta description** (≤160): An adversarial audit of a live x402 agent
storefront found 39 ways to take payment without delivering. None of
them were payment bugs. Here are the four worst.

**Tags (8):** x402, ai-agents, agentic-commerce, security, payments,
usdc, api-security, web3

**Featured image:** the four-character purchase. A terminal-style card:
an input field showing an invisible character, a green "SETTLED $0.005"
badge, and a delivered artifact that is visibly empty. Greenify it.

**Canonical link:** https://github.com/seancrecord/scvd-general-store-repo/blob/main/research/BUYER_AUDIT_LOG.md

---

# I Told an AI Agent to Rob My Own Store. It Found 39 Ways.

Six of them were severity-1. Not one was a payment bug.

I run [scvd.store](https://scvd.store), a small storefront where the
customers are AI agents and the money is USDC over x402. Between
September 5 and 8, 2026, I pointed a coding agent at my own live
checkout and gave it one instruction. Not "find bugs." Something
narrower and meaner:

> Take my money and give me nothing. Or give me the wrong thing. Do it
> through the front door.

It came back with 39 findings across five payment rails. As I write
this, 53 of the 81 repair steps are committed and 28 are open, three of
the six SEV-1s among them. The full log, with IDs and reproduction
steps, is [public](LINK: audit log).

Here's what I didn't expect. The cryptography did its job every single
time. Signatures verified. Replays were caught. Amounts matched to the
atomic unit. Every one of the 39 lives *around* the payment, in code I
wrote assuming the payment was the hard part.

[IMAGE 1: severity breakdown. Three bars: SEV-1 ×6, P1 ×24, P2 ×9.
Under it, one line: "Payment-layer defects: 0." Featured-image style.]

## The four-character purchase

The smallest one sets the shape for everything else.

Several products take a required text field. A confession. A summary.
A win to log. Send that field as a single null byte, `U+0000`, and
validation passes. The field is present, it's a string, it's not empty.
The payment settles. Then fulfillment maps the value, the null byte
collapses, and the buyer gets a signed artifact with nothing in it.

Twenty-four settlements, across HTTP and MCP and three rails. Each one
produced an empty good and a valid receipt. ([BUY-001](LINK))

It took me a while to say the lesson properly. **Validate the value
your fulfillment path will use, not the value your schema saw.** In
most codebases those are two different variables, and only one of them
gets checked before the money moves.

## Buy a correction, get the mistake back

The store sells a case file. You name a transaction and a claim about
it; you get back a signed observation.

Buy one with claim A. Read it. Realize claim A was wrong. Buy again
with a fresh payment, a fresh idempotency key, and corrected claim B.

The second payment settles. The signed artifact still says A.

The cache key was built from the transaction and the mandate. The claim,
the thing the buyer is paying to have examined, wasn't in it. Six
corrected purchases reproduced this, and a replay of the second
purchase would have preserved the wrong claim forever. ([BUY-005](LINK))

**Every input that changes the deliverable belongs in the reuse
identity, or the request has to be refused before payment.** There's no
third option that isn't a lie to the buyer.

[IMAGE 2: two receipts side by side. Left: "claim: A" / cert_xxx /
paid. Right: "claim: B" / new cert / paid, with the artifact body
still reading "A" circled in red.]

## The question mark that bought the wrong pass

This one is my favorite, and the one that convinced me the exercise was
worth it.

The store sells a patronage pass. You renew by naming its id. Create a
valid pass, then request a renewal with the same id plus a trailing `?`.

The id doesn't resolve. So the renewal logic falls through to the
first-time-purchase branch. Six fresh payments settled across both
doors and every rail. Each returned a *different* pass, marked
`renewed: false`. The original sat there unextended while the buyer paid
for something they never asked for. ([BUY-028](LINK))

Nobody typed that `?` on purpose. A URL builder appends it. A copy-paste
picks it up. And a nonempty target that can't be resolved quietly
became a new sale.

**An unresolvable reference is not an absent reference.** If someone
names a thing that doesn't exist, refuse. Don't reinterpret their
request as a different, more expensive one.

## "No charge," after the charge

The two open SEV-1s I lose sleep over are about uncertainty, not logic.

Inject a transport failure into the facilitator's acknowledgement
*after* the transfer lands. The money moved. The store never heard
back. On Base and Polygon, the original purchase and an identical retry
both returned no artifact, and both told the buyer **"No charge."**
([BUY-017](LINK))

That statement was false, and the store had no way to know it. Which is
the finding. A settlement you can't confirm is not a settlement that
didn't happen, and reporting it as one is worse than saying nothing.

The partial repair now returns `charged: null` and a reconciliation
reference instead of a confident denial. Delivering the good after
reconciliation is still open.

Its sibling is uglier. When human-queue order creation fails after
settlement and after the certificate is minted, eight purchases ended
with a paid buyer, a valid certificate, and no order. HTTP then said
`already_delivered: true` and handed back the certificate. MCP asked for
payment again. ([BUY-034](LINK))

**A payment certificate is not the work.** It isn't even proof the work
entered a queue. I'd built a system that couldn't tell those apart, and
it took an agent trying to rob me to show me.

[IMAGE 3: a three-state diagram. "Refused" / "Unknown" / "Settled",
with the old code collapsing Unknown into Refused, and the repair
keeping them separate. Simple boxes.]

## Why the payment layer never broke

I keep coming back to it. x402 is a good protocol. In 39 findings across
five rails, it held every time.

Every failure was somewhere else. Input validation checking a different
variable than fulfillment used. Cache keys missing a load-bearing field.
An unresolvable id falling through to a purchase branch. A certificate
standing in for a deliverable. A confident status line written for a
state the server couldn't observe.

That's the actual lesson for anyone selling to agents. The protocol is
the easy part and it's nearly done. The hard part is that **you now
have to be correct about delivery, and your buyer is a program that
can't look at your page and notice something's off.** A human who gets
an empty confession emails you. An agent files it, cites it, and moves
on.

## How it ran, and what it doesn't prove

The audit ran in an isolated worktree against revision `325a2fe2`, with
disposable keys and simulated settlement. No real payment, no production
change during the audit, no live buyer involved. EVM signatures were
real and locally signed against the offered USDC domain; balances and
chain state were simulated.

The individual passes were bigger than 39 suggests. Price integrity
alone made 249 purchases across 32 catalog items and three rails,
comparing every discovery surface against the actual 402 and the signed
receipt. Cross-rail made 116 observations.

What this doesn't establish: that any of these were ever exploited, that
a live facilitator behaves like the injected fixtures, or that the
repaired code is correct in production. Each fix has a regression that
was observed failing before it and passing after. That's a weaker claim
than "fixed," and it's the one I can make honestly.

If you sell anything to agents, the cheap version of this is one
afternoon. Take your five most expensive endpoints. For each one, write
down what the buyer receives if fulfillment throws *after* settlement
returns. If you can't answer from the code, that's a finding.

---

*I run scvd.store, so these are my own defects. Earlier pieces:
[AURa](https://hackernoon.com/ai-agents-are-customers-now-aura-is-how-i-take-notes-on-how-they-shop)
and [35 x402 hosts served no signed offer](https://dev.to/seancrecord/35-x402-hosts-served-no-signed-offer-here-is-how-tocheck-yours-in-one-request-ceh).*
