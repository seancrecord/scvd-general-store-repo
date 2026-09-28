# AEO hand check — discovery, accuracy and usable evidence

Version 2, September 28, 2026. Updated at the keeper's request after the
[original walk](../research/aeo-2026-09-28/README.md) and
[portfolio audit](../research/aeo-2026-09-28/PORTFOLIO.md).

This is a dated manual observation protocol. It supports production work;
it is not a market-validation gate, an automated tracker or a reason to delay
fixing a broken public surface. A single answer shows what that interface
returned once. It does not establish market share, adoption or a causal
ranking improvement.

## What changed

The original eight prompts remain verbatim for historical comparison. The
expanded panel covers the SDKs, MPP, A2A, UCP, MCP, corpus reuse and provider
comparison. Brand recognition is reported separately from unbranded discovery.
We now retain missing answers, model fallbacks, citation provenance, capability
boundaries and repeats. The old twenty-minute estimate is retired: a full
portfolio check spans several bounded sessions.

The September 28 observations remain historical records under their original
method. Do not backfill unknown modes, citations or errors to make them fit
this version. New prompts start a new baseline, not a before/after comparison
with questions nobody previously asked.

## Run scope and cadence

- Keep the **October 15, 2026 checkpoint**, then monthly. The September 17
  checkpoint date alone is not evidence that a run occurred.
- At the first expanded checkpoint, cover the legacy and portfolio panels
  across the four primary surfaces below. Split into sessions of at most
  45 minutes; predeclare the cells and record unfinished cells as `not_run`.
  Record each observation's actual date; do not disguise a multi-day walk
  as one simultaneous reading.
- Monthly thereafter, run the legacy panel plus a portfolio group selected
  **before** opening the engines. Rotate the portfolio so every family is
  covered within a quarter. Freeze the selected query IDs and report coverage.
- For each checkpoint, preselect the priority families for a second wave
  **3–7 days later**, with the same prompts and requested modes. Initially:
  MPP, A2A, offline verification and the preflight SDK family. Repeat those
  whether the first result is a hit or a miss. This is a practical stability
  check, not a statistically representative sample or a ranking threshold.
- After a release, verify the actual public changes and record release time
  first. Run one targeted observation wave about a week later; retain unknown
  recrawl timing. Do not attribute a change to the release from that alone.
- Revisit the question set after a material product release. Add a new ID for
  changed wording; keep retired IDs and historical results. Add new verticals
  only with a verified capability and an identifiable buyer job.

These are procedures for the next walk, not newly scheduled automations.
Copy [the run template](AEO_HAND_CHECK_RUN_TEMPLATE.md) into a dated research
folder before collection and freeze its manifest. A constrained session is
allowed; silently shrinking its denominator is not.

## Primary engine surfaces

| Surface | Record before sending | Comparison boundary |
| --- | --- | --- |
| ChatGPT searched answer | Visible model/mode label, search enabled or requested, whether a searched answer actually completed | An acknowledgement or a different search tool's result is not a ChatGPT searched answer |
| Gemini | Visible model/mode before sending and after completion; visible search/source evidence | Record fallback explicitly; do not combine it with the requested model |
| Google AI Overviews | Ordinary Search, exact query, overview present/absent | AI Mode is a separate optional series; organic listings are separate from overview citations |
| Perplexity | Visible mode/model where exposed; account/default settings retained | Search, Research and other modes are separate series |

Use the actual product interface. If an API is studied later, give it its own
series; it cannot fill a browser cell. Keep browser/profile, sign-in state,
language and region consistent where practical. Use a non-identifying profile
label, never an email address or credentials. Record settings as unknown when
not observable; do not infer a hidden backend model from the product name.

Start a fresh conversation for every prompt. Do not seed it with SCVD's site,
this plan, a preferred answer or prior results. Run unbranded questions before
branded diagnostics, without changing memory/personalization settings mid-run.
A fresh conversation does not prove personalization is absent. Freeze and
retain query order; use the same order in paired waves.

