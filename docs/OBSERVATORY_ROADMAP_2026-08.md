# Observatory Roadmap — 2026-08

A segmented execution roadmap FOR AN AI AGENT. Written 2026-08-24
from the audit ledger and the architecture spec; keeper-directed.

## How to use this document

- **Sources of truth:** every item cites a ledger ID (e.g. `I2`,
  `B9`) — READ THAT ENTRY FIRST in
  `docs/EVIDENCE_LAYER_REVIEW_2026-08.md`; it holds the finding, the
  reasoning, and the file pointers. Normative design lives in
  `docs/EVIDENCE_ARCHITECTURE_V1.md`. This roadmap orders the work
  and states acceptance; it deliberately does not duplicate detail
  (a second copy drifts — AT_SCALE rule 1).
- **House rules that bind every item:** read `HOUSE_RULES.md` and
  `KEEPER_LIST.md` before working. `npm run typecheck && npm test`
  before any commit. Every behavior change ships with a test SHOWN
  RED without it (stash the fix, run, confirm red, restore). Items
  marked ⚑ stop for the keeper — do not build past a gate.
- **Order matters within a phase only loosely; across phases it is
  load-bearing** (later phases consume earlier ones). One item per
  branch/PR-sized change; keep files ≤ ~300 lines, split modules.
- **git:** work on a feature branch; PULL before any merge/push
  (keeper's standing instruction).

---

## Phase 0 — Safety and truth (do first, small diffs)

Live false claims and live money exposure on shipping products.

**0.14 is A-class and arguably the worst of them.** A1 and A2 are copy
overclaims on HTML pages — wrong, fixable, ephemeral. 0.14 is a signed,
hash-chained, OpenTimestamps-anchored artifact asserting `ready` for a
door that provably cannot receive money. The anchoring is the problem
rather than the mitigation: it makes the false claim permanent,
attributable, and independently verifiable as ours. An observatory that
anchors a wrong verdict has published a durable lie with a proof of
authorship attached.

Note the shape, because it recurs: the check EXISTS, is free, is live,
and is correct — the flagship record simply does not consume it. Two
instruments of ours disagreeing in public is the failure; either could
have been right. **1.3 (D6) is the structural fix** — a verdict carrying
its battery version inside the signed bytes cannot make this error
silently, because the disagreement becomes visible in the artifact
itself. 0.14 stops the bleeding; 1.3 stops the class.

| # | Ledger | What | Acceptance |
|---|--------|------|------------|
| 0.1 | A1 | Fix live false public claim #1 (read the ledger entry) | Claim matches measured data; test pins it |
| 0.2 | A2 | Fix live false public claim #2 | Same |
| 0.3 | D3 | Rewrite stale `delivery-audit.ts` header comment (deliver-first is runtime truth) | Comment matches code; no behavior change |
| 0.4 | H1 | Registry copy overclaim ("working endpoints") | Copy states what was checked |
| 0.5 | H2 | One-line registry state fix | Red test first |
| 0.6 | I2 | Clamp launch-check `validBefore` to min(seller, 600s); add `authorization_outstanding_until` to signed bytes on presented-but-unpaid verdicts | Red test: hostile 402 with huge `maxTimeoutSeconds` gets clamped window; unpaid-after-presentation artifact carries the field |
| 0.7 | I3 | Launch check: cap body reads (record truncation), `redirect: "manual"` (redirect on paid knock = recorded finding), explicit timeout | Red tests per behavior |
| 0.8 | I7 | Derived test: `menu.launch_check.price_usdc > FIELD_SPEND_CAP_USD` by stated margin | Test-only; fails if either number moves wrong |
| 0.9 | L2 | Register `@scvd` npm scope, 2FA (⚑ keeper runs the npm account steps) | Scope owned |
| 0.10 | M5 | Agent-facing surfaces lead with the observatory identity, store voice second (llms, agents-md, README, skills, MCP guide, what.ts) — ⚑ exact wording is keeper canon; propose, don't finalize | Ordering canary test per surface |

Expand/consider: 0.10 is the discoverability keystone — while in
those files, inventory EVERY agent-facing door into one list so
future copy changes touch all of them (the maker's-mark lesson:
a field on some surfaces and not others reads as hiding).

### Phase 0-ops — operational items (added 2026-08-24)

| # | What | Acceptance |
|---|------|------------|
| 0.11 [~] | CORPUS BACKUP: periodic cold export of KV (corpus, watch histories, artifacts) to R2/offline, hash-verifiable against the anchored snapshots. The anchor chain proves integrity, not availability — the moat asset must survive losing the namespace | Export runs on schedule; restore drill documented; digests match anchors — **[~] 2026-08-24: export ships weekly with a per-bundle sha256 manifest; the RESTORE DRILL is not written and nobody has walked one, so this stays partial. A backup never restored is a belief rather than a backup.** |
| 0.12 | SELF-WATCH: an EXTERNAL monitor on SCVD's own surfaces, linked publicly (the store rightly refuses to audit itself; someone else must). Publish agent-API latency figures | Link live; latency served with denominators |
| 0.13 ✅ 2026-08-24 | RATE LIMITS on free unauthenticated paths (desk, future /agent/v1), with limits PUBLISHED (silent limiting violates the stated-conditions law); bulk consumers pointed at the snapshot feed (K1) | Limits enforced + stated; test |
| 0.14 | ⚑ THE CENSUS CERTIFIES DOORS THAT CANNOT BE PAID. Found live 2026-08-24, after this ledger was written, so it carries no A-number. `/corpus/host/hypernatt.com.json` publishes verdict `ready`, `failed: []`; `/api/preflight/v2` publishes `not_ready` on the same door, same day, because the Solana payTo owns no USDC token account. Cause: `ward-round.ts:451` calls `runChecks(response, false)` — the deliberately synchronous, offline battery — and `checkRailReceivable` is reachable only from `preflight.ts`. The check was built to live outside `runChecks` because it needs the network and CI aims `runChecks` at our own 402 every build; that reasoning was right and its consequence was never followed through, so the census never received the check | Red test: a Solana-rail host with an unfunded payTo is scored `ready` by the ward round today, and is not after. Ledger-unreadable is its own gap reason, never a pass |

### Phase 0-x402list — directory position (added 2026-08-24, from the
competitive read of x402-list.com; we scored 85, ranked 18/46 in
Verification, and the drags are identified)

