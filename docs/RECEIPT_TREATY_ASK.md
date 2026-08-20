# The receipt-treaty ask

Drafted 2026-08-20, closing the half-done thread /becoming has carried
since 2026-07-30: "Receipt treaties — another small shop honouring
artifacts issued here. The gate is not technical and never was: one
other operator saying yes."

This file is the ask, written so the keeper can send it (rule 30 —
outward sends are his hand), plus the mechanics of what a "yes"
actually commits both sides to. Nothing here is speculative code: the
first data-model change happens after the first yes, not before.

---

## What a treaty is (and is not)

A treaty is two operators each stating, publicly and revocably:

> "Artifacts signed by {other store's published key} verify at {their
> verify URL}; when one is presented to us and verifies, we treat it
> as evidence of exactly what it attests — nothing more."

It is NOT: an endorsement of the other store's judgment, a liability
for the other store's mistakes, an uptime dependency, or an exclusive.
It honours the artifact's own stated scope, which every scvd artifact
carries in `signature_covers` and its what-this-does-not-prove text.

**Why it's worth a yes to the other side:** their buyers gain a second
place where receipts mean something; ours gain the same. Verification
stays free and account-less on both ends, so honouring costs the
honourer one published statement and zero infrastructure.

## The mechanical shape of a yes

1. They publish one statement at a stable URL they control (a page, a
   JSON field, a line in their own trust document) naming our origin,
   our key URL (`https://scvd.store/.well-known/scvd-signing-key`),
   and what they honour our artifacts as.
2. We add a `treaty` relation to /trust-list.json (today it has
   `transacted` and `used`) citing THEIR statement URL, so the claim
   is checkable in both directions — our list points at their words,
   never paraphrases them.
3. Both sides may revoke by unpublishing; the lists are re-read, not
   cached promises. Freshness-dating already on the trust list covers
   the staleness case.

Step 2 is the only build, and it waits for a real yes.

## The first ask: CV

CV is the warmest candidate for the first treaty in the ecosystem's
history: he has transacted here, verified real artifacts, run the
conformance desk against us from outside, and holds his own keys. The
note below is a draft for the keeper's pen — it reads as one operator
to another, not a pitch.

> CV — a standing idea, small on purpose. You already verify our
> receipts when it matters; I'd like to make that mutual and public.
> One line from you, at any URL you control: that artifacts signed by
> our published key (scvd.store/.well-known/scvd-signing-key) verify
> at scvd.store/api/verify/{id}, and you honour them as evidence of
> what they attest. In return our signed trust list carries a treaty
> entry pointing at your statement — the first bilateral entry it has
> ever held, checkable both directions. No exclusivity, no liability
> for each other's mistakes, revocable by unpublishing. If you issue
> signed artifacts of your own, the treaty runs both ways and our
> conformance desk already checks yours free. Worth a yes?

## The general ask (outreach-desk version, later)

For operators surfaced by the ward who actually serve signed offers —
the rarest doors in the registry — a shorter variant rides the same
keeper-fired outreach flow as the broken-door notes. Not drafted per
host here; the outreach desk drafts fresh from round data when the
keeper works that queue. The qualifying bar: they must sign something
verifiable themselves, or the treaty has one real side.

## What this does not change

Rule 43 holds: a treaty entry is a dated, mutual statement of what
each side honours — never a score. Rule 30 holds: nothing sends
itself; this document is a drawer the keeper reaches into.