## Query register

Before each checkpoint, read the relevant **live** SCVD documentation and
package/listing pages. Record a dated capability/source map in the run file:
what the tool actually does, free/paid boundary, supported scope, useful entry
URL, and any unresolved limitation. Local changes awaiting release do not
count as live capabilities. This is scoring ground truth, not material to
paste into a query.

The source pointers below are starting points, not permanent promises about
versions, prices, package availability or endpoint counts. Also consult
`src/store/features.ts`, `src/store/discovery-protocols.ts`, package manifests
and the live payment/profile declarations. If eligibility is uncertain,
record discovery descriptively and exclude that cell from eligible-fit claims.

### Legacy panel — exact wording preserved

| ID | Family | Exact query | Relevant SCVD fit to check |
| --- | --- | --- | --- |
| L01 | Branded entity | What is scvd.store? | Correct operator/category and capability boundaries; a general-store label alone is incomplete, not automatically false |
| L02 | Service category | x402 conformance audit | Applicable conformance instrument and its bounded evidence |
| L03 | Transaction evidence | How do I verify an x402 payment settled? | Settlement/reconciliation evidence, distinct from challenge or signature validation |
| L04 | Receipt verification | How do I verify an x402 signed receipt? | Correct verifier/desk and supported receipt format; signature validity is not delivery proof |
| L05 | Monitoring | x402 endpoint monitoring signed uptime | Dated observations/watch/history; no continuous-uptime guarantee |
| L06 | Dataset | x402 endpoint readiness dataset | Corpus, Hugging Face or Zenodo; source attribution, coverage and dates |
| L07 | Defect language | offer contradicts challenge x402 | Correct named defect and its evidence boundary |
| L08 | Buyer-side testing | test an x402 payment client | Applicable live practice/buyer instrument and exact scope, not every tool with “test” in its name |

L01 is branded and stays outside unbranded totals. L05 deliberately retains
its old “signed uptime” wording; do not reward an answer for repeating the
implied guarantee. Presence and accuracy are different observations.

### Portfolio panel — unbranded buyer and integrator jobs

| ID | Exact query | Ground-truth starting point / boundary |
| --- | --- | --- |
| P01 | What tools can validate Machine Payments Protocol (MPP) payment challenges? | `/developers`, preflight criteria and MPP readings; unpaid inspection versus payment/checkout support |
| P02 | What tools can check A2A Agent Cards and test Agent-to-Agent protocol conformance? | `/a2a-desk`, `/api/a2a/check`; distinguish card checks, authorized runtime checks and full-protocol claims |
| P03 | Which open-source libraries can verify x402 signed offers and receipts offline? | `verifier/README.md`, x402-verify registry page; local inputs versus optional network key resolution |
| P04 | What Python, Go, and JavaScript SDKs can check an x402 endpoint before an agent pays? | `/developers`, the three preflight READMEs and live registries; correct package identity and unpaid-check scope |
| P05 | Where can I download historical x402 endpoint observations with signatures and documented coverage gaps? | `/corpus`, Hugging Face, Zenodo; signed originals versus unsigned table views, observed dates and coverage |
| P06 | Which MCP tools can inspect an x402 endpoint or verify a signed receipt? | `/mcp`, `/mcp/verifier`, published tool catalog; tools callable for this job, not just an MCP listing |
| P07 | Which agent-commerce services expose a UCP business profile and catalog search? | `/.well-known/ucp` and current deployed capabilities; exposing UCP is not a third-party UCP validation service |
| P08 | How can I compare x402 research providers using dated endpoint observations and payment terms? | `/menu/research_comparison`; observed terms/history and gaps, not investment advice or provider performance guarantees |

P01–P04 have September 28 observations in the portfolio audit. P05–P08 are
new questions and have no observed baseline in that audit. The earlier UCP
question about validating somebody else's merchant profile remains exploratory;
it is **not** the baseline for P07 or proof of a missing SCVD capability.

