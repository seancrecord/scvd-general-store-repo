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

### 5. Issuer-liveness beacon (the dead-man pattern) — SHIPPED 2026-08-01

Live at /.well-known/liveness.json. Built differently than first
sketched, and better: computed and signed PER REQUEST rather than
re-signed on a cron, so staleness cannot creep — the document either
serves fresh or the fetch fails, and a failed fetch is the fail-closed
signal. It carries two facts kept deliberately separate: the
infrastructure signs (provable), and the keeper's last provable
counter visit against the shutter's existing 48h presence window (the
same fact the store already acts on when it refuses human-labor money).
It claims nothing an automated signature cannot know, and says so on
the document. Exit recorded: solved.

### 6. KV races (patron numbers, stock units, weekly caps)

Duplicate patron numbers and double-sold drawer units are possible
under real concurrency; blast radius is one novelty item. Durable
Objects is the named v0.2 fix. **Trigger:** two settles inside one
propagation window on the same shelf, observed.

**Sharpened 2026-08-02 by CV's platform read:** the precise ceiling
is KV's 1 write/second per key (every tier — the store is on Workers
Paid, so daily caps are not in play), and the FIRST key to queue
under a real burst is claimPatronNumber()'s shared counter — before
CPU, before the edge. It already fails the right direction (retries,
worst case a shared badge number, never a failed sale). The full
five-question capacity checklist for new features now lives in
AT_SCALE.md; write amplification (~4-5 KV writes per settle) and the
someday storage napkin math (artifacts accumulate forever by design)
are noted there too.

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

### 12. Escrow / conditional release — the gap-hunt, now with research in hand

**CORRECTED 2026-08-01 (on /corrections):** this entry originally
claimed nothing live in x402 holds funds until fulfillment confirms.
False when written — Boson Protocol's x402B (non-custodial contract
escrow, on-chain dispute resolution, redeemable NFTs) has been on
mainnet including Base since 2026-06-08, verified against the live
web during the DR1 vet. The gap is not "nobody has conditional
release"; it is that contract escrow's operational weight (a contract
to run, monitor, and arbitrate) does not fit a one-person shop or
half-cent tickets. The honest mitigation shipped 2026-08-01 stands:
written refund commitment + /fulfillment-log, stated plainly as a
commitment, not escrow.

**DR1 round 1 (Perplexity), vetted 2026-08-01.** The report ranked
eight paths; verdicts after checking its load-bearing claims:

- **Verified by us against primary sources:** x402B exists as above
  (report said May 2026; actually June 8). ERC-3009 semantics
  (validAfter/validBefore checked against block.timestamp at
  execution) — AND the report MISSED a primitive: the spec defines
  `cancelAuthorization`, so a buyer holding an unsubmitted signed
  authorization can revoke it on-chain. That makes the
  delayed-submission construction closer to a revocable hold than
  the report's "not a hold" verdict — buyer protection is stronger
  than reported, at the cost of a gas fee.
- **Reported, not yet verified (Perplexity's bibliography did not
  survive the paste):** the FinCEN 2014 escrow/money-transmission
  ruling, UMA bond economics ($500+ floors), TLSNotary proxy-mode
  timings, Superfluid's no-clawback quote. Directionally plausible,
  all; none load-bearing for a build decision yet.
- **Structural flaw in the report's top recommendation, ours to
  catch:** for THIS store's own sales, the "independent observer"
  cannot be this store — an observer paid by the seller to attest
  the seller's delivery is self-attestation, the exact thing
  /attestation's taxonomy exists to name (and OpenBazaar's
  moderator-collusion history to warn about). The 2-of-3 pattern
  works with us as OBSERVER for trades we are not a party to
  (opportunity A), or with a peer operator observing ours
  (opportunity C — the causeclaw shape). The report glossed this.
- **The proposed experiment (hold buyer's validAfter-deadline
  authorization, submit after delivery, optional buyer-side
  observation): sound design, wrong month.** It assumes a "batch of
  human-fulfilled orders" and 30–60 days of dispute-rate data; the
  store has two organic sales. It also inverts the published
  settle-first law (unpaid labor risk moves to the keeper), departs
  from the standard x402 flow (would need an explicitly-labeled
  experimental tier, or it undercuts the spec-exact positioning),
  and holding unsubmitted authorizations means storing a live
  payment instrument in KV — not fund custody, but a bearer-shaped
  liability the report did not price. **Trigger to run it:** human-
  queue volume that would make the numbers mean something (≥10
  human-fulfilled orders in a month), or a counterparty asking for
  deferred settlement by name — and it runs on ONE clearly-labeled
  item first.
