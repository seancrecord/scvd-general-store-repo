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

---

## The first yes (2026-09-10)

It arrived before the ask was sent. StillOS Notary — the register
entry with `note_sent: null` — read this file in the public repository
and answered it from the other direction, in issue #622, from Marcus.
What their note says, in their words: their half is live at
`https://stillosdigitalholdings.com/notary/trust` (`?format=json` for
the machine form, shaped to mirror `/trust-list.json`); an SCVD
artifact signed by the key at our key URL, presented and verified, is
treated as evidence of exactly what it attests and nothing more; no
endorsement, no liability, no uptime dependency, no exclusivity;
revocable by unpublishing; marked `reciprocated: false`, meaning the
statement stands whether or not step 2 happens here.

Nobody here has read that page. The build environment's egress
refused their host, so the yes is recorded as what it is — a reply,
in the register, in their words — and not as a treaty entry. Rule 30's
condition applies exactly: what publishes must be a verified fact,
re-checked live by the hand that presses.

### What was built the same day

Step 2, as this file said it would be. `/trust-list.json` is version 2
and carries a third relation, `treaty`, beside `transacted` and `used`:

- the terms both sides commit to are stated once on the list
  (`treaty_terms`), in this file's words, negative half included;
- treaties are counted apart, and zero is a real count — the relation
  exists before its first entry so a reader learns what one would
  mean;
- a treaty entry carries `statement_url` (theirs, at an origin they
  control), `verify_url` and `key_url` (theirs, null until published),
  and the same dates and status as every other entry. The test refuses
  a statement URL on a different origin from the entry. It never
  carries a paraphrase of their words: the list points, it does not
  quote.

### What waits on the keeper

The entry. When he has opened their statement and it says what the
issue says, this is the row, dated the day he read it:

```ts
{
  origin: "https://stillosdigitalholdings.com",
  relation: "treaty",
  statement_url: "https://stillosdigitalholdings.com/notary/trust?format=json",
  verify_url: null, // theirs; the issue did not give one
  key_url: null,    // theirs; the issue did not give one
  first_verified: "<the day he read it>",
  last_checked: "<the same day>",
  status: "verified",
}
```

The two nulls are the gap in our half. The treaty as defined above
runs both ways only when their artifacts verify somewhere we can
point at; the issue describes a keyring resolving each receipt's own
`notary_fp` and re-verification on every request, but names no key
URL and no verify URL. The reply asks for both.

### The reply, for the keeper's pen (issue #622)

> Marcus — yes. Read your note; the treaty relation is now built on
> our side (/trust-list.json, version 2: a third relation beside
> transacted and used, terms stated once, treaties counted apart, and
> each entry pointing at the other operator's own statement URL rather
> than restating it). Your entry lands the day I read your statement
> myself; the build could not reach your host and the list does not
> carry a URL nobody here has opened.
>
> Two things I need from you for our half to run both ways: the URL
> where your public key lives, and the URL where one of your receipts
> verifies. The treaty as we wrote it is "artifacts signed by {their
> published key} verify at {their verify URL}," and the issue gave
> neither. Our entry will carry both, null until you say.
>
> Domain corrected in the register. The bad 402 at your door is noted;
> we won't retry on your account and we don't take a key in the
> runtime, as you guessed. The §7 read on #3220/#3376 I have not
> checked yet and will not pretend to have; it goes on the spec-watch
> desk and you'll hear what we find, either way.
>
> On the verifier that was quietly wrong: that is the argument, and
> it is why the list only ever points at your words.

Not sent. Sending is his hand.
