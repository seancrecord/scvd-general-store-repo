# PROBLEMS.md — what is not solved, said plainly

Started 2026-08-01 on the keeper's ask: a standing ledger of open
problems, kept in the /becoming discipline — a TRIGGER that would
change each answer, never a date. An entry leaves this file by being
solved or by being explicitly declined, and either exit gets written
down. A problem quietly deleted is a problem somebody will rediscover
at full price.

Ordering: things we cannot solve today first, then things we could
build but have deliberately gated, then watches, then the
opportunities that came out of the same walk.

---

## Cannot solve today

### 1. Theft of the signing key

One key, one operator, no threshold signing, no HSM. A thief holding
the key IS us, cryptographically, and the backup addresses loss only.
The succession protocol's own bad case: if the outgoing key cannot
sign honestly (because a thief also holds it), no clean handover
exists — /corrections would carry a dated compromise notice and the
chain of trust genuinely breaks.

**What would actually move this:** a pre-announced successor key —
generated, put on paper, announced under the current key BEFORE any
compromise, then stored apart. Theft of the primary then has a
recovery path that theft cannot follow. The gate is physical, not
cryptographic: where a second seed lives such that one burglary
cannot take both. Already filed on /becoming; it is the top of this
file because everything else assumes the key is ours alone.

### 2. Temporally immutable proof of authorization

Our key registry is self-hosted and mutable. The transition chain is
cryptographic (a predecessor cannot be invented without its
signature) and the public git history is third-party-timestamped and
tamper-evident — but none of that is immutability, and the spec
submission says so in its own words. **Trigger for the real thing:**
a counterparty whose verifier requires it, at which point the fix is
anchoring registry digests on Base — the store already has the wallet
and the chain access, and has simply declined chain writes so far.

### 3. Demand

The store cannot engineer a reason to arrive. Everything in the trust
layer removes reasons to bounce; nothing manufactures a visit. The
one lever identified and still unpulled: /try put directly in front
of x402 client builders, in the places they already read. This is
distribution work, human work, and no amount of building substitutes
for it.

---

## Buildable, deliberately gated

### 4. Settle-without-mint reconciliation

Money can move without goods if the Worker dies between settle and
mint; detection is currently the keeper noticing. The solved pattern
to import is BANK RECONCILIATION: walk on-chain settlements to our
wallet against minted certificates, flag orphans. **Trigger:** the
first real occurrence, or volume a hand cannot reconcile weekly.

### 5. Issuer-liveness beacon (the dead-man pattern)

causeclaw's stated need: fail-closed when the issuer disappears. The
solved pattern is the warrant canary / dead-man switch: a dated
statement re-signed on a schedule, so a verifier can fail closed on
staleness instead of guessing. We have the cron, the signer and the
artifact classes already; this is a small build. **My read: the best
next build in this file** — it answers a named counterparty need, it
strengthens the succession story (a stale beacon plus a fresh
handover is exactly the signal an honest transition emits), and it is
cheap. Gated only on the keeper agreeing the store should make a
weekly liveness promise it then has to keep.

### 6. KV races (patron numbers, stock units, weekly caps)

Duplicate patron numbers and double-sold drawer units are possible
under real concurrency; blast radius is one novelty item. Durable
Objects is the named v0.2 fix. **Trigger:** two settles inside one
propagation window on the same shelf, observed.

---

## Logged, not chased

### 7. The offer-receipt SDK gap (TypeScript only) — VECTORS SHIPPED

Conformance vectors now exist at conformance/offer-receipt-vectors.json:
deterministic, regenerable, signed by a PUBLISHED test key (0x42*32 —
unusable for anything real precisely because it is published), two
valid vectors and three invalid ones including the teaching case a
signature-only verifier gets wrong (valid signature, schema-invalid
payload). A test walks the committed file with an independent
verification and asserts the test key is not the live key. The offer
in SPEC_SUBMISSION.md is now backed by an artifact rather than a
promise.

### 7b. (superseded original entry)

The spec's own extensions table shows every other extension with
TypeScript, Go and Python support — Signed Offers & Receipts, the one
we just shipped, is TypeScript-only. Not our lane to write Go or
Python SDKs. **What IS our lane, and cheap: conformance vectors.**
We run a live, spec-exact implementation; publishing a small set of
known-good signed offers and receipts (with the verifying key) gives
any SDK author in any language something real to test against, and
puts our artifacts inside their test suites. Naming the gap in the
spec submission costs one sentence and is honest observation, not
obligation.

### 8. Proof-of-personhood (x402 issue #2677)

Adjacent to the human-labor shelf but not the same claim: we sell a
named human's labor; personhood protocols attest that a human exists
behind a wallet. A store certificate for human-fulfilled work is a
WEAK personhood signal and claiming more would overclaim — the exact
drift the maker's mark exists to prevent. **Watch.** Trigger: the
extension reaching the spec repo's normative folder, or a buyer
asking for it through the window.

### 9. Post-quantum signatures (x402 issue #2664)

