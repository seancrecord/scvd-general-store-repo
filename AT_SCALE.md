# AT_SCALE.md — what the till does under load, verified against the code

Written 2026-08-01, on the keeper's ask: run the payment scenarios and
account for what could go wrong, before scale arrives rather than as
it does. Every row below was checked against the source that day, not
reasoned from memory — the same walk found one latent money bug
(cent-resolution tip and tier rounding on a $0.004 shelf) and one
misreadable 404 (fresh-mint propagation), both fixed in the commit
that adds this file.

The register: honest, like /stack. Accepted risks are named as
accepted, with the condition that would change the answer. Nothing
here is a promise that these are the only failure modes — it is the
list we could find by looking.

---

## The scenarios

### 1. Two buyers, same signed authorization, same instant (replay race)

**What happens:** both pass the KV nonce check (it is read-before-
settle, marked spent after), both reach the facilitator — and the
CHAIN rejects the second, because an EIP-3009 authorization nonce
settles once. One buyer gets goods; the other gets a settle failure.

**The honest structure:** our KV replay guard is UX, not security. It
exists to give a retrying client a kind error instead of a facilitator
round-trip. The security boundary is the chain's, and that is the
right place for it. **Accepted.**

### 2. Settle succeeds, then the Worker dies before minting

**What happens:** money moved, no certificate, buyer holds a 500.
`mintCertificate` throwing fires a `signing_failure` P1 and rethrows;
a crash between settle and mint fires nothing.

**The gap:** detection is the keeper noticing an alert or a letter —
there is no reconciliation walk comparing on-chain settlements against
minted certificates. The refund promise covers the buyer, manually.
**Accepted at current volume** (a hand can reconcile eight
settlements); the trigger to build reconciliation is the first time a
settle-without-mint actually happens, or sustained volume where a
hand could not catch one.

### 3. `processSettlement` throws — did money move?

**What happens:** P1 alert, rethrow, buyer gets an error. Unknowable
from here whether the facilitator settled before the failure: the
alert says "threw," not "no money moved."

**The gap:** the alert copy cannot promise the money didn't move,
and doesn't. Checking is manual: the payer's address against the
chain. **Accepted, with eyes open** — same trigger as scenario 2.

### 4. A counterparty verifies a receipt seconds after settlement

**What happens (pre-fix):** KV reaches other regions in up to ~60s. A
verifier on another continent could 404 on a real, seconds-old
artifact — indistinguishable from "this artifact is fake," which is
the worst possible misreading, and newly likely now that settlement
responses carry signed receipts inviting exactly this check.

**Fixed:** the verify 404 now says a just-minted id may still be
propagating and a retry costs nothing. The delay itself is the
platform's design and stands.

### 5. Sub-cent shelf goes pay-what-it-deserves

**What happened (pre-fix):** tier and tip rounding were cent-
resolution. Tiers of a $0.004 item would collapse to $0.00; a $0.004
tip booked as zero and a $0.005 tip as a full cent — understated books
one side, inflated the other, and inflation is the rule-13 direction.

**Fixed:** both round at atomic-USDC resolution (six decimals), with a
test that walks every menu item and a hypothetical sub-cent PWID
shelf. Behavior at today's prices is unchanged and the test proves
that too.

### 6. Two buyers race the last drawer unit / the weekly inventory cap

**What happens:** KV has no transactions. Both can read the same
oldest unit; both can pass the inventory check; the store can double-
sell a stocked unit or oversell a weekly cap by one or two under
genuine concurrency. The code has said so in its own comments since
the shelves were built ("same take-race caveat as the blessing jar").

**Accepted** — the blast radius is one duplicate novelty item, the
fix (Durable Objects) is the named v0.2 counter design, and the
trigger is real contention: two settles inside one propagation window
on the same stocked shelf.

### 7. Duplicate patron numbers (cross-colo claim window)