- **Confirmed by the report, already ours:** path 7 (legal-wrapper
  reputational commitment, never custody) is exactly what shipped;
  the custody disqualifier kills HTLC-via-mint and literal UMA
  bonding, as briefed. The never-custody rule gains a legal edge to
  its existing architectural one, pending FinCEN-source verification.

**Round-1 bibliography, captured 2026-08-02** (titles as delivered;
several came without full URLs — flagged rather than invented):
- Independently verified by us: [5]/[7] ERC-3009 spec (we read the
  normative text at ethereum/ERCs — validAfter/validBefore semantics
  confirmed, cancelAuthorization present); [4] Boson x402B (verified
  via live web search: mainnet 2026-06-08, non-custodial escrow +
  dispute resolution + rNFTs, Base supported — report's "May" was
  off by a month).
- Report-cited, unverified by us, plausible: [1][3] Coinbase
  x402-for-Business rollout (July 2026, "no chargeback risk"
  marketing); [2] x402 whitepaper; [6][8] EIP-3009 integration
  guides; [9]-[14] UMA docs + Polymarket dispute coverage (incl. the
  $60M May 2026 Strategy-bitcoin-sale DVM vote and $500-750 bond
  norms); [15][16] OpenBazaar moderator/dispute documentation
  (2-of-3 multisig, Keybase-verified moderators, collusion history);
  [18][19][21] FinCEN CVC guidance + the April 29, 2014
  administrative rulings on money-transmitter exemptions (exact
  ruling numbers demanded in follow-up 1b); [20] California MTA
  exemption note; [22]-[26] zkTLS/TLSNotary cost and proxy-mode
  posts including TLSNotary's own "publicly verifiable ≠ trustless."
- [17] resolved to a bare YouTube link — cited for nothing we kept.

**DR1 round 2 (Claude DR), vetted 2026-08-02 — the strongest report
so far, cross-checked against round 1:**

*Where the two reports CONVERGE (high confidence):* Path 1 (EIP-3009
delayed submission) ranks first in both; third-party arbitration
(UMA min bond ≈ its final fee, Kleros "a few dozen dollars/case") is
economically dead at $0.005–$20 tickets in both — base cost binds
before collusion even matters; the custody disqualifiers kill the
same paths in both (Cashu/Fedimint mints, pooled bonds, true
escrow); and the shipped refund commitment is the correct honest
baseline in both.

*Where they DIRECTLY CONTRADICT (unresolved, 1b arbitrates):*
Perplexity characterized "a 2014 FinCEN ruling" as finding
conditions-precedent fund-holding to BE money transmission requiring
licensure; Claude DR says FIN-2014-R004 holds internet-sale escrow
is NOT transmission when "necessary and integral" to a
transaction-management service, with FIN-2008-R007 as the contrast
case (passive holding = transmitter). Possibly different rulings,
possibly one report wrong. Practical posture unchanged either way:
never hold buyer funds; refunding our own revenue is not
transmission under both readings.

*What round 2 resolved from our own round-1 vet:* the "sound design,
wrong month" objection to the Path-1 experiment is answered — Claude
DR's version runs on Base Sepolia with a test buyer, zero organic
volume required, INCLUDING the adversarial leg (buyer drains wallet
/ calls cancelAuthorization before validAfter). Its kill-criterion
is the honest framing itself: buyers CAN defect, so Path 1 validates
only as a buyer-protection feature the store backs with its own
non-payment risk — "your money stays in your wallet until we
deliver" — never as escrow or a payment guarantee. Mechanic
validation is runnable NOW on testnet; market validation (does the
tier convert) still waits on volume.

*New finds, verified by us against the live web:*
- **Circle Refund Protocol** (Circle Research, 2025-04-17,
  confirmed via circle.com and tier-1 crypto press): non-custodial
  contract where the arbiter can ONLY lock, refund to a
  payer-predefined address, or allow early withdrawal — never
  redirect. The strongest escrow-shaped primitive that clears our
  custody bar; gas-bound below ~$1, plausible for the $1–$20 shelf.
  Round 1 missed it entirely.
