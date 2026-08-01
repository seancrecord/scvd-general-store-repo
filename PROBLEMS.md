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

### 2. Temporally immutable proof of authorization — OTS ANCHORING SHIPPED 2026-08-02

**Shipped:** an append-only hash chain over the key state at
/.well-known/anchor-log.json, with digests submitted to the free
OpenTimestamps calendars and a cron that upgrades pending proofs to
Bitcoin-confirmed. Built to the three rules this codebase already
earned: never on the money path (cron only — no purchase waits on a
calendar server, no calendar outage fails a sale); store the digest
BEFORE trying to anchor it (the chain is ours and survives every
external failure; submission is a separate retryable step recorded on
the entry); and recomputable by a stranger or it proves nothing (full
snapshots published in the exact field order they hash in, next to
the canonical string itself).

The half that makes it more than an ornament: the free verifier now
RECOMPUTES the chain rather than reading it. `verifyAnchorChain()`
rebuilds each canonical form from the snapshot's own fields —
deliberately ignoring the `canonical_form` string the issuer
published, since a log that prints both can print two different
things — re-hashes, checks every previous_digest link, and checks the
sequence for gaps. That catches an edited snapshot, an edited-AND-
rehashed one (the next entry still commits to the old digest), a
deleted entry, and a canonical form that isn't the snapshot beside
it. Tested by lying to it in all four ways, plus the property that
matters most: one Bitcoin-confirmed entry vouches for the whole
history behind it, and that inference is WITHDRAWN the instant the
chain fails to recompute.

Two limits kept in the open, on the route and in the verifier's
return value. `ots.status` is the ISSUER'S CLAIM — the zero-dependency
verifier has no Bitcoin header source, so it hands back the proof and
`ots_status_is_unverified_claim: true` for the caller to settle with
`ots verify` themselves. And the anchor proves WHEN a key state was
committed, never WHO SHOULD HAVE held it: a thief with the key
anchors exactly as validly as we do. It bounds a compromise window
after the fact; it does not prevent one. That is forensics, not a
defence, and #1 above is still the entry that matters.

**Caught the same day, before anyone outside saw it — the how-to
taught a ritual.** The published steps said "run `ots verify` against
the digest" and stopped there. That command proves the digest existed
by some Bitcoin block; it says NOTHING about the date the snapshot
claims. An attacker who rewrote history and re-stamped the rewritten
chain passes every check we had published: digests match, links hold,
a proof exists. What they cannot fake is a block from before they did
it — so the check that actually catches backdating is comparing the
block time against the entry's own `taken_at`, and we had not told
anyone to make it. Now step 4 of the how-to and a `settle_it_yourself`
field on the verifier's result, both tested. THE GENERAL LESSON, which
is the reusable part: an instruction to run somebody else's tool is
not a check until you say what to compare its output against.

**And the limit no chain check can cover, now said rather than left
implicit:** if this store's KV were wiped and a fresh chain started at
sequence 1, it would look genuine to a reader who never saw the old
one. That is inherent to any transparency log and the defence is the
standard one — if you rely on the chain, keep the digest you last saw;
a chain that no longer contains it was replaced, not extended. Written
into the how-to and the verifier README rather than filed as a to-do,
because it is a property to disclose, not a bug to fix.

**The owed live check — LARGELY DISCHARGED 2026-08-02 by CV, who has
a network path this environment does not.** It was recorded as owed
because the agent proxy answers 403 CONNECT to
a.pool.opentimestamps.org:443 (policy denial, confirmed in its own
recentRelayFailures log), so every calendar interaction here is a fake
fetch in a test. CV ran the two checks that mattered:

- **Submission shape accepted, twice, against production calendars.**
  The exact request this code sends — POST /digest, Content-Type
  application/x-www-form-urlencoded, Accept
  application/vnd.opentimestamps.v1, raw 32-byte digest as the body —
  returned HTTP 200 with a real proof from a.pool (277 bytes) and
  b.pool (205 bytes).
- **Proof format round-trips through the reference implementation.**
  Using javascript-opentimestamps (what the `ots` CLI is built on):
  the magic header is genuine (`\x00OpenTimestamps\x00`, i.e. a real
  .ots file rather than a bare calendar response), serialize→
  deserialize returned a byte-identical digest, and `info()` on the
  reloaded proof reported a PendingAttestation — the correct state for
  a fresh unconfirmed stamp.

This closes the failure mode that worried me most: we never parse
proofs (deliberate), so a shape error would have looked like success
all the way to production. It does not look like success. It is
success.

**Still owed, and narrower now:** the confirm→upgrade cycle. Nobody
has waited the ~1-2 hours for Bitcoin confirmation and then watched
`upgradeOtsProof()` turn a pending proof into a complete one against a
real calendar. That is the one remaining modelled-but-unobserved path
(404 while pending, 200 with an upgraded proof after). It gets
confirmed on the first production cron run, or sooner if CV sits on
it.

**Sharpened the same day by CV's read on pending-only chains, and
built:** a chain whose proofs are ALL pending is exactly the state a
chain rewritten TODAY would be in — nothing has confirmed that could
contradict it. Reporting that as "anchored" publishes the attacker's
best case as if it were ours. So both the route and the verifier now
carry an explicit `anchor_confidence` of `confirmed` / `pending_only`
/ `unanchored` / `chain_broken`, deliberately four kinds of answer
rather than a score, so no consumer downstream can collapse
"submitted" and "confirmed" into one green checkmark. Rekor is designed for but not built; OTS is the durable
anchor and the one that closes the gap, Rekor was the fast
corroborating log.

*Original entry, kept:* Our key registry is self-hosted and mutable. The transition chain is
cryptographic (a predecessor cannot be invented without its
signature) and the public git history is third-party-timestamped and
tamper-evident — but none of that is immutability, and the spec
submission says so in its own words. **Trigger for the real thing:**
a counterparty whose verifier requires it, at which point the fix is
anchoring registry digests on Base — the store already has the wallet
and the chain access, and has simply declined chain writes so far.
*Fix candidate superseded 2026-08-02 by the DR2 finding below:
OpenTimestamps/Rekor anchoring does the same job for $0, with no
chain writes from our wallet and no on-chain footprint of ours at
all — see the DR2 block.*

**DR2 round 1 (Perplexity), vetted 2026-08-02 — covers this entry,
#1, and #11 as one cluster. Strong report: honest what-this-does-
NOT-stop sections throughout, bibliography inline.**

- **Top find, and it beats our own filed fix: transparency-log
  anchoring (OpenTimestamps + Rekor).** Every durable signed
  artifact's hash anchored into Bitcoin via OTS's free calendar
  servers (fractions of a cent, batched, verification self-contained
  once the proof upgrades ~1-2h post-confirmation) and pushed as a
  hashedrekord to the public Rekor log (seconds, append-only,
  Merkle-checkpointed). "Signed before date X" becomes checkable
  against Bitcoin itself instead of our self-hosted registry —
  gap (b) closed for $0. THE HONEST LIMIT, stated by the report and
  kept: logs prove WHEN, never WHO-SHOULD-HAVE — a thief timestamps
  as validly as we do. What it buys against theft is forensics: an
  undeniable timeline that bounds a compromise window after the
  fact. *Our shaping notes for a build:* both services take plain
  HTTP (Workers-compatible; the report's CLI framing adapts to
  fetch + a cron that upgrades pending OTS proofs); and the
  highest-value targets are the DURABLE classes — certificates,
  anchors, handover artifacts, and above all the key-registry/
  did.json digest per change — not ephemeral 300-second offers,
  which would be noise.
- **The FROST insight, sharpened by our vet into the design the
  report implies but never states: a key hierarchy.** frost-ed25519
  (Zcash Foundation, RFC 9591, NCC-audited, produces signatures
  indistinguishable from single-key Ed25519 — verify side unchanged)
  cannot protect the HOT key: interactive multi-round signing among
  paper/hardware/successor shares is impossible per-request in a
  Worker. What it CAN protect is a ROOT: day-to-day artifacts keep
  the hot Workers key (bounded blast radius), while key-registry
  updates and succession announcements require the FROST-split root
  — the thing a thief most wants becomes the thing a stolen Worker
  secret cannot touch. Costs the honest trade the report names:
  threshold schemes convert theft risk into loss/availability risk
  (2 of 3 shares gone = capability gone), and a solo DKG ceremony
  done wrong can leak the key.
