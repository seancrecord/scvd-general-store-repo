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

**Rule 0, the keeper's, about all the others (2026-08-02): rules
guide, they do not govern.** Every rule below — and every settled
ruling in the problem ledger — exists to prevent a specific recurring
mistake, not to bind the store against a pivot it is ready for or to
refuse significant capital on procedural grounds. When holding a rule
would do either, the rule is re-opened: OUT LOUD, by the keeper, with
the change dated and the reasoning recorded, exactly the way a
correction ships. What Rule 0 does not license is drift — a rule
quietly ignored is a correction waiting to be written. The difference
between a pivot and a slip is that a pivot has a date on it.

**Rule 0's carve-out, the keeper's, same day: legal exposure is
different in kind.** Flexibility toward capital never extends to
putting the keeper personally at legal risk. The rules that keep him
safe — never custody anyone else's funds, nothing that walks toward
unlicensed money transmission, nothing that quietly requires a
compliance department one person doesn't have — do not bend for a
revenue case. DEFENSIBLE is the standard: a position we can hold
with a straight face and, where real money or regulatory surface is
involved, professional advice behind it. Those rules re-open only
behind that advice, not behind an opportunity. A store this honest
being run by a keeper in legal trouble is a contradiction that ends
the store either way.

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

## The capacity checklist (CV's platform read, logged 2026-08-02)

An outside read of the real architecture, kept because it named the
actual ceiling instead of gesturing at "scale." Compute is not the
limit — Workers scale; the limits live in Workers KV, the store's
entire datastore. The platform facts as checked on 2026-08-02:
1 write/second per key (every tier), and the store is on Workers
Paid (settled July), so the daily write cap is not in play.

**The one named hot spot:** claimPatronNumber() in certificates.ts —
sequential patron numbers over a single shared COUNTERS key with
read-write-readback and up to 8 retries, because KV has no atomic
increment. It fails in the right direction already (worst case two
badges share a number; the sale never fails), and it is where a real
burst queues FIRST — before CPU, before the edge. The fix when it
becomes real is a Durable Object for that one counter (problem
ledger #6 already names it); not built now, on purpose.

The five questions every new feature answers before it ships:
1. Does it write a shared/singleton key? If two buyers can hit it in
   the same second, that is the bottleneck — walk-forward-and-retry
   (the existing pattern) or a Durable Object once volume justifies.
2. Do writes scale linearly, or does one sale fan out? A settle is
   already ~4-5 KV writes (order, patron, counter, metrics) — write
   amplification reaches caps faster than one-sale-one-write
   intuition suggests.
3. Anything touching the wallet or payment path gets the idempotency
   treatment BY DEFAULT — the precedent is set, and it is the bar
   for every new buy door, not a feature two doors happen to have.
4. Agent-written text (tags, letters, confessions, summaries) is
   escaped everywhere it renders and never interpreted — the
   existing discipline, restated as the default posture for anything
   new that stores it.
5. Storage: signed artifacts accumulate forever by design —
   immutability is the product — so the certs-per-month × years
   napkin math gets redone when volume moves, before the 1GB line
   does.
6. Does it add a dependency, and could that dependency read
   env.SIGNING_KEY? A red-team pass (PROBLEMS #1, DR2) named the
   cheapest attack on the whole store as a malicious npm package
   exfiltrating the secret from isolate memory on deploy. The
   defense is not code — it is a deliberately thin dependency set,
   lockfile discipline, and treating every new dep on a
   secret-handling path as a supply-chain decision, not a
   convenience. The signing path especially earns its dependencies
   or does without them.

## The dependency-audit finding (2026-08-02, OpenSSF Scorecard + npm audit)

Scorecard flagged 11 dep vulns; walked, they are 6 unique findings in
two chains, and the split is the whole answer:
- **sharp → miniflare → wrangler / vitest-pool-workers (5, dev-only):**
  libvips image CVEs inside the LOCAL dev simulator and test pool.
  Never ships in the deployed Worker, never processes an attacker's
  image. Left as-is on purpose: churning the runner that executes 747
  tests to patch a dev image lib with no real exposure is the tail
  wagging the dog. Reassess if a clean vitest-pool-workers bump lands.
- **axios via @coinbase/x402 → @coinbase/cdp-sdk (1, production):**
  a real transitive PRODUCTION dep, and the one worth attention. Two
  facts bounded it: (a) exploitability — every axios CVE needs the
  attacker to control our axios CONFIG or the SERVER axios talks to,
  and in this store axios (if it executes at all) only ever talks to
  the CDP facilitator (Coinbase, trusted); a buyer controls the
  payment payload, not our transport. Our one touchpoint,
  createFacilitatorConfig, generates CDP auth headers (crypto), while
  the facilitator HTTP calls go through the @x402 SDK's fetch path in
  Workers. So it was not buyer-reachable even unpatched. (b) We were
  already on the latest @coinbase/x402 and cdp-sdk, so no upstream fix
  existed to pull. Patched anyway, defense in depth: an npm override
  pins axios to ^1.19.0 (1.16→1.19, API-stable minor); audit drops
  from 6 to 4, full suite + build:check green. The rule for next time:
  a production transitive gets patched-or-assessed; a dev-only one
  gets a documented shrug, not a runner-churning bump.

## What this file is not

A guarantee. It is the walk one engineer did on one day, against the
code as it stood, and the next scenario will come from a direction
this list doesn't cover — that is what happened every previous time.
The durable part is the rules, and the habit of walking.