- **Cloudflare's facilitator deferred-payment scheme** (confirmed):
  real, but for BATCHING sub-cent high-frequency calls onto a
  settlement cadence — not delivery-conditioned release. What it
  establishes: asynchronous settlement schemes are legitimate x402
  scheme extensions, so a delivery-conditioned scheme would be a
  spec proposal, not off-protocol heresy. That reframes Path 1's
  standards cost.

*New material, report-cited, not yet verified:* x402
`batch-settlement` scheme (May 2026, buyer-deposits escrow for
metering); ERC-8004 identity/reputation registries live on mainnet;
the deliver-first loss analogs (Goldfinch ~$18M, Maple ~$54M 2022,
TrueFi ~$2.96M — well-sourced per the report to DL News/The
Block/CoinDesk) and the arXiv ~5% grant-before-settle exploit rate
(non-peer-reviewed, experimental — useful as a tightening threshold,
not a field fact).

*The menu after two rounds, honestly stated:* at these ticket sizes
true conditional release is either uneconomic (arbitration, per-tx
gas) or risk-SHIFTING rather than risk-removing (Path 1 moves
non-payment risk to the store). The realistic ladder: refund
commitment (shipped) → Path-1 testnet validation (runnable now,
~$0) → if validated, a clearly-labeled premium "money stays in your
wallet until we deliver" tier gated on buyer reputation for larger
tickets → Circle Refund Protocol pilot for $1–$20 if per-ticket gas
pencils. Gemini round 3 and Perplexity 1b arbitrate the FinCEN
contradiction and the x402B seller-surface question before anything
builds.

### 13. Keeper identity and staked reputation — a decision, not a build

Two tiers of the outside trust list turn out to be the same question
wearing two names: "independent confirmation of who the keeper is"
and "something to lose reputationally if the store defects" both
require attaching a real, known identity — and that cuts directly
against a boundary set on day one (the keeper is a public handle by
design; the private doors stay closed). This is a personal exposure
trade the keeper alone can make, and this file records it as HIS
decision, deliberately unmade, rather than a technical gap. A middle
path exists if he ever wants it — a long-tenured verifiable identity
(established GitHub history, a social account with years behind it)
staked without a legal name — but nobody picks that for him.
Meanwhile the buildable share of "track record" shipped as
/fulfillment-log, and the rest of it is time: real strangers, real
settlements, months. Manufacturing volume stays off the table by
house law; the outreach already in motion is the only honest lever.

### 14. Resale and transfer — a category mismatch, named before it bites