Language-specific SDK questions, timestamp verification and additional
verticals can be appended with new IDs when needed. Declare them before
collection; do not keep rewriting a failed question until it produces SCVD.

### Branded diagnostics — attribution, not acquisition

| ID | Exact query | What it diagnoses |
| --- | --- | --- |
| B01 | Who maintains x402-verify and scvd-preflight, and what do these packages do? | Ownership, package-name collisions, language coverage and functional precision |
| B02 | What can scvd.store do with MPP, MCP, A2A and UCP, and what are the limits of each? | Portfolio understanding and support-versus-validation conflation |

B01 has a September 28 observation; B02 is new. Named diagnostics can explain
an unbranded miss but cannot turn it into a discovery hit. Run B01 and B02 in
the first expanded checkpoint and after material protocol changes; thereafter use branded
diagnostics for a predeclared selection of unclear attributions.

## Collection and evidence

1. Freeze run ID, plan version, query IDs/text, engine/mode series, wave,
   order, planned cells and time budget in the run template. Finish the live
   capability/source map before scoring, preserving anything still unknown.
2. Confirm the exact composer text before submitting. Record UTC time and
   requested mode. Wait for a substantive completed answer and inspect its
   final mode. Record an error, clarification request, truncated response or
   absent overview separately; none is a clean negative answer.
3. Keep the **first attempt**. Permit at most one recovery attempt per cell
   for a technical failure or an unrequested mode fallback, in a fresh
   conversation with identical text and requested settings. Link its parent attempt. Never retry a valid miss to
   improve the score. Later stability waves are separate observations.
4. Save a concise, sanitized answer note and the conversation/revisit URL.
   Capture decisive passages and citation state where needed, within source
   reuse limits. Do not commit account chrome, chat history, cookies or tokens.
   A rerunnable Google URL or private conversation link alone is not an
   immutable record; preserve the dated observation alongside it.
5. Open relevant source controls. Record SCVD-related citations and the first
   competing recommendation's citations as exact URLs where exposed, with
   their associated claims. Distinguish a direct supporting page from a home
   page, directory profile, package listing, dataset or author-written article.
   If the drawer cannot be opened, record visible labels and `partial` coverage;
   do not invent URLs or claim there were no citations anywhere.
6. Check whether each material claim is supported by the linked page. Record
   broken links, wrong package owners, outdated capability descriptions and
   unsupported guarantees. A competitor named by an engine is a lead to
   investigate, not a verified competitive finding.

### Record each dimension separately

| Dimension | Allowed values / meaning |
| --- | --- |
| Attempt status | `complete`, `no_overview`, `error`, `clarification`, `truncated`, `unavailable`, `not_run` |
| Comparability | `matched`, `fallback`, `settings_changed`, `unknown`; preserve requested and observed modes |
| SCVD presence | `recommended`, `mentioned`, `citation_only`, `absent`, `unknown`; exclude query text/navigation |
| Identity | Exact entity/package/dataset name seen; attribution `correct`, `wrong`, `ambiguous`, `not_stated` |
| Citation | Exact URL and claim; relationship `scvd_site`, `scvd_hosted_asset`, `independent`, `unknown` |
| Citation inspection | `complete` for relevant drawers checked, `partial`, `unavailable`; absence is only within inspected scope |
| Task fit | `eligible`, `ineligible`, `uncertain`, with a dated capability reference |
| Accuracy | `correct`, `partial`, `incorrect`, `not_assessable`, with the specific claim and counterevidence |
| Next-step usefulness | Valid relevant entry point and usable next step, `partial`, `none`, `not_assessable`; no purchase needed |
| Alternatives | First relevant recommendation in answer order, exact cited URLs and reason given; no invented rank for unordered lists |

