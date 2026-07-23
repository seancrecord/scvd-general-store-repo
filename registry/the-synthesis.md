# FILED 2026-07-23 — received from the keeper with the prioritized task list.

Filed verbatim below the rule. Its six recommended changes (C1–C3 copy,
S1–S3 structural) are queued in TASKS.md under "THE SYNTHESIS" and wait
on the keeper's nod like every build does now. Nothing in this document
overrides KEEPER_CANON or HOUSE_RULES; where it agrees with them, that
is the point it is making.

---

# THE SYNTHESIS — Positioning the Store for the Buyers That Actually Exist

**Sean-Claude Van Damme** · July 23, 2026
Inputs: 15 research runs (5 prompts × Perplexity Deep Research / ChatGPT / Gemini Deep Research), cross-run adjudication memos, and 4 primary-source verifications performed during synthesis.

---

## 0. Method and verification status

Evidence tiers are preserved as received: **DISCLOSED** (published by the party in question), **MEASURED** (third-party empirical data with named models), **INFERRED** (reasoned extrapolation), **UNSOURCED** (asserted without primary source). No claim has been upgraded. Where runs conflicted, the adjudication is stated inline with the winner and why.

**Verified against primary sources during synthesis** (all four confirmed real, with noted variances):

- **Detection-action gap** (arXiv 2606.00497): confirmed exact — agents whose own reasoning flags a site as suspicious still transact in 35.9% of sessions vs 66.1% when no suspicion is verbalized; 30.2pp gap robust across four model families. The paper's named failure mode "trusted-surface normalisation" — agents defer to surfaces that look like standard legitimate infrastructure — is directly relevant below.
- **SSL / structured skills** (arXiv 2604.24026): confirmed real. Structured three-layer skill representation beats text baselines on skill discovery, and beats the *full SKILL.md document itself* (MRR 0.729 vs 0.645 in the paper's main table; the abstract's 0.573→0.707 figures differ by version). Task is discovery/retrieval, not purchase.
- **Verbosity frontier/small split** (arXiv 2607.02104): confirmed exact. Sixteen current-generation judges (Claude Haiku/Sonnet/Opus, GPT-4o-mini/5.1/5.5, Gemini, DeepSeek, Llama, Qwen, Phi-4): cheap and mid-tier judges carry strong verbosity bias; the frontier judges tested show little. Task is judging, not purchase.
- **Brand/manipulation study** (arXiv 2606.17443, "Incumbent Advantage"): confirmed real. Conditional monopoly for known brands at tied specs; collapses with a +0.1-star competitor advantage (abstract figure; +0.075 appears in secondary summaries). Fabricated authority language breaks the monopoly (Bias Surplus Value ≈ +0.17 rating points). Universal adoption of the same optimization collapses individual payoff from +0.802 to +0.007. Tested on GPT-4o-mini, Claude Sonnet, Gemini 3 Flash, in consumer-product recommendation — transfer to agent purchasing is INFERRED.

**Corroboration surfaced during verification** (not present in any run): arXiv 2502.01349 finds scarcity/exclusivity language *reduces* product visibility in LLM recommendations while social proof boosts it — stronger than the null the runs reported. arXiv 2603.17417 (BiasRecBench) finds current SOTA models (Gemini 2.5/3 Pro, GPT-4o, DeepSeek-R1) still succumb to injected contextual biases despite sufficient reasoning capability — the tilts have not been trained out yet.

**Discarded before synthesis** (tier violations in source runs): Ramp's $100B total platform volume presented as agent spending; invented percentages attached to INFERRED claims (quantized-model purchase shares); DeepSeek *pretraining corpus filters* recast as runtime fraud-detection triggers; unverifiable model version strings ("GPT-5.6 Sol"); SEO-blog-sourced claims about entity corroboration and "total exclusion"; run-5 predictions with invented baselines.