What this store issues is proof of AUTHENTICITY, not sole possession:
a "resold" certificate is a copy of signed bytes the seller can keep
and sell again, because a signature cannot enforce scarcity. Not a
missing feature — a category difference between a receipt and a
token, now stated on /rights (transfer_caveat) so no buyer discovers
it inside a dispute. Two honest paths exist if resale ever matters:
on-chain tokenization (real scarcity, wrong weight for a shelf priced
in tenths of a cent) or a store-run holder ledger (old holder signs a
handoff to the new holder's key; reuses the ed25519 machinery; same
self-hosted trust model as everything else here — consistent with the
shop's stance, not a compromise of it). Most of the shelf is not
resale-shaped anyway: souvenirs of an interaction, not collectibles.
**Deliberately unbuilt: this solves for a market that does not exist
at nine days old. Trigger:** a real holder asking to transfer a
unique-content artifact (portrait-class, drawer-class), at which
point the ledger version is the fit.

### 15. The outside gotcha catalog, reviewed against the code (2026-08-01)

An outside AI's production-infrastructure catalog, walked item by
item rather than nodded at — most of it was already answered by the
AT_SCALE walk, and citing beats re-deriving:

- **Key rotation vs. historical receipts:** solved and exercised for
  real. Permanent per-key kids, retired keys append-only in did.json
  with dates and the outgoing-key-signed handover (AT_SCALE #10).
- **Offer hoarding / replay:** solved by design. Offers carry a 300s
  validUntil and are EVIDENCE, not coupons — nothing redeems them;
  the gate rebuilds terms per request and the chain settles an
  authorization nonce exactly once (AT_SCALE #1, #8).
- **DDoS via 402 signing:** accepted with numbers — sub-millisecond
  signs, bounded metric keyspace, rate-capped porch writes
  (AT_SCALE #9).
- **Settle-then-crash / no chargebacks:** accepted with trigger
  (AT_SCALE #2, #3); the buyer-facing half shipped 2026-08-01 as the
  written refund policy and /fulfillment-log. Escrow proper is #12.
- **Clock drift:** checked TWICE and the second look sharpened the
  verdict. CV's audit claimed "raw validUntil comparison in the
  verification path, no leeway" — read against the code, NO timestamp
  comparison exists anywhere in our verify path at all
  (requirement-match.ts validates shape only; validUntil appears only
  at issuance). The comparisons that can bounce a drifted buyer live
  in the BUYER's client and on the chain — so a leeway constant in
  our code would be a fix at the wrong layer, guarding a comparison
  we never make. What shipped instead, at the right layer:
  verifier_guidance on the standards block and the served vectors
  ("issuance is strict, consumption should be tolerant — allow a few
  seconds of skew"), which reaches the code that actually compares.
  Same class as rule 6: the audit's paraphrase of our code was not
  our code.
- **Gas spikes vs. micropayments:** not our layer. The exact scheme
  on Base has the facilitator carry gas; our exposure is facilitator
  pricing, which is a /stack dependency already named there.

The two genuinely new items became #16 and #17. The catalog's closing
question — "which layer do you want to solve?" — has a shop-shaped
answer already on file: opportunity A (conformance checks as a
product) is the layer where this store's answer is a THING SOLD
rather than infrastructure taken on.

### 16. Idempotency keys — the infinite-loop wallet drain — SHIPPED 2026-08-01

Built the same night it was logged, on the keeper's green light: both
buy doors honor it now (Idempotency-Key header on HTTP,
_meta['x402/idempotency-key'] on MCP), scoped by item + payer + hashed
key so honoring a replay requires knowing the paying wallet AND its
secret key; 16-character minimum so "retry-1" is treated as absent
rather than guessably honored; 24h TTL; only SETTLED sales cache
(errors and 402s stay retryable); every failure direction falls
toward a normal charge, which the refund policy already covers.
lib/idempotency.ts. The original entry follows for the record.

### 16b. (original entry, for the record)

The one real hole the catalog found. The chain refuses to settle the
SAME authorization twice, but a non-deterministic agent stuck in a
retry loop signs a FRESH authorization each pass — 500 loops is 500
honest charges, and "the store behaved correctly" is no comfort to
the drained wallet. Our MCP annotations already warn (idempotentHint:
false, "a second identical call is a second charge"), but a warning
is not a mechanism. **The build, when triggered:** honor an
Idempotency-Key header (and its MCP _meta twin) on buy paths — same
key + same item inside a window returns the ORIGINAL result, cached,
unsettled, with the repeat named in the response. KV with a TTL fits;
the race window (two identical keys inside one propagation window)
fails toward a duplicate charge, which the refund policy already
covers — fail closed on money would mean refusing sales for a cache.
**Trigger:** the first observed repeat-purchase pattern that looks
like a loop rather than intent (the fulfillment log and till make
this visible), or a counterparty SDK that sends the header expecting
it to mean something.

### 17. Wallet-authenticated claims — surviving a context reset — SHIPPED 2026-08-01

Built the same night: /api/claims, challenge-response with a
single-use five-minute nonce, EIP-191 personal_sign verified by
recovery (the address comes FROM the signature, never from the
claimant's word), failed attempts burn the nonce so guessing earns
nothing. Returns the proving wallet's own orders with their order
URLs. EOA-only, stated plainly on the door (EIP-1271 needs an RPC
dependency this Worker deliberately does not carry). The sharp edge
the entry named — never accept a bare address — is the door's whole
design. The original entry follows for the record.

### 17b. (original entry, for the record)

An agent pays for a two-hour human job, crashes at minute ten, and
the respawned instance holds no order id — the goods exist, claimed
by nobody. Everything needed already binds: orders and certificates
carry the payer wallet. **The build, when triggered:** a claims door
where a wallet proves itself live (sign a server-issued nonce with
the payer key — never a stored session) and gets back its own orders
and artifacts. Privacy is the sharp edge: the endpoint must prove
possession of the key, not accept an address, or it becomes an
enumeration service for anybody's purchase history. **Trigger:** the
first letter from an agent that lost its order id — the mailbox
answer today is the keeper looking it up by hand, which is the
correct mechanism at eight settlements. Also filed: the legal
half-thoughts from the same catalog (sanctions screening on
anonymous wallets, liability lines on human-executed errands) are
real, unmapped, and NOT a build — they are keeper-awareness items
for the day volume makes them concrete, and the phone_call shelf's
existing keeper-discretion rule is the current, honest answer.

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
