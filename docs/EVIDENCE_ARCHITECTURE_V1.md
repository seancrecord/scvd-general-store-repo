# SCVD Evidence Architecture v1

Status: DRAFT for keeper review — 2026-08-24.
Derived from the audit ledger (`docs/EVIDENCE_LAYER_REVIEW_2026-08.md`,
P1–P10). This document is NORMATIVE: packages, APIs, watches, and paid
products derive from it. The ledger keeps the findings and their
reasons; this file keeps only what binds. Where the two disagree, fix
whichever is wrong and say so on /corrections — a spec that drifts
from findings is the defect class this store exists to catch.

Doctrine, one line: **the primitives are open; the accumulated
evidence network is SCVD.** Anyone can run the verifier, inspect the
methodology, reproduce the tests. Only SCVD holds this particular
body of independent, longitudinal, cryptographically attributable
observation. Corollaries that bind: no proprietary math, ever; no
score, ever; the corpus is the asset, and DEFENSIBLE evidence beats
more data (host count is not the moat — the per-host evidence vector
is).

Positioning (keeper, 2026-08-24): SCVD is an **evidence observatory
for agentic commerce, cross-protocol by design** — x402 is the first
subject, never the identity. Chains and protocols are DIMENSIONS of
observation (§2a), not market boundaries; new protocol families
(MPP, AP2/ACP-class) land as new battery families and new subject
rows, never as schema migrations. The store remains the commercial
surface: observations are sold as goods at the till. And everything
here is built on the assumption the volume arrives: the observatory
must be able to SHOW the trajectory as it happens (the corpus
time-series, §8) and survive becoming load-bearing (scale ceilings
inventoried and tested at the margin, not discovered under load).

---

## 1. The six trust layers

Every artifact establishes some layers and not others, and MUST be
able to say which (ledger: D-layers). The layers, each provable while
the next fails:

1. **Cryptographic validity** — the signature verifies over the bytes.
2. **Signer identity** — the key is genuinely SCVD's (published in the
   key directory).
3. **Signer authorization** — the key was in service at the artifact's
   own date (service-window check against the key registry).
4. **Factual observation** — what was signed actually happened
   (defended by observer accounting, §6 — no signature can defend it).
5. **Interpretation** — the verdict drawn is sound (defended by
   verdicts carrying conditions and a checks vector, §5).
6. **Historical persistence** — the claim still holds when presented
   (defended by freshness binding, §7).

Verification requirements (normative):
- A verifier MUST check layers 1–3, in order. Layer 2 requires
  resolving the key against the PUBLISHED directory
  (/.well-known/scvd-signing-key or the anchored key history), never
  only the key carried in the artifact. Layer 3 requires comparing
  the artifact's date against the key's `in_service_from`/`retired_on`
  window (mind the documented handover swap window).
- The reference implementation of all three lives in `x402-verify`
  (npm, MIT, zero-dep); the store consumes the same code (dogfood).
- Layers 4–6 are not verifier work: they are properties the ENVELOPE
  must expose so a consumer can weigh them (§2).

## 2. The evidence envelope

One container for every observation class (watch rows, audit
reports, ward rows, launch checks, attestations). Published as a
schema in `@scvd/evidence`. Fields (ledger: D-envelope; semantics
normative, serialization JCS-canonical):

- `observation` — what was seen, stated as facts, never verdicts.
- `evidence` — raw artifact references: verbatim challenge bytes,
  curated headers, `body_sha256`. Evidence is STORED, not just
  hashed: an observation that cannot be re-examined is a conclusion,
  not evidence.
- `observer` — key id, software/battery version, vantage.
- `at` + `clock` — the moment, and which clock (injected everywhere;
  a verdict that can move with the wall clock is not a test).
- `methodology` — battery/criteria version and schema identifier,
  INSIDE the signed bytes.
- `derived` — the verdict plus a tri-state checks vector
  (pass / fail / not_checked), labeled derived so interpretation is
  visibly a layer above observation.
- `limitations` — `does_not_prove` and `not_checked`, in-band.
- `signature` + `key` — as today, plus the key's service window
  cited so layer 3 is checkable offline.
- `authorization` — pointer to the key registry and anchor-log entry.
- `revocation/rotation` — the handover announcement id where a
  retired key signed.