| # | What | Acceptance |
|---|------|------------|
| 0.14 | FIX "DEGRADED": x402-list still probes /api/buy/daily_fortune, retired 2026-08-20 (their last_seen matches the retirement date exactly). Use their owner-update flow (/services/{slug}/update, one-time domain proof, manually reviewed) to drop the retired endpoint. ⚑ keeper submits (domain proof) | Status returns to ● on their board |
| 0.15 | SIGNABILITY RE-CAPTURE: their eip712_domain_extra check reads unknown (envelope captured 2026-08-21, before their signability checks landed); VERIFIED 2026-08-24 our live 402 carries extra.name/version on every EVM entry, so a fresh capture passes. Request re-assessment via the owner flow; ?signable=true currently EXCLUDES unknowns, so agents filtering on it never see us | Check reads pass; we match ?signable=true |
| 0.16 | FORTE TIER: only 1 of 550 listed services is verified (they paid a real call that delivered). Our $0.004 settlement_attestation is the cheapest possible probe target. Request a paid probe via the owner flow / their paid /assess with probe target. Being FORTE service #2 puts us in every require_verified=true result from their /best API | verified: true on our listing |
| 0.17 | THE $0.001 QUICK LOOK (⚑ keeper: name/price/copy): the J-gate v0 as a paid x402 route — give a host, get what the observatory already holds (ladder state, last observed, artifact links, coverage, honest not_observed) from KV reads only, no external calls, envelope-shaped response. Purpose: the routine pre-transaction call path (the only route to top-of-board buyer counts from the Verification category), cheapest-sort visibility at $0.001, buyer diversification (gen-3 ranking discounts our 64.6% top-buyer share). This is Area J's gate shipped early on existing data, not a new product class | Route live at $0.001; envelope response; buyers_30d and top_buyer_share both improve |
| 0.18 | BUYER CONCENTRATION: watch top_buyer_share_30d (0.65 at writing) — gen-3 discounts it; 0.17 is the fix, this row is the metric to check monthly alongside the npm trends in KEEPER_LIST | Share trending down |