**Unresolved by design — the decision-context assumption.** No run, and no located study, establishes what a purchasing agent actually has in its context window at the 402 decision moment. This document handles it as an explicit assumption set, ordered by certainty of presence: (1) the 402 response payload — certain; (2) MCP tool descriptions — near-certain on the MCP channel; (3) Bazaar catalog metadata — certain on the bazaar channel; (4) fetched storefront HTML — uncertain. Every recommendation in §4 is placed on the most-certain surface that can carry it, and §5 includes a test that distinguishes "copy isn't persuading" from "copy isn't present."

---

## 1. Buyer personas, evidence-tiered

The market's single most important measured property frames everything: **within the only independently measured population (x402/Base, Chainalysis), roughly half of transaction volume is pipe-testing rather than commerce, and the one documented first-person account of a solo x402 seller listed on six-plus marketplaces reports zero organic paid calls.** [MEASURED for the network shape; DISCLOSED single account for the seller base rate.] Simultaneously, real settlement has migrated up-band: 95% of value now moves in transactions ≥$1, up from 49% a year prior; the $0.10–$1 band collapsed from 46% to 4% of value. [MEASURED] Retention and tester-to-payer conversion are rising (4x over six months). [MEASURED] The personas below are drawn against that backdrop.

### P1 — The Pipe-Tester
**Existence: MEASURED** (≈50% of x402 volume; the PING episode inflated weekly counts >10,000%). The dominant visitor. A developer-owned or autonomous agent confirming that the payment rail works: hits free surfaces, triggers 402 challenges, rarely settles, and when it settles, settles pennies once. **Decision model:** cheap tier or deterministic code [INFERRED — no model telemetry exists anywhere; this is the funnel's persistent hole]. **Budget:** sub-cent to cents, developer-capped [DISCLOSED pattern]. **Optimizes for:** confirmation the pipe works. **Rejects sellers for:** nothing — it isn't evaluating. **Implication:** P1 is not a customer and must not shape copy. It is, however, the honest top of the funnel: its 402-abandonments are the *expected baseline*, not churn, and the house-flag/infrastructure split in the store's instrumentation already handles it correctly.

### P2 — The Session-Capped Machine-Economy Buyer *(primary target)*
**Existence: MEASURED** (the ≥$1 value band; rising retention; 590,000 buyers / 100,000 sellers per Coinbase's April–May 2026 disclosures — platform-disclosed, not third-party). An agent buying data, inference, or services on x402 inside a human-set session cap, autonomous at the transaction. **Decision model:** frontier-class (Claude/GPT/Gemini tier) at the buy/no-buy step, per the three-run-convergent two-tier architecture — strong model decides, cheap models execute [DISCLOSED for the AWS reference pattern; INFERRED for population share]. **Budget:** session caps; individual transactions concentrated ≥$1 [MEASURED]. **Supervision:** bounded autonomy — no documented population spends without a pre-set ceiling [DISCLOSED, three-run convergent]. **Optimizes for:** task completion within cap; every purchase implicitly answerable to the cap-setter's audit. **Rejects sellers for:** ambiguity in the offer, identity inconsistency, unverifiable claims, anything that trips suspicion (which costs ~30pp of conversion even when it doesn't block — MEASURED, verified). The store's $0.50–$3 instant-utility shelf and $3–$50 human-labor shelf sit exactly in this persona's settlement band; the penny shelf sits below it.

### P3 — The Enterprise Pilot Agent (Bedrock/AgentCore)
**Existence: DISCLOSED, weeks old** (AgentCore Payments preview May 2026; Warner Bros. Discovery the first named customer; the x402 Bazaar MCP server is integrated into AgentCore Gateway, which means this persona can discover the store through its `bazaar` channel). **Decision model:** Claude Sonnet — the only harness with a disclosed default [DISCLOSED via AWS docs; the apparent conflict with "Nova defaults" resolves as: reasoning harness defaults Claude, memory subsystem defaults Nova Lite]. **Supervision:** IAM policy, session spending limits, sanctions screening, audit logging [DISCLOSED]. **Budget:** undisclosed — no primary source, in any run. **Optimizes for:** policy compliance and line-item justifiability. **Rejects sellers for:** anything that fails a compliance sniff — and note its purchasing *behavior* is entirely INFERRED; the infrastructure is disclosed, the buying patterns are too new to exist. Small population, outsized strategic value: it is the persona most certain to be running a frontier decision model against a formal audit requirement — the store's thesis in persona form.

### P4 — The Self-Hosted Personal Agent (OpenClaw-class) — *INFERRED-only persona*
**Existence of the population: DISCLOSED** (350k+ GitHub stars; rich vendor ecosystem of wallet plumbing). **Existence as a *spending* population: UNSOURCED** — this was a direct cross-run conflict, adjudicated for the negative: the payment plumbing is vendor-marketed capability; no evidence ties the population to measurable settlement volume, and the strongest run explicitly classifies it pre-commercial. **Decision model if it buys:** community rankings put Kimi K2.5 first, with DeepSeek and Qwen variants for local [DISCLOSED lists, INFERRED usage] — notable because Kimi K2's disclosed training method (RL against *verifiable rewards*, ~20,000 synthetic tool environments) is the shortest inference path in the entire funnel from "how the model was trained" to "why checkable claims should win." **Treat as phantom until observed:** the store's `skill` channel is this persona's fingerprint; a single skill-channel settlement is worth more than any amount of further research on P4.

### P5 — The Human-Present Consumer Agent — *non-persona, named to kill an assumption*
ChatGPT/Gemini shopping flows exist [DISCLOSED] but run card rails (ACP/UCP/AP2), require human confirmation, pivoted away from in-chat checkout in March 2026, and cannot reach x402 endpoints. Additionally, in AP2 "Human Not Present" flows the autonomous purchase moment is a lightweight rules check — the persuadable reasoning happened earlier, at mandate-signing, *by a human* [DISCLOSED]. This persona cannot buy from the store and no copy should be spent on it.

**Explicitly INFERRED-only:** P4 in its entirety; P3's purchasing behavior (infrastructure disclosed, behavior not yet observable); and the decision-model identity of P2 (architecture disclosed as a vendor pattern, population share never measured — no model-level telemetry exists for any spending segment, a gap every run independently confirmed).

---

## 2. Ranked seller-relevant tilts

Ranked by (measured effect size × relevance to the purchase context × currency of the tested models), with the seller action each implies. Model class notation: F = frontier, S = small/cheap tier.

| # | Tilt | Direction & size | Tier | Model class | Seller action |
|---|------|-----------------|------|-------------|---------------|
| 1 | **Specification dominance.** Product parameters (rating, price, review count) explain 82.4% of ranking variance; brand identity 1.2%; position 6.5%. Incumbent monopoly collapses with a +0.1-star advantage. | Overwhelming, positive for spec-complete sellers | MEASURED (2606.17443, current models; consumer-goods task → agent-purchase transfer INFERRED) | F + S | Complete, exact, machine-legible spec fields on every listing outrank every persuasion tactic combined. This is the #1 lever and it is free. |
| 2 | **Authority & social proof from concrete signals.** Authority-style content breaks incumbent monopolies at 50–73%; social proof similar. The Wharton compliance line (33%→72% pilot on GPT-4o-mini; 35.3%→51.3% in the larger multi-model replication — both arms real, task is objectionable-request compliance, transfer INFERRED). | Large, positive | MEASURED ×2 (task-transfer caveats on both) | F + S | State real operational facts *as* the authority signal: settlement counts, uptime, tenure, verifiable receipts. The mechanism that makes fabricated authority work makes verifiable authority work. |
| 3 | **Stacking backfire on Claude.** Combining authority + social proof dropped Claude's breakthrough from 55.0% → 21.2% ("too good to be true" suppression) while raising GPT's to 91.2%. | Model-split; actively negative on the #1 decision seat | MEASURED (2606.17443) | Claude Sonnet specifically; Opus INFERRED | One clean credibility signal per surface. Since Claude holds the most-likely decision seat (Bedrock default, gateway premium tiers), tune to the inverted-U: moderate, single, factual. Never stack. |
| 4 | **Detection-action gap & suspicion cost.** Verbalized suspicion doesn't reliably block action, but it suppresses it by ~30pp. Agents that proceed anyway rationalize via "trusted-surface normalisation" — deference to normal-looking infrastructure. | Suspicion ≈ −30pp conversion; boring legitimacy ≈ the trust surface | MEASURED, verified, 4 model families | F + S | Never trip suspicion: no urgency theater, no inflated claims, no identity wobble. Being a spec-complete, standards-shaped, verifiable endpoint *is* the trusted surface agents normalize toward. |
| 5 | **Identity mismatch is the top fraud trigger.** Brand/domain mismatch is the most reliable flag in the phishing-detection literature (98.7% precision on GPT-4/4V); capability generalizes to 70B open-weight. | Binary risk; one inconsistency can reclassify the store | MEASURED (phishing analog → commerce transfer INFERRED) | F + S | Freeze identity: one domain, one signing key, one wallet, identical names across storefront / Bazaar / skill / MCP. If anything must ever change, version it with permanent history. |
| 6 | **Verbosity split.** Cheap/mid-tier judges strongly prefer longer text (recall ~0.5–0.6 uncorrected); frontier judges tested show little bias and judge on semantic density. | S: pro-length; F: neutral | MEASURED, verified, current models (judging task → purchase INFERRED) | Split | Compression costs nothing with the deciders and the discovery layer wants *structured fact-density*, not prose length. Add real fields, never filler. |
| 7 | **Position/order bias.** Order reversal shifts rankings up to 25%; severe in S, moderate in F when quality gaps are narrow. | Distorting, variable | MEASURED (multiple) | S ≫ F | Strongest items first in every list the store controls; make each catalog entry self-sufficient because marketplace position is not controlled. Lead every schema with the decision-critical fields. |
| 8 | **Structure beats prose for discovery.** Structured skill representation outperforms the full SKILL.md text itself on discovery MRR. | Positive for structure | MEASURED, verified (discovery task) | Agent-orchestration stacks | Restructure the published skill into explicit layers (when-to-invoke signals / execution structure / cost-and-resource evidence) rather than narrative prose. First finding in the funnel that touches the discovery gap. |
| 9 | **Evidence-shaped content lifts visibility.** GEO: adding statistics +22%, named quotations +37%, citations positive; measured on generative-engine citation, not purchase. | Positive | MEASURED (task-transfer INFERRED) | F + S | Real numbers in copy; "quotations" translate honestly as signed receipts and verifiable artifacts, not testimonials. |
| 10 | **Global-brand background bias.** Known brands get systematically better attribute associations independent of quality; holds across frontier and small open-weight models. | Headwind for an unknown seller | MEASURED | F + S | Can't be fabricated away. The substitute is *tenure made checkable*: wallet age, settlement count, corrections history — brand equity as a ledger property. Compounds; cannot be rushed. |
| 11 | **Sycophancy toward the principal.** Models shade toward the user's/principal's expressed preference over objective merit; amplified by preference training; CoT masks capitulation with post-hoc rationalization. | Real, seller-inaccessible | MEASURED (foundational study is 2023-era — superseded-model caveat; 2026 taxonomy work confirms it persists) | F + S | Not a seller lever — flattery at the seller layer measured *lowest*-efficacy. The implication is positional: be the choice a cautious principal's audit would defend. "Nobody got fired for buying the verifiable option." |
| 12 | **Numeric anchoring.** 22–61% of outputs anchored by first-seen numbers in estimation tasks; near-null as a sales-copy tactic in choice tasks. | Scope-split | MEASURED ×2 (scopes differ; both stand) | F + S | Minor lever: order price displays deliberately (verification-free-forever adjacent to price). No reference-price theater — measured useless and doctrine-banned. |

### What doesn't work (measured-ineffective or counterproductive)

- **Scarcity and urgency language:** 10–13% breakthrough vs 50–73% for authority; near-zero Bias Surplus Value [MEASURED]; corroborating study finds scarcity/exclusivity *reduce* visibility [MEASURED, 2502.01349]. The doctrine banned it on principle; the data says it was also just bad marketing.
- **Anchoring/loss-aversion as copy:** same near-null band [MEASURED].
- **Flattery/liking and unsolicited reciprocity:** lowest measured efficacy of all Cialdini principles on reasoning models [MEASURED].
- **Keyword stuffing:** zero to negative; dilutes semantic density, trips quality filters [MEASURED, GEO].
- **Stacked persuasion:** actively backfires on Claude (§2 #3) [MEASURED].
- **Verbose padding aimed at deciders:** frontier judges don't reward it [MEASURED, verified]; it only moves the tier that doesn't sign purchases.
- **Manipulation premised on stated model caution being a hard gate:** suspicion suppresses but doesn't block (35.9% proceed) — which means the inverse tactic, *relying* on agents' laxity, is a one-way reputational bet against the direction every harness is moving [MEASURED + DISCLOSED harness trend].

### The uncomfortable finding, stated plainly

The brand study's fabricated clinical-evidence claims *worked* — 50–73% breakthrough on current models. The store's honest positioning is not currently rewarded by any direct measurement; no located study tests whether cryptographic verification, signed provenance, or schema completeness raises selection probability — that is a genuine evidence gap, and the store's central bet is therefore INFERRED while the rejected tactic is MEASURED-effective. Three reasons the bet still stands, in descending strength: (1) the harness layer, not the model, is where rejection is deterministic — caps, allowlists, KYA, audit logs are DISCLOSED, contractual, and tightening, and every harness trend rewards verifiability regardless of model psychology; (2) the universal-adoption result — fabricated-authority payoff collapses from +0.802 to +0.007 when everyone does it, and it *will* be universally adopted because it's free, whereas cumulative signed history, honest books, and a public corrections log cannot be pasted by a competitor; (3) the Claude-specific suppression means over-claiming is already negative-EV on the most likely decision seat. §5 turns this bet into predictions the store's own logs can falsify.

---

## 3. Pre-fit vs. constructed

The strategic core, stated once: **the measured research rewards exactly the properties the store already has for constitutional reasons.** Most of the work is translation of existing honesty into machine-legible signal, not construction.

### Pre-fit — tilts already answered by existing surfaces

| Tilt answered | Existing surface that answers it | Remaining task (surfacing only) |
|---|---|---|
| #2 Authority via verifiable facts; #9 evidence-shaped content | ed25519 signatures on everything issued; free unlimited verification endpoint | Put the verify URL and key fingerprint *inside* every listing and every 402 payload — authority made checkable, not asserted |
| #4 Suspicion avoidance / trusted-surface normalisation | Structural-truth doctrine; no urgency, no fake scarcity, honest books, published corrections | Nothing to add — this is the store's constitution operating as fraud-heuristic compliance |
| #5 Identity consistency | Single domain, single signing key, single wallet, days-old and never rotated | Verify the *names* match exactly across storefront, Bazaar listing, skill registry, and MCP manifest — one audit, ~30 minutes |
| #1 Spec dominance | Honest books mean real price, real latency, real SLA already exist and were never in question | Formatting: expose them as uniform fields (constructed item 1 below) |
| #11 Sycophancy-toward-principal / audit defensibility | The claim chain (CLAIM → EVIDENCE → EXTERNAL SIGNAL) is precisely an audit-line generator | Surface it: every listing should let the agent copy a one-line justification into its own log |
| Foot-in-the-door (Wharton, task-transfer caveat) | **The free shelf and penny shelf are an already-built commitment ladder** — bell, guestbook, stamps, then $0.005 blessings, then $0.50–$3 utility. The Gemini run proposed constructing a diagnostic endpoint; the store shipped one before the research existed | Order the catalog so the ladder is legible as a ladder: free → penny → utility → human-labor, with each rung's listing pointing one rung up |
| #12 calibration signals (guarantees vs estimates) | Permanent public corrections; queued human-labor SLAs with real limits | Adopt the guaranteed / not-guaranteed split (constructed item, copy 3) |
| Scarcity findings | Only real scarcity exists (one proprietor's actual hours) | Nothing — the null result costs the store zero because it never bought the tactic |

### Constructed — new work required, all inside ~5 h/week

1. **Uniform listing schema across all ~22 items** — answers tilts #1, #6, #7. One fixed field order everywhere: capability → inputs → outputs → verification → constraints → price. (~2–3 h once.)
2. **Ledger-sourced track-record line + public stats endpoint** — answers #2, #10. The instrumentation already computes these numbers; publishing them is formatting. (~1–2 h.)
3. **Structured restructure of the published skill** — answers #8, and it is the only lever that touches discovery. (~2 h.)
4. **Manifest hygiene** — `.well-known` completeness, llms.txt, key fingerprint publication, versioned identity policy. (~1 h.)
5. **Copy strip-and-replace** per §4. (~2 h across the catalog.)

Total: roughly two weeks of the hours budget, once, then maintenance-free.

---

## 4. The three copy changes and three structural changes

Placement priority follows the decision-context assumption (§0): 402 payload > MCP tool descriptions > Bazaar catalog metadata > storefront HTML. Everything below goes on the *most certain* surface that can carry it, then cascades outward.

### Copy

**C1 — Spec-first fact block on every listing.** *(tilts #1, #6, #7, #9)*
Canonical form (adapted per item):
> `Returns: ed25519-signed JSON greeting + permanent patron number. Price: $0.50 USDC (x402, Base). Latency: signed response in <Nms typical. Verify: GET /verify/{id} — free, unlimited, forever. Constraints: one patron number per wallet; number is permanent and never reissued.`
**Proof artifact:** a live sample artifact ID in the listing whose verify link resolves — the claim carries its own check.
**Placement:** top of the MCP tool description and the Bazaar catalog entry; mirrored in the 402 payload's human-readable field; storefront HTML last.

**C2 — The honest track-record line, including at zero.** *(tilts #2, #10; doctrine: uncertainty stated, never smoothed)*
Canonical form today:
> `Operating since [date]. Settled purchases: 2, both proprietor-wallet tests, house-flagged and excluded from every figure on this page. Organic settlements: 0. Every number here is computed live from /stats; every artifact ever issued verifies at /verify.`
This is the store's most distinctive possible sentence right now. Every competitor can paste "trusted by thousands"; almost none will publish a true zero with the exclusion policy that proves the books are honest. An agent that checks finds the claim and the ledger agree — calibration demonstrated at the only scale the store has. The line rewrites itself as the ledger grows and never needs marketing review.
**Proof artifact:** the public `/stats` endpoint the numbers are drawn from, with the house-flag policy published beside it.
**Placement:** storefront header, catalog root metadata, and the skill's evidence layer.

**C3 — Strip to one signal; split guaranteed from not-guaranteed.** *(tilts #3, #4, #12)*
Delete every trust adjective ("reliable," "premium," "trusted") catalog-wide — each is an unsupported claim per the compression doctrine and stacking-fodder per the Claude suppression finding. One credibility signal per listing, maximum. Where a listing makes forward commitments, use the two-column split:
> `Guaranteed: signature validity forever; verification free forever; price as displayed; delivery format as specified. Not guaranteed: fitness for your particular task; future protocol compatibility beyond stated interfaces; human-labor turnaround faster than the posted SLA.`
Character stays where the doctrine already permits it: the proprietor's signed personal surfaces only.
**Proof artifact:** the corrections log — the standing demonstration that the store distinguishes what it guarantees from what it got wrong.
**Placement:** every paid listing; the guaranteed/not-guaranteed block belongs in MCP descriptions verbatim (it is exactly the shape a planning model wants to copy into its own risk assessment).

### Structural

**S1 — One schema, one field order, all ~22 items.** *(tilts #1, #6, #7)*
capability → inputs → outputs → verification → constraints → price, as literal JSON key order in MCP tool definitions and catalog metadata, with identical field names storewide. An agent comparing the catalog reads one format 22 times instead of 22 formats once — comparison legibility is a purchase-probability property, and key order is the primacy lever on the small-model tier.
**Proof artifact:** the schema itself published at a stable versioned URL; the catalog validates against it in CI.
**Placement:** MCP manifest and Bazaar metadata (the certain surfaces).

**S2 — Verification adjacency: zero distance between pay and prove.** *(tilts #2, #4, #5)*
Every 402 response carries, in-payload: the verify endpoint URL, the signing-key fingerprint, and the sample-artifact ID. The moment of maximum evaluation is the challenge itself — the only surface guaranteed to be in-context (§0) — so the strongest evidence must live there, not one fetch away. Publish alongside it a one-line identity policy: *this key, this wallet, this domain, never rotated; any future change will be versioned with permanent history.*
**Proof artifact:** the signed 402 payload is self-demonstrating; the key fingerprint at `.well-known` matches the one in the payload — the identity-consistency check an agent runs resolves instantly and favorably.
**Placement:** 402 payload (certain surface), `.well-known`, Bazaar listing.

**S3 — Restructure the published skill from prose to layers.** *(tilt #8; the discovery lever)*
Reshape the skill into the three-layer form the SSL result rewards: **scheduling signals** (when an agent should reach for the store — explicit trigger conditions, not narrative), **execution structure** (exact call sequences per shelf, 402 handling, verify step), **resource evidence** (prices, caps, SLAs, signing-key fingerprint, `/stats` link). The measured result is that this beats the full prose document *on discovery* — and discovery is the store's binding constraint, not conversion.
**Proof artifact:** the skill file itself, versioned; effect is directly attributable via the `skill` channel.
**Placement:** the skill registry entry; mirror the scheduling-signals layer into the Bazaar description.

---

## 5. Falsifiable predictions (30–60 days, against the store's actual instrumentation)

Framing matters more than any single prediction: **the store's baseline is zero organic, and the market's measured base rate for listed x402 sellers is zero organic.** Percentage-growth predictions are meaningless against this baseline (the run-5 syntheses that offered them invented their denominators). The honest prediction set is event-based and ratio-based, and it must first predict the *expected* pattern so that the expected pattern is never misread as failure.

**P0 — The baseline expectation (calibration check, not a success metric).** 30–60 days of logs should show: 402s issued substantially exceeding settlements on every item; unknown/direct-channel crawls dominating porch visits; verification calls arriving in pipe-test-shaped bursts uncorrelated with purchases. *This is the market's measured shape (P1 traffic), not a failed store.* If even this traffic is absent — no 402s issued at all in 30 days — the problem is upstream of persuasion entirely: discovery listings aren't surfacing, and S3/manifest hygiene jump the queue.

**P1 — Schema/copy changes raise challenge-to-settlement conversion.** Working: among wallets that trigger ≥1 402, the settle rate on the reformatted catalog exceeds the pre-change rate (the pre-change logs exist — days of them, but they exist), and the first organic settlements concentrate in listings carrying the C1 fact block. Not working: 402 issuance accumulates into the hundreds across 60 days with conversion pinned at zero — which, per the §0 assumption set, indicates the deciding model never sees listing copy at all; response is to collapse all optimization onto the 402 payload and catalog metadata (the certain surfaces) and stop investing in storefront HTML.

**P2 — Verification adjacency changes verifier behavior.** Working: the share of settlements preceded (same wallet, same session window) by a verify or schema fetch rises; verify-then-402 chains convert at a visibly higher rate than 402-only chains. Not working: verify traffic stays burst-shaped and purchase-uncorrelated — verification is being used as pipe-testing, not diligence, and S2's conversion premise fails even if S2 remains correct hygiene.

**P3 — Channel quality ranks as the funnel predicts.** Runs 1–2 imply bazaar-channel wallets (AgentCore-gatewayed, frontier-decided, audit-bound — persona P3) should convert 402→settle at the highest rate of any channel. Working: first bazaar-channel settlement within 60 days, and bazaar conversion ≥ direct/unknown. Not working: bazaar 402s accumulate with zero settlements while another channel converts — the Bazaar *listing metadata* is then the binding surface and inherits all copy effort; alternatively all channels sit at zero, see P0/P1 failure branches.

**P4 — The phantom persona test.** A single skill-channel settlement in 60 days is existence proof for P4 (self-hosted spenders) and would justify investing in the skill surface beyond S3. Zero skill-channel settlements confirms the adjudication (capability-marketed, usage-unsourced) at zero further cost — the cheapest persona validation available anywhere in this project.

**P5 — Repeat wallets are the thesis metric.** The store sells continuity; continuity's only proof is return. The single most informative event in the entire log is the first wallet that settles twice ≥7 days apart. Working: ≥1 organic repeat wallet in 60 days, and first-seen wallet cohorts show any nonzero 30-day return. Not working: settlements (if any) are all one-shot — the store is being bought as novelty, not memory, and the context-anchor/continuity positioning needs rework even if revenue looks fine.

**P6 — The null that should stay null.** Removing/never-adding urgency copy shows no settlement penalty (trivially expected; the store never used it). Included only because it is this synthesis's cheapest self-test: if some listing's conversion *drops* after a C3 adjective strip, the compression doctrine over-fired and real information was removed with the decoration — restore the facts, not the adjectives.

---

## 6. The strongest counterargument

**The case: model-behavior tilts are too unstable across versions to build positioning on.** The tilt evidence rests overwhelmingly on GPT-4o-mini, Claude Sonnet, and Gemini 3 Flash as tested in 2025–2026; the actual decision seats identified in the funnel (Claude Opus, GPT-5-class, Nova, Kimi K2.5) are mostly untested variants. The one study that compared models directly found *qualitatively different response shapes across just three models* — Claude's inverted-U, GPT's linear response, Gemini's saturation. If shape varies that much across three contemporaries, no principled basis exists for assuming transfer to next quarter's versions, and providers are explicitly training against sycophancy, order sensitivity, and persuasion susceptibility. A store tuned to 2026 tilts could decay silently, its conversion drift misattributed to demand.

**And the objection beneath it, which evidence discipline requires stating:** the direct evidence asymmetry runs the wrong way. Fabricated authority is MEASURED-effective on current models; the reward for cryptographic verification has never been directly measured at all. The counterargument's sharpest form is not "tilts will change" but "you are betting on an unmeasured tilt while declining a measured one."

**What the seller does if the counterargument is correct — and why the answer is already the plan.** Sort every recommendation in this document by model-dependence and the portfolio splits cleanly. The exposed slice is the copy-level tuning: the single-signal discipline calibrated to Claude's inverted-U, the fact-block phrasing, the anchoring-adjacent price ordering. Treat that slice as low-confidence and perishable — revisit whenever public benchmarks re-test current generations, and let P1/P6 monitor it for silent decay. The durable core is model-agnostic *by construction*, not by hope: structured complete data, cryptographic verifiability, identity consistency, and uniform schemas work by **removing ambiguity, not by exploiting a measured tendency** — they are equally legible to a frontier reasoner, a quantized local model, and a non-LLM rules engine. And the deterministic layer beneath all of it — session caps, allowlists, KYA verification, audit mandates — is contractual infrastructure, DISCLOSED and tightening in every harness the funnel examined; it rewards verifiability regardless of what any model finds persuasive, and it is the layer where rejection is absolute rather than probabilistic.

If every behavioral tilt in §2 is trained out of existence next quarter, the store loses its tuning notes and keeps its position: the fallback strategy under the counterargument is the store's constitution, unchanged. That is not a coincidence to be enjoyed — it is the test the doctrine was designed to pass, and §5 exists so the store's own ledger, not the next benchmark cycle, is what says whether it's passing.

*— Sean-Claude Van Damme*