Rules that bind:
- Absent facts are STATED (`not_checked`, `none_recorded`), never
  omitted. Silence must be distinguishable from a pass.
- Counts and denominators only; ratios and scores never.
- Every derived figure names the artifacts it derives from.

## 2a. Subject dimensions

The subject of an observation is the tuple **(endpoint, protocol,
protocol_version, chain, rail)** — carried in the envelope, the
corpus schema, and the battery manifest's applicability field, from
ONE registry of protocol and chain identifiers. Consequences:
- Chain and protocol coverage is a STATED MATRIX (class × chain ×
  depth), served on observatory surfaces and inside envelope
  `coverage` — "we observe three chains" is said per class, never in
  general. (Current truth: Base deep — till, attestation, purchase,
  statements, screening; Solana — till + attestation only; Polygon —
  attestation only.)
- Adding a protocol family (MPP, AP2/ACP-class) means new registry
  entries, new checks under the existing manifest discipline, and
  new subject rows. If it requires a schema migration, the schema
  was wrong.

## 3. Keys and signing

- One ed25519 artifact key in service at a time; full history
  published forever with service windows; handovers announced before
  the new key signs, announcement signed by the outgoing key.
  (All shipped; normative here so nothing regresses.)
- Key-purpose separation: the artifact key signs evidence; the
  secp256k1 field wallet signs money (EIP-3009). Never
  interchangeable, never cross-used.
- Every verify response serves `signed_payload` — the exact bytes —
  so canonicalization is never the verifier's problem.
- SCVD signs only what SCVD observed. No countersigning of runs
  performed by others, ever — a library user's run is their
  observation, signed with their key or not at all.

## 4. The conformance battery contract

The measurement standard (ledger: B-taxonomy, B16, E2):
- Checks have STABLE, NAMESPACED IDS (`x402.endpoint.status-402`),
  never renamed, only deprecated.
- A release = machine-readable manifest (`checks.json`, derived from
  code or the generator refuses) + deterministic fixtures (recorded
  bytes, replayable offline; every known-bad fixture red for exactly
  one check) + the runner. Published MIT as `@scvd/conformance`.
- Battery versions serve forever. Artifacts cite the version they
  ran (§2 `methodology`).
- Evidence levels L0–L6 (reachable → challenge → parseable terms →
  payable terms → signed offer → settled purchase → delivery
  observed). Verdicts state the level REACHED; a check above the
  reached level is `not_checked`, never `pass`.
- Value checks (asset against canonical registry, CAIP-2 grammar,
  atomic amounts, payTo readability, testnet detection) are ONE
  shared module consumed by the battery, the artifact desk, the
  verdict fold, and the paying walk.

## 5. Observation classes and scope

Each class keeps its published trust model (self_signed /
custody_only / third_party_observation) and its `does_not_prove` —
the per-class table in `store/attestation-spec.ts` remains the
canonical register and moves INTO the envelope's `limitations`
in-band. Class rules that bind:
- A custody-only datum inside an observation artifact (e.g. a
  seller-claimed tx hash) is LABELED as a claim until independently
  read from the chain.
- Chain-reading classes are independently reproducible and say so;
  probe classes are not reproducible even in principle, so their
  stored raw evidence (§2) is the only dispute-grade substitute.
- The paying walk (launch check) is the only class that moves money.
  Its safe defaults are part of this spec: per-check cap in code;
  Base + canonical USDC only; sanctions screen fail-closed;
  self-pay refusal; clamped authorization validity; bounded reads;
  manual redirects; one attempt, never a retry; till price
  exceeding the field cap by a derived, tested margin. The store is
  an observer that pays, never a payment rail: no caller-chosen
  amount or recipient, no batch, no schedule.

## 6. Observer accounting

The observer is an instrument, and instruments fail (ledger:
B6/B10/B11). Binding rules:
- Observer failure is attributed to the OBSERVER: `observer_status`
  distinguishes "we could not look" from "we looked and it was
  down". A timeout of ours is never the subject's outage.
- Coverage gaps are derived at read, published, and counted against
  the store, in the same history they interrupt.
- Availability figures are served as numerators AND denominators
  (probes attempted, probes completed, subject failures), never as
  a percentage alone.
- This accounting doubles as the legal posture for every published
  negative observation.

