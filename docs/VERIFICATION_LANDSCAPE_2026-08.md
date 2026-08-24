# The Verification Landscape — observation notes and index plan

**Dated 2026-08-24.** Raw material for the public observation index of
the x402 verification category. Everything in §2 was observed from
public surfaces on that date — nothing paid, no code run, unreachable
noted as unreachable rather than absent. Traction figures are
x402-list.com's measured 30-day on-chain floors (CC BY 4.0), read the
same day.

**What this is NOT:** a grading exercise. The published index states
observable facts per service, dated and reproducible, with SCVD in the
table under the same columns — including the cells where someone else's
fact beats ours. The keeper's framing: observation index territory;
fill any noteworthy gaps before it posts.

---

## 1. Why facts and not scores

The category's *vocabulary* has fully converged — "Ed25519-signed,"
"deterministic," "verifiable offline," "tamper-evident," "no LLM,"
"named operator, corrections page" all appear across the 46 listings,
most of it plausibly model-authored. Copy cannot differentiate when
copy is free. What separated services under actual observation was
never the claim; it was whether the claim survived a fetch:

- LION advertises an Ed25519 key URL that **404'd twice** on 2026-08-24.
- Aegis's listing claims a "daily tamper-evident hash chain" —
  **no artifact findable** on its own surface.
- StillOS's listing claims notarization, OFAC screening, and an
  on-chain correctness bond — **its public page shows a different
  product** with none of the three visible.
- Hermes's "signed receipt" is **HMAC** — not third-party verifiable
  by construction, though honestly described on their own docs.
- Dokimo's "published spec" and "on-chain registry" could not be
  located from the crawlable surface.

An index whose every cell is a checkable fact is therefore both the
honest artifact and the differentiating one: producing it *is* the
demonstration of being an actual observer, and it is what an answer
engine should surface when an agent asks which verification service
to trust.

## 2. The field, condensed (observed 2026-08-24)

Full per-service reports live in the session transcripts; this is the
decision-relevant extract. Traction = x402-list 30d volume / buyers.