- **The dead-man distinction, kept verbatim into house thinking:**
  a dead-man switch protects against operator DISAPPEARANCE, not
  IMPERSONATION — a thief holding the key keeps the liveness beacon
  signing on schedule and suppresses the trigger indefinitely. Our
  beacon already claims only what it can (infrastructure liveness);
  this names why that restraint was correct.
- **Time-locked succession: fatal as a standalone,** per the report
  and our prior read agreeing — the veto key is the same stolen key.
  Component only, layered on a FROST root or guardians.
- **Rate-limited co-signer (Nitro/KMS attestation): real but
  second-step.** Strongest raw protection against gap (a); honest
  flaws named — a solo admin can eventually redeploy permissive
  policy, and a rotation carve-out reintroduces a small gap (a).
  ~$30-50/mo and multi-weekend hardening is disproportionate at
  current volume; adds AWS to /stack if ever adopted. Deferred with
  a volume trigger.
- **Cross-operator guardian networks: NO prior art** — the second
  "nobody has built this" cross-operator construction this research
  cycle has surfaced (peer attestation being the first). Notable
  shape: the SAME peer relationship could carry both functions —
  mutual fulfillment attestation and mutual rotation guardianship —
  one counterparty, two trust services, both novel. Logged for T4's
  orbit; months-not-weekends, social infrastructure first.

**DR2 round 2 (Claude DR), vetted 2026-08-02 — the strongest report
of either cycle, cross-checked against round 1:**

*Unanimous across both rounds (decision-grade):* OTS + Rekor ranks
first in both — Claude DR adds the precise trust boundaries
(calendars can censor, never forge; Rekor equivocation is
detectable via signed tree heads but durability is NOT guaranteed,
so Bitcoin/OTS is the durable anchor and Rekor the fast
corroboration). FROST is root-key-only in both (ZF frost-ed25519,
RFC 9591; Claude DR's maturity detail: v3.0.0 as of 2026-04, but
the NCC audit covered v0.6.0 and frost-tools is demo-grade — you
script against the audited library, and there is NO turnkey
solo-operator product; Frostsnap is secp256k1-only, inapplicable).
Dead-man protects disappearance, never impersonation, in both.
Timelock's veto-under-duress flaw named in both.

*Divergence, minor:* Claude DR ranks timelocked succession #2
(Zodiac Delay / Safe Sentinel / Argent as production prior art,
cents on Base) where Perplexity ranked it #4 — Claude DR values it
as anti-QUIET-takeover once pre-rotation exists, and flags real
implementation risk (a June 2026 Delay Module flaw on Gnosis Pay
bypassed a veto gate — audited unmodified contracts only).

*New in round 2, kept:* the OFF-CLOUDFLARE rule for any co-signer —
a second signer on the same platform adds zero independence, so the
bounded-blast-radius design requires a second trust domain (Nitro
Enclave class); tlock/drand timelock encryption as the dead-man
primitive (GA since 2023, Kudelski-reviewed, not post-quantum);
and the KERI recognition — commit-the-next-key-hash pre-rotation is
KERI's core defense, and full KERI tooling is too heavy for one
person while the manual version captures most of the benefit.