Expand/consider (from the category read, all mapping to existing
plans): watch alerts via webhook (Trust Prober sells these; J2's
diff feed productized); payTo-rotation as a named alertable finding
(x402-list logged 1,069 rotations in 90d; PulseFeed leads with the
fear); free preview + embeddable endpoint badges (K-chips); a
published benchmark page in the Second Opinion style (accuracy with
failures shown — house style already); MPP coverage exists at
probe402 (validates M2's dimension work). Deliberate non-gaps, do
NOT build: trust scores (J4 refusal is the differentiation) and
take-rate routing à la Aegis (the payment-execution class Area I
refuses).

## Phase 1 — Evidence model (the foundation; stops the weekly loss)

| # | Ledger | What | Acceptance |
|---|--------|------|------------|
| 1.1 | D-envelope, M2 | Define envelope schema v1 with subject dimensions (endpoint, protocol, protocol_version, chain, rail) — types + JCS canonical form + validators, as its own module tree (future `@scvd/evidence`) | Schema round-trips; validator rejects each malformed fixture |
| 1.2 | B9, G1, I5 | Wire the envelope into its first three producers: watch rows, ward rounds, launch checks — STORE raw evidence (challenge bytes, curated headers, body_sha256) | Red test: current main discards evidence; new artifacts carry and store it |
| 1.3 | D6 | Methodology/battery version + schema id INSIDE signed bytes on all observation classes | Red test: artifact without methodology fails validator |
| 1.4 | M1 | Derived coverage matrix (class × chain × depth); serve on observatory surfaces + envelope `coverage` | Matrix derived from code, not typed; test compares to registrations |
| 1.5 | L1 | Key-window (service dates) check in `x402-verify`; store consumes it (delivers D4/D5) | Red test: retired-key artifact dated post-retirement passes today, fails after |
| 1.6 | D5 | Fix offline verification recipe text (resolve key against published directory + window) | Copy test |

Expand/consider: while in 1.1, decide envelope storage layout in KV
(per-artifact vs bundled) with M4's write limits in mind; 1.2 is the
place to confirm every producer clears its KV prefix in specs
(append-only surface rule in AGENTS.md).

### Phase 1-joins — coherence batteries (landscape §11)

Not a second Phase 1. The batteries that sit on the envelope
already shipped. Productize (paid report / refresh / alerts) stays
off until the keeper names a price.

| # | What | Acceptance |
|---|------|------------|
| 1.j6 ✅ 2026-08-25 | `receipt_coherence` dogfood: bind the selected catalog surface into our own receipts | Minted `hello` carries `saw` matching the menu hash; planted list-price disagreement is conflict; missing `saw` is not_observed; published signature fixtures still verify |
| 1.j7 ✅ 2026-08-25 | `capability_coherence` catalog-only: chains + primary transport | Live x402.json and x402 thin agree on networks; planted chain is conflict; A2A MCP vs MCP card agree after normalize. No live probe |

## Phase 2 — Conformance engine as the measurement standard

| # | Ledger | What | Acceptance |
|---|--------|------|------------|
| 2.1 | B1/B2/B3, A3 | Probe-layer honesty: reached_level, tri-state checks vector, split `unreachable`, conditions beside every verdict | Red tests from B-adversarial list |
| 2.2 | B13, F1, I1 | ONE shared value-checks module (canonical USDC asset, CAIP-2, atomic amounts, payTo, testnet) consumed by battery + desk + verdict fold + launch check | Red test: hostile 402 naming arbitrary ERC-20 currently signed as "USDC" — refused after |
| 2.3 | B16, E2, L4 | Battery release discipline: stable check IDs, `checks.json` derived from code, endpoint fixtures (recorded bytes, offline replay), changelog | Manifest generator refuses hand-typed drift; every known-bad fixture red for exactly one check |
| 2.4 | F2, I6 | Offer/signer validation at the desk; launch check consumes it (absence recorded either way) | Red tests both consumers |
| 2.5 | B12, H4 | Absence-stated law at remaining surfaces (fresh-set conditions) | Copy/shape tests |

Expand/consider: 2.3 is the extraction seam for `@scvd/conformance`
— structure the module tree so packaging later is a move, not a
rewrite. Protocol identifiers registry (M2) feeds the manifest's
applicability field — build the registry here if 1.1 didn't.

## Phase 3 — Corpus, money-path symmetry, honest accounting

| # | Ledger | What | Acceptance |
|---|--------|------|------------|
| 3.1 | G3, G4 | Capture-at-observation-time fields (key material seen, offer bytes, latency) — free now, uncollectable later | New rows carry them; test |
| 3.2 | C2, I4 | Money-path symmetry: verify seller-claimed tx on chain via the existing attestation reader; until read, label `tx_hash_claimed` | Red test: fabricated PAYMENT-RESPONSE hash currently signed as fact |
| 3.3 | D2, F4 | Freshness: `stale_after` per class, `is_stale` derived at read; clock injection everywhere both sides | Red test: old artifact served without staleness today |
| 3.4 | B6, B10, B11 | Observer accounting: `observer_status`, gap attribution, numerator+denominator serving (never bare %) | Red tests: our timeout currently booked as subject outage |
| 3.5 | G5, J2, M3 | Derived views over the corpus chain: subject histories, since-diff, TRAJECTORY SURFACE (weekly time-series per chain/protocol) | Views derived only from signed snapshots; test re-derives |
| 3.6 | G2 ⚑ | Operator linking — DO NOT BUILD before the privacy/attribution ruling | Ruling recorded first |

Expand/consider: 3.5's trajectory surface is also the
state-of-the-market report generator — while building, emit a
publishable weekly artifact (the winter authority play). Denominators
always; no ratios.

## Phase 4 — The consumable agent surface

| # | Ledger | What | Acceptance |
|---|--------|------|------------|
| 4.1 | J-API, H3/H5/H6 | `/agent/v1`: five routes, J-envelope responses, reason-code registry (frozen, additive), claims/observations as separate objects | Contract tests per route; fresh-set becomes a view (one builder) |
| 4.2 | J1 | Two free MCP evidence tools: `find_endpoints`, `lookup_endpoint` | Tool responses = same envelope |
| 4.3 | J3 | Gap→fill links: every stated absence carries the x402 offer that fills it | Test: envelope with absent purchase evidence carries launch_check offer |
| 4.4 | J-SDK | `@scvd/agent`: five methods + `verifyLocal` (layers 1–3 incl. key window) + `fillGap` (caller's wallet only); NO decide()/score() | SDK verifies fixture artifacts offline |
| 4.5 | F5, F6 | Desk depth: rotation-aware verification, remaining artifact checks | Red tests |

Expand/consider: 4.1 must be cheap at wallet volume — cache the read
path; revisit M4 inventory before shipping. Reason codes: derive the
registry from check IDs where possible.

## Phase 5 — Distribution and network

| # | Ledger | What | Acceptance |
|---|--------|------|------------|
| 5.1 | K1 | Snapshot + diff feed (zero-leak wallet integration precondition; also the scale answer) | Feed re-derivable from signed snapshots |
| 5.2 | K, K3 ⚑ | Partner integrations wallets-first; chips/gates as envelope subsets; ALL pricing to the keeper first | — |
| 5.3 | I-interfaces | Extract `@scvd/launch-check` lib + CLI (caller's wallet; SCVD never countersigns) + `--sandbox` (Base Sepolia, `sandbox: true` in signed bytes) | Lib runs the same battery the paid walk runs |
| 5.4 | L3 | CI publishing: OIDC + npm provenance before package #3 | Pipeline green |
| 5.5 | E1 ⚑ | Behavioral/delivery observation into the passport (gated on paying buyer + keeper) | — |
| 5.6 | K2 | First `cross_ref` consumer (facilitator receipt or marketplace cert) | Bilateral fixture verified both ways |

## Horizon (design when the trajectory surface says so)

- Distributed observers: second vantage, then cross-observer
  co-signing via cross_ref (the standing answer to single-operator).
- Evidence graph over operators (⚑ G2 ruling first).
- New protocol families (MPP per keeper; AP2/ACP-class): new
  registry entries + battery families, never schema migrations.
- Solana depth (purchase evidence, statements, screening), Polygon
  beyond attestation — as the coverage matrix and demand direct.
- C3 (reorg awareness), F3 (standards boundary read).

## Standing gates (check before every phase)

- ⚑ items stop for the keeper: all pricing (K3), operator linking
  (G2/G-privacy), shelf-copy wording (M5), batch/subscription
  payment products (I-execution-risk), E1, F3.
- M4 scale-readiness inventory revisited before each phase ships.
- Money fails closed; decoration fails open. No score, no
  countersigning, no proprietary math, no caller-directed payments
  (spec §11).
- Every derived number stays derived — if a count or version is
  typed twice, the build is wrong (AT_SCALE rule 1).
