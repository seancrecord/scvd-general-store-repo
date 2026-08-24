# Evidence-layer review — running ledger, August 2026

A working document for a multi-pass audit of SCVD's evidence layer.
Organized by **product/area and finding**, not by prompt — the review
prompts are noted only as provenance (P1, P2, …) so a reader can trace
where a finding came from. When the pass series ends, the
CONSOLIDATION section becomes the overarching build plan and this file
is corrected into it or archived whole with its date (rule 45 — no
third state). Nothing here is a ruling; RULE-class items are flagged
for the keeper (⚑).

Status: [ ] open · [x] done · [~] partial · ⚑ keeper ruling.

A `[x]` carries the DATE and the COMMIT that closed it. A completion
nobody can check is the same shape as every claim this ledger exists
to catch: true-sounding, unverifiable, and eventually wrong. Done is
recorded HERE and nowhere else — the roadmap points at these entries
rather than keeping a second copy, because a second copy drifts
(AT_SCALE rule 1).
A fix that closes two findings is built once and cross-referenced.

**Reviewed against:** main @ 230b5ac (2026-08-21). P1 ran against the
pre-merge tree; items the 08-21 merge already closed are recorded as
closed with evidence.

**Provenance:**
- P1 — full architecture / evidence-model / threat / FP-FN review, ranked improvements (2026-08-21).
- P2 — deep audit of `standing_watch`: evidence-level taxonomy, v2 schema, migration, adversarial tests (2026-08-24).
- P3 — audit of the conformance engine as a protocol-testing framework: full check map, missing conformance classes, versioned-battery design, MIT/hosted split (2026-08-24, against the same main @ 230b5ac).
- P4 — audit of the corpus as a longitudinal proprietary evidence asset: dimension classification, time-value analysis, longitudinal schema, privacy/legal/attribution (2026-08-24, same main).
- P5 — audit of the registry/discovery layer: the state ladder, accidental state conversions, source-by-source trust table, per-fact provenance model, agent-facing registry API (2026-08-24, same main).
- P6 — audit of the evidence/attestation system as dispute evidence: per-class dispute map, the six-layer trust distinction with adversarial examples, the formal evidence envelope (2026-08-24, same main).
- P7 — launch_check as end-to-end machine-commerce test: the 15-step flow model, safe-defaults audit, payment-execution-risk containment, interface designs (2026-08-24, same main).
- P8 — SCVD designed for autonomous agents: the minimum-evidence decision model, the unified /agent/v1 surface (absorbing H-API), MCP evidence tools, npm SDK (2026-08-24, same main).
- P9 — SCVD as marketplace infrastructure: composable evidence primitives, eight integration classes, priority by automatic-query-before-transaction (2026-08-24, same main).
- P10 — open-source strategy: the seven-question component analysis, package architecture, namespace/versioning/supply-chain doctrine (2026-08-24, same main).
- P11 — keeper direction on positioning (2026-08-24): evidence observatory, cross-protocol prop, volume-readiness principle; chain/protocol nuance assessment (Area M).

---

## AREA A — Trust surfaces (public claims vs. measured data)

The highest-trust-cost area: where displayed language can outrun what
was actually measured. House rule 10 (the auto-refund incident) is the
governing precedent — a true-sounding line nobody re-checked.

- **A1 [x] DONE 2026-08-24 — `/criteria` says "no badges today," which is false.** (P1)
  `criteria.ts:110` and `:175`: `badges_today: "None. Nothing this
  store serves carries a badge…"` while audit badges, passport chips,
  and patron badges all ship live. Same class as the auto-refund
  incident. Fix: derive the statement from what badge routes actually
  serve; behind a failing `claim-chain` test.

- **A2 [x] DONE 2026-08-24 — registry overstates offer verification.** (P1)
  `registry.ts:53` says offers "a third party can cryptographically
  verify," but the census only *parses* the JWS — signatures are not
  verified (`preflight.ts:504` says so itself). Reword to what was
  measured ("signed offers present, structurally valid").

- **A3 [ ] MEDIUM — verdicts rendered without their conditions.** (P1)
  Passport "ready," chip "FRESH," fresh-set membership, registry
  "working x402 endpoints" all rest on one GET of 402 *shape* from one
  vantage. The derived surfaces don't carry method/vantage/date/cadence
  or a checked/not_checked field list beside the bold verdict. This is
  the biggest false-positive class. Fix: carry conditions in payload
  and beside the human line. (Overlaps AREA B — the underlying "ready"
  is the standing_watch/preflight battery.)

- **A4 [ ] MEDIUM — self-passport reports ready/fresh with zero probes.** (P1)
  `passport.ts issueSelfPassport` hard-codes `verdict:"ready"`,
  `freshness:"fresh"`, `rounds_probed:0`, no `probeHost` call. Labeled
  SELF-OBSERVED in the `observer` string, but the JSON is structurally
  identical to a census passport, so a machine consumer keying on
  `latest.verdict`/`freshness` misses the caveat. Fix: make the
  self-observed status machine-legible (distinct field/verdict token).

- **A5 [~] expired chips still render (partial).** (P1)
  Broken/not-ready → dark (correct). Expired (>16d) still renders a
  dated chip; subcopy says "refuse it" but the embed still shows a
  passport brand. Consider a visibly-degraded or refused expired chip.

Note: freshness model is sound in structure — `FRESH_DAYS=8`,
`AGING_DAYS=16`, gaps derived at read time (`standing-watch.ts:412`),
which is the right honesty pattern.

---

## AREA B — Probing / conformance battery (`preflight` + `standing_watch`)

`preflight`, `service_audit`, `conformance_watch`, and `standing_watch`
all reduce to one no-retry GET from the Worker + the `runChecks`
battery. P2 is the deep audit of `standing_watch` specifically.

### B-current: what it actually measures (ground truth)
- One GET, `redirect:manual`, 8s timeout, single vantage (Cloudflare
  egress), signed bot identity + `Accept: application/json`, predictable
  cron time (`:30`, 55-min floor).
- `runChecks` hard checks: status-402 → PAYMENT-REQUIRED present →
  header base64-JSON parses → x402Version===2 → accepts non-empty +
  each entry has string scheme/network/amount/asset/payTo. Early-exits
  on first failing gate.
- Everything else (payTo validity, atomic amount, testnet, nonstandard
  scheme, resourceUrl, no-input-contract, no-signed-offers) is an
  **advisory**, and `standing_watch` **discards advisories entirely** —
  it keeps only failed hard-check *names*.
- `signed-offers` hard check passes on **JWS structure only** — "Signatures
  NOT verified here" (`preflight.ts:504`).
- Signed probe bytes: `{watch_id,url,at,verdict,status,latency_ms,failed}`
  (`standing-watch.ts:118`). Signs the CONCLUSION, not the evidence.

### B-check-map (P3): the whole engine, ground truth
Three layers share one law (preflight's checks = the till's own
signing requirements pointed outward):

**Layer 1 — endpoint battery, `runChecks` (`preflight.ts:245`).**
Pure function of (Response, bodyOverLimit); consumed by /api/preflight
(free), `service_audit` (paid, signed), `conformance_watch` (daily),
`standing_watch` (hourly, advisories discarded — B-current). All checks:
network-required, no payment, deterministic GIVEN the response bytes
(end-to-end nondeterminism is the network's and the target's — B7/B8).
Protocol scope: x402 v2 only (`x402Version===2`, strict number).
- Hard (fold into verdict; EARLY-EXIT order — see B12):
  `status-402` (3xx and non-402 both stop; FP via cloaking B8) →
  `payment-required-header` (present + `atob` + JSON.parse, one gate
  for three distinct malformations) → `x402-version` →
  `accepts` (non-empty array; 5 required fields string-typed —
  `preflight.ts:64` — presence/type only, no values) →
  conditional: `bazaar-extension` (only if declared),
  `signed-offers` (only if present; JWS PARSE only — B4's FP class:
  a forged signature passes).
- Advisory (true, never in the verdict; discarded by standing_watch —
  B3): `nonstandard-scheme` (≠"exact"), `testnet-network` (table of
  exactly 2 EVM testnets, `preflight.ts:75`), `payto-is-a-name` /
  `payto-wrong-rail` / `payto-not-an-address` (readPayTo taxonomy,
  `lib/pay-to.ts`, the one value-level check that exists),
  `amount-not-atomic` (catches "." and nothing else),
  `no-bazaar-extension`, `inputs-declared`/`no-input-contract`,
  `no-signed-offers`, `large-body` (>256KB).

**Layer 2 — artifact desk, `checkConformance` (`conformance.ts`) +
MIT `verifier/x402-verify.js` (npm `x402-verify`).** POST
/api/conformance/v1, free; offline (deterministic) when
`public_key_hex` supplied, network only for did:web resolution and
opt-in `check_anchor` (both budgeted, degrade to unchecked-not-denied).
Checks: `parse` → `alg` (EdDSA only; `none` and HS256 both die here —
the one conformance class with real adversarial vectors) → `kid`
present → `schema` (required-field PRESENCE + `version===1` +
validUntil/issuedAt numeric — F1) → `key-resolution` (today's did.json
only — F5) → `signature` → `expiry` (advisory; real clock — F4).
Verdict conforms / does_not_conform / could_not_check; `live` separate.
Anchored key history is its own block: chain recompute (rehash + link
+ sequence) is real; `bitcoin_confirmed` is the issuer's claim,
labeled so.

**Layer 3 — vectors** (`conformance/offer-receipt-vectors.json`, v2,
served at /.well-known/conformance/, regenerated byte-for-byte by
`scripts/generate-conformance-vectors.mjs`, pinned by tests). 3
known-good + 10 known-bad; strong on the JWS layer (alg none, alg
confusion, tamper, truncation, wrong key, missing fields, expired-
but-wellformed), silent on value-level and relationship classes (F6).
Carries its own changelog (`changed_in_v2`) — the pattern B16 wants.

### B-findings
- **B1 [ ] CORE — binary verdict welds distinct failures.** (P1 "C1"/P2)
  `ready|not_ready|unreachable|refused` collapses ~19 separable signals.
  Replace with `reached_level` (L0–L4) + tri-state `checks` vector
  {pass|fail|n/a|indeterminate}.

- **B2 [ ] — `unreachable` collapses DNS/TCP/TLS/timeout, error string discarded.** (P1 "C1/E"/P2)
  Bare `catch{}` at `standing-watch.ts:233`. Retain raw error; default
  to `network_failure:"unlocalized"`; only claim a sub-class (dns/tcp/
  tls/timeout) once staged probing (`connect()` TCP sockets + DoH)
  exists. Never fabricate a sub-class (rule 5). **This is the same fix
  as A3's vantage honesty and P1's "split unreachable" — build once in
  the shared probe/`runChecks` layer.**

- **B3 [ ] — advisory-blind: an unpayable 402 reads "ready."** (P2)
  payTo=name, decimal amount (1e6 underprice), testnet network are
  advisories → discarded → verdict `ready` for 7 days. Fold L3b
  consistency (payTo valid for network, atomic amount, known
  asset/network, resourceUrl matches probed URL) into the verdict.