*TWO VET CATCHES, ours:*
1. **Claude DR says "you already do manual pre-rotation." We do
   not.** We hold a paper backup of the CURRENT seed and a published
   succession protocol — the pre-committed SUCCESSOR key hash is
   planned (this entry's own "what would actually move this"),
   never executed. The report promoted "planned" to "shipped." The
   catch matters in the good direction: both reports independently
   treat pre-rotation as the single strongest theft defense
   available to us, and it is a ceremony away — generate the
   successor offline, paper it, publish its HASH in an artifact
   signed by the current key. A thief holding the current key then
   cannot rotate to a key they control; they lack the committed
   preimage. Elevated to the top of the staged plan.
2. **"The hot/cold split costs nothing" is wrong for this
   codebase.** The architectural insight is right and convergent
   (both rounds; our round-1 vet said the same): per-request
   beacons cannot share heavy machinery with succession authority.
   But splitting keys touches did.json (second verificationMethod),
   the key registry, /attestation's per-class key mapping, every
   verify surface, and the test suite. Days of coherent
   multi-surface work, not zero — priced honestly before anyone
   builds it.

**THE STAGED PLAN, standing as the build candidate (keeper's go +
Gemini red-team pass pending):**
- *Stage 0a — OTS/Rekor anchoring* (unanimous #1): durable artifact
  classes + registry/did.json digests per change; Workers-native
  via HTTP; weekly upgrade cron; ~$0.
- *Stage 0b — execute pre-rotation* (the vet-elevated item): the
  successor-key ceremony, hash committed under the current key.
  Keeper's hands required (offline generation, paper); the
  announcement artifact and registry field are code we write.
- *Stage 1 — the hot/cold split*, priced as real work; then
  timelocked succession on audited unmodified contracts (cents);
  co-signer stays deferred on its volume trigger, off-Cloudflare
  by rule when it comes.
- *Stage 2 — FROST 2-of-3 on the root key* once it exists as a
  separate root; scripted on the audited crate, loss-risk trade
  accepted explicitly.
- *Never claimed:* anything here defeating an attacker who steals
  the live key AND coerces the keeper — both reports state it,
  the threat model says it out loud.

**DR2 round 3 (Gemini, narrowed red-team brief), vetted 2026-08-02
— the demoted-engine-in-its-lane experiment, and it worked.** Given
only the attack slice (enumerate how a motivated attacker defeats
each layer, cheapest-first, with forensic residue), Gemini returned
a genuinely useful 10-vector assessment. Three were checkable
against our own code immediately:

- **V3 (error handler dumps env into a 500): CLOSED, verified.**
  src/index.ts onError returns fixed prose plus front_door/menu_url,
  never stringifies err or env; console.error logs the error object
  server-side only. The attack this names is real and common; our
  handler already doesn't commit it. Left a note here so the next
  edit to onError knows why it must never interpolate env.
- **V7 (liveness beacon replay): REAL GAP, FIXED SAME DAY.** The
  beacon signed only its own issued_at, so a captured beacon was
  replayable during an outage to fake this-instant liveness. Fixed:
  an optional ?nonce= is signed INTO the payload (client_nonce),
  so a verifier who needs freshness gets a signature that could
  only have been minted for their request, after they chose the
  nonce. No nonce → null → the cacheable statement it always was;
  the guarantee is opt-in and the doc's anti_replay field states
  the verifier's contract. Capped at 128 chars. Commit: "Close the
  liveness-beacon replay gap." Gemini earned its keep on this one.
- **V1 (dependency exfiltrates the Worker secret): standing risk,
  not a bug — logged as its own watch.** No fix is a line of code;
  the mitigations are supply-chain hygiene (lockfile discipline,
  minimal deps — the store already runs a deliberately thin
  dependency set — and outbound-request review). AT_SCALE's feature
  checklist gains this; see below.

The other seven are architecture/opsec, not code, and each maps to
a defense already on the staged plan or already stated as
out-of-scope:
- **V5 (succession race) is the sharp one, and it REORDERS the
  plan.** A thief who steals the live key immediately signs a
  rotation to THEIR key and publishes first; the keeper's later
  paper-backup rotation is rejected as second. This is precisely
  why pre-rotation (Stage 0b) must ship BEFORE it is needed, not
  after theft: with the successor hash already committed under the
  current key, the thief cannot rotate to a key they control — they
  lack the preimage — and the race has no prize. Gemini independently
  re-derived the same top-priority the two full reports reached.
  Also strengthens the case for OTS/Rekor (Stage 0a): an externally
  timestamped legitimate succession history makes a thief's
  competing artifact forensically later, not just contested.
- **V4/V6/V8/V9/V10 (did:web domain hijack, dashboard phishing/SIM
  swap, physical seed theft, $5-wrench duress, Cloudflare insider /
  V8 isolate escape):** opsec and platform-trust, not code.
  Captured as keeper-awareness items — the actionable ones are
  concrete and cheap: registrar lock + hardware-key 2FA (FIDO2, not
  SMS) on both the domain registrar and Cloudflare closes V4 and the
  cheap half of V6 outright; the rest (physical, duress, insider)
  are the residual the threat model already says no design defeats.
  These belong in the keeper's operational runbook, not the repo;
  noted here so they are not lost.

*Cycle-2 close:* three engines again, and the demotion policy
proved correct — Gemini in a narrowed red-team lane produced the
one same-day code fix of the round (V7) and independently confirmed
the plan's top priority (V5 → pre-rotation first). The staged plan
is unchanged in content, sharpened in order: pre-rotation is not
just strongest-defense, it is time-critical against the succession
race. Awaiting the keeper's go on Stage 0.

### 3. Demand

The store cannot engineer a reason to arrive. Everything in the trust
layer removes reasons to bounce; nothing manufactures a visit. The
one lever identified and still unpulled: /try put directly in front
of x402 client builders, in the places they already read. This is
distribution work, human work, and no amount of building substitutes
for it.

**DR3 round 1 (Perplexity), logged 2026-08-02 — market stats are
report-cited directional (two trackers, cross-consistent; not
fetch-verified here because nothing triggers code or a published
claim). The findings that change how we read ourselves:**

- **The reframe: two organic sales is the MEDIAN, not a failure.**
  Per the report, ~45% of x402 volume is organic; of that, 67% sits
  in 10 wallets; MEDIAN seller revenue is ~$0.10 over 30 days.
  Most "sellers" listed everywhere make nothing. Our "supply-side
  excellence, ~2 sales" is the median outcome of directory
  presence, not an anomaly — which kills the temptation to keep
  polishing supply and names the real problem as demand, exactly
  where this entry already put it.
- **Directories are EVIDENCE AGAINST, and our falsifying signal
  already fired.** Listed on 5+ directories, near-zero sales —
  that is the predicted outcome under "directories don't convert,"
  not a contradiction of it. Verdict: zero further directory
  investment beyond hygiene. Settles the SETTLED-list item about
  registry submissions with data instead of a hunch.
- **The finding that VALIDATES completed work: tool-description
  quality is the actual routing mechanism.** Per Anthropic's own
  docs (report-cited), when Claude picks a tool it reads the
  descriptions — "no hidden routing layer." Which is precisely
  what the Glama MCP hardening built: purpose-first lines,
  when-to-use, when-NOT, annotations. That work now has an evidenced
  mechanism behind it, not just a rubric score. Cheap follow-through
  named: add explicit "does NOT handle X — use Y" boundary language
  to the tool descriptions (hours, testable).
- **llms.txt as a demand channel: evidence AGAINST at scale**
  (multiple studies; Google on record it does nothing; no major
  crawler references it). BUT the one surviving use — on-site
  navigation for coding agents already reading your docs — is
  EXACTLY what ours is (the store guide, the standards section).
  So it was not wasted; it just stops being counted as demand-gen.
  Zero further time on it as a growth lever.
- **The highest-upside channel is the one we're already built for:
  the FIXTURE strategy.** Be the reference implementation devs test
  x402 clients against — free /try + published conformance vectors
  (we SHIP these already). Stripe test-mode is the prior art: the
  thing you debug against becomes the thing you ship with. No
  x402-specific case study exists (honest: unproven), but the
  developer pain is real and visible (x402scan cluttered with
  "demo"/"test" listings — people are hunting for exactly this).
  This is opportunities A/B from the same walk, now ranked #1 demand
  channel by an outside pass. Falsifier to watch: zero inbound
  GitHub/PR references to scvd.store as a test target after 60 days.
- **Genuinely unknown, no evidence either way:** agent-to-agent
  word-of-mouth through embedded signed artifacts (our anchors and
  certs get carried into other agents' contexts — no prior art
  found, positive or negative; a real untested bet), and demand-side
  gatekeepers (Skyfire KYA etc.) still too early to have listing
  mechanics.

*Time-allocation verdict the report lands on, and it matches the
store's constraints:* the two highest-confidence lowest-cost moves
are (1) the boundary-language pass on tool descriptions (hours), and
(2) the /try + conformance-fixture sandbox (a real week, unproven in
x402 but strongly analogous and responsive to visible pain). Both
are BUILD-able on our side; the distribution half (getting /try in
front of client builders) stays the human work this entry always
named.

**DR3 round 2 (Claude DR), vetted 2026-08-02 — converges hard with
round 1 and lands the load-bearing finding of the whole demand
question:**

- *Convergence, now decision-grade:* both engines independently rank
  the ROUTING/TOOL-SELECTION layer as the #1 evidenced lever — and
  Claude DR backs it with peer-reviewed work (BiasBusters, arXiv
  2510.00307v2, Oxford+Microsoft, ICLR 2026: semantic alignment of
  tool description to query is the strongest driver; small
  description perturbations shift selection; position and
  pre-training exposure follow). This is the third independent
  validation of the Glama hardening. Both flag llms.txt as
  evidence-against for citations, surviving only as IDE-agent docs
  nav. Both name the fixture strategy as high-upside/unproven with
  the Stripe-test-mode prior art — Claude DR adds the crucial trap:
  httpbin and RequestBin were beloved, free, and UNMONETIZED
  (RequestBin died of free-target abuse), so a /try door needs a
  designed free→paid bridge AND a rate limit or it becomes a cost
  center, not a channel.
- *The retrieval bottleneck, sharpened:* "Incumbent Advantage"
  (arXiv 2606.17443) — identical-spec tools go 100% to the
  recognized brand, and an unknown brand is retrieved only ~6.1% of
  the time in top-5. Implication for us: we lose head-to-head on
  brand, so the only winnable game is (a) get retrieved at all
  (semantic description quality — the boundary-language pass) and
  (b) be UNIQUELY relevant, never framed as a functional substitute
  for an incumbent. That reframes the description pass from "polish"
  to "the one move that fights the actual bottleneck."
- *THE FINDING THAT OUTRANKS EVERY TACTIC — product-market fit, not
  marketing.* Both reports, arriving separately, say the proven
  autonomous x402 demand today is for LIVE DATA FEEDS and INFERENCE
  — and this store sells signed artifacts, memory, and human-labor,
  categories with NO documented autonomous demand yet. Claude DR is
  blunt: "the demand channels will not manufacture demand for a
  category buyers aren't buying." The honest read: our two sales
  aren't a distribution failure to fix with better descriptions;
  they may be a category that hasn't arrived. This is logged as the
  real problem behind #3, above any tactic.
- *And the bridge both the demand research AND the earlier
  opportunity walk point at the SAME thing:* Claude DR's single
  most-valuable recommendation is to expose a SKU in a category
  agents DO pay for — naming "a paid x402-conformance-check
  endpoint" explicitly. That is opportunity A (PROBLEMS "Opportunity
  A: signed conformance checks as a product"), independently
  re-derived from the demand side. Two separate research threads —
  "what's our strongest revenue idea" and "what do agents actually
  buy" — converged on the conformance-check product. That
  convergence is the strongest signal in either cycle for what to
  build next after the trust-layer work.

*Cross-checked verdict — the demand plan, ordered:*
1. Boundary-language pass on tool descriptions (hours, highest
   evidence, fights the retrieval bottleneck) — BUILD-able now.
2. ~~Verify Bazaar cataloging~~ — **DONE 2026-08-02, and the answer
   is YES.** CV ran `/v2/x402/discovery/search?query=...`: the store
   returns under both its name and its domain, tagged
   `serviceName: "SCVD General Store"` with the full tag list, across
   at least five items (the_collab, graffiti_on_a_train,
   small_blessing, hello, dibs) — carrying real `lastCalledAt` and
   quality figures that match our own /pulse. **Step one of demand was
   already done and we did not know it**, which is worth sitting with:
   the item on this list was "find out whether we are discoverable,"
   and the honest reading of the answer is that discoverability was
   never the bottleneck. Two live consequences: (a) CDP holds usage
   data on us, so agents reaching these items is a measurable fact
   rather than a hope, and (b) the "beautiful and unused" worry
   attached to the anchor log and opportunity A cannot be answered by
   pointing at obscurity — we are findable, so whatever is or is not
   happening is happening to a store that CAN be found. The remaining
   distribution work (curated lists — Agentic.Market categories, Merit
   skills) stands unchanged.
   *Its first answer was WRONG in the other direction* — a list
   endpoint filtered by a parameter the API silently ignores, read as
   "not listed." Our own `scripts/bazaar-check.mjs` had the same
   defect in a different costume (one page of a paginated list,
   printing `VERDICT: ABSENT`) and has been rewritten so search is the
   authoritative pass and a list-page miss cannot print a verdict
   alone. See AT_SCALE rule 5, sharpened the same day.
3. The /try + conformance-vectors sandbox WITH a designed free→paid
   bridge and a rate limit (the RequestBin lesson) — BUILD-able,
   a week.
4. **Strategic: the conformance-check SKU (opportunity A), now
   double-confirmed as both our best revenue idea AND a category
   with documented demand.** This is the DR4 question's likely
   center of gravity.
Gemini red-team brief 3 (attack this plan) still to run before any
push; DR4 (strategy) will decide the conformance-SKU question with
its own cross-check.

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
(drafts since removed from the repo at the keeper's call) is now backed by an artifact rather than a
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
a draft for the keeper's pen, since removed from the repo. The PQ position statement
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
recomputable. A draft answer with live URLs was written and since removed from the repo;
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
pencils.

**DR1 round 1b (Perplexity follow-up), vetted 2026-08-02 — the
round that resolved things:**

- **The FinCEN contradiction is RESOLVED: two rulings, not one.**
  Both earlier reports were right about different documents.
  FIN-2014-R012 (2014-10-27): the company holding funds WAS money
  transmission — "not covered by either the payment processor or the
  integral exemption." FIN-2014-R004: escrow WITH active
  transaction-management (establishing conditions precedent and
  validating their discharge) IS exempt as integral. The line:
  active management of conditions can exempt; bare fund-holding
  cannot. On HOLDING AN UNSUBMITTED AUTHORIZATION: no ruling on
  point — the reasoned inference (an unexecuted signature is not
  "acceptance of currency, funds, or value"; the buyer's balance is
  untouched throughout) is plausible-but-unconfirmed, and per Rule
  0's carve-out it gets counsel before operational reliance, not a
  commit. Ruling quotes are report-cited (fincen.gov bot-blocks our
  fetches); exact numbers and dates on file.
- **cancelAuthorization VERIFIED on USDC-on-Base** (the live
  contract implements it, typehash on file; signable with the same
  EIP-712 stack agents already run; gas sub-cent, inferred-and-
  flagged). Race semantics now precise: cancel and submit target
  the same nonce, first-mined wins, so the kill switch is a
  MITIGANT needing a time margin, not a last-second guarantee.
  Path 1 upgraded accordingly: a real, tooled buyer kill switch.
- **The x402B seller surface, ANSWERED — and it moves a ruling to
  the keeper's desk.** Per Boson's docs (report-cited) and the
  x402-escrow-schema README (VERIFIED by us): a seller integrates
  without operating any contract — Boson runs the Diamond escrow
  and a hosted facilitator; the seller does a one-time on-chain
  registration, adds one accepts[] entry, and wires a fulfillment
  channel (email/webhook among them). Human/async deliverables are
  IN SCOPE: "physical goods, generated content, gated access
  credentials, and asynchronous services all have a provable gap
  between 'funds sent' and 'resource received'" — round 1's
  digital-only framing was never sourced and is withdrawn. **Open
  blockers before any pilot:** fee mechanics undisclosed in every
  retrieved document; the dispute-resolver network's fairness and
  cost unaudited; and adopting it adds a real dependency on Boson's
  facilitator uptime — smaller than running escrow ourselves, not
  zero, and disclosed to buyers if ever adopted. Whether the
  no-escrow stance gets its dated Rule 0 re-open is now a decision
  with facts under it, and it is the keeper's.
- **Peer attestation (T4): nobody has built it.** No prior art
  exists for peer-merchant mutual-attestation networks — the
  structural honesty conditions (cross-linked public breach logs;
  reciprocity as mutual hostage) are argument, not validated
  finding, and an exchanged pair with a peer would be a genuine
  first. Also: no professional notary/oracle market takes
  $0.005–$20 attestation jobs — our observation product appears to
  be rare-to-unique at this scale (moat evidence for opportunity
  A). Adjacent commercial find: x402Disputes, $0.05/dispute
  AI-assisted post-hoc arbitration — dispute resolution, not
  delivery attestation; track record unverified.
- **Held-authorization handling, from Stripe's auth/capture prior
  art, kept as Path-1 design notes:** model every held
  authorization as an explicit state machine (signed → held →
  checked → submitted/cancelled/expired) persisted in KV; encrypt
  at rest; use EIP-3009's own validBefore as the expiry rather
  than inventing a TTL; idempotent writes throughout; and disclose
  honestly that Workers+KV is not a PCI vault — the instrument is
  less sensitive than a card number, the storage is less hardened
  than Stripe's, both true.
- **Bibliography delivered in full** (URLs on file in the report),
  including the official x402 batch-settlement page and the arXiv
  "Five Attacks on x402" paper — the round-1 unverified column is
  now largely graduated or superseded.

**DR1 round 3 (Gemini), vetted 2026-08-02 — weakest sourcing of the
three, two real contributions:**

- *Citation integrity: poor.* Three of its first references resolve
  to the same Avalanche academy page; others are irrelevant (an ABA
  banking-law page, a French fundraising list, a WEF PDF); bracket
  numbers repeat on paragraphs regardless of content. Its claims
  count only where they converge with better-sourced rounds.
- *Third FinCEN ruling number, third framing:* Gemini cites
  "FIN-2014-R009, agent-of-payee." The cycle has now produced R004,
  R009, and R012 for adjacent concepts — and agent-of-payee is
  substantially a STATE money-transmission doctrine (Gemini's own
  supporting reference is a California DFPI letter). The confusion
  across three careful-sounding reports is itself the finding: the
  ruling landscape is genuinely muddled, all three agree the
  DIRECT-SELLER position is safe, and nothing beyond that gets
  relied on without counsel. Unchanged posture, better documented.
- *Its "50–80% default rates" for deliver-first: unsupported.* No
  source given survives inspection; Claude DR's specific lumpy
  losses (Goldfinch/Maple/TrueFi) remain the best evidence, and
  they describe concentrated correlated losses, not a 50–80% rate.
  Discarded.
- *Contribution 1 — the Sybil harvest attack, kept:* an adversary
  ages or buys clean burner wallets, submits deliver-first work
  requests across many vendors in parallel, harvests outputs,
  defaults on all invoices; wallet-acquisition cost < aggregate
  stolen labor. The sharpest adversarial argument against
  reputation-gated inversion in the whole cycle, and it binds our
  Path-6 thinking: deliver-first only ever ships gated on
  NON-FUNGIBLE identity signals, small tickets, and eaten-loss
  budgets — never as a default.
- *Contribution 2 — the adversarial validation script, kept:* a
  concrete Base Sepolia nonce-burn/balance-drain sequence proving
  EIP-3009 is not a hold (expected revert:
  AuthorizationIsUsedOrCanceled). Complements Claude DR's
  experiment; together they are the full testnet protocol — prove
  the mechanic AND prove its failure mode, so the honest framing is
  forced by evidence.
- *Its Phase-3 roadmap: REJECTED on house law.* "Worker
  automatically triggers an on-chain USDC refund from the
  operational wallet" requires a hot spending key inside the
  Worker. This store's standing design is the opposite — the Worker
  never holds a spending key and never moves money; refunds are the
  keeper's hand. A hot wallet is a new attack surface bolted onto
  the component most exposed to the internet, and no report finding
  justifies it.
- *Observer bribe math, sharpened and kept:* at micro tickets a
  bribe exceeds an observer's cumulative fee income, so observer
  honesty must rest on reputation collateral, not fees — which is
  exactly the peer-with-a-public-breach-log design T4 proposes, and
  a working argument for why OUR observation product (backed by
  /corrections-grade reputation) is credible where a fee-only
  micro-notary would not be.

---

**DR1 CYCLE SYNTHESIS — filed for initial review, 2026-08-02.**
Three independent reports (Perplexity + follow-up, Claude DR,
Gemini), every load-bearing claim vetted, primary sources fetched
where reachable. The keeper asked for cost-benefit, differentiation,
what it opens, and confirmation nobody else is here. Filed:

*The convergent finding (all three rounds, high confidence):* the
only conditional-release shape that fits this store — non-custodial,
Workers-native, no new legal surface, honest — is EIP-3009
delayed submission: buyer signs with validAfter = fulfillment
deadline, store holds the authorization unsubmitted, delivers, then
settles. It is NOT a hold and is never marketed as one: the buyer
keeps a verified on-chain kill switch (cancelAuthorization, live on
USDC-Base) and can drain the balance; the store bears non-payment
risk. It is a buyer-protection tier the store backs with its own
labor risk.

*Cost:* testnet validation ≈ $0 (both experiment scripts on file —
the happy path and the adversarial nonce-burn). Build cost if
validated: a held-authorization state machine in KV (design notes
from Stripe auth/capture prior art on file), encrypted at rest,
validBefore as native expiry — days, not weeks, of work. Legal
cost: one counsel review of the held-authorization reading before
mainnet reliance (Rule 0 carve-out). Operating cost: bounded unpaid-
labor risk per defecting buyer — cap exposure by ticket size
(start: human items ≤$8), so worst case is one keeper task unpaid,
which the store survives trivially and prices in.

*Benefit and differentiation:* "your money stays in your wallet
until we deliver" — a one-sentence differentiator NO x402 service
offers today, stacking on the wallet-safety pair (idempotency +
claims) to make this store the one designed end-to-end for the
buyer's failure modes. It converts the trust layer from defensive
(we won't cheat you) to affirmative (we structurally can't take
your money without performing).

*Uniqueness, confirmed to the limit of three research passes plus
our own searches:* nobody is doing non-custodial delivery-
conditioned settlement in x402. The adjacent rails differ in kind —
x402B and Circle RP lock funds in contracts (custody moved, not
removed; different trust shape), Cloudflare's deferred scheme is
usage metering. Also confirmed unique-adjacent: no micro-notary
market exists at our ticket sizes (our observation product stands
alone), and peer-merchant mutual attestation has NO prior art
anywhere (T4's pilot would be a first).

*What it opens:* (1) a premium tier with honest pricing for the
labor risk; (2) a spec-contribution candidate — a delivery-
conditioned settlement scheme proposal, legitimized by the
precedent that x402 schemes are extensible (CF's deferred scheme),
feeding T5's standards-authorship strategy; (3) the observer leg —
if the pattern spreads, every adopter needs independent delivery
attestation, which is opportunity A's product sold at ecosystem
scale; (4) the T4 peer pilot becomes the live demonstration.

*Next gates, in order:* (1) run both testnet scripts (anytime, ~$0);
(2) counsel on the held-authorization reading (before mainnet);
(3) keeper decisions with facts under them — the Path-1 tier
build, and separately whether x402B earns a Rule 0 re-open once
fee/resolver questions resolve (CV's T3 read pending). Nothing
builds before its gate.

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

### 18. The reconciliation was blind to the failure it looked like it covered — FIXED 2026-08-02

Found 2026-08-02 while scoping CV's settle-then-crash idea
(CORRESPONDENCE T13), and it is worse than the idea it came from,
because the instrument already exists and reads healthy.

`reconcileSettles()` compares settle COUNTERS against PAYER ROWS and
reports `unexplained`, with the two legitimate differences named. It
is a good instrument for the axis it measures. But the money path in
payment-gate.ts runs:

    processSettlement      ← money moves
    recordSettlement       ← counter AND payer row both written
    await next()           ← the handler that mints the artifact

**Both sides of that reconciliation are written before delivery is
attempted.** So the settle-then-crash case — payment settled, handler
throws, no certificate or order ever created — bumps the counter,
bumps the payer row, mints nothing, and the reconciliation reports
`unexplained: 0`. The books balance. The buyer got nothing. And the
one number anyone would check during that incident is the number that
cannot see it.

This is rule 5 exactly: a zero from a probe that cannot observe the
thing is not evidence the thing is fine. The blast radius is the worst
class this store has — money taken, goods not delivered, no complaint
guaranteed because the buyer may be an agent that is no longer
running. It is also invisible to /fulfillment-log, which reports on
orders that EXIST.

**The fix, in two parts and the second matters more:** (1) add the
missing third axis — settled purchases against artifacts actually
issued — on the existing hourly cron, alerting on any gap; (2) make
`reconcileSettles()` state on its own output that it does not cover
delivery. A number that reads healthy while blind is worse than no
number, and the correction that matters is the one that stops the
healthy reading being trusted for something it never measured.

**BUILT the same day, both halves.**

*(1) The missing axis.* An intent row opens after settlement and
before the handler, and is deleted only when the handler returns a
2xx. Anything still sitting there past a ten-minute grace window is a
sale that took money and delivered nothing; the hourly cron finds it
and pages, and /admin/deliveries is the desk. The row is keyed on the
settlement transaction where there is one, because that is the fact an
outsider can check on Base. It reports rather than repairs, on
purpose: re-running a handler whose side effects are unknown could
double-deliver, and a refund is money moving, which never happens on a
cron here. What it buys is that the keeper finds out before the buyer
does.

*Failure direction chosen deliberately:* a failed intent write never
fails the sale — refusing a paid customer because a bookkeeping row
would not write is the wrong trade — so such a sale is invisible to
the audit rather than falsely flagged. A failed CLEAR after a good
delivery leaves a false alarm. A false alarm the keeper dismisses
beats a silent loss he never hears about.

*(2) The honesty fix, which matters more.* `reconcileSettles()` now
carries `does_not_cover` on its own output, stating that both its
sides are written before delivery and that a clean zero says nothing
about whether goods went out. The bug was never that the number was
wrong; it was that a correct number was load-bearing for a question it
could not answer.

**A second bug fell out of testing this, and it was the wider one.**
The audit's own "survives a corrupt row" test failed: KV's bulk JSON
read rejects the ENTIRE batch if one key holds unparseable data.
Every list-then-read in this store goes through `bulkGetJson`, so a
single corrupt row could 500 the published anchor log or blind the
delivery audit — an instrument that stops working exactly when the
data is already damaged, which is the wrong shape for a safety net.
Fixed at the helper: a failed batch falls back to per-row text parse,
so readable rows survive and an unreadable one degrades to `null`,
which is the case every caller already handles. Found only because
the test put junk in a row on purpose.

**Coverage boundary, recorded rather than assumed:** the
post-settlement failure path is proven at the unit level but not end
to end, because inducing it needs a route that fails after taking
money and there is deliberately none — every pre-flight refusal,
sold-out included, runs before the gate and moves no money. Adding a
money-losing route to prove money-losing routes are detected is the
wrong trade.

### 19. The idempotency cache was collectable without a signature — FIXED 2026-08-02

Found while scoping CV's T11 (pre-supply an Idempotency-Key in the 402
challenge), and it is the reason T11 must NOT be built as asked.

The cache holds a buyer's actual goods — the certificate they paid
for — keyed by (surface, payer, hashed key). The replay lookup ran at
the TOP of the gate, off `payerFromPaymentHeader`, which is
`JSON.parse(atob(header))` and a field read. No verification, because
verification happens later in `processHTTPRequest`. So the store
handed a cached purchase to whoever ASSERTED the buyer's address, and
a buyer's address is public on Base. Same hole, same shape, on the MCP
door via `payerFromPaymentMeta`.

**Not a live exploit, and worth being exact about why:** honoring a
replay also required the Idempotency-Key, which is a caller-generated
secret we never publish. The documented model even says so — "honoring
one requires knowing the paying wallet AND its chosen key". So the
defence was real. It was also SINGLE, and resting entirely on a value
the caller controls and can leak through a log, a shared client
library, or a predictable generator. One disclosed key meant one
wallet's goods collectable by a stranger.

**Fixed by moving, not by adding crypto.** Both doors already had a
seam between verify and settle — `processHTTPRequest` returns a
verified `paymentPayload`, `processSettlement` is a separate call. The
lookup now happens there, against `payerOfVerifiedPayload()`, a
deliberately separate reader from the header-decoding one so the
unsafe reading cannot be selected by accident. A replay now takes the
private key rather than knowledge of an address. It costs one verify
round trip on the replay path, which the looping agent this exists for
already pays: it signs a fresh authorization every pass by definition
(#16). `payerFromPaymentMeta` was deleted rather than left unused,
because an unverified payer reader sitting in the file is an
invitation to the same bug.

*Proven, not asserted:* the regression test was run against the old
code first and fails there, passes here.

**What this means for T11:** publishing a suggested key in the public
402 would have converted the one secret into public knowledge. With
the payer now verified the cache is safe even if a key is public, so
T11 becomes buildable — but on its own merits and after this, not
before it.

**A process finding fell out of the same hour, and it is the more
embarrassing one.** `npm run build:check` is `wrangler deploy
--dry-run`: esbuild bundling, which STRIPS types without checking
them. It had been standing in for a typecheck all session and it
bundled a reference to a deleted variable twice without complaint; a
test caught it. `npm run typecheck` (tsc --noEmit) is the real one,
and running it surfaced 25 further type errors sitting in committed
test code plus a `.d.ts` that had drifted from its implementation.
All fixed, and AGENTS.md now says which command is which.

---

## Opportunities (the $ question, from the same walk)

### 0. The reframe that reorders everything below: OBSERVATION, not verification

Logged 2026-08-02 on the keeper's insight, sharpened by a Cloudflare
CPU-limit change and converging with the strategy pre-mortem's
enclosure finding (DR4 #3) and #10 (execution verification). The
distinction the whole opportunity set turns on:

- **VERIFICATION is offline crypto math** — does this JWS validate,
  does this did.json resolve, does this receipt match the spec.
  Anyone can run it; it is forkable by design; it is CPU-trivial
  (Ed25519 is sub-millisecond); and it is exactly what the x402
  Foundation and CDP will bundle FREE. Gemini's FM3 said this gets
  commoditized to zero and the pre-mortem said an independent
  syntax-checker is roadkill. Both correct. So verification is B —
  the free public good — and it stays free BECAUSE it cannot be
  defended. Trying to charge for it is trying to sell arithmetic.

- **OBSERVATION is going into the world and looking, then signing
  what was seen** — phantom_check (was that URL up 6h later?),
  settlement_attestation (what does the chain actually say?), and
  the one that matters most, DID THE SELLER ACTUALLY DELIVER WHAT
  THEY PROMISED. You cannot fork this into an offline library,
  because the value is not the math — it is the act of a
  disinterested party having gone and looked at a specific moment.
  It is I/O-bound (fetch, wait — the work the 100ms CPU ceiling does
  not even charge for), and it is the behavioral layer platforms
  explicitly disclaim. This is A's defensible edge.

The CPU realization and the pre-mortem's enclosure cut are one truth
from two angles: **the store's moat is observation, not
verification.** You can copy a verifier; you cannot copy the act of
having watched. This resolves the free-rider trap (FM3) at the root
and re-aims A below.

### A. Signed x402 OBSERVATIONS, as a product (re-aimed 2026-08-02)

Originally framed as "conformance checks": an operator pays a
quarter, the store probes their 402/offers/receipts/did.json/key
history and signs what answered as declared. That framing survives
only for the SYNTAX half — which entry 0 above just moved to B, the
free tier, because the platform will give it away. The paid product
re-aims to the half that cannot be commoditized: BEHAVIORAL
observation, sold to the party who bears the RISK (the SELLER or
operator protecting its reputation, NOT the transacting buyer-agent,
who optimizes for price and won't pay for a badge — the pre-mortem's
deepest cut). Concretely: "we watched whether your service actually
delivered against its own declared terms, over this window, and
signed what we saw" — the generalization of phantom_check pointed at
a counterparty's behavior, not its syntax. Uses the existing
third_party_observation trust model and artifact plumbing; the
distinction from a facilitator's inline payment validation is that
this attests DELIVERY, which no facilitator touches. **Still the
strongest revenue idea on the board — but gated behind B per both
DR4 rounds, priced like a commodity check per DR4's Let's Encrypt
band, and trigger-dependent (no buyer until risk forces one).**

### B. A tiny open-source verifier (the free VERIFICATION tier) — SHIPPED 2026-08-02

Live at verifier/ in this repo: x402-verify.js, zero dependencies, MIT,
works on ANY store's artifacts with nothing privileged about ours.
Keeps the four checks separate on purpose (parse / resolve the kid to
a key from somewhere other than the artifact / verify the signature /
validate the schema) because signature validity and schema validity
are NOT the same check — and proves it: the suite runs the library
against our own published conformance vectors and asserts the
teaching case (a valid signature over a schema-invalid payload) is
rejected for the schema reason, not the signature one. Crypto and
fetch are injectable seams so a runtime without Ed25519 in WebCrypto
can still use it. Expiry is advisory and never folded into ok, with
caller-set leeway — issuance strict, consumption tolerant. The honest
limit is stated in the module, the README and the standards block: it
verifies cryptography and shape, and CANNOT tell you whether a seller
delivered, because no offline check can. That gap is the reason this
tier is free and observation (A) is not. Surfaced in trust.json's
standards block and on /agents.md.

The two red-team constraints, honestly reported: the versioned
fixture and the live-authority hook are NOT built. The hook was
designed for a key-liveness/registry lookup only we can answer, which
depends on the OTS/Rekor anchoring in #2 that has not shipped yet —
building a hook with nothing behind it would be the ornament this
ledger exists to prevent. Next build closes it.

**Update 2026-08-02 — the live-authority hook is now CLOSED, and it
closed differently than the red team framed it.** `checkAnchoredKeyHistory()`
takes a did:web and a key and answers when that key first appears in
the issuer's anchored history and whether a Bitcoin-confirmed entry
stands at or above it — which is exactly the "was this key authorized
AT THE TIME" question offline math cannot reach.

The framing that changed: the red team wanted the hook to be a lookup
ONLY WE CAN ANSWER, so the fork becomes the funnel. We built it
GENERIC instead. It reads any issuer's /.well-known/anchor-log.json,
nothing about ours is privileged, and an issuer without one returns
`available: false` rather than failing. That is a deliberate trade of
lock-in for adoption, and it is the same bet entry 0 makes: the moat
is OBSERVATION, not a proprietary hook bolted to a public library. A
verifier that only worked properly against its author's own store
would be an advertisement, and nobody vendors an advertisement. If
the ecosystem picks up the shape, our log is one of many it can
check — and the reason to come back to us was never the lookup.

Still not built: the versioned /try/v1 fixture endpoint.

### B (original entry)

A dependency-light package that verifies ANY store's offer-receipt
artifacts, did:web keys and key history — ours included but not
specially. This is the VERIFICATION half from entry 0: offline crypto
math, forkable by design, free because it cannot be defended, and
that is the point — it is the public good that builds reputation and
the funnel. Two constraints from the demand red-team, written before
a line of it exists: (1) an optional LIVE-AUTHORITY lookup only we can
answer (key-liveness against the beacon we ship; registry/breach
check against the OTS/Rekor-anchored history from #2's plan) so the
fork is the funnel and the live call is the reason to come back —
without it, pure offline math gets commoditized on day one; (2) a
versioned, frozen, rate-limited fixture endpoint (/try/v1) so CI
pipelines that hardcode it cannot be broken by a schema change, and
so a free sandbox cannot be drained. The paid product is NOT "us
running this same math for you" — it is OBSERVATION (entry A), a
different thing you cannot fork.

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

---

### DR4 round 1 (Perplexity), vetted 2026-08-02 — REFINES the A/B ordering above, does not just echo it.

Market stats consistent with DR3 (same trackers, cross-verified
there); the strategy findings:

- **The pricing bands, and the one that survives, decide how A is
  priced IF built.** Third-party attestation has three historical
  tiers: SOC 2 ($25k-70k, needs an accredited firm's liability and
  brand — structurally inaccessible to a solo pseudonymous
  operator); BBB ($400-1500/yr, reputationally WEAK because it is
  pay-to-play accreditation the buyer knows is bought not earned);
  and the Let's Encrypt commodity tier ($0-100, survived by being
  independently verifiable WITHOUT trusting the issuer's brand).
  Only the third fits us, and it fits exactly: A must price like a
  commodity check (single dollars, the quarter already planned),
  publish precisely what was tested and how, and lean entirely on
  the signed observation being cryptographically checkable — because
  institutional authority is the one thing a solo pseudonymous
  operator cannot buy or fake, and claiming it would break the
  honesty law. This is a design constraint on A, not just a price.

- **THE SEQUENCING REFINEMENT — B before A, and why it matters.**
  The A block above calls A "the strongest revenue idea on the
  board." DR4 does not contradict the DIRECTION (both research
  cycles confirm verification is where our edge and the demand
  converge) but corrects the ORDER: A is UNPROVEN — no evidence
  exists of anyone paying for x402 third-party attestation yet, a
  genuine gap, uncontradicted but unvalidated. B (the free verifier)
  is the de-risking funnel: cheap to build, ships inside the
  8-hr/week budget in a month, targets the same Stripe-test-mode
  fixture mechanism, AND its adoption IS the missing evidence for
  whether anyone values conformance checking at all. Building A
  before B is observed is building a paid product for an unconfirmed
  market. Revised sequence: (1) operate + polish vectors + run the
  description pass continuously; (2) ship B free; (3) attempt A only
  once B shows inbound; (4) C stays opportunistic (needs a willing
  peer — T4's territory). Logged as a correction to the A-first
  implication, per Rule 0's "a pivot has a date on it."

- **The falsifier that would flip B-before-A:** if B ships and gets
  zero external engagement in 8 weeks WHILE a paid-A request arrives
  anyway (a peer asking "check my offers/receipts and sign it"),
  that means demand is real but does not route through a free funnel
  — skip straight to minimal paid A at commodity price. The inverse
  (B adopted, nobody ever asks about paid) says A's payoff is
  reputational not commercial, and A deprioritizes further. Either
  way B is the instrument that tells us which world we're in.

- **Pinboard is the closest analog, and it VALIDATES what the store
  already does.** One person, anti-growth, paid from day one, ~$212-
  250k/yr on near-zero costs, no ads, sustained 15+ years — and
  Ceglowski credits three things: charge real money immediately
  (filters for committed users), radical minimalism, and — his
  words — "if I wasn't funny and if I couldn't tweet, I don't think
  I could make this work." The store already charges from day one
  and already has the voice. Reality-check kept honest: of ~1000
  scraped solo products, 80.9% make under $500 MRR and only 12 clear
  $10k — Pinboard-scale is the tail, not the median, so the honest
  baseline for this store is modest revenue on low costs, not a
  breakout. That is not a downgrade; it is the operating philosophy
  already in the wind-down doc, confirmed from outside.

- **The novelty shelf is a MOAT, with a sharp caveat that becomes a
  design rule.** Significant Objects (thrift trinkets, $128 → $3,612
  on invented backstories, measured +6258% from narrative alone) is
  real experimental evidence that voice raises value and
  memorability independent of utility; Pinboard corroborates at
  whole-business scale. BUT no evidence tests voice-moats on TRUST
  products specifically, and the defensible synthesis is a rule we
  keep: voice is TOP-OF-FUNNEL (makes the store rememberable and
  referred — luckies/dibs/graffiti do marketing without marketing),
  while the trust products must stay LEGIBLE AND SERIOUS at the
  point of technical evaluation. They do not compete for the same
  attention. The actionable constraint for when A/B ship: the
  conformance reports themselves stay boring and precise — never
  make the attestation cute. Cutting either layer weakens the
  business; conflating them would hurt conversion exactly where it
  matters.

### DR4 round 2 (Claude DR), vetted 2026-08-02 — RESOLVES the fork, and one competitive claim VERIFIED live.

- **THE FORK IS RESOLVED: both DR4 engines independently land on
  B-before-A.** Claude DR sequences it identically to Perplexity —
  Month 1 ship the free verifier (B) + operate honestly to age the
  track record; Month 2 distribution-as-being-the-example; Month 3
  soft-launch paid A to the qualified-lead list B surfaces. The
  A-first implication in the Opportunity block above is now
  superseded by two-engine agreement, not one. Build order settled.

- **The load-bearing risk, named cleanly: A is TRIGGER-dependent.**
  Every paid-attestation business that survived had an external
  trigger — a compliance MANDATE (SOC 2, sold by Vanta/Drata who
  sell the badge not the audit), a measurable CONVERSION LIFT the
  customer rewards (trust seals), or a counterparty DEMANDING
  validation (OV/EV certs for banks). x402 has NONE yet: no enterprise
  refuses to transact with a non-conformant x402 seller. The bet is
  that the store can be READY and REPUTABLE when the trigger arrives;
  if it never does, A stays a hobby line and B + honest operating IS
  the business. The CA cautionary tale sharpens it: Let's Encrypt
  annihilated paid DV certs (16:1 migration away from GeoTrust), and
  paid attestation survives only where it attaches to a mandate.

- **The competitive claim, VERIFIED by us against the live web
  (2026-08-02) because the whole A/B thesis rests on it:** Claude DR
  says the full-scope conformance-verification niche is empty. Search
  confirmed the adjacent players and their scope precisely —
  402audit.com does SERVICE QUALITY (proxy detection, pricing-markup,
  reliability scoring, public leaderboard); x402station.io does a $1
  badge gated on UPTIME (≥95% over 7 days), re-run on render; Vauban
  VPSF is a receipt FORMAT extension (IETF drafts), not an attester.
  NONE does the cryptographic full scope — 402 shape + Signed
  Offers/Receipts validation + did:web key-history resolution +
  settlement attestation, signed and published. And the x402
  Foundation launched 2026-07-14 with, by public admission, "no
  conformance suite, security profile, or validation procedure."
  The niche is genuinely empty of a full-scope competitor AND the
  standards body just publicly named the hole. That is the closest
  thing to a forming trigger in the whole cycle — it strengthens
  B-first (the free verifier fills exactly the admitted gap).

- **The pseudonymous-attester precedent, and it directly validates
  the keeper's model:** samczsun built crypto's most trusted security
  reputation while pseudonymous — reputation-first, badge-second,
  identity secondary to the receipts; hired by Paradigm, founded SEAL.
  Code4rena/Sherlock pay often-pseudonymous researchers by
  demonstrated public findings. The working model is EXACTLY the
  store's structural advantage: reputation earned through public,
  verifiable, track-recorded work. Caveat kept honest: a pseudonymous
  attester of OTHERS' compliance is a subtly different trust ask than
  a pseudonymous bug-finder, and the track record + radical-honesty
  layer must carry it — unproven at scale, but the precedent is real.

- **"The pain is real" datapoint, specific and checkable:** the
  academic tool x402scope (arXiv 2607.19545) found spec violations in
  ALL 15 major facilitators it tested, and Coinbase adopted
  mitigations. Real defects exist for a verifier to surface, so B is
  immediately useful, not theoretical.

- **Convergent with Perplexity DR4 on the rest:** novelty shelf is a
  moat, firewalled from attestation (the "never make the attestation
  cute" rule holds from both); the pay-to-be-rated trap (Trustpilot
  "Mafia" report, -32% in a day; BBB) makes our radical-honesty layer
  the exact antidote AND a design constraint — A must be architected
  so the attested party cannot buy a better result. Pinboard/Tarsnap
  the durable analogs; voice load-bearing not decorative.

- **The kill-metric, cleaner than round 1's:** ≥2 genuine unsolicited
  requests from DISTINCT parties to pay for a signed observation
  (not the free tool, not novelties — the paid attestation
  specifically) by end of month 2 → the trigger arrived early, pull
  A forward now. Zero paid demand while B gets usage → confirms
  "empty because early," let the record age while B compounds.
  Honest-law-compatible: measures revealed demand, manufactures
  nothing.

**BOTH RESEARCH CYCLES NOW CLOSED on the full-report side** (DR1+1b
conditional release; DR2 key continuity; DR3 demand; DR4 strategy —
three engines each, every load-bearing claim vetted, three of our
own claims corrected along the way, two real gaps fixed in code).
Remaining: the two Gemini red-team briefs (attack the demand plan;
pre-mortem the strategy) as the adversarial close. Build queue that
emerged, in agreed order: (1) tool-description boundary pass — hours,
triple-validated; (2) free verifier B — a week, both DR4s' month-1
move; (3) paid conformance A — gated on B's inbound + the kill-metric;
distribution and C stay human/opportunistic.

**DEMAND RED-TEAM (Gemini brief 3), vetted 2026-08-02 — no shipped
bug this round (unlike DR2's beacon), but two real strategic
refinements and three design constraints that bind the free verifier
BEFORE it is written:**

- **FM3 (free-rider commoditization) — the sharpest catch, and it
  hands us the anti-commodity design for B.** A purely offline
  stateless verifier gets forked, stripped of our identity, and
  bundled into rivals' packages — we carry the maintenance, capture
  zero flow. Gemini's fix is exactly right and we already hold the
  pieces: the verifier stays sticky only if it makes a DYNAMIC
  authority call only we can answer — a live key-liveness check (the
  liveness beacon we already ship) and a real-time registry/breach
  check (the OTS/Rekor-anchored key history from the DR2 plan). So B
  is designed as: offline crypto math anyone can run (honest, forkable
  by design — that IS the free public good) PLUS an optional live
  authority lookup against scvd.store that answers "is this key
  current, retired, or unknown, as of now, anchored externally." The
  fork is the funnel; the live lookup is the reason to come back. This
  converts two already-built/planned assets into B's moat.

- **FM2 (Layer-0 candidate exclusion) — FATAL tag, and a genuine
  qualifier on the triple-validated description finding.** Agent
  frameworks pre-filter tools DETERMINISTICALLY before semantic
  matching ever runs — latency caps (drop anything with a human
  fulfillment window), whitelist/registry gates, minimum-age/volume
  bars. If our human-labor shelf is dropped at Layer 0, its
  description is never read. This does NOT kill the description pass;
  it SCOPES it: the boundary-language work pays off for INSTANT,
  machine-verifiable items (verify, the conformance-check SKU, signed
  artifacts) and is largely wasted on human-queue items that get
  pre-filtered on latency. Sharpens the #1 build item — polish
  descriptions where Layer 0 lets them through. Early signal: high
  Bazaar indexing with zero manifest/mcp.json fetches from agent IPs.

- **FM1 (test-artifact arbitrage) — a hard design constraint on B/try,
  partly pre-mitigated.** A free /try that signs real JWS with a test
  key invites harvesting those receipts and passing them as paid work
  to naive third-party verifiers that check signature validity but not
  WHICH key. We already run the discipline for conformance vectors
  (published test key, distinct test kid did:web:scvd.store#conformance-
  test-key, a test asserting test≠live). The constraint for /try:
  inherit that exactly — a visibly distinct test kid, and our OWN
  verify surface must LOUDLY name a test-key artifact as proving
  nothing about a real purchase (verify.ts already names which key
  signed and flags no-known-key; extend it to flag the test key by
  name when /try ships). We cannot fix third parties' loose kid
  checks, but we can make the honest reading unmissable and never mint
  a test artifact that looks production. Early signal: production
  verify traffic for test-key signatures.

- **FM4 (unpriced CI load + reputational blast radius) — COST, and
  the RequestBin lesson again from another angle.** If frameworks
  hardcode /try into CI, every PR across dozens of repos hits our
  edge, and any schema change or key rotation breaks hundreds of
  builds globally — devs then flag us as an unstable dependency. Fix:
  a versioned, explicitly-stable fixture endpoint (/try/v1 frozen),
  a rate limit, and the free→paid bridge Claude DR4 already required.
  Stable-by-contract, not stable-by-luck. Early signal: identical
  top-of-hour POST spikes from CI runner IP ranges.

- **FM5 (the honesty trap) — existential, largely pre-mitigated,
  now named as explicit discipline.** The slow slide: zero organic
  volume → pressure → "uptime-monitor bots making real paid txns" →
  logging them as fulfillment → "impartial audits" that are
  cherry-picked marketing. The store's structural house-wallet
  exclusion already blocks the first step (monitoring wallets flag as
  house, excluded from every organic count). What this adds is the
  STATED rule and a periodic audit: no internal probing is ever
  counted as external demand, and the check is Gemini's own signal —
  do any public-fulfillment-log payer wallets trace to operator
  funding sources? Ever. That the store's whole edge is integrity
  makes this the one failure mode where the early-warning signal
  should be run deliberately, not just watched for. The kill-metric
  for pulling A forward (≥2 unsolicited paid requests) is honest-law
  clean precisely because it measures inbound the operator cannot
  manufacture.

*Net:* the demand plan survives with its order intact and three
constraints written onto B before a line of it exists (live-authority
lookup for stickiness; distinct+loudly-flagged test kid; versioned
stable fixture + rate limit), one scope refinement on the description
pass (instant items, not human-queue), and one discipline promoted to
an explicit rule (never count internal probing as demand). Gemini's
pre-mortem of the STRATEGY (brief 4) is the last adversarial pass;
after it, the build queue is final.

**STRATEGY PRE-MORTEM (Gemini brief 4), vetted 2026-08-02 — the
capstone, and the best adversarial work of the effort. Its six
causes-of-death share ONE hidden through-line, and naming it is the
finding:**

*THE THROUGH-LINE: every failure mode assumes an ENTERPRISE buyer
and an INFRASTRUCTURE-DEPENDENCY model — the two things the store
explicitly rejects.* Read that way, the pre-mortem is not a refutation
of the strategy; it is a proof that IF the store drifts toward selling
to enterprise compliance teams and toward being depended-upon
infrastructure, its constraints (no-infra, pseudonymity, voice) become
fatal. Which is an argument FOR staying in its lane, precisely stated.
The constraints Gemini attacks are the same ones that make the store's
ending clean and its bus-factor survivable. Held against that frame,
each cause resolves:

- **#1 Mercenaristic routing — the deepest cut, and it reframes WHO
  the customer is.** Buyer agents optimize for price/latency and won't
  pay for out-of-band trust badges; the transport layer already
  validates payment (sig/balance/nonce at the facilitator). PARTLY
  overstated — Gemini conflates PAYMENT validation (real, done by CDP)
  with CONFORMANCE/BEHAVIORAL verification (does the seller deliver,
  does its did:web resolve, does its receipt match spec — facilitators
  do NOT do this). But the core survives and it is important:
  verification demand comes from whoever bears the RISK, and that is
  NOT the transacting buyer-agent — it is the SELLER protecting its
  reputation, or an operator. This matches DR3's "demand is a function
  of transaction risk, not volume." The reframe: A's customer is the
  seller/operator, not the buyer-agent — which points at the hedge
  (inline validation middleware a seller embeds) and reconnects to
  opportunity A being sold to the /try audience (builders), not to
  passing agents. Logged as the sharpest correction to how A is aimed.

- **#3 Enclosure from above — refines the defensible niche, converges
  with DR1 #10.** The Foundation/CDP will bundle native SYNTAX
  conformance free (it already admits it has none), making an
  independent syntax-checker roadkill. The surviving niche is exactly
  what Gemini names and what PROBLEMS #10 (execution verification)
  already identified: cede "does your 402 conform" to the platform,
  own "did you actually DO what you said" — behavioral/execution
  assertions platforms disclaim. The store already holds those
  primitives (phantom_check = independent world-effect observation;
  settlement_attestation = chain-state observation). So B verifies
  syntax (free public good, commodity by design) while A's paid edge
  is the BEHAVIORAL layer no facilitator will touch. This is the
  single most valuable strategic refinement of the pre-mortem.

- **#5 Novelty/voice as enterprise liability — resolves the apparent
  contradiction with DR4 by buyer identity.** DR4 said voice is the
  MOAT (Pinboard, samczsun); Gemini says enterprise procurement reads
  it as risk. Both true, different buyers: voice wins the
  developer/community/operator buyer the store is actually built for;
  voice loses the enterprise-compliance buyer the store explicitly is
  NOT chasing. The domain-isolation hedge (a sterile
  x402-conformance.org) only becomes real IF A ever targets
  enterprise — logged as a conditional, not a to-do. The store's
  whole positioning is the samczsun model (reputation-through-public-
  work, community buyer), where voice is load-bearing.

- **#4 No-infra bottleneck — Gemini MISUNDERSTANDS the constraint.**
  It assumes no-infra blocks continuous observation, forcing a Rule 0
  bend. But the store ALREADY runs stateless serverless with crons
  (phantom_check is scheduled). The rule is "nobody's UPTIME depends
  on us," not "no compute" — a continuous-observation feed whose
  staleness fails safe does not violate it. So Gemini's own hedge
  (stateless serverless cron) is already available and needs no bend.
  Correction logged: the constraint is narrower than the critique
  assumes.

- **#2 Trigger horizon + #6 bus-factor — real, already in the ledger,
  self-consistently mitigated.** The multi-year mandate horizon is the
  trigger-dependency both DR4 rounds named; the hedge is not "freeze B
  as dead repo" (too pessimistic) but keep B cheap and let A wait on
  the kill-metric, which is the plan. Bus-factor is #11/#14 already;
  Gemini's "radical honesty makes the ending uglier" holds ONLY under
  the infrastructure-dependency premise — because the store is a shop
  whose artifacts stay verifiable forever without the keeper (published
  key, published bytes, the wind-down doc), a keeper departure strands
  nobody the way infra would. The clean ending is DESIGNED; the
  constraints Gemini attacks are what make it clean.

**THE DEEP-RESEARCH EFFORT IS NOW CLOSED.** Four questions
(conditional release, key continuity, demand, strategy), three
engines each plus one follow-up and two red-team passes, every
load-bearing claim vetted, several verified against primary sources,
three of the store's own claims corrected along the way, two real
code gaps fixed (offer-signing, beacon replay), and one demoted
engine proven useful in a narrowed adversarial lane. What survives as
the strategic picture:
- Verification is the store's edge, and the DEFENSIBLE half is
  BEHAVIORAL/execution observation (phantom_check/settlement lineage),
  not syntax conformance (which the platform will commoditize).
- A's real customer is the SELLER/operator bearing reputational risk,
  not the buyer-agent — aim it there.
- Order stands: description boundary pass (instant items) → free
  verifier B (syntax, forkable, with the live-authority lookup for
  stickiness) → paid A (behavioral, gated on B's inbound and the
  ≥2-unsolicited-request kill-metric) → C opportunistic.
- Every constraint the pre-mortem called fatal is fatal ONLY on a
  pivot to enterprise + infrastructure the store refuses; in the
  store's actual lane they are load-bearing, and Rule 0 bends them
  only behind a real case with a date, never behind pre-mortem fear.
The build queue is final. Nothing builds until the keeper's go;
the research's job — knowing exactly what we'd be building and why,
and what would kill it — is done.
