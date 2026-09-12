# Buyer waves — September 12, 2026 UTC

**Wave 1 is partially exercised; Waves 2–4 are planned, not executed in this run. New spending: 0 USDC.** The public battery made 529 prepayment requests and 341 direct link fetches. Six independent, wallet-free agents reached usable quotes. None bought or verified a purchased result. Three previously recorded buyer defects reproduced; no new BUY identifier is assigned.

The [run order](../BUYER_RUN_ORDER.md) sets the acceptance standard and remaining scenario matrix. [score.json](score.json) contains denominators; [wave-plan.json](wave-plan.json) contains unspent plans; [LOG_ADDITIONS.md](LOG_ADDITIONS.md) isolates this run's exact ledger changes.

## Findings that matter to a buyer

- **BUY-040 — checkout rail contradiction persists.** Among 29 products whose published examples quoted successfully through both doors, 27 HTTP quote rail sets differ from MCP. HTTP generally includes Arbitrum; MCP and discovery omit it. Launch Check and Opening Day offer the same four rails on both doors. This is a buyer contradiction regardless of which surface is intended to be canonical. Requests and offer sets are in `prepayment.json` and `score.json` → `quote_parity`.
- **BUY-042 — examples cannot be submitted literally.** Attestation Bundle publishes `tx_hashes: "tx hashes"`; Bitcoin Anchor publishes an abbreviated `sha256:e3b...b855` digest. Both examples fail before payment through HTTP and MCP. A schema-following buyer must invent a valid replacement. This reproduces the existing example defect rather than adding a second ID.
- **BUY-044 — key-discovery link is dead.** The llms surface links `/keys`, which returned 404. This is the only concrete first-party 404 established by this direct pass after excluding unresolved templates. It does not invalidate earlier, broader crawl findings.

The A2A Repair Kit example returned `unsupported_version`, and Trust Profile returned `passport_refused` with its generic example target. These are unsuitable prerequisites/fixtures for a happy-path run. They are retained for follow-up, not promoted to proof that a valid buyer purchase fails.

## What passed, with its denominator

**198 structural comparisons:** six comparisons for each of 33 products across menu, manifest and OpenAPI found no differences. They compare price tiers, fulfillment, normalized input schemas and complete manifest specs. They do not establish agreement across every human and machine surface or every semantic field.

**98 actual prepayment quotes:** each observed minimum matched its menu minimum. This tests the minimum, not every tier or fulfillment promise.

**177 typed invalid MCP requests:** null, object and array substitutions for required string fields and `agent_name` all received -32602, with structured `bad_request`, no-charge context, field guidance and contract links. HTTP query strings cannot carry those JSON types, so no false HTTP typed-input parity claim is made.

**52 required-input omissions:** 26 HTTP requests returned the explicitly documented price-only 402; 26 MCP typed purchase requests refused missing arguments. That intentional distinction is not scored as an equivalence defect. An agent still needs the complete input before submitting payment.

**216 URL refusal requests:** twelve probe products × nine URL forms × two doors; none reached a quote. Forms included HTTP, loopback/private host, localhost, custom port, credentials, file scheme and malformed text. Case File contributed 18 separate context controls: 14 accepted and four invalid URI refusals. Its URL is recorded historical context, not a fetched probe; acceptance of that context is not evidence of SSRF.

**No server-error response in the 529-request battery.** This does not exercise paid upstream, storage or fulfillment failures.

## Error-language coverage

The battery observed four refusal codes: `bad_request` 254 times, `target_refused` 173, `unsupported_version` twice and `passport_refused` twice. The remaining 98 requests quoted. `error-examples.json` retains the response examples for inspection.

The typed refusal path supplies actionable no-charge and correction context. This run does **not** claim that every error answers all six buyer questions (payment, cause, correction, retry safety, permanence and verification). Paid failures, capacity changes, timeout ambiguity and upstream incidents still require their own generated examples. Earlier error-language findings remain open at their original scope.

## Crawl coverage and instrument exclusions

341 direct fetches originate from homepage/llms/skill links, product listing/input/sample/verification links, concrete OpenAPI GET paths and selected well-known/docs paths. `links.json` retains URL, provenance label, timing, status and response headers; it does not retain every link response body. Redirects are recorded without being silently treated as failures.

This is not a recursive all-page/all-artifact graph crawl. It does not establish redirect-loop absence, every fragment's existence, all content-type promises, external source-link health or all correction references. The first extractor accidentally admitted percent-encoded `{parameter}` templates and truncated some embedded URL examples to `url=https`; their failures are instrument exclusions. GET 405 on a POST-only MCP surface is expected and separately explained by its response. Do not count these as product 404s.

## Six independent cold entries

All six ultimately selected Spot Check at $0.001, understood it as signed existing observations rather than a fresh probe, and interpreted payment-required as a quote without a debit. Five chose `scvd.store`; the cheaper skill reader chose `example.com`. The task did not supply a subject or downstream use, so “suitable” means a comprehensible, valid paid artifact choice, not established commercial usefulness.