| Service | Signs with | Key fetchable today | Anchoring artifact | Buys from graded doors | Corrections page | Named operator | Rails (settle) | Traction |
|---|---|---|---|---|---|---|---|---|
| **SCVD (us)** | ed25519 | yes — `/.well-known/scvd-signing-key`, retired keys in registry | Bitcoin (OTS) anchor log, tamper-tested in suite | **yes — settled purchases + replay check** | yes | yes (keeper) | Base+Polygon+Solana | **$215 / 14** |
| x402 Trust Prober | ed25519 over JCS | yes — well-known, dated key | none (sig-only, 90d bound) | **no — states it deliberately does not verify delivery** | none found | anonymous | Base | $0.80 / 17 |
| LION | ed25519 (claimed) | **no — advertised key URL 404s** | none | no | none found | anonymous | Base | $3 / 17 |
| PayPerByte | EIP-712 over exact bytes | yes — attester + per-feed keys in agent.json | none | no | **yes-adjacent: dated key-exposure incident + field-defect disclosures** | pseudonymous | Base | $3 / 13 |
| Aegis | ed25519 (receipts only) | yes (receipts pubkey) | claimed hash chain: **artifact not found**; ERC-8004 writes real | claims spot-checks, no spend log published | none found | org only | Base+MPP/Tempo+Algorand | $0.15 / 10 |
| Rubric Protocol | ML-DSA-65 (post-quantum) | per-record via public verify | **Hedera HCS topic, live** | no | none found | named (off-site) | Base (anchor: Hedera) | $5 / 10 |
| Hermes Plant | **HMAC** (symmetric) | n/a by design | none | no | changelog, no incidents | named | Base | $2 / 7 |
| Dokimo | unspecified | **not locatable** | claimed on Base, not locatable | no | none found | named, strongest bio | Base | $0.39 / 6 |
| PulseFeed | unsigned verdicts | n/a | claimed append-only, no tamper-evidence published | no (probes only) | yes — published a dated correction | anonymous | Base | $21 / 3 |
| Second Opinion | ed25519 | yes — well-known + canonicalization spec + browser verifier | none (dated receipts w/ tx hashes) | n/a (claim verification, not endpoints) | failures woven into /benchmark | anonymous | **Algorand+Base+Polygon+Solana** | $4 / 2 |
| Lazaretto | ed25519 (JWS) | yes — live JWKS | none; anti-stale badges | n/a (package scanning) | **claimed, log not found** | pseudonymous | Base | $0.06 / 1 |
| 10x402 | deliberately unsigned | n/a | none, keeps nothing | no | DISAGREEMENTS.md in repo | pseudonymous, open source | Base | $0.53 / 1 |
| LedgerProof | ed25519 | yes — public **in-browser verifier** | **Bitcoin-anchored RFC 9162 Merkle, checkable today** | n/a | none found | pseudonymous | Base (+Stripe path) | $0.15 / 1 |
| Permit Verdict | EVM ECDSA | yes — recovery address in README | none; live re-resolution instead | n/a | none found | first name only | Base | $1 / 1 |
| probe402 | **none claimed** | n/a | immutability asserted, no artifact | **structurally cannot pay** (import-graph-enforced) | **yes — live, count 0, published preemptively** | **yes — named** | Base | $0 / 0 |
| nsgoods | ECDSA (claimed; key not found) | no — manifest 404s | **Bitcoin/OTS log for SDN source files, checkable today** | n/a | none | anonymous | **Solana** | $0 / 0 |
| Watchtower | none (deterministic replay) | n/a | point-in-time snapshots, no external anchor | n/a | none found | anonymous | Base + Stripe prepaid | $0 / 0 |
| fingers, token-risk, Hexscan, Bounty Truth, Butterfly Delta*, Vibes-Coded*, AgentBiz*, StillOS, FixSpec | mostly unsigned or key-not-findable; Butterfly Delta EIP-191 w/ published signer, Vibes-Coded ed25519 key embedded in responses | * = substantiated | none anywhere | no | none | anonymous/pseudonymous | Base (VC: +Solana) | ≤$4, ≤3 buyers |

Cross-cutting facts the index can state plainly:

- **Nobody else in the category combines** a fetchable signing key,
  Bitcoin-anchored tamper-tested history, real settled purchases at
  graded doors, a corrections page, a named operator, and 3-rail
  settlement. Each element exists somewhere; the conjunction exists
  once.
- **Only three services have substantiated anchoring** of anything:
  Rubric (Hedera), LedgerProof (Bitcoin), nsgoods (Bitcoin, source
  files only). We are the fourth, and the only one anchoring its own
  key history and observation corpus.
- **Only PayPerByte and probe402** (and PulseFeed, once) practice any
  incident/correction disclosure. probe402 is our closest
  house-style relative — named operator, corrections-from-day-one,
  structural can't-pay discipline — and signs **nothing**.
- **Claim-vs-artifact gaps are the category norm:** LION, Aegis,
  StillOS, Dokimo, AgentBiz, nsgoods (response signing), Lazaretto
  (corrections log) all state something on their listing that their
  public surface could not substantiate on 2026-08-24.
