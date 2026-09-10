# Byline draft — "I told an agent to rob my own store. It found 39 ways."

Draft for the keeper's name. HackerNoon (tags: x402, ai-agents,
security, payments). His voice, his edits; this is the shape.
Every number re-read from `research/BUYER_AUDIT_LOG.md` and
`BUYER_REPAIR_CHECKLIST.md` the day it posts.

---

**Title:** I told an agent to rob my own store. It found 39 ways, and
not one of them was a payment bug.

**Standfirst:** I run an x402 storefront where the customers are AI
agents. In September I pointed a coding agent at my own checkout and
told it to take money without delivering. It came back with 39 findings
across five payment rails. The payment layer held every time.

---

Between September 5 and September 8, 2026, I ran an adversarial audit
against my own live x402 checkout. The instruction was not "find bugs."
It was narrower and meaner: **take my money and give me nothing, or
give me the wrong thing, and do it through the front door.**

It found 39 distinct ways. Six of them severity-1. Twenty-four P1. Nine
P2. As of this writing 53 of the 81 tracked repair steps are committed
and 28 are still open, including three of the six SEV-1s.

Here is the part I did not expect. **Not one finding was a payment
bug.** Signature verification worked. Nonce replay guards worked.
Settlement worked. Every single one of the 39 lives in the twelve
inches on either side of the money moving.

I run scvd.store, so this is my own checkout failing. The full log,
with reproduction steps and IDs, is public.

## The four-character purchase

Start with the smallest one, because it sets the shape of everything
else.

Several products take a required text field. A confession. A summary. A
win to log. Send that field containing a single null byte, `U+0000`, and
validation passes: the field is present, it is a string, it is not
empty. The payment settles. Then fulfillment maps the value, the null
byte collapses, and the buyer receives a signed artifact containing
nothing.

Twenty-four settlements across HTTP and MCP and all three rails tested.
Each one produced an empty good and a valid receipt.

The lesson took me a while to say properly. **Validate the value your
fulfillment path will actually use, not the value your schema saw.**
Those are two different variables in most codebases, and only one of
them is checked before the money moves.

## Buy a correction, receive the mistake

The store sells a case file: you name a transaction and a claim about
it, and you get back a signed observation.

Buy one with claim A. Read it. Notice claim A was wrong. Buy again —
fresh payment, fresh idempotency key, corrected claim B.

The second payment settles. The signed artifact still contains claim A.

The cache identity was built from the transaction and the mandate. The
claim, the thing the buyer is actually paying to have examined, was not
part of the key. Six corrected purchases reproduced it. A replay of the
second purchase would have preserved the wrong claim too, permanently.

**Every input that changes the deliverable belongs in the reuse
identity, or the request has to be refused before payment.** There is no
third option that isn't a lie to the buyer.

## The question mark that bought the wrong pass

This is my favorite, and the one that most convinced me this audit was
worth running.

The store sells a patronage pass. You can renew one by naming its id.
Create a valid pass, then request a renewal with that same id plus a
trailing question mark.

The id doesn't resolve. So the renewal logic falls through to the
first-time-purchase branch. Six fresh payments settled across both doors
and every rail. Each returned a *different* pass, marked
`renewed: false`. The original pass sat there, unextended, while the
buyer paid again for something they did not ask for.

Nobody typed that question mark maliciously. A buyer's URL builder
appends it. A copy-paste picks it up. And a nonempty target that cannot
be resolved silently became a new sale.

**An unresolvable reference is not an absent reference.** If someone
names a thing that doesn't exist, refuse. Do not quietly reinterpret
their request as a different, more expensive one.

## "No charge," after the charge

Two of the open SEV-1s are the ones I lose sleep over, because they are
about uncertainty rather than logic.

Inject a transport failure into the facilitator acknowledgement after
the transfer has already landed. The money moved. The store never heard
back. On Base and Polygon, both the original purchase and an identical
retry returned no artifact — and told the buyer **"No charge."**

That statement was false, and the store had no way to know it was
false. Which is the actual finding. A settlement you cannot confirm is
not a settlement that did not happen, and reporting it as one is worse
than reporting nothing.

The partial repair now returns `charged: null` and a reconciliation
reference instead of a confident denial. Both doors distinguish
"refused" from "unresolved." Delivering the good after later
reconciliation is still open.

The sibling finding is uglier. When human-queue order creation fails
after settlement and after the certificate is minted, eight purchases
across two products ended with a paid buyer, a valid certificate, and no
order. HTTP then reported `already_delivered: true` and handed back the
certificate. MCP asked for payment again.

**A payment certificate is not the work.** It is not even proof that the
work was accepted into a queue. I had built a system that could not tell
those apart, and it took an agent trying to rob me to show me.

## Why the payment layer never broke

I keep coming back to this. x402 is a good protocol. In 39 findings
across five rails, the cryptography did its job every time. Signatures
verified. Replays were caught. Amounts matched to the atomic unit.

Every failure was somewhere else: input validation that checked a
different variable than fulfillment used, cache keys missing a
load-bearing field, an unresolvable id falling through to a purchase
branch, a certificate standing in for a deliverable, a confident status
line written for a state the server could not observe.

That is the actual lesson for anyone shipping paid agent endpoints. The
protocol is the easy part, and it is nearly done. The hard part is that
**you now have to be correct about delivery, and your buyer is a program
that cannot look at your page and notice something is off.** A human
buyer sees an empty confession and emails you. An agent files it, cites
it, and moves on.

## How it was run, and what it doesn't prove

The audit ran in an isolated worktree against revision `325a2fe2`, with
disposable keys and simulated settlement. No real payment was made, no
production change was deployed during the audit, and no live buyer was
ever involved. EVM signatures were real and locally signed against the
offered USDC domain; account balances and chain state were simulated.

The individual audits were bigger than the finding count suggests. The
price-integrity pass alone made 249 purchases across 32 catalog items
and three rails, comparing every discovery surface against the actual
402 and the signed receipt. The cross-rail pass made 116 observations.

**What this does not establish:** that any of these were ever exploited,
that a live facilitator behaves the way the injected fixtures did, or
that the repaired code is correct in production. Each fix has a
regression that was observed failing before it and passing after, which
is a different and weaker claim than "fixed."

Twenty-eight repair steps are still open. They are listed by ID, with
what remains, in the same public log as the findings.

If you sell anything to agents, the cheap version of this exercise is
one afternoon: take your five most expensive endpoints, and for each
one, write down what a buyer receives if your fulfillment throws after
your settlement returns. If you can't answer from the code, that's a
finding.

---

*Canonical link:* the buyer audit log.
*Prior bylines to cross-link:* the AURa piece (HackerNoon, 2026-08) and
the signed-offer census (dev.to, 2026-09-03).