- **B4 [ ] — offer authenticity never checked.** (P2)
  Escalate to L3c: cryptographically verify signed offers + signer
  authorization (a second request, cached/coalesced per host like the
  cross-ref resolver in PROBLEMS #21).

- **B5 [ ] — no cross-probe consistency.** (P2)
  Add an intra-tick burst (3 probes ~5s) → L3d; report distribution;
  separate transient from steady.

- **B6 [ ] — observer failure attributed to the endpoint.** (P2)
  Same-tick control beacon (off-Cloudflare known-good 402) →
  `observer_status: ok|degraded`. Degraded ticks excluded from endpoint
  stats AND from coverage (not counted as a probe). Requires
  provisioning a stable non-store 402 (Workers can't fetch own host,
  `probe-target.ts:211`).

- **B7 [ ] — probe time is seller-predictable.** (P2)
  Cron `:30` + 55-min floor means all probes hit the same phase → a
  seller serving good only at `:30` reads 100% ready. Jitter scheduling;
  keep the floor for double-tick protection.

- **B8 [ ] — probe is fingerprintable (cloaking).** (P2)
  Stable Web Bot Auth signature + `Accept: application/json` lets a
  seller serve a clean 402 to the probe and a paywall-off 200 to real
  buyers. Consider a second unsigned identity and divergence flagging.

- **B9 [ ] — signs the conclusion, not the evidence.** (P2)
  A verifier can check "SCVD signed this verdict" but can't reproduce
  what SCVD saw. Sign the reproduction envelope: verbatim
  PAYMENT-REQUIRED bytes, curated headers, body_sha256,
  resource_url_declared, request params, observer identity+version.
  Move canonicalization to JCS (`src/lib/jcs.ts`) with a `schema` field
  INSIDE the signed bytes (v1 has no in-signature version — a verifier
  can't tell forms apart).

- **B10 [ ] — availability without misleading %.** (P2)
  Never a single uptime %. Emit probes_expected / probes_recorded /
  probes_observer_degraded / hours_unprobed as separate numbers with an
  explicit denominator + "nothing claimed between probes." Latency as
  distribution, not mean. Type the `refused` tally and add
  `probes_observer_degraded` to `WatchHistory.summary`.

- **B11 [ ] — coverage inflation by refused-as-probe.** (P2)
  A `refused` row (our policy) still increments `probes_recorded`,
  shrinking `hours_unprobed`. Separate refused/observer-degraded from
  genuine observation in the denominator.

- **B12 [ ] — early-exit renders unrun checks as absent, not indeterminate.** (P3)
  `runChecks` stops at the first failing gate, so a `not_ready` on
  status-402 says nothing about the header, version, or accepts — and
  the report cannot say "unknown," only omit. A consumer diffing two
  reports reads a vanished check as a fixed one. Same fix as B1's
  tri-state vector: every defined check reports pass|fail|n/a|
  indeterminate, always present.

- **B13 [ ] — value validation is shallow and enumerative.** (P3)
  The testnet table is 2 EVM entries — Solana devnet/testnet, Polygon
  Amoy, Arbitrum/OP Sepolia all read as mainnet. `amount-not-atomic`
  catches only a "." — zero, negative, non-numeric, exponent notation
  all pass silently. No CAIP-2 grammar check anywhere (`familyOf` in
  pay-to.ts defaults every unknown network to "evm", so a garbage
  network gets EVM remediation advice). `asset` is never validated
  past "is a string." No accepts timeout field is ever read
  (impossible-timeout class unchecked). No EIP-55 checksum read on 0x
  addresses. And no facilitator-compatibility read: a well-formed
  mainnet offer whose scheme+network combination no known facilitator
  settles reads clean — same table-shape as the testnet check, same
  honest framing ("no facilitator known to us," never "unsettleable").
  One shared value-checks module fixes this AND B3's L3b.

- **B14 [ ] — no conflict/consistency conformance class.** (P3)
  Nothing checks accepts entries AGAINST each other or the challenge
  against itself: duplicate entries, two entries for the same
  network+asset at different amounts, a body challenge disagreeing
  with the header one — all invisible. The "multiple payment
  requirements" and "conflicting fields" classes are simply absent.

- **B15 [ ] — endpoint-side signed offers: parsed, never read.** (P3)
  Beyond B4 (signature unchecked), the offers' PAYLOADS are never
  opened on the endpoint path: an endpoint serving EXPIRED signed
  offers, or offers whose `resourceUrl` names a different host than
  the probed URL (bait-and-switch, adversarial test 5), still reads
  "ready." Folding into L3b/L3c with B3/B4.

- **B16 [ ] — the battery is versioned by label, not by definition.** (P3)
  `PREFLIGHT_VERSION = "v1"` is a string; there is no machine-readable
  registry of check IDs, no per-check protocol-applicability, no
  changelog, and — the sharp half — NO FIXTURES for the endpoint
  battery at all: only the artifact desk has vectors. `runChecks` is
  already pure over Response bytes, so recorded-response fixtures
  (known-good + one-defect-each known-bad) are cheap and make the
  battery runnable offline by anyone. Design and packaging in E2.

### B-taxonomy (L0–L6), for the v2 schema
- L0 network reachable · L1 HTTP reachable · L2 x402 detectable
  (402+header) · L3a well-formed (parse/version/accepts) · L3b
  internally consistent (payTo/amount/network/resourceUrl) · L3c
  authentic (offer sig + signer authorized) · L3d cross-probe
  consistent · L4 purchasable (executable, assessed without spend) ·
  L5 purchased (real settled spend) · L6 delivered (post-pay 2xx).
- **standing_watch measures L0–L3, L4 as assertion only.**
- **L5/L6 are SEPARATE money-gated products** (launch_check + a
  delivery watch), never on the unattended cron. ⚑ ties to KEEPER_LIST
  NOW-6 (the settlement-attempt-lane ruling).
- **Platform caveat:** Workers `fetch` collapses L0 sub-classes; honest
  default is `unlocalized` until `connect()`/DoH staged probing exists.

### B-v2 schema (proposed, not yet written)
Fields: `schema` (in signature), watch_id, url, at, `clock`,
`observer{vantage,identity_key,control_ok}`, `observer_status`,
`request{method,accept,redirect,timeout_ms}`, `reached_level`,
`network_failure?`, `network_error_raw?`, `http_status?`,
`evidence{payment_required_raw,headers_seen,body_sha256,resource_url_declared}`,
`checks[]` (tri-state vector), `burst[]`, `signature`, `public_key`.
Derived read-time `verdict` kept for back-compat, never stored.

### B-migration
v1 rows stay valid forever (detect by `schema` presence, verify with
matching canonicalizer — mirrors cert current/legacy split). v2 carries
version inside JCS bytes. New watches start v2; in-flight v1 finish v1
(no dual-writing a live watch's rows). Provision the control beacon
first. Surface-sweep the copy (rules 44/45); type the refused tally;
add probes_observer_degraded to summary.

### B-adversarial tests (each shown red on current main; v2 acceptance criteria)
1. Probe-cloaking by identity (clean 402 to probe, 200 to buyers).
2. `:30`-only flapping (up at cron phase, down otherwise).
3. Advisory-blind unpayable 402 (payTo name / decimal amount / testnet).
4. Forged signed offer (valid JWS structure, bad signature).
5. resourceUrl bait-and-switch (challenge points at a different host).
6. Observer-failure masquerade (sleep 8.1s → false unreachable).
7. Egress tarpit (refuse Cloudflare ranges only).
8. Refused-as-coverage (refused row inflates probes_recorded).
9. Signature-form confusion (v1 has no in-signature version).

---

## AREA C — Settlement & delivery observation

- **C1 [x] Polygon attestation + bank walk — CLOSED by 08-21 merge.** (P1)
  `attestation.ts` now reads both EVM rails for a 0x hash and checks
  Polygon before signing NOT_FOUND (`chains_checked` emitted); Polygon
  got its own bank walk (`test/polygon-walk.spec.ts`). Was an open P1
  finding; the merge landed the fix.

- **C2 [ ] MEDIUM — MCP buy path lacks the ambiguous-settle rescue.** (P1)
  `rescueAmbiguousSettle` (Base AuthorizationUsed lookup after 5xx)
  exists only in the HTTP gate; MCP double-5xx gets a booked decline
  where HTTP would rescue. Door asymmetry. Re-verify against current
  `mcp-payment.ts` before acting (08-21 merge didn't touch it).

- **C3 [ ] LONGER — reorg/finality hardening on settlement attestation.** (P1)
  One-shot RPC read; a reorg after attestation is invisible; loose
  queries take `matches[0]`. Re-read at finality depth or emit a
  `finality_watch` follow-up for high-value queries.

- **C4 [x] delivery-audit blindness — CLOSED earlier (PROBLEMS #18).**
  Third axis + `does_not_cover` shipped. BUT see D-docs below for the
  stale comment.

---

## AREA D — Signing / anchoring / evidence model

- **D1 [ ] MEDIUM — Rekor typed but never implemented.** (P1)
  `AnchorRecord` carries Rekor fields; no submit path populates them —
  only OTS runs. Implement or remove/annotate so no reader believes a
  fast append-only log exists.

- **D2 [ ] MEDIUM — no freshness binding on live-presented artifacts.** (P1)
  Nearly all classes bind content + a self-reported timestamp with no
  freshness nonce; a month-old SETTLED/ready artifact verifies forever
  and looks current. Bind freshness (signed valid_until or verifier
  nonce) into artifacts MEANT to be presented live (passport,
  settlement attestation). Keep durable certificates immutable —
  immutability is the product. Exceptions today: x402 offers (300s
  validUntil) and the opt-in liveness nonce.

- **D3 [x] DONE 2026-08-24 — stale delivery-audit header comment.** (P1)
  `delivery-audit.ts:11-25` still describes pre-amendment
  settle-before-handler ordering; runtime is deliver-first. Rule 45
  doc-drift.

Sound as-is: ed25519 over declared-order + JCS dual-emit; per-class
`does_not_prove`; key continuity/succession; OTS on key-chain, corpus,
report bodies, patron digests; the verifier-anchor tamper tests.

### D-dispute map (P6): every artifact class, read as dispute evidence
The substrate is unusually good and should be said first: per-class
trust models ordered weakest-first, `signs` derived from the signing
code (the compile guard), `does_not_prove` on every class,
`signed_payload` served as exact bytes (sidesteps canonicalization
disputes entirely), the `attests` evidence-hash binding with the
legacy/current both-forms-break design, key attribution with an
honest `unrecognised` verdict, and ONE instance of key-purpose
separation (payout authorizations sign with the secp256k1 field
wallet, never the ed25519 evidence key). Against the thirteen
dispute questions, the systematic gaps are four, not thirteen:
- **Software/methodology version:** signed on service/onpage audits
  (criteria version — the model), absent from watch rows, settlement
  attestations, launch checks. In a dispute, "under which battery"
  is unanswerable from the artifact (B9's in-signature schema point,
  generalized).
- **Conditions:** vantage/method/timeout not in the signed bytes of
  any probe artifact (A3, at the evidence layer).
- **Replayability splits by class:** chain-reading artifacts
  (settlement attestation, statement, reconciliation) are
  INDEPENDENTLY REPRODUCIBLE — anyone can re-read public state,
  which is most of their dispute value. Probe artifacts are NOT
  reproducible even in principle (the moment passed); stored raw
  evidence (B9 ⇄ G1) is the only dispute-grade substitute, and today
  none is stored.
- **Staleness:** D2 — every artifact verifies forever with no
  freshness binding; "was true then" is presented as indistinguishable
  from "is true now" by anyone re-showing an old artifact.

### D-layers (P6): six layers, each provable while the next fails
The model that keeps claims no stronger than evidence. Each layer's
adversarial example holds every layer above it TRUE:
1. **Cryptographic validity** — the signature verifies over the bytes.
2. **Signer identity** — the key is genuinely SCVD's. *Adversarial
   1→2:* forge an artifact with your own keypair, embed your pubkey;
   crypto-valid, not ours. DEFENDED at /api/verify (`attributeKey` →
   `unrecognised`, said loudly); UNDEFENDED in the offline recipe —
   see D5.
3. **Signer authorization** — the key was AUTHORIZED at the claimed
   time. *Adversarial 2→3:* a stolen RETIRED key signs an artifact
   dated after its retirement; identity is genuinely ours,
   authorization is not. UNDEFENDED — see D4.
4. **Factual observation** — what was signed actually happened.
   *Adversarial 3→4:* the authorized key signs "unreachable" that was
   OUR timeout (B6's observer failure); every cryptographic layer
   true, the fact false. Defense is observer accounting (B6), not
   cryptography — no signature scheme can fix this layer.
5. **Interpretation** — the verdict drawn from the facts is sound.
   *Adversarial 4→5:* the probe truly saw a parseable 402 (facts
   true), verdict "ready" on an unpayable door (B3); or `ready`
   rendered as "working" (H1). Defense: verdicts carrying their
   conditions and checks vector.
6. **Historical persistence** — the claim still holds when presented.
   *Adversarial 5→6:* a genuinely-true-then "ready"/SETTLED presented
   months later as current (D2/F4); or NOT_FOUND presented after a
   later settle (the spec's own warning; C3's reorg is this layer
   too). Defense: freshness binding on live-presented classes.
Layers 1–3 are cryptography and registry mechanics; 4 is instrument
honesty; 5 is battery honesty; 6 is time honesty. A dispute-grade
artifact states which layers it establishes and which it cannot.

### D-envelope (P6): the formal evidence envelope, assembled from parts
Mostly shipped pieces plus B9; one design serving watch rows, audit
reports, ward rows (G1), and launch checks:
- `observation` — what was seen, stated as facts not verdicts.
- `evidence` — raw artifact refs: verbatim challenge bytes, curated
  headers, body_sha256 (B9/G1's capture).
- `observer` — identity key id, software/battery version, vantage.
- `at` + `clock` — the moment, and which clock (F4's injection).
- `methodology` — battery/criteria version + `schema` INSIDE the
  signed bytes (B9; service_audit's criteria field is the precedent).
- `derived` — the verdict + tri-state checks vector, labeled DERIVED
  so interpretation is visibly a layer above observation.
- `limitations` — does_not_prove + not_checked, in-band (exists
  per-class; moves into the signed bytes).
- `signature` + `key` — as today, plus the key's service window
  cited so layer 3 is checkable offline.
- `authorization` — pointer to the key registry + anchor log entry
  (the anchored history bounds backdating — already built).
- `revocation/rotation` — the handover announcement id where a
  retired key signed (exists in the registry; the envelope carries
  it).
Nothing here invents a format the store doesn't already half-own:
signed_payload discipline + attests binding + key registry + OTS,
with B9's evidence capture as the one genuinely new field group.

- **D4 [x] — no service-window check at verification (the layer-3 gap).** (P6)
  CLOSED 2026-08-24 (phase1/1.5-key-window). The comparison lives in
  the PACKAGE (`checkKeyServiceWindow` in verifier/x402-verify.js, per
  the L1⇄D4⇄D5 build-once rule) and `/api/verify`'s signedBy consumes
  it, passing each artifact class's own date (cert/stamp/anchor/lucky/
  gazette date, phantom checked_at, handover announced — every class,
  per the maker's-mark lesson). The response gains
  `signed_by.service_window` with status/in_window/window/means; a
  retired-key artifact dated post-retirement now reads
  `after_retirement` with "the exact shape a stolen retired key
  produces". Swap window honoured two ways: the store reads the
  registry through `retiredKeysFor` (lock wins), and the window is
  inclusive at both ends (retirement-day artifacts are the handover's
  expected last signatures). RETIRED_MEANS no longer reassures
  unverifiably — it points at the check beside it. Red-proven:
  test/key-window.spec.ts route tests fail without the wiring (3
  failed on stash, 11 pass with it).

- **D5 [x] — the offline verification recipe stops at layer 1.** (P6)
  CLOSED 2026-08-24 (phase1/1.5-key-window).
  `KEY_ARCHITECTURE.verification` is now four numbered steps: (1)
  ed25519 over signed_payload, stated to prove only internal
  consistency; (2) resolve the key against the published directory;
  (3) confirm the artifact's date falls inside that key's service
  window — naming `checkKeyServiceWindow` in the open verifier so a
  dispute runs the same function the store runs; (4) compare fields
  against signed_payload. The envelope's key-window citation
  (D-envelope) remains Phase 1's schema work.

- **D6 [ ] — methodology/version absent from most signed bytes.** (P6)
  Extends B9 beyond the watch: settlement attestations and launch
  checks sign no software version; watch rows sign no battery
  version; only the audit classes sign criteria. Generalize the
  audit-class pattern via the envelope's `methodology` block.

- **D7 [x-by-design elsewhere / cross-ref] — replayability.** (P6)
  Not a new finding: the reproducible classes already cite chain
  state; the irreproducible classes are B9 ⇄ G1's build. Recorded
  here so the dispute map is complete in one place.

---

## AREA E — Moat / ecosystem (longer-term, gated on demand)

- **E1 [ ] LONGER — wire behavioral/delivery observation into the passport.** (P1)
  The central seller attack (serve-402-never-deliver) is badged, not
  caught, because passport rests on 402 shape. Make the passport
  include a delivery observation (launch_check-class). The moat move
  per PROBLEMS #A/#0; gated on a paying buyer.

- **E2 [ ] LONGER — ecosystem packaging: the versioned conformance battery.** (P1, design expanded by P3)
  Package the (already MIT) verifier as npm (npm `x402-verify` exists;
  `x402-sign` is the issuer half); a GitHub Action running
  preflight/conformance in CI (fixture strategy, PROBLEMS #3 #1-ranked);
  MCP tools. Verification stays open/free; the moat stays in
  observation, never the math.

  **The battery-release design (P3).** A release = manifest + fixtures
  + code, so other implementations can run it locally:
  - **Stable check IDs**, namespaced and never renamed (only
    deprecated): `x402.endpoint.status-402`, `x402.artifact.alg`, …
  - **Machine-readable manifest** (`checks.json`): id, layer
    (endpoint/artifact), severity (hard/advisory), protocol
    applicability (x402 v2; offer-receipt rev 1), input shape,
    expected result, known FP/FN notes. Derived from the code or the
    generator refuses (AT_SCALE rule 1 — no hand-typed twins).
  - **Fixtures on both layers:** artifact vectors exist (v2); add
    ENDPOINT fixtures as recorded Response bytes `runChecks` replays
    offline — it is already a pure function, so this is cheap. Every
    known-bad fixture red for exactly one check.
  - **Regression:** the suite pins fixtures byte-for-byte (the
    existing vectors tests are the pattern).
  - **Determinism:** injected clock for anything expiry-shaped (F4);
    everything else already deterministic given input bytes.
  - **Changelog per release:** the vectors' `changed_in_v2` block is
    the house pattern; the battery adopts it. New releases are new
    versions; old versions serve forever (the battery-versioning
    standing rule in KEEPER_LIST already says this).

  **The MIT/hosted split (P3), one sentence per side.** OPEN (MIT):
  the math and the definitions — `runChecks`, `readPayTo`, the
  verifier, the manifest, all fixtures/vectors, the replay harness,
  the CLI/Action. HOSTED (SCVD): the observation — the network
  vantage, the Web Bot Auth identity, signed verdicts at stable URLs,
  cadence (watches), anchoring, the census, the live 402 test targets,
  and the hosted obstacle course (KEEPER_LIST backlog filed item 5 is
  this exact product). Anyone can rerun the math; only an independent
  observer can say what an endpoint answered at a time — that is the
  product line, and open-sourcing the battery sharpens rather than
  erodes it.

---

## AREA F — Artifact-side conformance (the desk + the MIT verifier) (P3)

The desk's honesty ABOUT its limits is exemplary (limits attached to
every verdict, conflict declared, budget degradation instead of
denial, `could_not_check` distinct from failure). The gaps are in what
the checks cover, not in what they claim.

- **F1 [ ] — schema validation is presence-only.** (P3)
  `schemaProblems` checks field EXISTENCE plus `version===1` and
  numeric validUntil/issuedAt. A correctly signed offer with network
  `"banana"`, a decimal amount, a name in payTo, and a non-URL
  resourceUrl gets `verdict: "conforms"`. `readPayTo` exists and is
  never consulted here — the value-level law lives one layer away and
  the desk doesn't call it. The verifier's own header comment says
  "steps 3 and 4 are not the same check"; step 4 is currently a
  presence check wearing a schema check's name. Share B13's value
  module across both layers.

- **F2 [ ] — signer authorization is unchecked.** (P3)
  The signature check proves the kid's key signed the bytes; nothing
  binds that DID to the `resourceUrl` host or the `payTo` it names.
  Anyone with a valid did:web can sign an "offer" for someone else's
  resource and it conforms. The prose limits gesture at this ("not the
  artifact an issuer served"); the machine verdict is identical either
  way. Add an authorization check (did:web host vs resourceUrl host,
  reported as its own named check) — the difference between "signed"
  and "signed by a party entitled to offer this."

- **F3 [ ] — no receipt↔offer relationship class.** (P3)
  `RECEIPT_REQUIRED_FIELDS` carries no offer reference, so the desk
  can never say "this receipt settles that offer" — the relationship
  the offer/receipt pair exists for is untestable. Partly a spec
  boundary (standards-boundary language, KEEPER_LIST filed item 9):
  where the spec lacks the field, the honest move is a named
  `not_checkable_in_rev1` rather than silence.

- **F4 [ ] — desk expiry rides the wall clock.** (P3)
  `isOfferLive` accepts `nowSeconds` but `checkConformance` never
  passes one — the house testing law (inject the clock on BOTH sides;
  the anchor-submit midnight failure) applies to the product, not just
  its tests. Also the replay surface: nothing artifact-side is
  single-use (no nonce/jti), so a conforming receipt can be presented
  forever as if current — same class as D2's freshness binding.

- **F5 [ ] — key rotation is half-built.** (P3)
  Resolution reads only TODAY'S did.json, so a genuine artifact signed
  by a retired key fails key-resolution even when the issuer's own
  anchor log lists that key with its retirement date. The rotation
  data exists (this store publishes it); the verifier consults it only
  for the opt-in history block, never to admit a retired-key
  signature as "valid then." Add a rotation-aware path: verify against
  the anchored key history, verdict named distinctly (e.g.
  `signed_by_retired_key`), never silently equal to a current-key pass.

- **F6 [ ] — vector coverage stops at the JWS layer.** (P3)
  No vectors for: signed-but-value-invalid offers (F1's class), a
  receipt referencing a mismatched offer, a rotated-key artifact, a
  did:web resolution fixture set (missing kid, oversized doc, redirect
  refusal). Each new check class in F1–F5 ships with its vectors or it
  isn't real (same law as the adversarial tests in B).

---

## AREA G — The corpus as a longitudinal evidence asset (P4)

### G-current: what the chain actually holds (ground truth)
One `CorpusSnapshot` per week since the ward round shipped: the whole
`WardRound` verbatim — per-host rows (host, one URL, verdict, failed
check NAMES, advisory NAMES, feed source, leaderboard volume-claim as
labeled testimony, `OfferFacts`: networks/schemes/min+max USDC/payTo
capped at 4), plus `PopulationCensus` (known/walked/coverage,
appeared/disappeared/returned events, carry-forward, collapse guard),
`MarketAggregates` (rot, signed-offers rate, rails, price percentiles,
schemes, operator concentration via the `operatorOf` heuristic),
instrument self-diagnosis (coverage_suspect, pagination_shape,
door_bank, walk). Hash-chained, signed, OTS-anchored, R2-stored,
CC BY 4.0. Derived read: `/corpus/host/{host}.json` replays the chain
with a five-reason gap taxonomy and REFUSES the reliability ratio
(rule 43). Roster ~6,000 hosts, cadence weekly, long walk assembling.
The right bones: gaps counted against ourselves, events not states,
enumeration split from observation, aggregates recomputable by anyone.

### G-classification (the 25 dimensions, by defensibility)
Classes: **C** commodity (anyone can measure it today) · **M**
moderately differentiating · **P** proprietary after accumulation
(cannot be backfilled at any price) · **N** potentially defensible
network effect.
- **C:** endpoint enumeration (1), registrable-domain grouping per
  snapshot (3), current payment requirements (6), current rail/asset
  support (7), operator-concentration arithmetic (21), testnet
  contamination (24). Any funded competitor reproduces TODAY's value
  in a week; only their history differentiates.
- **M:** operator identity as heuristic (2), resource identity (5),
  availability at weekly grain (12), flapping at weekly grain (20),
  suspicious/contradictory claims as recorded testimony (25).
- **P:** pricing history (8), offer history (9), conformance history
  per battery version (11), drift events (13), key identity/rotation
  history (17), first/last-seen (18), disappeared/returned (19),
  shared-infrastructure history (4 — the lookup is commodity, the
  who-was-where-when tape is not), duplicated-service and
  cloned-infra detection (22, 23 — requires evidence bytes, G1).
- **N:** signed-offer adoption (10 — the store defines the metric,
  ships the signer, and measures the curve; the measurement makes the
  market it measures), settlement/purchase/delivery observation
  (14, 15, 16 — L5/L6, ⚑ NOW-6: nobody else pays to verify at scale,
  and each paid observation improves the instrument every buyer
  cites), and 18/19 once cited: the "observed continuously since
  <date>" claim compounds because no entrant can ever tie it.

### G-time-value (what mere age buys)
- **6 months:** first citable trendlines — signed-offer adoption
  curve, price percentile series, rot rate, rail mix; listing
  half-life becomes computable (median host lifespan).
- **12 months:** survival analysis means something (operator survival
  vs platform-subdomain survival), drift-event base rates, seasonal
  shape; every "since <date>" claim is a year no competitor can buy.
- **24 months:** actuarial substrate — failure-class base rates
  usable as priors by underwriters, insurers, and routing agents;
  protocol-transition history (v2→v3 as OBSERVED, not as announced);
  key-rotation and infra-migration norms for the whole ecosystem.
  Rule 23a/43 boundary stands: sell the DATED OBSERVATIONS and let
  buyers compute their own priors — the corpus never ships a score.

### G-findings
- **G1 [ ] CORE — the corpus stores conclusions, not evidence.** (P4)
  Ward rows keep failed-check NAMES and derived OfferFacts; the
  verbatim PAYMENT-REQUIRED bytes, response headers, and body hash
  are discarded at probe time. Same disease as B9, and here it is an
  UNBACKFILLABLE loss running weekly: without stored challenge bytes,
  duplicated-service detection (22), cloned-infrastructure detection
  (23), offer forensics (9), and any future re-parse under a better
  battery are impossible retroactively. The evidence envelope
  belongs in the ward row, not only the watch row — one design, both
  instruments (B9 ⇄ G1). Size is the objection and R2 is the answer
  (snapshots already graduated).
- **G2 [ ] — subject identity is a host string; operator identity is
  computed and thrown away.** (P4) `operatorOf` runs at aggregate
  time only; no per-row operator_id, no identity continuity when a
  service moves hosts. The corpus ALREADY captures the two strongest
  evidence-based linking signals — payTo reuse across hosts and (once
  G3 lands) key reuse — and never joins them. ⚑ RULE-shaped edge:
  evidence-based operator LINKING is identity resolution, not
  scoring, but it walks toward rule 43's line (an accumulating record
  keyed to an actor) — the keeper should draw where linking stops.
- **G3 [ ] — key identity never captured.** (P4) Signed offers carry
  a kid; the ward records only that offers exist. Recording
  kid + key-first-seen per host would give the ecosystem's only
  key-rotation history (F5's other half, pointed outward) — pure P
  class, free at probe time, uncollectable later.
- **G4 [ ] — no infrastructure dimension.** (P4) No ASN/cert/CDN
  observation at probe time, so infra migrations and shared-infra
  clusters (4, 23) have no tape. Worth capturing only what the probe
  already touches (TLS cert fingerprint, server headers) — zero extra
  contact, same consent posture.
- **G5 [ ] — drift events exist in the data, not as events.** (P4)
  Price/rail/scheme/payTo changes sit derivable across snapshots but
  are never minted as dated events the way appeared/disappeared are.
  Derivable retroactively (unlike G1/G3/G4), so lower urgency: a
  replay job, not a schema change.
- **G6 [~] — the three money dimensions are absent by ruling, not
  oversight.** (P4) Settlement, purchase, delivery observation
  (14/15/16) are the corpus's highest-value missing rows and the
  August field run proved both the method and the misattribution
  risk. Same ⚑ as E1/C-lane/NOW-6; the corpus is where those rows
  would live when ruled.

### G-schema (longitudinal, proposed — the chain stays untouched)
Principle: the signed chain remains the append-only EVIDENCE layer;
everything longitudinal is a DERIVED, rebuildable view (the
subject-history replay is already the pattern — extend it, never
fork it). Additions in build order:
1. **Evidence envelope per ward row** (G1, with B9's design): verbatim
   PAYMENT-REQUIRED, curated headers, body_sha256, battery version.
2. **Entity keys stored per row**: registrable_domain + operator_id
   (heuristic, versioned), offer kid/public_key (G3), cert
   fingerprint (G4). Raw signals only — linking stays derived.
3. **Derived event log**, replayed from the chain and re-mintable:
   verdict transitions (exists), listing events (exists), offer-drift
   events (G5), key-change events, infra-change events. Each event
   dated, sourced to the two chain sequences it spans.
4. **Subject views** keyed (subject, week) for endpoint/operator/
   key/payTo — the query shapes a buyer actually asks — all carrying
   the gap taxonomy and coverage denominators (B10's law).
Schema version inside the signed bytes (B9's rule) the day any of
this touches the snapshot itself.

### G-privacy / legal / attribution
- **payTo addresses in an irrevocable chain ⚑.** Wallet addresses
  are personal data when linkable to a person (sole traders will
  be), the chain is append-only by design, and CC BY licenses
  irrevocable redistribution. An erasure request collides with the
  tamper-evidence spine. Shape of an answer: keep verbatim payTo in
  the MUTABLE derived views, put a salted digest in the signed chain
  — evidence survives, erasure stays possible. Rule 41 exposure
  review before the corpus grows this dimension further; keeper's
  call on the existing rows.
- **Misattributed failure is the defamation-adjacent surface.** A
  published "not_ready for 12 weeks" that was OUR observer's failure
  (B6) is a false public statement about someone's business — the
  withdrawn August report is the in-house precedent. B6/B10's
  observer accounting is the legal defense, not just the honesty fix.
- **The aggregate refusal is load-bearing.** Rule 43's no-scores line
  also limits exposure; CC BY reusers WILL compute the ratio — their
  act, but the dataset description should say the store publishes
  observations, not ratings, and why.
- **Third-party testimony:** leaderboard volume claims are recorded
  with source and window (correct); redistributing them CC BY rides
  on the source's own terms — worth one look before W34-style
  publishes lean harder on that feed.
- **Consent posture is sound and published** (one GET/host/week,
  WBA-signed); the money dimensions (G6) are a different consent
  class and already gated on the keeper.

---

## AREA H — Registry / discovery layer (P5)

### H-current: the layer, ground truth
Enumeration: CDP discovery feed (offset paging, `coverage_suspect` +
`pagination_shape` self-diagnosis), x402.fuchss.app providers
(~10k hosts, ALL-OR-NOTHING read law — any failed bucket makes the
whole source unreadable), agent402.tools leaderboard (population +
volume TESTIMONY, `not_probed`, never in the ready arithmetic), the
door bank (past declarations re-probed as `source:"revisit"`), and
two paid directories deliberately UNREAD with reasons published
(`UNREAD_DIRECTORIES`). Register: normalized hosts (port/root-dot
lesson), first/last_seen, carry-forward with `carried_since`, gone/
returned as events, collapse suppression with a one-round benefit of
the doubt. Served surfaces: /registry (aggregates only, no names,
keeper-pressed), /fresh-set (names on the ready side only, coverage
block, corpus citations), /corpus/host/{host}.json (the replay with
the five-reason gap taxonomy). The posture is already the right one —
"listed ≠ working" is the registry page's whole message; what follows
is where the machinery leaks against it.

### H-sources (the eight questions, per source)
No source is AUTHORITATIVE — all are self-registration or scraping;
the only verification anywhere in this ecosystem is a probe, which is
what the ward adds. Per source: **CDP discovery** — free (keyed);
enumeration ingestion-based, completeness unknowable from outside;
pagination healed 08-19 but shape has moved before (the instrument
now records it); staleness PROVEN (31% rot IS the staleness measure);
subdomain farms yes (operatorOf collapses them at aggregate time);
"separate sellers" unknowable from listing alone; claims verifiable
only by probing. **fuchss** — free; largest known free enumeration;
all-or-nothing read; staleness unmeasured (no per-row dates in the
scrape); duplicates yes; claims = existence only. **agent402
leaderboard** — free; volume claims INDEPENDENTLY UNVERIFIABLE and
~78–98% wash by Artemis's classification (recorded 08-04); treated
as testimony with source+window attached (correct). **402index.io /
x402scan** — paid, unread; ~90k rows would trip the R2/full-universe
pairing; completeness claims untestable until one hand-captured paid
read. **door bank** — ours; a MEMORY, not a listing; revisit rows
carry that label for exactly this reason.

### H-ladder: the ten states, and what exists today
DISCOVERED (named by any source, ever — register) → LISTED (named by
a READ source THIS round) → OBSERVED (walked at least once — chain) →
PROBED (walked this round) → REACHABLE (= L0/L1) → CONFORMANT
(= L2/L3, battery version cited) → PURCHASABLE (= L4, assessed
without spend — TODAY AN ASSERTION, B-taxonomy) → PURCHASED (L5 ⚑) →
DELIVERED (L6 ⚑) → HISTORICALLY_STABLE. The last is special: rule 43
means it can only ever ship as the full dated transition list with
denominators (which /corpus/host already serves), NEVER as a label or
ratio — a "stable" badge is a score on an operator wearing a state's
name. The ladder's top four rungs are the same L4–L6 ⚑ as everywhere
else. **The registry ladder and B's evidence taxonomy are ONE model**
— enumeration states (DISCOVERED/LISTED), observation states
(OBSERVED/PROBED), evidence levels (L0–L6). Build it once.

### H-findings (accidental state conversions)
- **H1 [x] DONE 2026-08-24 — copy converts CONFORMANT into "working."** (P5)
  `/registry` prose: "N answered as working x402 endpoints"
  (`registry.ts:63`) and the Dataset markup's "doors answering as
  working x402 endpoints" — `ready` is L3a shape-conformance from one
  vantage, and "working" reads as purchasable-and-delivering. Same
  family as A2/A3; fix with the same conditions-beside-verdict rule
  (say "answered a well-formed challenge"). Cheap, live, public.

- **H2 [x] DONE 2026-08-24 — subject history marks revisit probes as listed.** (P5)
  `subject-history.ts` sets `listed: true` on every probed row, but a
  `source:"revisit"` row means BY DEFINITION no feed named the host
  that round (the door bank's own doc says so). A host delisted
  everywhere but still in the bank reads as continuously listed in
  its published history — PROBED silently converted into LISTED.
  One-line fix (`listed: entry.source !== "revisit"`), one red test.

- **H3 [~] — carry-forward blends DISCOVERED into LISTED at the
  denominator.** (P5) `population_known` includes carried-forward
  hosts (their source went dark); `carried_forward` is counted and
  published beside it, so the honest number exists — but a consumer
  of `population_known` alone inherits the blend. Publish
  `listed_now` (union of read sources this round) as its own field;
  carried stays in known.

- **H4 [ ] — fresh-set rows are the A3 gap on a routing surface.** (P5)
  A `FreshSetRow` carries host/url/rails/schemes/min_usdc + history
  link — a shopping row — but no per-row conditions: no battery
  version, no observed_at (round-level only), no `checks`/advisory
  summary, no vantage. With B3 unfixed, an UNPAYABLE door (name
  payTo, decimal amount, testnet) sits in the set with its rails and
  price rendered as if buyable — CONFORMANT converted into
  PURCHASABLE by presentation on the one surface built for routing
  decisions. Fix rides A3 + B3; the row gains `conditions` +
  `not_checked` fields.

- **H5 [ ] — per-fact provenance exists at round level, not fact
  level.** (P5) `sources[]` on the register is a lifetime union with
  no dates; a served row nowhere says WHICH source named it, WHEN,
  under WHAT read (source_version/pagination shape), through WHAT
  transformation (normalize, operatorOf version). The model, per
  fact: `{source, observed_at, source_version?, coverage
  (round's own flags), completeness (read|partial|unread|carried),
  confidence (measured|derived|testimony), transformation[]}`.
  `confidence` has exactly three honest values here — a probe result
  is measured, an operator grouping is derived, a leaderboard volume
  is testimony — and the leaderboard rows already model the pattern
  (source + window attached).

- **H6 [ ] — no machine-readable state vector.** (P5) The ladder
  lives in prose and field conventions (`verdict`, `not_probed`,
  `gap`, `carried_since`). An agent must parse OUR docs to learn that
  listed ≠ verified. Serve the states as a vector so the distinction
  is structural: see H-API.

### H-API (proposed, agent-facing — /registry/v1, frozen contract like conformance v1)
The design rule that answers the prompt's hard requirement: THIRD-
PARTY CLAIMS AND SCVD OBSERVATIONS ARE SEPARATE TOP-LEVEL OBJECTS,
so "listed in directory X" structurally cannot read as "verified by
SCVD" — different keys, not different adjectives.
- `GET /registry/v1/hosts?state=&min_state=&week=` — filterable rows:
  ```
  { host, states: { discovered: {at, by[]}, listed: {this_round,
    sources[]}, observed: {rounds, first, last}, probed: {at, battery,
    reached_level}, conformant: {at, battery, checks_url},
    purchasable: "not_assessed", purchased: "not_a_product_of_this_api",
    delivered: "not_a_product_of_this_api" },
    third_party_claims: [{source, claim, window, verifiable: false}],
    scvd_observed: {verdict, conditions, not_checked[], vantage,
      observed_at, battery},
    provenance: [H5's per-fact records],
    history_url, corpus_digest }
  ```
  Absent rungs are STATED (`"not_assessed"`), never omitted — B12's
  law at the API layer. Ratios never served (rule 43); transitions
  and denominators always.
- `GET /registry/v1/host/{host}` — subjectHistory, plus the state
  vector and provenance.
- `GET /registry/v1/sources` — the roster WITH the unread list and
  reasons (UNREAD_DIRECTORIES already is this; serve it).
- Aggregates stay on /registry as today (keeper-pressed, no names).
- /fresh-set becomes a view: `state=conformant&this_round=true` — one
  builder, so the surfaces cannot drift (AT_SCALE rule 1).

---

## AREA I — launch_check as end-to-end machine-commerce test (P7)

### I-current: the walk, ground truth
`services/launch-check.ts` + fulfillment: $5 at the till; one real
mainnet purchase attempt from the field wallet, capped at $0.05
(FIELD_SPEND_CAP_USD); disclosed UA; six verdicts (settled /
payment_refused / no_payment_gate / malformed_challenge /
unpaid_by_rule / unreachable); stages recorded as narrative; signed
whole with evidence_hash bound into the purchase certificate.
[AMENDED 2026-08-24, post-audit pull: the walk gained a REPLAY stage
(`replay_served` tri-state) — on settle, the byte-identical payment
is presented once more and a door serving goods again is recorded
(evidence-driven: 3 of 31 doors failed this on an independent
tester's board, while hostile-payload checks yielded ~nothing). This
strengthens I-flow steps 10–14 and adds one more unbounded body
read to I3's list. I1/I2/I4–I7 unchanged at head.] Safe
defaults ALREADY built: spend cap in code, Base+exact-scheme only,
fail-closed sanctions screen (keyless on-chain oracle default),
self-pay refusal, payTo shape read via the shared `readPayTo` table,
one attempt never a retry, random 32-byte nonce, every early return
a signed verdict. Two wallets two jobs (till receives, field walks).
Seams injectable throughout: FieldSigner, SanctionsScreen, fetch,
clock, nonce — the service is one extraction away from a library.

### I-flow: the fifteen steps against the build
Per step: what's observed / covered today / money state. (Money
column: steps 1–8 no money moved; step 9 is the boundary; the
authorization signed at step 7 is the live risk between.)
1. GET resource — `approach` stage ✓.
2. Receive 402 — ✓ (`no_payment_gate` names the open door).
3. Parse requirements — ✓, header/body split recorded as a finding.
4. Validate requirements — PARTIAL: amount parseable, payTo payable;
   asset NEVER checked (I1), decimals assumed (I1).
5. Select method — ✓ cheapest Base exact rail, rule stated.
6. Validate signer/offer — ABSENT (I6 ⇄ F2): payTo authenticity is
   nobody's check; harm bounded by the cap, but the report can't say
   who the money went to beyond "the address the 402 named."
7. Construct payment — ✓ EIP-3009, but validBefore is
   seller-controlled and unbounded (I2).
8. Verify own payment — not done pre-presentation; acceptable (the
   USDC contract is the verifier), worth one line in scope.
9. Settle — seller-side; boundary where paid_usd flips.
10. Retry with payment — ✓ one second knock, by design.
11. Receive response — ✓ but unbounded body read, default redirect
    following, no explicit timeout (I3).
12. Verify delivery — PARTIAL: byte count + sha256 + first 300;
    no check against what the OFFER promised (content-type,
    mimeType) — cheap to add; deeper semantic verification is
    honestly out of scope and should be a stated limitation.
13. Verify receipt — reads PAYMENT-RESPONSE, names its absence ✓ —
    but never verifies the claimed tx (I4).
14. Correlate payment↔delivery — ABSENT (I4): the machinery exists
    in-repo (settlement attestation reader) and is not called.
15. Record evidence — PARTIAL: narrative + hash, raw bytes not
    stored (I5 ⇄ B9/G1/D-envelope).

### I-findings
- **I1 [ ] — the asset is never checked against canonical USDC.**
  `verifyingContract: chosen.asset` signs whatever contract the
  seller names; `amountUsd` assumes 6 decimals for any of them. A
  hostile 402 naming an arbitrary ERC-20 gets an authorization on
  that contract while the signed report says "$X USDC" — evidence
  says USDC, chain says otherwise (a P6 layer-4 failure inside our
  own artifact). Domain binding bounds theft, not the false report.
  Fix: the B13⇄F1 shared value-checks module reaches here — asset
  must equal Base USDC or the verdict is `unpaid_by_rule` naming it.
- **I2 [x] DONE 2026-08-24 — unbounded validBefore + paid_usd recorded before the
  authorization dies.** validBefore = now + seller's
  maxTimeoutSeconds (uncapped: a seller can mint a years-long
  authorization). And on `payment_refused`/late `unreachable`, the
  report signs `paid_usd: 0` IMMEDIATELY while the authorization
  remains submittable until validBefore — a signed money claim that
  can become false minutes later (layer 6 at the money layer; the
  unreachable branch's own prose "no funds can have moved after the
  window" is only true because the window is short today). Fix:
  clamp validBefore (min(seller, 600s)); on unpaid-after-presentation
  verdicts carry `authorization_outstanding_until` in the signed
  bytes, and optionally re-read the chain after expiry to upgrade
  the record via a linked follow-up artifact (never mutate).
- **I3 [x] DONE 2026-08-24 — unbounded reads, default redirects, no explicit
  timeout.** Both knocks `await .text()` with no size cap; fetch
  follows redirects (the paid header travels to wherever the seller
  points); no configured timeout. Fix: cap the body read (e.g. 1MB,
  recorded when truncated), `redirect: "manual"` (a redirect on the
  paid knock is itself a finding), explicit per-knock timeout.
- **I4 [ ] — tx_hash is the seller's unverified claim.** Signed into
  a third-party-observation artifact without labeling (P6 layer
  mixing: custody-only datum inside an observation class). The
  settlement-attestation reader already does the exact read needed:
  confirm the tx exists, moves `amount` USDC from the field wallet
  to `payTo`. That read IS steps 13–14. Until built, the field
  should be `tx_hash_claimed`.
- **I5 [ ] — raw evidence discarded.** headerRaw, response headers,
  full bodies not stored — the D-envelope's `evidence` block
  (B9 ⇄ G1) reaches here; the walk is the artifact class where a
  dispute is LIKELIEST, since money moved.
- **I6 [ ] — no offer/signer validation.** Where a 402 carries a
  signed offer or DID, nothing checks it (F2's build, consumed
  here). Absence should be a recorded observation either way.
- **I7 [~] PARTIAL 2026-08-24 — the economic invariant is hand-typed.** Till price ($5,
  menu) > payout cap ($0.05, service) is the load-bearing 100:1
  ratio and lives in two files with no derived guard — AT_SCALE
  rule 1. One test: `menu.launch_check.price_usdc >
  FIELD_SPEND_CAP_USD` by a stated margin. Plus: no aggregate
  field-spend counter (per-check cap × N checks is bounded only by
  sales volume; a daily aggregate cap that fails closed is cheap
  defense-in-depth, and the funded balance of the field wallet is
  the final ceiling — say so in the scope).

### I-defaults: the safe-defaults sheet (built / missing)
Built: max spend per check ($0.05 in code) · allowed network (Base
only) · allowed scheme (exact) · recipient screening (sanctions,
fail closed) · self-pay block · one-attempt rule · random nonce ·
disclosed UA · URL validated at the buy door (https, public).
Missing: allowed ASSET list (I1) · validBefore clamp (I2) · max
response size / timeout / redirect policy (I3) · aggregate spend cap
(I7) · sandbox mode — a Base Sepolia variant for pre-launch sellers
(testnet USDC, screen skipped AND SAID, artifact marked
`sandbox: true` inside the signed bytes so it can never be quoted as
a mainnet settlement) · explicit buyer authorization is strong
(buyer names the URL and pays) but the $0.05 outlay should be
restated in the 402 offer terms, not only the menu copy.

### I-execution-risk: why this never becomes a payment rail
The store's answer must be structural, not vigilance: (a) the walk
only ever moves money BEHIND the till — every field payment is
preceded by a $5 sale, so spend ≤ 1% of the revenue that authorized
it (make it a derived test, I7); (b) the field wallet's funded
balance is the hard ceiling, kept small on purpose (already the
payout_authorization stance); (c) recipients are screened and the
screen fails closed; (d) one attempt, no retry, no schedule — the
product shape itself refuses rail semantics (no caller-specified
amount, no caller-specified recipient beyond "whatever YOUR 402
offers", within cap); (e) the library route (below) moves volume
users onto THEIR OWN wallet and risk. What would break this: a
raised cap without a raised price (the derived test), a batch/
subscription variant (⚑ keeper rule before any such product), or
countersigning third-party runs (refused below).

### I-interfaces (proposed)
- **Paid x402 endpoint — exists, stays the flagship.** The $5 walk
  IS the independent-observer product; everything below feeds it.
- **HTTP API** — already there (buy door + free verify at
  /api/launch-check/{id}); the work is upgrading the artifact to
  the D-envelope, not new routes.
- **MCP tool** — expose through the existing MCP till like the other
  shelves; thin wrapper, no new trust surface.
- **npm library (`@scvd/launch-check`)** — the extraction the seams
  already permit: the whole walk with THE CALLER'S FieldSigner,
  caller's cap/allowlists as required constructor args (no
  defaults that spend), emitting the SAME envelope shape but
  UNSIGNED-BY-SCVD — the caller may sign with their own key. SCVD
  never signs a run it did not observe (the observation model is
  the product; countersigning others' runs would be vouching for
  evidence we never saw — refused by design, stated in the README).
  This is also execution-risk containment: high-volume users run
  their own wallet, their own risk, our battery.
- **CLI (`npx @scvd/launch-check <url>`)** — wraps the lib; flags
  for key, cap, network, `--sandbox` (Sepolia); prints the envelope
  and the stage narrative; exit code = verdict class so CI can gate
  a launch on it. The CLI is the free marketing for the paid
  independent observation ("your own run says ready; now buy the
  version a stranger signed").
Shared battery, three consumers: the paid walk, the lib/CLI, and
E2's conformance manifest — one check registry (B16) serving all.

## AREA J — the agent-first surface (P8)

### J-decision: the $0.17 problem, and the minimum evidence
The agent with $0.17 and 40 endpoints is running ELIMINATION, not
ranking — which is exactly the shape rule 43 permits: SCVD serves
evidence, the agent computes its own decision. Four eliminations,
each answerable from evidence the store already holds or sells:
1. Can I pay it at all? — rails/asset/amount from the offer as
   read, price ≤ budget. (Facts: L3b conformance + offer terms.)
2. Is the door payable NOW? — freshness-bounded conformance; a
   verdict older than its class policy is served AS stale, with the
   fill offer beside it.
3. Does money produce goods there? — the only DIRECT evidence in
   the whole ecosystem is a settled launch check (rung 8 on the
   H-ladder: someone really bought, tx on chain). Proxy evidence:
   stability window (probes, transitions, gaps — denominators,
   never uptime%).
4. What's the downside? — bounded price, payTo screened/attributed,
   operator identity to whatever rung is evidenced, does_not_prove
   in-band.
The MINIMUM evidence vector per endpoint is therefore: current
conformance (verdict + tri-state checks + battery + conditions +
observed_at) · offer terms with provenance=read_from_402 · stability
window {n, days, transitions, gaps} · purchase evidence {settled
launch checks, or "none recorded"} · operator attribution · staleness
bounds · limitations. NO SCORE — composition is the agent's job, and
serving one would be rule 43's forbidden move (also a liability:
their loss, our number).

### J-envelope: every response, one shape
```
{ facts: {...},                      // the queried section(s)
  evidence: [{fact, artifact_id, verify_url}],
  evidence_basis: {kind: direct|derived|absent, n, window},
  freshness: {observed_at, age_s, stale_after_s, is_stale},
  coverage: {checked[], not_checked[], gaps[]},   // B12's law
  provenance: [{fact, source, method, at}],       // H5 per-fact
  limitations: [...does_not_prove, in-band],      // P6
  reason_codes: ["conformance.l3b.asset_unknown", ...],
  fills: [{gap, item_id, price_usdc, offer_url}], // J3, the loop
  cost: {this_call: 0, fills_priced_above: true},
  latency: {probe_ms, served_in_ms} }
```
`confidence` is DESIGNED AS A REFUSAL: never a scalar. What the
prompt wants confidence FOR is answered by `evidence_basis` (direct
settled purchase beats derived stability beats absent), and the
agent weighs it. Reason codes are a frozen additive registry
(B16's check-ID discipline), namespaced `area.check.finding`, served
at /agent/v1/reason-codes — strings an agent can switch on, never
prose it must parse.

### J-API: the smallest surface (absorbs H-API — one API, not two)
/registry/v1 (P5) and this are ONE surface; H-API's routes become
J's discover section so the ledger carries no competing designs.
Five routes cover all eleven capabilities:
1. `GET /agent/v1/endpoints?rail=&asset=&max_price=&min_state=&hosts=`
   — discover AND compare (compare is discover with an explicit
   hosts list; same rows, same envelope; H-API's state vector +
   third_party_claims/scvd_observed separation unchanged).
2. `GET /agent/v1/endpoint/{host}?since=` — the whole evidence
   vector: conformance / history+watch / purchases (launch checks) /
   offer+rails / operator / provenance. `since=` serves WHAT CHANGED
   — a derived diff between corpus snapshots (G's chain provides
   this for free; the diff is derived at read, the signed snapshots
   are the authority).
3. `POST /agent/v1/preflight {url}` — the free desk re-served in the
   envelope: fresh unsigned conformance now; the signed version is a
   fill.
4. `GET /agent/v1/evidence/{artifact_id}` — evidence retrieval: one
   uniform alias over the existing verify surfaces, envelope-wrapped,
   signed_payload passed through untouched.
5. `GET /agent/v1/reason-codes` — the frozen registry.
Paid actions (launch_check, watch, attestation, settlement) are NOT
new routes — they are `fills` links to the existing x402 till.
Evidence responses SELL THEIR OWN GAPS: "no purchase evidence" ships
beside the offer that would create some. That link is the commerce
loop and the reason the free tier is not charity.

### J-workflows: the seven questions, mapped
1. "Currently conformant?" → route 2 `.conformance`; stale ⇒
   `freshness.is_stale` + reason code + fill.
2. "Stable for 30 days?" → `.history` {probes, transitions, gaps,
   observer_status} — denominators only (B6/B10 accounting is what
   makes this claim honest).
3. "Independently purchased?" → `.purchases`: settled launch checks
   with tx + verify_url, or `purchase.none_recorded` — the one
   rung-8 evidence class that exists (H-ladder).
4. "What rails?" → `.offer.accepts` as read, with read_at and
   provenance — never normalized into prose.
5. "Evidence not score" → the envelope IS the answer; every fact
   carries its artifact link; no scalar exists to quote.
6. "Run a fresh launch check" → the fill (MCP: buy_observation with
   item_id=launch_check — already sold today).
7. "What changed since yesterday?" → route 2 `?since=` (J2).

### J-MCP: two free tools, no more
The catalog is deliberately small (the 27→10 consolidation is
documented in mcp-tools.ts); the evidence desk adds TWO free tools,
both returning the J-envelope as structured content:
- `find_endpoints` — route 1's inputs; discover/compare.
- `lookup_endpoint` — route 2's inputs {host, since?}.
Everything else already exists at the till: buy_observation sells
the fresh checks, verify_artifact is evidence retrieval. Total
catalog stays inside the tool-count band that motivated the
consolidation.

### J-SDK: npm `@scvd/agent` (read-side twin of I-interfaces' lib)
- Typed envelope + five methods mirroring the routes: discover(),
  endpoint(host, {since}), preflight(url), evidence(id),
  reasonCodes().
- `verifyLocal(artifact)` — offline ed25519 against the FETCHED key
  directory with the service-window check: D4+D5 baked in, so every
  SDK consumer gets layers 1–3 checked without reading our docs.
- `fillGap(fill, {signer})` — pays the x402 offer with the CALLER's
  wallet (the I-interfaces stance: no SCVD key ever ships in an SDK,
  and we never execute payments for callers).
- NO decide()/score() — stated in the README as a refusal, same
  sentence as the API's. The SDK returns evidence; deciding is the
  agent's job and the agent's liability.

### J-findings
- **J1 [ ] — the MCP surface is a till without an evidence desk.**
  An agent can buy through MCP but cannot ask: no conformance query,
  no history, no compare. The two free tools close it; highest-
  leverage item in this area (agents that cannot ask do not stay to
  buy).
- **J2 [ ] — "what changed" is derivable and unserved.** The corpus
  chain already holds the snapshots; a since-diff is a pure derived
  view (G-schema's pattern), needed by the cheapest real agent loop
  (poll the diff, act on transitions).
- **J3 [ ] — evidence gaps don't sell their fills.** Every "absent"
  in an envelope should carry the offer that would fill it; today
  the free surfaces and the till don't reference each other
  machine-readably.
- **J4 [design decision] — confidence-as-scalar refused.** Recorded
  as a decision with its reason (rule 43 + liability), so a future
  "just add a score" proposal meets a written answer.

## AREA K — marketplace infrastructure (P9)

### K-primitives: composable evidence, not a reputation score
Everything a partner embeds is a J-envelope subset — no new
machinery, no scalar anywhere (J4's refusal holds at partner
surfaces too, and it is also the partner's legal shelter: nobody
can accuse a marketplace of rigging a score that does not exist).
1. **Evidence chip** — the seller-card unit, exactly the prompt's
   sketch: {host, observations_n, last_observed_age, conformance
   verdict + battery version, signed_offer_seen, settled_purchases_n,
   transitions_30d, verify_url}. Counts and ages, never ratios;
   every number links its artifact. EMBEDDABLE WITHOUT TRUST: the
   partner re-serves it, anyone verifies against our published key,
   tampering is detectable — the chip is safe to hand to a party
   with incentives, which is the entire requirement.
2. **Pre-transaction gate** — one cheap call: conformant-now +
   purchase-evidence-exists + payTo attribution, answered in reason
   codes (a J route-2 subset), cacheable, built to sit in a signing
   path.
3. **Diff feed** — J2's since-diff as a subscription: transitions
   only, for partner re-ranking triggers.
4. **Verification kit** — E2's MIT battery: the partner runs the
   math locally, trusting us for nothing (the credibility primitive
   that makes the other three adoptable).
5. **Countersignable receipts** — cert `cross_ref` is BUILT AND
   SIGNED already (the bilateral fixture that never happened);
   cross-operator receipt recognition is a primitive waiting for its
   first partner, not a design.
6. **Watch delegation** — partners buy watches on their own sellers
   in bulk; the rating-agency clause (payment buys frequency and
   permanence, never outcome) is already at spec level and covers
   the marketplace-pays variant of the same conflict unchanged.

### K-integrations: eight classes
Each: SCVD provides / partner provides / why they can't build it /
neutrality / data flows / commercial / complexity / network effect.
- **Agent wallets** — THE integration. Provides: the gate + a
  licensed SNAPSHOT FEED so the wallet queries locally. Partner:
  the enforcement point — the query happens at the signing moment,
  before every transaction, automatically. Can't build: payer-side
  fiduciaries building seller evidence is a conflict, and the
  corpus is uncopyable backwards. Neutral: we hold no balance,
  touch no keys, serve evidence not verdicts-to-act-on. Flows: host
  queries in, envelopes out — and with the snapshot feed, NOTHING
  per-transaction flows to us (K1: per-call queries leak purchase
  intent; the local feed is a product requirement, not a tier).
  Commercial: SDK free, feed licensed by volume. Complexity: medium.
  Network effect: sellers learn conformance is a revenue
  precondition — the strongest compelled-demand loop available.
- **Orchestration frameworks** — provides J-SDK/MCP tools as a
  default-on commerce-safety module; partner provides distribution.
  Can't build: not their domain and pure liability. Free
  (distribution play; paid fills flow through). Complexity: low.
  Effect: queried before every autonomous purchase by default.
- **Payment facilitators** — provides settlement attestations and
  reconciliations ON THEIR SETTLEMENTS, attached to every receipt.
  The purest neutrality case: a facilitator attesting its own
  settlements is self-signed by definition (P6 trust models); the
  value IS that we are not the facilitator. Flows: tx hashes in
  (public anyway), attestations out. Commercial: wholesale
  per-attestation, resold inside their receipt. Complexity: medium.
  Effect: our signature becomes standard receipt enrichment —
  automatic at every settlement.
- **Agent marketplaces** — provides chip + gate in the seller card;
  partner provides placement and query volume. Can't build: they
  are a PARTY (listing revenue = conflicted rater), no probe
  vantage, no corpus, no sanctions/compliance machinery for real
  purchases. Neutral: signed artifacts + published gaps + the
  spec-level payment clause. Commercial: free chips, volume API,
  bulk watch delegation. Complexity: LOW (embed JSON/SVG — badge
  machinery exists). Effect: J3's loop surfaces inside partner UI —
  sellers see rivals' chips and buy checks to fill their own.
- **x402 directories** — provides the H-API state vector with the
  claims/observations separation; partner provides listing breadth
  (H-sources reciprocity). Can't build: x402station's $1 badge is
  the counterexample already cited in the attestation spec —
  shape-checks without corpus, independence, or purchase evidence.
  Flows bidirectional: their rosters in (corpus grows), chips out.
  Complexity: low. Effect: evidence-backed rows visibly outperform
  badge rows in the shared audience.
- **Agent directories** — chips for breadth; free both ways;
  trivial complexity; effect: observation count becomes de facto
  listing metadata.
- **MCP registries** — chips for MCP servers, A NEW SUBJECT CLASS
  (today's subjects are x402 endpoints; an MCP-shape battery
  variant is real work — priced accordingly). Complexity: low-med.
  Effect: registry cards → server operators buy checks.
- **Procurement systems** — provides the enterprise bundle that
  already exists as shelf items: mandates (claimed authorization),
  launch checks (vendor onboarding), statements (reconciliation),
  watch histories (SLA evidence). Can't build: auditors require
  INDEPENDENT signed evidence — internal records structurally
  cannot satisfy the requirement. Commercial: the actual money
  (enterprise contracts, volume watches). Complexity: high, slow
  cycles. Effect: vendors REQUIRED to hold current SCVD evidence.

### K-priority: ranked by automatic-query-before-transaction
1. Wallets (the signing moment — every transaction, structurally
   pre-payment); 2. Orchestration (default-on, pre-purchase);
3. Facilitators (universal, at settlement); 4. Marketplaces +
x402 directories (pre-selection — earlier but partial coverage);
5. MCP registries, agent directories, procurement (slower loops;
procurement is the revenue tail, not the wedge). All of 1–3 consume
the same three primitives (gate, chip, snapshot feed): K is
DISTRIBUTION OF J — nothing here builds before Area J ships.

### K-findings
- **K1 [ ] — the snapshot feed is a privacy requirement.** Per-call
  gate queries tell us what an agent is about to buy; a wallet
  integration that leaks purchase intent to a third party
  (us) will and should be rejected by wallet teams. Local snapshot +
  diff feed makes the gate zero-leak, and it must be designed in
  from the first wallet conversation, not retrofitted.
- **K2 [ ] — cross_ref is built and unused.** The countersignable
  receipt primitive shipped in the signature on 2026-08-02 and no
  partner ever consumed it; every integration above that exchanges
  receipts (facilitators, marketplaces) is a candidate first user.
- **K3 [⚑ KEEPER] — every commercial model above is a pricing
  ruling**, and bulk watch delegation is the batch variant
  I-execution-risk flags: volume terms need the keeper before any
  partner hears a number.

## AREA L — open-source strategy (P10)

### L-current: more is shipped than the ledger knew
`x402-verify` and `x402-sign` are PUBLISHED — unscoped, v1.0.2, MIT,
zero-dependency, living as `verifier/` and `signer/` in this repo,
cited on README/agents-md/llms/skills, download trends in the
keeper's monthly review, and the store DOGFOODS the verifier
(preflight imports it). The strategy is therefore not "what to
open" — it is how to grow a coherent namespace around two names
that already have adoption.

### L-doctrine (the moat sentence, recorded)
"The primitives are open. The accumulated evidence network is SCVD."
This is E2's MIT/hosted split said better, and it is already the
house position: anyone can rerun the math; only an independent
observer at a vantage, at a moment, with an anchored history, can
say what an endpoint answered. Corollary written down so it binds:
NO PROPRIETARY MATH — any temptation to keep a format or verifier
closed to protect the moat is refused, because a closed format
shrinks the network the corpus measures. The one asset never
published wholesale is the corpus itself (per-artifact reads free
forever; the LONGITUDINAL body is the product — G-time-value).

### L-components: the seven questions, answered in groups
(adoption / credibility / displacement / commoditization / standard /
competitor-contribution / funnel)
- **Parser, offer+receipt verifier, JWS** — SHIPPED in x402-verify.
  All seven: yes, yes, yes, no (we charge for observation, never
  math — the free desk already gives the math away hosted), yes,
  some, yes (README → conformance desk → paid siblings).
- **Signer-authorization verification** — the D4/D5/F5 key-window
  check. NOT in the package yet (L1). Opening it is pure
  credibility: it makes OUR OWN offline recipe fix distributable
  (J-SDK's verifyLocal), and it is the check that catches
  retired-key forgeries of anyone's artifacts, including ours.
- **Conformance runner, vectors, deterministic fixtures** — E2/B16's
  battery release, MIT as planned. The competitor-contribution
  answer lives here: badge-sellers validating against SHARED vectors
  strengthen the standard we host the reference observation for.
  Commoditization: no — a local pass is a fact about your machine;
  the sale is a stranger's signed verdict at a URL.
- **Evidence schema + evidence hash** — @scvd/evidence, the
  D-envelope as a published standard with JCS canonicalization, the
  sha256 convention, reason-code registry (J), envelope validators.
  THE STANDARD PLAY: if others adopt the envelope, SCVD is the
  reference implementation and the largest corpus in the format it
  defined. Opening it commoditizes nothing — the format was never
  the moat (G-time-value is).
- **Certificate verifier** — ours-specific (CERT_FIELDS, legacy
  forms); modest adoption value; ships inside @scvd/evidence rather
  than as its own package.
- **Settlement parser** — reads public chain state; nothing to
  protect; separate package because it carries an RPC dependency
  (see zero-dep rule below).
- **CLI / GitHub Action / MCP verifier tool** — pure funnels; one
  binary (@scvd/cli) with the Action wrapping it and a `--mcp` mode
  serving the verifier tools locally, to avoid package sprawl.

### L-architecture: the package map
Two namespace tiers, deliberately:
- **Unscoped, shipped, KEPT:** `x402-verify`, `x402-sign` — renaming
  published packages burns adoption and mints a supply-chain
  confusion window (old name + deprecation shell + squatting risk).
  They stay canonical for their jobs. (⚑ KEEPER — naming is canon;
  if he ever wants the scoped mirror, publish @scvd/* as thin
  re-exports, never move the source.)
- **Scoped, new:** everything else under @scvd — `@scvd/conformance`
  (runner+manifest+vectors+fixtures, B16/E2), `@scvd/evidence`
  (envelope standard), `@scvd/agent` (J-SDK), `@scvd/launch-check`
  (I-interfaces, caller's wallet), `@scvd/settlement` (chain reads),
  `@scvd/cli`. The conceptual split is the user's diagram verbatim:
  sign creates evidence → verify verifies it → conformance measures
  behavior → evidence represents observations → the hosted API
  serves history → the network is the accumulation. Recorded as the
  architecture sentence for all future packaging decisions.
- **Dependency discipline (hard rule):** sign/verify/evidence/
  conformance stay ZERO-DEP forever — it is already the shipped
  differentiator and it is AT_SCALE rule 6 as a product feature.
  Packages that must touch a chain (@scvd/settlement,
  @scvd/launch-check) carry the RPC dep so the pure tier never does.
- **Versioning:** semver with frozen behavior contracts — the
  conformance battery's versions-serve-forever rule (already
  standing) generalizes: a published check, vector, or envelope
  field is never renamed, only deprecated; protocol-version support
  is an explicit parameter with a documented support matrix, and
  vectors carry their `changed_in` blocks (house pattern).

### L-supply-chain
The signing path IS the product, so the package pipeline is a trust
surface: register the @scvd npm scope now (defensive, cheap,
urgent — L2); 2FA + npm provenance attestations (`--provenance`,
publish from CI via OIDC, no local tokens); the store pins and
consumes its own packages (already true for the verifier — keep it
true, it is the canary); publish contents are already
files-allowlisted (shipped packages do this right). No new deps on
sign/verify paths without a stated reason — now enforced by the
zero-dep rule above rather than by review vigilance.

### L-findings
- **L1 [x] — key-window verification missing from x402-verify.**
  CLOSED 2026-08-24 (phase1/1.5-key-window). `checkKeyServiceWindow`
  shipped in the package with README section and .d.ts types —
  generic over any issuer's published key_history shape, five
  statuses (in_service / before_service / after_retirement /
  unknown_key / undated), inclusive window edges for the swap day.
  The store's /api/verify is its first consumer (D4), which is the
  dogfood path the cross-ref ordered. NOT yet republished to npm —
  the release is a keeper ceremony (⚑), and until it ships the
  function is public in-repo only.
- **L2 [ ] — @scvd scope unregistered (verify, then register).**
  Squatting cost is near-zero for an attacker and permanent for us.
- **L3 [ ] — no CI publish pipeline with provenance.** Local
  publishes are the current state; move to OIDC + provenance before
  the package count grows past two.
- **L4 [=B16/E2] — vectors and fixtures not yet packaged.** Already
  in the build order; L adds only the namespace decision
  (@scvd/conformance).

## AREA M — positioning & the multi-chain/multi-protocol lens (P11, keeper direction)

### M-direction (keeper, 2026-08-24 — recorded as rulings, not findings)
- **Positioning: EVIDENCE OBSERVATORY, with room to pivot.** The
  bigger prop is the CROSS-PROTOCOL evidence layer — x402 is the
  first subject, never the identity. (Doctrine amended in the
  architecture spec.)
- **The store stays.** Products remain the commercial surface —
  observations are sold as goods at the till, which is already the
  house model. The nuance owed: the shelf needs a clear line between
  observatory instruments (checks, watches, attestations — the
  purpose) and the general-store character goods (the voice). Both
  stay; the copy should let a stranger tell which is which. ⚑ shelf
  taxonomy wording is keeper canon.
- **Build on the assumption we are RIGHT about volume.** The goal is
  to be past-ready when it arrives: documented history deep enough
  to SHOW the trajectory/spike as it happens, and infrastructure
  that survives being suddenly load-bearing. Readiness is a product
  feature: "we watched this market from N=small and here is the
  curve" is only sayable if the counting started early and never
  broke.
- **No self-segmentation.** Chains and protocols are DIMENSIONS of
  observation, not market boundaries. Gather the data; let it drive
  the pivots. MPP (keeper-named) and the other agentic-commerce
  protocols (AP2, ACP-class) become new battery families when
  warranted — the schema must make that additive, not a migration.

### M-nuance: is there enough today? Honest answer: no — Base-deep, elsewhere thin
Ground truth per chain (from the shipped classes):
- **Base:** deep — till accepts it, settlement attestations read it,
  launch check pays on it, statements read it (USDC/Base only),
  reconciliations read it, sanctions oracle lives on it.
- **Solana:** till accepts it, attestations read it — no launch
  check, no statements, no field wallet, no screening path.
- **Polygon:** attestation reads only.
Protocol nuance: the battery is x402 v2 + offer-receipt rev 1; the
manifest's per-check protocol-applicability field (B16) is the right
seam and currently has one family in it. The corpus does not carry
protocol/chain as first-class subject dimensions — a host is a host.

### M-findings
- **M1 [x] — the coverage matrix must be STATED, per class per
  chain.** CLOSED 2026-08-24 (phase1/1.4-coverage).
  `src/evidence/coverage.ts` derives class × chain × depth from the
  chain ids payments.ts / base-rpc / solana-rpc already export.
  Every KNOWN_CHAIN is present on every row (`none` is a value).
  Envelopes carry `coverage` (class_id, this-observation depth,
  class_row snapshot). Served at `/coverage.json` and
  `/.well-known/coverage.json`. Sandbox Sepolia is named and stays
  `none` on every production class. Partner question "do you cover
  Solana?" is now per class: attestation/statement/till yes (read or
  till); launch_check no.
- **M2 [~] — subject dimensions in the corpus schema.** Envelope
  subject tuple shipped in 1.1. Discovery-surface families
  (x402_bazaar, mcp_card, a2a_agent_card, llms_txt, openapi, …)
  landed as PROTOCOL_FAMILIES rows 2026-08-24 so a coherence
  observation can name the surface — batteries not built yet, the
  row is the id not a claim we have checks. Corpus schema still
  open (G-schema).
- **M3 [ ] — the trajectory surface.** "Show the spike as it
  happens" is a derived time-series over the corpus chain (hosts,
  offers seen, settlements observed, failure classes — per week,
  per chain, per protocol, denominators always). This is also the
  state-of-the-market reporting asset (the winter authority play):
  same build, two consumers. The chain already holds the history;
  the view does not exist.
- **M5 [ ] — agent legibility of the observatory identity.** The
  primary readers of the forward-facing surfaces are now AI agents,
  and every agent-facing door (llms.txt, agents.md, README, skills,
  MCP read_store_guide, store copy) leads with "general store." An
  agent classifying SCVD from those surfaces files it as a novelty
  shop and never surfaces it for a trust/evidence query — the
  discovery failure costs the entire observatory positioning. The
  shape (keeper's words): "we're a store, but the other stuff is
  stated at the forefront" — observatory identity first, store voice
  kept. Every agent-facing surface answers "what does SCVD do" with
  independent signed observation BEFORE the shelf. ⚑ exact wording
  is keeper canon; the finding is the ORDER, not the voice. Canary
  test: the copy specs already assert phrases — add one asserting
  the observatory line appears before the store line on each
  agent-facing surface.
- **M4 [ ] — scale-readiness inventory, before the spike.** The
  known ceilings, written down and tested at the margin rather than
  discovered under load: KV write/list limits on the hot counters,
  cron fan-out per watch tick as watch count grows, the suite's
  own load-timeout behavior (already documented in AGENTS.md) as a
  canary, read-path caching for /agent/v1 (the gate must be cheap at
  wallet volume — K1's snapshot feed is also the scale answer:
  bulk reads move load off the per-query path). Not premature
  optimization: an inventory with thresholds and a test at each
  edge, so the first spike is measured, not survived.

## Cross-cutting overlaps (build once)
- **A3 ⇄ B2:** carrying conditions on trust surfaces and splitting the
  `unreachable` verdict are the same honesty fix at the probe layer.
- **B1 ⇄ B2 ⇄ B3:** reached_level + checks vector + folding advisories
  are one schema change to the battery, not three.
- **B6 ⇄ B10 ⇄ B11:** observer_status, the availability denominator,
  and coverage integrity are one accounting change.
- **E1 ⇄ C-lane ⇄ KEEPER NOW-6:** behavioral observation, the L5/L6
  products, and the settlement-attempt-lane ruling are the same ⚑.
- **B13 ⇄ F1 ⇄ B3:** one shared value-checks module (CAIP-2 grammar,
  atomic amount, payTo via readPayTo, asset, testnet table) serves the
  endpoint battery, the artifact desk, and the L3b verdict fold —
  built once, consumed three times.
- **B16 ⇄ E2:** the check-ID registry, manifest, and endpoint fixtures
  ARE the packaging work — B16 is the finding, E2 is the build.
- **F4 ⇄ D2:** clock injection and freshness binding are the same
  time-honesty change viewed from opposite sides of the desk.
- **B15 ⇄ B3/B4:** endpoint-side offer payload reading folds into the
  same L3b/L3c escalation.
- **B9 ⇄ G1:** the reproduction envelope is ONE design serving the
  watch row and the ward row — signing evidence instead of
  conclusions, and storing it, is the same build.
- **G3 ⇄ F5:** key capture outward and rotation-aware verification
  inward are two ends of one key-history capability.
- **G6 ⇄ E1 ⇄ C-lane ⇄ KEEPER NOW-6:** the corpus's money rows, the
  passport's delivery observation, and the settlement-attempt lane
  remain the same ⚑.
- **B6/B10 ⇄ G-privacy:** observer accounting doubles as the legal
  defense for every published negative observation.
- **H-ladder ⇄ B-taxonomy:** the registry's ten states and the
  watch's L0–L6 are one model — enumeration states on top of evidence
  levels. One definition, every surface derives from it.
- **H1 ⇄ A2/A3, H4 ⇄ A3/B3:** the copy fixes and the
  conditions-beside-verdict rule are the same build reaching the
  registry surfaces.
- **H5/H6 ⇄ G-schema:** per-fact provenance and the state vector are
  fields of the same derived subject views G proposes.
- **D-envelope ⇄ B9/G1/B-v2:** the formal envelope IS the v2 schema's
  container — observation/derived/limitations/methodology are B9's
  fields named at the evidence layer. One design, every signing class.
- **D4 ⇄ F5 ⇄ G3:** service-window checking at our verify, rotation-
  aware verification at the desk, and key-history capture outward are
  the same key-window capability at three surfaces.
- **D5 ⇄ H-API:** the offline verification recipe and the registry
  API's provenance rule are the same instruction: never let a
  verifier take attribution from the artifact being verified.
- **D-layers ⇄ everything:** the six-layer model is the acceptance
  rubric for the whole series — B6 defends layer 4, B3/H1 layer 5,
  D2/F4/C3 layer 6, D4/F2 layer 3. Each adversarial example doubles
  as a red test.
- **I1 ⇄ B13/F1:** the shared value-checks module gains its fourth
  consumer — asset-vs-canonical-USDC is the same check at the
  battery, the desk, the verdict fold, and now the paying walk.
- **I4 ⇄ C2 ⇄ settlement attestation:** the chain read that verifies
  a seller-claimed tx is the attestation reader pointed at our own
  payment — money-path symmetry's other half.
- **I5 ⇄ B9/G1/D-envelope:** the walk joins the envelope's consumer
  list; it is the class where dispute-grade evidence matters most
  (money moved).
- **I6 ⇄ F2:** offer/signer validation built once at the desk,
  consumed by the walk.
- **I2 ⇄ D-layers:** the outstanding-authorization window is the
  series' one layer-6 failure inside a MONEY claim — priority above
  its size.
- **J-API ⇄ H-API:** ONE surface — /agent/v1 absorbs /registry/v1's
  routes as its discover section; H5/H6's provenance and state
  vector are fields of the J-envelope. No competing designs survive
  this merge.
- **J-envelope ⇄ D-envelope:** the response envelope (read side) and
  the evidence envelope (signing side) share coverage/limitations/
  provenance vocabulary — define the terms once (B16's registry).
- **J-SDK ⇄ D4/D5:** verifyLocal ships the service-window check and
  key-directory fetch, making the offline recipe fix distributable
  rather than documentary.
- **J3 ⇄ E1/E2:** gap→fill links are the moat's demand engine — every
  free read advertises exactly the paid observation it lacks.
- **K ⇄ J:** every partner primitive is a J-envelope subset; Area K
  builds nothing before /agent/v1 ships — it is J's distribution.
- **K1 ⇄ J2:** the wallet snapshot feed is the since-diff plus a
  bulk endpoint dump — one derived-view build serves both.
- **K2 ⇄ I-interfaces:** cross_ref's first consumer is likeliest the
  facilitator receipt or a marketplace's own certificate — the
  bilateral fixture the field was built for, found via K rather
  than waited for.
- **L1 ⇄ D4/D5 ⇄ J-SDK:** one key-window check, three deliveries —
  our verify route, the x402-verify package, the SDK's verifyLocal.
  Build the comparison once in the package; the store consumes it
  (dogfood path already exists via preflight's import).
- **L-architecture ⇄ I-interfaces/J-SDK/E2:** @scvd/launch-check,
  @scvd/agent, and @scvd/conformance are the same builds already
  ordered — L contributes only names, tiers, and the zero-dep rule.
- **K-primitives ⇄ @scvd/evidence:** the chip and gate are envelope
  subsets; partners validating chips against the published schema
  package is what makes embedding-without-trust real.

---

## CONSOLIDATION (series ended 2026-08-24 — this is the plan)

**The strategy ruling this order** (outside counsel, endorsed): don't
optimize for more data; optimize for more DEFENSIBLE evidence. The
target sentence is per-host: "observed hourly for N months, under M
battery versions, D drift events, S signed offers seen, P
independent purchases, each observation cryptographically
attributable" — every number in it a derived count with artifacts.
Host count is explicitly NOT the moat (a crawler recreates it in a
day); the longitudinal evidence vector is. Two consequences bind:
G1's weekly evidence loss is the single most strategically expensive
open item (every week without the envelope, the corpus accrues
conclusions instead of evidence), and observer accounting (B6/B10/
B11) plus freshness (D2/F4) are what make the target sentence
HONEST rather than an overclaim — they are part of the moat, not
hygiene. One genuinely new long-term item from the same counsel:
DISTRIBUTED OBSERVERS — the only answer on the table to
HELD_AGAINST_US (single key, single operator, single vantage, the
one critique the store concedes in full). Cheap first moves exist
(second vantage in another region; cross-observer co-signing with a
peer store — cross_ref is built for exactly this). Filed as the
end-state after the network effect, per the execution graph; the
EVIDENCE GRAPH's embryo already exists (corpus chain + cross_ref +
G2's operator linking, the last ⚑-gated).

**Execution phases** (safety outranks strategy; then the counsel's
foundation→network order, which matches the dependency structure the
areas found):
- **Phase 0 — this week, regardless of strategy:** live false
  claims (A1, A2, D3, H1, H2); live money exposure (I2 validBefore
  clamp, I3 read caps/redirects/timeout); L2 scope registration;
  I7's derived invariant test. All small diffs, each with a red
  test where behavior changes.
- **Phase 1 — evidence model:** the D-envelope as spec and schema
  (@scvd/evidence), B9 ⇄ G1 ⇄ I5 as its first three producers —
  stops the weekly loss; D6's methodology-in-signature rides in;
  M2's subject dimensions (protocol/chain in the schema) land here
  so nothing built later needs a migration, and M1's coverage
  matrix is the envelope's coverage block said per chain.
  L1's key-window check in x402-verify (delivering D4/D5) beside it.
- **Phase 2 — conformance engine as standard:** B1/B2/B3 + A3
  probe-layer honesty, the B13⇄F1⇄I1 value-checks module, B16/E2
  manifest + fixtures + @scvd/conformance, F2's offer/signer
  validation (consumed by I6).
- **Phase 3 — corpus/history:** G3/G4 cheap capture, C2 + I4
  money-path symmetry, D2/F4 freshness, B6/B10/B11 observer
  accounting, then G2/G5 derived views (J2's since-diff included,
  M3's trajectory surface beside it — same derived-view build).
- **Phase 4 — the consumable surface:** /agent/v1 (H3/H5/H6 folded
  in), J1's MCP tools, J3's gap→fill links, the J-SDK, F5/F6 desk
  depth.
- **Phase 5 — distribution/network:** K's integrations wallets-first
  (K1's snapshot feed is a precondition), I-interfaces lib/CLI, E1
  behavioral passport, remaining L pipeline (L3 before package #3).
- **Horizon:** distributed observers; the evidence graph. Gated on
  demand and keeper rulings.
⚑ standing gates: K3 (all partner pricing), G2/G-privacy (before any
operator-linking build), F3 (standards boundary), C-lane/E1/KEEPER
NOW-6 (one ruling), every RULE item to the keeper. M4's
scale-readiness inventory is revisited before each phase ships.
Every behavior change ships with a test shown red without it.

The normative spec derived from this ledger lives at
`docs/EVIDENCE_ARCHITECTURE_V1.md` — packages, APIs, watches, and
paid products derive from THAT document; this ledger keeps the
findings and their reasons. The agent-executable ordering lives at
`docs/OBSERVATORY_ROADMAP_2026-08.md` (phases, acceptance criteria,
gates) — three documents, three jobs, no duplicated detail.

**Original ordering note (superseded by the phases above, kept for
the record):** fix live false public claims first (A1,
A2, D3, and now H1/H2 — near-zero risk, H2 is a one-line state fix),
with I2's validBefore clamp and I3's read caps pulled forward beside
them (small diffs, live money exposure on a shipping paid product,
each one red test), then the shared probe-layer honesty change
(B1/B2/B3 + A3, which now includes B12/B15, H4's fresh-set
conditions, and the B13⇄F1⇄I1 shared value-checks module), then the
evidence envelope (B9 ⇄ G1 ⇄ I5 — one build, and G1's loss is
running weekly, which argues for pulling it earlier than P2 alone
did), then cheap-at-probe-time capture
(G3/G4 — free now, uncollectable later), then money-path symmetry
(C2 — now with I4's tx-claim verification, the same chain read),
then freshness (D2/F4), then observer accounting (B6/B10/B11 —
also the legal defense, G-privacy), then artifact-desk depth
(F2/F5/F6 — F5 now travels with D4's service-window check and D5's
recipe fix, three cheap moves on one key-window capability), derived
corpus views (G2/G5 — J2's since-diff is one of these), and the
state-vector/provenance layer (H3/H5/H6 + the unified /agent/v1
API per J, which absorbed /registry/v1 and packages everything
above for consumers — J1's two MCP tools and J3's gap→fill links
ride this step, and the J-SDK ships beside it), then the moat
(E1/E2 with B16's manifest+fixtures, which now includes
I-interfaces' lib/CLI extraction — the seams are already cut, and
Area K's partner primitives distribute all of it, wallets first)
and reorg (C3) gated on demand. K3 gates every partner commercial
conversation on the keeper. Two L items jump the queue for cost
reasons: L2 (scope registration — minutes, permanent downside if
lost) rides the first batch, and L1 (key-window check in
x402-verify) is the preferred delivery vehicle for D4/D5 rather
than a store-only fix. L3 lands before the third package publishes. I7's derived invariant test is test-only and rides the
first batch. F3 waits on the
standards-boundary read; G2's operator linking and G-privacy's payTo
question are ⚑ before any build. Every behavior change ships with a
test shown red without it; RULE items (⚑) wait on the keeper.