- **Four services beat us on one axis each** — honest cells we do not
  get to hide: Second Opinion settles on four rails (we settle three);
  Trust Prober claims 80k+ endpoint coverage (our census is ~1k hosts,
  deeper rungs); Watchtower sells point-in-time list-state queries
  (we hold snapshots but don't sell the lookup); Trust Prober and
  probe402 sell per-host history depth as a product (we don't, yet).

## 3. The published index — design

**Surface:** one page (HTML for eyes, JSON twin for agents) under the
registry, plus an llms.txt pointer. Stable URL, dated rows, method
note at top, reproduction instructions per column. Every row links the
source URL for each cell. Our own row sits in the table under
identical columns, gap cells included.

**Columns (each one checkable, none an opinion):**

1. Signature scheme on paid artifacts (or "none claimed")
2. Public key fetchable — URL + HTTP status + date observed
3. Offline third-party verify path (artifact link, or none found)
4. Tamper-evident history artifact (what, anchored where, or none)
5. History depth purchasable (product + price, or none)
6. Makes real purchases at the doors it reports on (evidence, or
   own statement to the contrary)
7. Revenue from parties it reports on — routing/take-rate/placement
   (a fact, stated without adjectives)
8. Corrections or incidents page (URL, or "none found <date>")
9. Operator named (name, or pseudonym, or none)
10. Methodology page (URL, or none found)
11. Settlement rails
12. Cheapest paid item / free tier
13. Measured 30d traction (x402-list, CC BY, date)
14. Machine surfaces: MCP / npm / badge / llms.txt / openapi

**Method note (top of page):** observation date per cell; how to
dispute (the corrections process applies to this page — a service
that fixes a 404'd key gets its cell re-observed and the change
logged); "none found" ≠ "does not exist," and unreachable is recorded
as unreachable. Listings' claims are quoted as written and never
paraphrased into stronger ones.

**Cadence:** re-observe on a clock (monthly at minimum; a disputed
cell immediately). A dated diff log accumulates under the page — the
index itself becomes longitudinal evidence.

**Keeper gates:** naming competitors publicly is a keeper pen-pass
before it posts (copy canon, rule 7), and the dispute-SLA wording is
his. The facts ship as drafted; the prose ships as ruled.

## 4. Gaps to fill before it posts

Ranked by what the table itself makes visible. "Beat" = a competitor
cell that currently reads better than ours.

**P0 — build before publishing (they change our row):**

1. **The $0.001 quick look** (already on the roadmap, Phase
   0-x402list). Four services sit on the $0.001 shelf today (LION,
   PulseFeed, Rubric, Bounty Truth); our cheapest door is $0.004. The
   quick look serves what the corpus already holds for a host —
   ladder state, last observed, artifact links, honest `not_observed`
   — pure KV reads, and it is simultaneously the cheapest-sort
   visibility play, the buyer-count fix, and column 12.
2. **Per-host history as a product** (column 5). Trust Prober sells
   90 days at $0.02; probe402 prices 30/180/full tiers; Watchtower
   sells point-in-time. We hold weekly anchored snapshots and sell no
   lookup into them. Ship history tiers on the quick-look door (same
   KV, deeper read): 30d / 180d / full, priced under Trust Prober.
3. **Self-check of our own cells.** Before the table posts, fetch our
   own key URL, anchor log, corrections page, A2A card, and badge
   endpoints the way a stranger would, from outside, and file the
   evidence beside the page. A table about fetchability whose own
   row was never fetched is the joke competitors get to make.

**P1 — cheap, do with the same push (they change column 14):**

4. **MCP directory listings** — scvd-tab is live on npm and listed
   nowhere (standing KEEPER_LIST item); Glama + official MCP registry
   entries are hours, not days, and column 14 counts them.
5. **Citable weekly dataset** — LedgerProof has a Zenodo DOI,
   PulseFeed a HuggingFace dataset. Our weekly corpus snapshot is
   already anchored; exporting it as a citable, licensed dataset is
   packaging, not new observation. (License: keeper RULE.)
6. **GitHub Action wrapping x402-verify** — Lazaretto and PulseFeed
   ship actions; ours wraps a published npm package we already
   maintain.

**P2 — planned and disclosed as not-built in our row (do not block):**

7. **payTo/receiver profiling and payTo-drift incidents** (PulseFeed's
   genuinely novel capability; already an expansion note on the
   roadmap). Until built, our cell says "not built" — in house style,
   counted against ourselves.
8. **Census breadth.** Trust Prober claims 80k+, PulseFeed 27k
   tracked. Ours is ~1k hosts at deeper rungs. The honest cell states
   both numbers and the rung difference; widening the crawl is Phase
   3 corpus work, not a precondition.
9. **Webhook/Slack delivery on watches** (Trust Prober's watch UX) —
   quality-of-life on an existing product, queue behind revenue work.

**Refusals — stated in our row as facts, not defended:**

- No 0–100 score (the ladder and the artifact are the product).
- No routing, no take-rate, no paid placement (column 7 is where the
  three services that do it — Aegis, Cleared Index, PulseFeed's
  paid-API-neutral stance vs. Aegis's routed purchases — carry the
  fact without our commentary).
- No token. No pay-to-prefer tier.

## 5. Order of work

1. Quick look + history tiers (one door, one PR — menu, fulfillment,
   discovery declarations, tests; price copy ⚑ until the keeper's
   pen).
2. Self-check run + directory listings + dataset export (ops-heavy,
   low code).
3. The index page + JSON twin + method note, built from a data file
   whose every cell carries `observed_at` and `source_url` (rule 1:
   derived, never hand-typed into prose).
4. Keeper pen pass on the public prose; corrections process wired to
   the page before it is linked anywhere.
5. Post, sweep AEO surfaces (rule 44), and put the re-observation
   clock on the calendar.

## 6. Differentiation beyond the gap-fills (keeper ruling territory)

**Verbiage.** The category's copy converged because it was
unfalsifiable. The rewrite rule for every SCVD surface: a sentence
survives only if a probe-only, anonymous, unanchored service could
NOT say it truthfully. Concretely:

- Every clause carries an artifact URL or a derived number, never a
  bare adjective. ⚑ draft one-liner for listings (keeper's pen):
  "The only x402 verifier that settles real purchases at the doors it
  reports on — and replays the spent payment to see if the door
  serves twice. Key, anchor log, corrections, named operator: all
  fetchable. Each artifact prints what it does not prove."
- **"We buy from the doors we report on"** as the standing second
  sentence everywhere — the one claim nobody else in the category can
  make (Trust Prober disclaims delivery verification outright; Aegis
  publishes no spend log).
- **Publish the assurance ladder** (queued build, keeper-approved)
  and speak in rungs publicly — ours and the field's. If the
  category adopts the vocabulary, everyone must self-place on our
  scale; standard-setting through language.
- **Answer-shaped copy:** surfaces carry the agent's literal
  questions with one-line answers + artifact links, because answer
  engines retrieve verbatim.

**Offerings (differentiating, not parity):**

- **The claim check** — an operator or directory hands us listing
  text; we observe which claims their public surface substantiates
  and sign the result. Monetizes the category's defining defect
  (claim-vs-artifact gaps); the observation index is its standing
  demo; natural buyers are the other 45 services and the directories.
- **The witnessed-purchase shelf, priced as a ladder** — corpus
  answer at $0.001 (quick look) up to a fresh witnessed run (launch
  check), rung named on every artifact. Structurally closed to
  probe-only competitors.
- **The dispute pack** — everything held on door X as one signed,
  anchored artifact with chain of custody; assembly of shipped
  pieces, bought at the moment verification is actually valued.

**Consistency machinery (build):** `src/store/claims.ts` — one
canonical claim set (human sentence, machine-terse variant, evidence
URL, derived numbers never literals), rendered by every surface
(homepage, /what, llms.txt, agents.md, menu copy, MCP tool
descriptions, OpenAPI info, Bazaar declarations, trust.json, npm
READMEs, the x402-list listing), enforced by a spec that walks the
rendered surfaces — the rule-44 AEO sweep becomes a failing test
instead of a chore. Exact-phrase consistency across surfaces (not
per-page paraphrase) is what retrieval rewards. Add JSON-LD: FAQPage
on answer-shaped sections, Dataset on the corpus export, Organization
with the named operator.

## 7. The agent's-eye view — which service an agent actually picks

Run the buyer's side honestly. An agent holding a task and a small
budget does not read 46 descriptions; it takes the cheapest adequate
path: **free surface first → whatever is already in its MCP toolkit →
cheapest paid door.** Segment by the question being asked:

- **"Should I pay this arbitrary endpoint right now?"** (the routine
  gate, highest query volume): the agent picks **PulseFeed** (free
  cached /verify, incident feed) or **Trust Prober** (free
  full-fidelity preview, 13-tool MCP, 80k coverage). Not us — our
  corpus covers ~1k hosts, and for a door we never observed the
  honest answer is `not_observed`, which does not gate a payment.
  Coverage beats depth for this question, and we should say so
  plainly in our own row.
- **"Sanctions/compliance check on this counterparty":** Watchtower
  on list breadth and point-in-time replay. LION is cheapest, but an
  agent that fetches artifacts finds the 404'd key; one that doesn't,
  buys on price. (Both outcomes are index facts.)
- **"Is this npm package/skill safe to install":** Lazaretto.
  **"Is this claim true":** Second Opinion. **"Why is my 402
  nonconformant":** 10x402 at $0.25 with a fix per finding.
- **"Has anyone independently BOUGHT from this seller, and can I
  hold the evidence later?"** — pre-commitment diligence, disputes,
  anything that must survive being shown to a counterparty: **us,
  and structurally only us.** Witnessed-rung purchases, replay
  behavior, signatures that verify offline, Bitcoin-anchored
  history, a corrections page. No probe-only service can serve this
  query at any price.

Three lessons the exercise forces:

1. **We win the high-stakes query and are invisible on the
   high-volume one.** The quick look + a free gate answer on ANY
   host (honest `not_observed` + pointer to the paid fresh look)
   puts us in the routine path without pretending coverage we lack.
2. **Agents pick from their toolkit, not from the field.** Being in
   the MCP registries, in directories' embeds (the passport chip),
   and in the page answer engines cite (the observation index) IS
   the distribution; a better artifact nobody's toolkit contains
   loses to a worse one that ships by default.
3. **The verifier-selection problem is itself unanswered.** No
   neutral, reproducible "which verifier, for which question" page
   exists — the observation index is that page, and the agent
   walkthrough above is its natural companion prose (⚑ keeper pen
   before any of it posts, since it names competitors as picks).

## 8. The live self-row (keeper direction, 2026-08-24)

Evidence-aware rankings — last successful paid delivery, schema
validity, failure history, payTo stability, buyer concentration,
signed receipts — should be servable about US, live, before we ask
any list to rank by them. Not a self-score ("never a score" has no
self-exception); a **self-row**: each dimension computed from the
till at read time, with how-computed and a source URL per cell.

What exists: the trust panel (key history, corrections, corpus,
house-paid gallery) and the self-passport cover about half. The
plumbing delta:

1. **Last successful paid delivery** — latest settled + delivered
   order, house/organic split explicit (an unsplit "recently" is the
   defect we tabulate in others). From payer rows + delivery audit.
2. **payTo stability** — new small data: per-rail payTo with `since`
   dates + a runtime check that the live 402 matches the declared
   record. The strongest possible answer to the hijack-detection
   category.
3. **Buyer concentration** — distinct organic payers + top-buyer
   share, live. Publishes 64.6% against us today; volunteering it
   before the directory reports it owns the narrative, and the quick
   look turns the cell into an improvement graph.

Plus derived: schema validity (own battery vs. own doors — the
self-audit) and signed-receipt share (certs per settle, derived
never asserted).

**The format is the play:** publish the shape as
`/.well-known/evidence.json` — a spec any service can serve, fields
defined with their computations. We serve the reference
implementation live; the observation index consumes it where
competitors serve it and records "not served <date>" where they
don't; directories get a spec to ingest instead of a pitch. Any
adopter either tells the truth in it or 404s — both are index cells.
Same standard-setting move as the assurance-ladder vocabulary, in
JSON.

Discipline: every cell derived at read time or the row rots into
checkable stale wallpaper — hand-typed "live" facts are worse than
none. Overlaps corpus/metrics/well-known lanes; assign as a named
lane in the work split, not ad-hoc.

## 9. Keeper notes 2026-08-24 — coverage check

Five market theses from the keeper, mapped to where each is covered
and what was NEW. Four were already load-bearing in the plans; one
adds a dimension nobody had written down.

1. **Freshness markets** — operators pay for recurring
   re-observation, not a permanent badge; the badge decays, the
   watch renews it. COVERED and older than this note: freshness
   states ("sell the refresh, never the grade" — KEEPER_LIST,
   outside-reads item 2), the freshness-degrading passport chip
   (shipped), conformance_watch. The one-line commercial loop worth
   keeping verbatim: **the watch is the badge's power supply.**

2. **Cross-protocol discovery aggregation (CRITICAL, and partly
   NEW).** x402, MCP, A2A, AP2/ACP/MPP-adjacent metadata get merged;
   agent-tools.cloud is an early aggregation signal. Covered as
   positioning (spec §2a dimensions; MPP battery families at
   horizon). NOT previously written down: **discovery-surface
   coherence as an observation class.** One service exists across
   several discovery layers at once — its 402 catalog, its MCP
   server card, its A2A card, its llms.txt, its directory listings —
   and nobody observes whether those surfaces AGREE. An MCP card
   claiming tools the till doesn't sell, an A2A card naming a dead
   endpoint, a Bazaar entry whose price drifted from the live 402:
   each is a citable cross-surface inconsistency, and the audit that
   finds them is the claim-check product (§6) pointed at machine
   surfaces instead of listing prose. Fits the architecture without
   amendment: discovery layers land as new protocol-registry rows
   with their own battery families (M2's no-migration rule doing its
   job). We are also our own first subject — the self-row should
   link every discovery surface we serve and assert their coherence
   in CI.

3. **Verification as pre-transaction middleware.** COVERED: roadmap
   0.17 (the $0.001 quick look), Area J's gate, the guard-SDK
   distribution item (§4/§6), TTL semantics for high-volume flows
   (the amortization note from the traffic-plan review).

4. **Signed negative evidence becomes citable.** COVERED in parts
   (battery failure states, launch-check defects, 0.14's unfunded
   payTo, the payTo-drift/incidents expand note) — the envelope
   makes it structural: a failure is an envelope whose checks vector
   says `fail` with raw evidence attached, as signable and anchorable
   as a pass. The named-product version already queued:
   KEEPER_LIST's "obstacle course + signed failure diagnosis" (the
   paid, signed "why an agent cannot buy from this door" report).
   The observation index's "none found <date>" cells are the same
   class, published.

5. **Portable endpoint passports as THE product object.** COVERED
   and keeper-ruled: the Endpoint Passport is item 1 of the
   outside-reads build list (P2 in his own ROI ordering) — one
   URL/JSON object carrying status, observed routes, coverage,
   receipts, corrections, expiry, verification links. Everything in
   this document rolls INTO it: the self-row (§8) is our own
   passport served live; evidence.json is the passport's
   interchange format; the index is passports side by side; chips
   are its embeddable face; the watch renews it. Note 2's merge
   layer gives the passport its cross-protocol spine — the passport
   is where the merged discovery surfaces become one object.

## 10. The passport spec sketch, the cadence, and the named artifacts

Second keeper coverage-check of 2026-08-24. Most rows were already
in the roadmap (0.15 signability re-capture, 0.16 FORTE, 0.17's
KV-read-only quick look, 0.18 concentration). Three things were not
written down anywhere; they are now.

### 10.1 Endpoint Passport — the concrete sketch (keeper's fields)

One JSON object per service/endpoint; everything else the store
sells becomes a module inside it. Public noun: **Endpoint Passport**.

- **Identity:** `passport_id` (stable per subject), `subject`
  (domain, endpoint URL, route, protocol, protocol_version, chain,
  rail, asset, payTo, price — the envelope's subject block plus the
  route-level fields).
- **State:** `status` ∈ ready | not_ready | unreachable |
  indeterminate. `freshness` ∈ fresh | aging | expired | revoked |
  corrected. `observed_at`, `valid_until` (expiry derived from a
  stated rule, never implied permanence).
- **Modules:** service_audit, launch_check, badge, watch,
  quick_look, envelope, conformance, corpus, corrections. The badge
  is DISPLAY ONLY, never a source of truth.
- **Signed bytes include:** passport_id, subject, observed_at,
  valid_until, methodology_id, battery_version, schema_id, coverage,
  not_observed, limitations, evidence_hashes, correction_of.
- **Public page order (agent-first):** can an agent pay this right
  now → last observed + expiry → what was checked → what failed →
  what was NOT checked → verify URL → change/correction history →
  buy refresh / start watch.

**The load-bearing observation:** the signed-bytes list maps almost
1:1 onto the evidence envelope shipped 2026-08-24 (`src/evidence/`,
scvd-evidence/v1): methodology_id/battery_version/schema_id are the
envelope's methodology block, coverage/not_observed are its
limitations discipline, evidence_hashes is its evidence capture,
correction_of is its authorization-adjacent lineage pointer. The
passport is a DERIVED, SIGNED VIEW over envelopes — build it that
way and the vocabulary never forks (the ledger's J-envelope ⇄
D-envelope rule doing its job). The reference artifact is our own
self-passport (§8's self-row), shipped first, limitations and
correction links visible.

### 10.2 The operating cadence (⚑ = keeper's hands)

- **Daily:** check our x402-list badge, signable state, active
  endpoints, rank, failed checks; run the self-passport and confirm
  preflight, corpus, watch, and public copy DISAGREE NOWHERE;
  classify new Verification-category entrants into §1's table.
- **Weekly:** a State of Endpoint Evidence note; one public failure
  fixture or correction note if something meaningful broke; ⚑
  outreach to endpoints observed stale/malformed/unknown/not_ready.
- **Monthly:** buyer concentration + route-level traction review
  (roadmap 0.18); ⚑ quick-look/watch pricing from actual usage; ⚑
  decide whether @scvd/evidence or @scvd/conformance publish as
  installable packages.

### 10.3 Named recurring artifacts (what each research track ships)

Research that doesn't end in a changed artifact field, a red test, a
SKU, a fixture, or an outreach target is research theater — the
keeper's rule, now the doc's rule.

1. **Discovery Position Note** (weekly): where SCVD appears —
   x402-list /services and /best, Coinbase Bazaar, x402scan feeds,
   MCP registries, agent-tools.cloud — where it is FILTERED OUT, and
   the exact field causing the loss (the 0.15 lesson generalized:
   `?signable=true` excluding unknowns cost distribution invisibly).
2. **Verification Market Map**: §1 of this document, kept current by
   the daily entrant classification.
3. **Evidence Gap Register**: already exists — it is the ledger
   (EVIDENCE_LAYER_REVIEW). Every place we sign a conclusion without
   enough method, coverage, expiry, or correction context is a
   D-series finding.
4. **Money Loop Report** (monthly): scan → diagnosis → fix → paid
   refresh → passport → watch renewal, measured per route: price,
   buyer count, repeat buyers, top-buyer share, free-to-paid
   conversion, refresh purchases, watch renewals, refunds, manual
   time.
5. **Failure Receipt Catalog**: the signed-negative-evidence product
   (§9.4) as a public, growing catalog — malformed 402, missing
   EIP-712 extra, wrong version, unfunded payTo, unsupported chain,
   bad atomic amount, templated endpoint, schema mismatch, settled
   -but-no-delivery, stale docs, payTo rotation, price drift,
   oversized body, redirect on a paid knock. Each entry: a fixture,
   a red test, and a public example.

One measurable item left the doc for the codebase the same day:
`extra.name`/`extra.version` on our own EVM 402s was confirmed by
hand (0.15) but nothing FORCED it — the values are emitted by the
x402 SDK, which dependabot bumps; a version that dropped them would
have passed every test we had. `test/signability-guard.spec.ts`
now walks every priced door and fails the suite if any EVM entry
loses its EIP-712 extra.

## 11. The joins thesis: coherence classes inside the Passport

Third keeper filing of 2026-08-24, and the one that names the wedge:
agent commerce is fragmenting into complementary machine surfaces —
Bazaar catalogs, MCP cards (/.well-known/mcp.json), A2A Agent Cards,
llms.txt, OpenAPI, agent-services.json, directory listings, receipts
— and everyone validates each surface alone. **SCVD validates the
JOINS: do the surfaces agree, does the live endpoint still behave
like the catalog says, and can the disagreement be cited as signed
evidence.** Marketing line, keeper-approved wording: "SCVD finds
contradictions between the machine surfaces agents use before they
pay." A fact-claim, so it survives the no-score doctrine.

NOT ten products. Observation classes inside the one Endpoint
Passport (§10.1), landing as protocol-registry rows + battery
families per M2's no-migration rule:

1. **discovery_coherence** (ship first) — one service across
   Bazaar, MCP card, A2A card, llms.txt, OpenAPI, menu/catalog,
   directories, owned well-known files: do names, endpoints, tools,
   schemas, prices, networks, payTo, capabilities agree? Output
   PASS / DRIFT / CONFLICT / NOT_OBSERVED with per-surface facts.
2. **price_settlement_coherence** (very high) — catalog price vs
   live 402 amount vs atomic USDC vs settlement vs receipt. RULE:
   this is the QUICK LOOK'S growth path (0.17), not a second cheap
   oracle — same route, richer answer, one buyer habit.
3. **schema_coherence** (very high) — MCP inputSchema vs OpenAPI vs
   Bazaar extension vs actual response payload. Agents act from
   schemas, not prose; drift breaks calls on live endpoints.
4. **capability_coherence** — streaming/transport/auth/chains
   claimed vs observed.
5. **identity_binding** — ⚑ BLOCKED ON KEEPER: cross-origin
   operator resolution (domain/payTo/signing key/repo) is exactly
   the operator-linking question G2/G-privacy already flags.
   Same-origin surface comparison is unencumbered; the binding
   GRAPH needs a ruling first.
6. **freshness_coherence** — do timestamps, cache headers,
   last_seen, valid_until, badge renewal and the live probe tell
   one story. The recurring-revenue wedge.
7. **receipt_coherence** — does the delivered artifact match the
   surface the agent SELECTED (toolName, price, schema, chain).
   Dogfood field first: bind a discovery-surface hash into our own
   receipts so the artifact is provably what the buyer saw.
8. **registry_coherence** — x402-list vs Bazaar vs MCP registries
   vs owned surfaces. The 0.14 degraded-status incident is this
   class experienced from the subject's side.
9. **corrections** — correction_of / supersedes / affected_surfaces
   pointers; anchored wrongness cannot be deleted but can be
   surrounded by more-discoverable signed corrections.
10. **stated_conditions** (later) — refund/SLA/auth/rate-limit
    claims vs live behavior.

Implementation order (keeper's, annotated against the plans):
registry rows for discovery surfaces (a small extension to
src/evidence/subject.ts — M2 built for this) → subject binding
model BEFORE checks → host inventory first, raw bytes/hashes, no
grading (G3/G4 doctrine: free now, uncollectable later) → derived
coherence checks → **signed Diff Observations, which are evidence
envelopes already** (the diff is the observation block, raw hashes
its evidence capture, not_observed its limitations — no new
container) → passport module → **self-row coherence in CI as a
release blocker** (we serve llms.txt, MCP, A2A, menu.json and the
well-knowns today and nothing asserts they agree; never grade
anyone before that test exists) → productize: free inventory, paid
signed report, paid refresh, watch + drift alerts.

Sequencing: none of this jumps the queue. Phase 1's producers and
the subject-binding model are prerequisites; the free moves (rows,
self-coherence test) can ride convenient branches. Observer costs
apply — inventory fetches are bounded, cached and rate-limited like
any probe (B6, 0-ops).

---

*Filed 2026-08-24 from three parallel research passes over the top ~30
Verification-category listings on x402-list.com, plus prior deep reads
of PulseFeed and Cleared Index. Per-service detail lives in the
session transcripts; claims quoted here were each observed directly.*