Ed25519 is not PQ-safe. The honest position: every signature tenure
claim this store makes assumes ed25519 holds, and when that
assumption ages out, the migration path is the one we already built —
a handover, announced under the outgoing key, to a PQ key, with the
old key's artifacts staying attributable via key_history. We built
the rails a PQ migration would ride, without building the PQ.
**Thread-read update, 2026-08-01, and a changed conclusion.** #2664
proposes ML-DSA-65/ML-KEM-768 with scheme identifiers and a session
mode — and its own open-questions list EXCLUDES backward
compatibility. No transition mechanics, no dual-algorithm rollout, no
story for how pre-migration artifacts stay attributable. That missing
half is precisely the succession machinery this store runs: a PQ
migration is a handover announced under the outgoing key, old key
published forever, artifacts attributable across the era change.
Upgraded from watch to CONTRIBUTE: a comment on #2664 naming the
backward-compat gap and offering the transition pattern (prior art
cited, same discipline as the table PR) is drafted in
SPEC_SUBMISSION.md for the keeper's pen. The PQ position statement
itself is now published on /attestation, llms.txt and trust.json —
the assumption named, the migration path stated, the trigger for
adoption explicit. Building PQ signing stays gated on the ecosystem
picking a scheme and the runtime supporting it.

### 10. Execution verification — "did the action actually happen" (x402 #2648/#2650)

The gap one level below our receipts, named precisely: the
offer-receipt extension we ship proves THIS SERVER RETURNED 200 to
this payer for this URL at this time. It does not prove the promised
off-chain action was carried out. Somebody already answered that
question with working code — vaaraio's SEP-2828 (action_ref join
key, RFC 8785 canonicalization, signed execution receipts,
implementations on PyPI and npm), with serious engagement already in
the thread (a proposed five-field split: payment_hash / action_ref /
receipt signature / service_response_hash / world_effect_hash).

**Verdict: solved elsewhere — adopt, don't build.** Racing an open
spec with existing implementations and traction would be the
paraphrase defect at project scale. What we DO hold, and it is the
genuinely additive observation if we ever join that thread: an
execution receipt is still SELF-SIGNED — the service attesting "I did
the thing." That is the exact distinction our /attestation taxonomy
draws between self_signed and third_party_observation, and the
proposed world_effect_hash field begs precisely the question the
taxonomy answers: WHO attests the world effect? A self-signed hash of
it is a claim; an independent observer looking is evidence. This
store already sells the second half — phantom_check IS independent
world-effect verification for hire, and settlement_attestation is the
same shape for chain state. The two schemes compose rather than
compete: their receipt says "we did it," our observation says
"somebody disinterested checked."

**Triggers:** SEP-2828 landing normatively in the spec repo → emit
action_ref-compatible execution receipts for the human-labor orders,
whose deliverables are exactly the off-chain actions in question.
A thread contribution only if we have the composition point to offer
and the keeper wants his name in it — not to advertise.

**Thread-read update, 2026-08-01 (fetched, not summarized):** #2648's
scope question — "is post-settlement accountability in scope for x402,
and where should a binding like this live?" — is UNANSWERED, and the
fetched page showed no comment thread at all. The engagement CV
reported (clementineCU's five-field split, DrVelvetFog's answer) did
not render in our fetch; recorded as unverified rather than
contradicted, since GitHub lazy-loads comments and a fetch showing
none is the instrument, not the fact. #2650 fetched as fully
unanswered — and the asker (an AI operator) wants almost exactly the
shape our certificate now has: who performed the action, what task,
evidence hashes, which x402 payment covered it, independently
recomputable. A draft answer with live URLs is in SPEC_SUBMISSION.md;
different conclusion than 'logged, not chased' — an unanswered
question we can substantially answer with things already running is
an invitation.

### 11. The bus factor

One human fulfils the labor shelf, holds the office password, and
answers the mailbox. /wind-down covers the ending; succession covers
the key; nothing covers a long absence that is neither. The shutter
mechanism (human shelves close honestly when the keeper is away) is
the mitigation and it is real. Genuinely unsolved beyond that, and
probably correctly so — a shop this size hiring a second human to
satisfy a continuity doc would be the tail wagging the dog.

---

## Opportunities (the $ question, from the same walk)

### A. Signed x402 conformance checks, as a product

The generalization of phantom_check plus everything learned this
week: an operator pays a quarter, the store probes their 402, their
offers, their receipts, their did.json and key history, and signs a
third-party observation of what answered as declared. It is the
registrar's round, pointed outward, for hire. Uses an existing trust
model (third_party_observation), existing artifact plumbing, scales
as pure code, and monetizes exactly the expertise this week produced.
**My read: the strongest revenue idea on the board**, because the
buyer is the same x402 builder /try already serves, arriving with a
wallet by definition.

### B. A tiny open-source verifier

A dependency-light package that verifies ANY store's offer-receipt
artifacts, did:web keys and key history — ours included but not
specially. Free tool, our name in the README of the reference
implementation people actually use, and the natural funnel to A: the
free tool checks yourself, the paid product is us checking you and
signing it.

### C. Receipt-treaty first-mover

The causeclaw fixture, now buildable on the standard rather than a
private format. Value is precedent and narrative more than direct
revenue: two small operators honoring each other's spec-standard
receipts is a story the x402 crowd reads, with our name in it.

### D. What was considered and declined

White-label trust layers, consulting, "infrastructure for other
stores" — all collide with the settled ruling that this stays a shop,
and the ruling has an architectural reason (nobody's uptime should
depend on one keeper). A signed observation (A) is a THING SOLD, not
a dependency taken on; that is the line, and it is why A fits and
these do not.