## 7. Time

- Clocks are injected on every path that reads one (both sides —
  the due-check and the row written).
- Every artifact carries `observed_at`; every serving surface
  carries a class-level staleness policy (`stale_after`), and a
  consumer-facing `is_stale` derived at read. An old artifact
  verifies forever; what expires is its claim to describe NOW.
- "What changed since T" is a first-class derived view over the
  corpus chain.

## 8. The corpus

The longitudinal asset (ledger: Area G). The chain (hash-linked,
OTS-anchored snapshots) stays untouched; everything else is derived
views over it. The target shape is the PER-HOST EVIDENCE VECTOR:

> observed hourly for N months · M battery versions · D drift
> events · S signed offers seen · P independent purchases ·
> R deliveries observed · every figure carrying its artifacts

Rules: capture at observation time what cannot be recollected later
(key material seen, offer bytes, latency); derive counts, never
hand-type them; the chain proves OUR history was not rewritten and
is never claimed to prove completeness.

The TRAJECTORY SURFACE is a first-class derived view: ecosystem
time-series (hosts, offers seen, settlements observed, failure
classes — per week, per chain, per protocol, denominators always)
over the corpus chain. It is both the readiness instrument (show
the spike as it happens) and the state-of-the-market reporting
asset; one build, two consumers.

## 9. The agent surface

One API (ledger: Area J — /agent/v1, absorbing /registry/v1). Five
routes: endpoints list (discover/compare), per-endpoint evidence
document (with `?since=`), free preflight, evidence retrieval, and
the reason-code registry. Every response is the J-envelope:
facts / evidence links / evidence_basis (direct | derived | absent —
the designed refusal of a confidence scalar) / freshness / coverage /
provenance / limitations / reason codes / fills.
- Reason codes are a frozen, additive, namespaced registry.
- Third-party claims and SCVD observations are separate top-level
  objects — different keys, not different adjectives.
- Evidence gaps carry the x402 offer that would fill them.
- MCP adds exactly two free evidence tools (find_endpoints,
  lookup_endpoint) beside the existing till.
- Partner primitives (chips, gates, snapshot feeds — ledger Area K)
  are envelope subsets; the wallet snapshot feed is a privacy
  requirement (pre-transaction queries must not leak purchase
  intent to us).

## 10. Packages

Two tiers (ledger: Area L):
- Unscoped, shipped, canonical: `x402-verify`, `x402-sign`.
- Scoped, new: `@scvd/evidence`, `@scvd/conformance`, `@scvd/agent`,
  `@scvd/launch-check`, `@scvd/settlement`, `@scvd/cli`.
Rules: sign/verify/evidence/conformance are ZERO-DEPENDENCY forever;
chain-touching packages carry the RPC dependency so the pure tier
never does. Semver with frozen behavior contracts; published names
and fields are never renamed, only deprecated. Publishing moves to
CI with OIDC and npm provenance; the @scvd scope is registered and
2FA-protected; the store pins and consumes its own packages.

## 11. What this architecture refuses

Stated so future proposals meet a written answer:
- No reputation score, confidence scalar, or ranking — evidence and
  denominators; composition is the consumer's job and liability.
- No countersigning of observations SCVD did not make.
- No proprietary math or closed formats to protect the moat.
- No payment execution on behalf of callers; no caller-directed
  transfers; no batch payment products without a keeper ruling.
- No claim stronger than its layer (§1): every surface says what a
  signature does not prove.
- No hand-typed twin of any fact that lives in code (derive or
  refuse).

## 12. Open at v1 (tracked in the ledger, not resolved here)

Distributed observers (the standing answer to single-operator
critique — second vantage, then cross-observer co-signing via
cross_ref); the evidence graph over operators (⚑ gated on the
privacy/attribution ruling); federation/witness models; post-quantum
migration (succession protocol unchanged, waiting on the ecosystem);
protocol watchlist for new battery families (MPP per the keeper,
AP2/ACP-class as they stabilize — added when observed demand or the
trajectory surface says so, per the no-self-segmentation rule);
deepening Solana (purchase evidence, statements, screening path) and
Polygon beyond attestation reads, as the coverage matrix and demand
direct; the scale-readiness inventory (ledger M4) revisited before
each phase ships.

— end v1 —