- **Homepage:** 4 client actions, 1 product call; homepage → full menu → compact menu → quote. Large output was truncated twice by the client. The final report listed four offered rails although the live HTTP header supplied five.
- **llms:** 5 actions, 1 product call; two web-tool URL-safety failures, then public-fetch fallback. Three successful public retrievals; web caching hides exact origin round trips.
- **Skill / cheaper agent:** 5 actions, 2 product calls; two web timeouts reported by the tool as 400, then a direct 200 skill fetch. It followed a bare buy link to a price-only quote before adding the required host. One avoidable input revision, no observed origin 400. This is a first-call-input defect candidate, not proof of a failed paid transaction.
- **OpenAPI:** 4 actions, 1 product call; cached four-day-old API description, an unattributed Python-fetch 403, cached three-day-old menu, then a live usable quote. The 403 lacks retained response headers/body; no origin-versus-edge diagnosis is claimed.
- **MCP:** 8 actions, 1 product call; one local safety rejection and seven HTTP requests. GET 405 led to the published POST discovery path, then tools/list, compact menu, item contract, scoped tools and the quote. MCP carried payment-required inside HTTP 200; the agent understood it correctly.
- **Third-party listing:** 4 actions, 1 product call; Cursor Directory → homepage → menu → quote. The menu output was truncated. The listing entry was `https://cursor.directory/plugins/scvd-general-store-repo`.

Total: **30 client actions, 6/6 usable quotes, 5/6 first product calls containing required inputs, zero observed origin 400s, 0/6 purchases exercised.** Counts include tool failures; they are not a single homogeneous network-round-trip metric. Raw ordered calls, guesses, retries and prose understanding are retained in each `cold/*.json` and `.events.jsonl` file. Manually reviewed metrics live in `cold/reviewed-metrics.json` and cannot automatically score a new cohort.

### Cold-context correction

Two initial in-process agents reported inheriting the repository's SCVD-specific AGENTS instructions despite requesting no history. Those attempts are excluded. The valid cohort used new CLI processes in separate temporary directories, `--ignore-user-config`, `--ephemeral`, `--skip-git-repo-check`, `project_doc_max_bytes=0`, and a single-entry prompt. Source reading was forbidden, and saved tool traces show public retrievals rather than source reads. This is context isolation and trace evidence, not a claim that the OS made every local file unreadable.

The skill entry explicitly requested `gpt-5.6-luna`; exact resolved model revisions were not captured for the other five CLI defaults. The launcher now includes all six entries for future runs; this observed homepage run was launched separately before the remaining five. The prompt explicitly asked for verification but also required stopping at the first usable quote because no wallet was provided. Consequently **spontaneous verification, paid first-try success and purchased-result verification are unmeasured**. No rescue was supplied after starting the isolated agents.

## Cost and later-wave readiness

The shelf contains 33 products. Bare live quotes establish **163 offered product/rail pairs**, summing to **$3,040.430** at quoted minimums: $610.886 each on Base, Polygon, World and Solana; $596.886 on Arbitrum, which omits Launch Check and Opening Day. [shelf-quote-grid.json](shelf-quote-grid.json) links every offer row to its actual request. This arithmetic is not a reservation or guarantee that capacity permits all purchases.

The nine architecture representatives total **$158.059** for one rail, unspent. Wave 2 starts with the $0.001 Spot Check. Repeat scenarios, other tiers and network fees are additional. The requested aggregate spending ceiling has not been supplied; an EVM buyer configuration exists, while no Solana buyer key/file configuration was present. Presence is not a balance check. No secrets are in this report.

Previous [deployment-boundary evidence](../deployment-boundary-2026-09-11/REPORT.md) independently records 18 Base Small Blessing purchases for $0.09. It is an unchanged-code control, not this run's Spot Check, Polygon, Solana, human-completion or changed-release evidence. No historical defect is closed here.

## Benchmark enhancements delivered

- **EW-01 — evidence-preserving public run:** fresh surface acquisition, unsigned battery, retained raw responses, replayable scorer and a per-product offered-rail grid. Future acquisition records status/header/time provenance; the original eight snapshot files lack a separate acquisition ledger, which is a retained limitation.
- **EW-02 — independent cold cohort:** six-entry CLI launcher, cheaper-model entry, trace retention, manual review and explicit exclusion of context-contaminated attempts. Full paid and spontaneous-verification variants remain to be run.
- **EW-03 — buyer-grade house walk:** an opt-in private journal records inputs, offers, authorization before transmission, chain/store/artifact/verification evidence, round trips and waits. It refuses automatic second paid submissions and enforces a conservative per-run spending reserve. Product and recipient review remain incomplete until actually performed. Additional EVM rails use the live quote asset. Sequential HTTP only; it does not stand in for the concurrency suite.
- **EW-04 — scored advancement and follow-through:** the run-order document separates all four waves, actual fulfillment from order creation, live evidence from mocks, and planning cost from spend. Remaining implementation work is on ROADMAP; spending and locally provisioned Solana access are keeper decisions.

Validation: **14 collector controls pass**, including tampered and replacement artifacts, incorrect subject/recipient, missing evidence, wrong chain recipient, Solana owner/mint deltas, body-only quotes, automatic retry and spending limits. The two late collector regressions were observed failing before their fixes. Repository `npm run typecheck` and script syntax checks pass. A buyer-grade full-menu dry run exits without buying. No new live collector payment, full application suite, commit, push or deployment was performed in this wave run.
