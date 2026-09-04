# The trade counter — who to write to, and the letter

Drafted 2026-09-03 for the keeper's hand (rule 30: sending is his
press). The product is finished enough that the letter is now the
bottleneck, so here is the letter, and the list it goes to.

## The list

CV's aggregator research (2026-09-03) named four platforms that
abstract x402 away from their own users. Each is a candidate to
resell this shelf on account. The store has verified nothing about
any of them beyond the names; the paragraph on each is CV's read-off
and is to be checked against their site before a letter goes.

| Platform | Why they might want the counter | Before writing |
|---|---|---|
| x402scan | An index of x402 doors; a listing feed of ours (`/api/trade/catalog`) is the shape they already consume | Confirm they route paid traffic, not only list it |
| Agentic.Market | A marketplace for agent services; the trade account is their model exactly | Confirm how their customers pay them, and the share they take |
| Pay.sh | A payments layer that hides the rail from its users; our signed receipt is the artifact their user lacks | Confirm they resell third-party services at all |
| DeskCrew | An agent-work platform whose agents may need signed evidence mid-task | Confirm they have a catalog of outside tools |

And Hal, who asked first: `docs/TRADE_HAL_LETTER.md` carries their
letter, with the ten questions.

## The letter

Short, the sandbox first, the price rule in one line, and nothing
that asks them to trust us — everything named is checkable before
they reply.

---

Subject: Resell our signed evidence instruments on account — sandbox is live, no conversation needed to try it

Hi —

scvd.store sells small signed evidence instruments to AI agents:
endpoint audits, settlement attestations, Bitcoin-anchored timestamps,
signed certificates — each an ed25519-signed artifact a third party can
verify against our public key without trusting us or you.

We've opened a trade counter for platforms that resell to agents. The
shape is the one you already know from Stripe or GitHub webhooks: your
customer pays you, however you take money; your backend sends us one
HMAC-signed instruction; we deliver the same signed goods our front
door sells and bill your account on a statement. Your customer never
touches x402.

Try it before you write back. The sandbox account's secret is
published on https://scvd.store/trade — sign one request (a
twelve-line snippet in Node, Python or Go is on the page, or
`npx scvd trade check context_anchor` from a shell) and the check desk
tells you which of the four signature checks passed, by name. Real
goods deliver on the sandbox, marked test, booked to nobody.

What you'd be listing: https://scvd.store/api/trade/catalog — every
item with its copy, a free specimen, what its signature does and does
not prove, and the price at your share. Pricing is one published rule
(retail plus 20% net of your share, rounded up to the cent), printed
per item at https://scvd.store/api/trade/contract. What you charge
above it is yours.

What your customer gets that they can't get from an opinion: a
receipt that verifies offline, forever, that says the sale settled
through your account and names no chain — because none was involved.

If it's a fit, tell us the dialect you sign in (or use ours), the
items you want, and expected daily volume, and we open an account in
test mode. You issue us one secret; nothing of ours is ever asked of
you.

— Sean
scvd.store · https://scvd.store/trade

---

## What the store does not do here

No agent sends this. No agent follows up. The outreach ledger on
`/admin/outreach` is for doors we observe, not for partners we court;
a partner's reply is a letter, read on Sunday, answered by hand.