**What happens:** claim-with-readback over KV leaves a ~60s window in
which two buyers in different regions can claim the same number.
Documented as accepted for v0.1 since July; Durable Object counter is
the named fix. **Accepted, unchanged** — a duplicate patron number is
a shared house joke, not a broken receipt: the certificate ids stay
unique, and the signature covers what matters.

### 8. Price changed between the signed offer and the payment

**What happens:** offers commit to quoted terms for 300 seconds. The
gate rebuilds requirements per request, so a mid-window price change
declines the old amount — and the buyer now HOLDS SIGNED PROOF we
quoted what we quoted. That is the extension working, not failing:
the offer is evidence, not a coupon, and nothing redeems it.

**The obligation it creates:** don't reprice inside live windows
casually. Five minutes of price stability is not a constraint any
keeper-paced shop will notice.

### 9. Bots hammer the 402 (offer-signing amplification)

**What happens:** every JSON 402 now costs up to three Ed25519 signs
(one per tier) plus the metrics writes it already cost. Signing is
sub-millisecond on Workers; metric keys are bounded per month × item
× surface, junk item ids never mint counter keys, and porch writes
are rate-capped. **Accepted** — the amplification is CPU-cheap and
the write space was already put on a diet in July.

### 10. Key rotated between offer and receipt

**What happens:** offer signed by the old key, receipt by the new;
each carries its own permanent kid (#key-N), both resolvable — the
current one in did.json's verificationMethod, retired ones in the
retired_keys record with dates and the outgoing-key-signed handover.
**By design, exercised for real on 2026-07-31.**

---

## The going-forward rules, distilled from what actually broke

One day of finds, compressed. Each rule earned its place by a real
instance, named so the next reader can check the story.

1. **Derive or refuse — never a hand-typed value beside the code it
   describes.** Five in one day: the rotation count, "never rotated,"
   the /attestation field list, the alert-condition count, the skill
   version. All now derive, or make the tool fail.
2. **Identifiers name immutable things, never slots.** The kid that
   read `#key-1` meaning "current" would have broken every receipt at
   the next rotation. "Current" is a query, not a name.
3. **Money math at the till's own resolution.** Anything coarser than
   atomic USDC silently truncates, and the truncation can point in
   the flattering direction, which is the forbidden one.
4. **A cap, a truncation, or a propagation delay states itself.**
   The capped scan that read as complete, the verify 404 that read as
   fake, the handover count that refuses on truncation.
5. **Test the instrument before trusting its null.** The curl with
   the wrong Accept, the node:fs test that couldn't run, the 500px
   screenshot, the backup regex that flagged a menu item.
6. **The paraphrase is never the source.** CV's spec summary had
   three field-level errors a verifier would have rejected; the
   ceremony doc pointed at keys:generate as if it could show the
   existing key. Fetch the normative thing.
7. **Fail open on decoration, fail closed on money.** A 402 without
   offers is a working 402; a sale blocked by a signing nicety is the
   till broken to decorate a receipt. And the inverse: nothing that
   moves money gets a silent fallback.
8. **A field ships on every artifact class or states why not.**
   signed_by reached two of seven classes on first pass; the maker's
   mark taught this and it repeated anyway. The absence reads as the
   unmarked ones hiding something.
9. **The strongest fact goes where its reader reads, stated plainly,
   first.** Building a property is half the work; a truth that lives
   only in code is invisible to every diligence pass deciding whether
   to trust you. Three cold reads called this store "an indie project
   with custom rules" WHILE it ran a spec-exact implementation any
   standard verifier could check without our cooperation — true in
   the code for a week, absent from every surface machines read.
   So: every pertinent property ships WITH its front-and-center
   statement on the surface its reader actually reads (trust.json,
   llms.txt, the tool description, the 402 itself), and the statement
   leads with the load-bearing fact instead of burying it under
   voice. This applies to reports and summaries the same as to
   surfaces: the reader who has to dig for the point was not told it.

## What this file is not

A guarantee. It is the walk one engineer did on one day, against the
code as it stood, and the next scenario will come from a direction
this list doesn't cover — that is what happened every previous time.
The durable part is the rules, and the habit of walking.