A SCVD-authored HackerNoon article, its npm package or its Hugging Face dataset
is an externally hosted SCVD asset, not independent endorsement. Record host
and authorship separately when uncertain. A citation-only hit can demonstrate
source retrieval without demonstrating brand recognition. Directory positions,
package downloads and corpus downloads belong in the supporting footprint
inventory, not in answer-engine citation counts.

## What to report

Report **counts with denominators**, by query family, engine/mode, wave and
branded/unbranded panel. No blended “AEO score.” Use one selected answer per
planned cell: first complete matched attempt, or its single allowed technical
recovery; retain all attempts in the ledger. A complete fallback can be described
in its observed series but does not fill the matched-mode cell.

- Coverage: completed matched cells / planned cells; show each missing status
  and fallback separately. A `no_overview` is an observed availability outcome,
  not a missing log entry and not proof that SCVD was rejected.
- Discovery: SCVD-recommended, mentioned and citation-only counts / completed
  matched **unbranded** cells. Show uncertain and ineligible task fits separately;
  use only eligible cells for any “missed applicable opportunity” statement.
- Attribution and accuracy: correct / assessable SCVD appearances, with partial,
  wrong and unassessable counts. Preserve inaccurate positive mentions.
- Citation provenance: site, externally hosted asset and independent-source
  counts / completed matched cells; a cell can have multiple source types, so
  these are not exclusive percentages. State inspection coverage.
- Usability: applicable SCVD appearances that give a valid next step / assessable
  applicable appearances. Track real referrals, data reuse, partner integrations
  and purchases separately, using existing production evidence. Unknown
  attribution stays unknown; an answer mention is not a conversion.

Compare only intersecting query IDs, product interfaces and compatible mode
settings. Show dates and sample sizes. If the mode changed, start a new series.
For repeats, show each cell as hit/hit, hit/miss, miss/miss or incomplete rather
than treating repeated answers as independent users. Here a hit means any
SCVD answer appearance (including citation-only); retain presence type and
accuracy alongside it so a wrong recommendation cannot look like a useful one. A before/after difference
is descriptive; changes in model, search results and personalization also exist.

## From a finding to work

| Finding | Next action |
| --- | --- |
| Our live copy contradicts implemented scope, a link fails, or a dataset will not load | Fix and verify the public surface now; do not wait for another market test |
| Named attribution works but repeated eligible unbranded questions miss | Inspect the selected sources and task framing; improve the existing relevant page/package/dataset documentation first |
| SCVD appears with wrong claims or names | Trace the cited source and correct the specific claim; keep the inaccurate hit in the record |
| Useful SCVD data is cited without attribution | Check its actual licence/citation guidance and source chain; repair missing attribution instructions where we control them |
| The answer cites a clearly better-fitting alternative | Record why it fits; do not manufacture a SCVD capability or a comparison-page claim |
| Access/indexing looks suspect | Check real crawler evidence, indexing tools if available, public readability and canonical links; a generic-client 403 alone proves no crawler exclusion |
| Coverage or repeat evidence is incomplete | State the gap and the next bounded check; do not convert it into zero visibility |

Retain the original six-week gate for **new question-titled pages** at October
15. Where completed eligible answers across the observed engines all omit
SCVD, treat that as a candidate gap. Before proposing a new page, require the
paired repeat, inspect what the selected source answers, and check that an
existing page cannot be improved to serve the job. Missing engines leave that conclusion provisional.
This gate does not delay factual corrections, broken-data repairs or launches.
Assign implementation to ROADMAP and only actual human presses/decisions to
KEEPER_LIST. End each run with a specific action, evidence, owner and next check.

Google's current guidance separates AI Overviews from AI Mode, notes that an
overview may not trigger, and requires ordinary indexing/snippet eligibility
without special AI markup. That supports these measurement distinctions, not
a guarantee of inclusion. [Primary guidance](https://developers.google.com/search/docs/appearance/ai-features),
read September 28; source and limits recorded in [SPEC_READS](SPEC_READS.md).
