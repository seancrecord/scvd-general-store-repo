# Exact additions to existing logs — four-wave run

These changes are relative to the files immediately before this wave-summary update. They preserve the earlier deployment-boundary additions and do not include unrelated branch changes. No new BUY identifier is assigned.

## research/BUYER_AUDIT_LOG.md

```diff
--- before/research/BUYER_AUDIT_LOG.md
+++ after/research/BUYER_AUDIT_LOG.md
@@ -382,3 +382,13 @@
 **Scope remains partial:** identical deployed module bytes and runtime/bindings; one client location; Base only; the doors Worker did not change; real human labor and changed-code/schema compatibility were not exercised. This run does not close earlier defects. Evidence and the authorization-window close are scored in [the full report](deployment-boundary-2026-09-11/REPORT.md) and [repeatable benchmark](BUYER_DEPLOYMENT_BOUNDARY.md).
 
 Enhancements: **E22-01**, carry the benchmark across an actual approved functional/schema release; **E22-02**, independently roll the doors/store pair with old catalog and input contracts outstanding; **E22-03**, add attributed multi-region and additional-rail coverage under explicit spending caps; **E22-04**, carry an existing consented live human commission through release, completion and polling. Build follow-through is filed as **B22** in ROADMAP.md.
+
+## Four-wave buyer run — September 12, 2026 UTC
+
+**Wave 1 partial; 0 USDC newly spent. Waves 2–4 not executed in this run.** 529 prepayment requests, 341 direct link fetches, 198 structural comparisons and six isolated cold-to-quote walks. Existing findings reproduced: **BUY-040** (27 of 29 comparable HTTP/MCP quote rail sets differ), **BUY-042** (literal bundle/anchor examples fail), **BUY-044** (`/keys` linked from llms returns 404). No new BUY ID and no earlier closure. 177 typed invalid MCP requests refused; 216 probe-URL requests refused; 98 quoted minima match. HTTP missing-input price quotes are documented behavior, not typed-MCP parity failures.
+
+Six replacement CLI agents reached usable quotes; five supplied required inputs on the first product call. The cheaper skill reader needed a host revision. Two initial in-process attempts inherited SCVD facts and are excluded. No wallet was supplied to the cold cohort: purchase and purchased-artifact verification remain unexercised, and explicitly prompted verification cannot measure spontaneity. Full semantic discovery, recursive crawl and every-error coverage remain incomplete.
+
+Enhancements **EW-01**: provenance-aware public collection, scorer and per-product offer grid; **EW-02**: independent six-entry cold launcher with cheaper-model entry and trace review; **EW-03**: private buyer-grade shopping journal, bounded payment submissions, chain/artifact checks and mandatory product/recipient review; **EW-04**: four-wave acceptance and advancement record. Collector controls: 14 pass, two late fixes witnessed red first; typecheck and no-spend dry run pass. New collector live path remains unvalidated. Build follow-through: **B-WAVES**, ROADMAP.md.
+
+Current quoted full-shelf grid: 33 items, 163 offered item/rail pairs, **$3,040.430** minimum arithmetic cost, unspent and not a capacity reservation. Nine architecture representatives: $158.059 on one rail, unspent. Aggregate spending ceiling and locally configured funded Solana buyer remain outstanding. [Full report](buyer-waves-2026-09-12/REPORT.md), [run order](BUYER_RUN_ORDER.md), [exact log additions](buyer-waves-2026-09-12/LOG_ADDITIONS.md).
```

## ROADMAP.md

```diff
--- before/ROADMAP.md
+++ after/ROADMAP.md
@@ -35,6 +35,8 @@
 | D1 | **The doors in a Worker of their own.** BUILT 2026-09-05 on his "id love to do it, i just want to make sure we look for edge cases and have proper tests in place to reconcile": the x402-list night read found eight hours of 1,000ms+ checks with no deploy inside them, the cold canary read Cloudflare's floor at 5ms, so the 3.5 MB script was the whole cost. `src/doors.ts` answers the unpaid knock on `/api/buy/*` from a 656 KB Worker with the store's own edge (`src/lib/edge.ts`) and door checks (`src/routes/door-checks.ts`), both moved out of the store unchanged and registered from one list each; everything paid, unready or elsewhere is handed to the store over a service binding as it came. Three import cuts so the doors carry no delivery code. The flip is six keeper steps on KEEPER_LIST, safe by construction (a doors Worker without its secrets is a pass-through). NEXT: after the flip, the night reads on x402-list and the cold-read workflow; whether the trailing-slash 402 the parity test exposed should be fixed in `routes/buy.ts`. | The directory scores the first knock, and the first knock at a quiet hour was paying for the observatory to start. An observatory that publishes other doors' latency carried a 1.3s p95 on its own listing. | `test/doors-parity.spec.ts`: every door byte-equal across both Workers under one clock, the edges (HEAD, slash, dot, Accept, unknown, retired, missing argument, OPTIONS, POST, http, empty payment header), hand-over exact, readiness fail-open, both routers running the same functions in the same order by reference. `scripts/doors-config.test.mjs` holds the two wrangler files together; `npm run cold:local` fails past 1,000,000 bytes or on `services/fulfillment.ts` in the doors bundle; `npm run doors:live` reconciles the live pair door by door. |
 | V3 | **The MPP read-only battery.** PR 1 BUILT 2026-09-04 on his "get bolder on actual implementation" and his rulings on the design (decision 3 firm: the x402 verdict keeps its meaning permanently, `protocols_spoken` is the union; decision 2 wants the passport copy mocked up before he rules; the rest approved as-is): `src/lib/mpp-challenge.ts` (RFC 9110 parser, the quoted-comma trap included), `src/services/mpp-battery.ts` (the Tier 0 checks and advisories, `protocols_spoken` derived, `countMppMisreads` with its denominators), the `mpp` block and `protocols_spoken` on the free report and so on the dry run and the look, `www-authenticate` on the capture list from this round, `/api/practice/mpp-shape`, the `mpp` family row, vocabulary v11 (one class per check that can fail, sourced to the draft), the CLI's protocol lines, the recorded doors in `test/fixtures/mpp/`. NEXT: PR 2 (the census column, the corpus fields, the brief's count, the passport ruling once he has seen the copy in `docs/MPP_READ_ONLY_2026-09.md`), PR 3 (the paid audit's discovery read). | The second wire. A door speaking MPP read as a broken x402 door was a verdict on our reader wearing a finding about their door. | `test/mpp-battery.spec.ts`: the parser, every recorded door failing exactly the checks it is bad in, the report's block and the verdict untouched, the practice door, the family row, a class for every failing check. |
 | B22 | **Deployment-boundary benchmark — unchanged-code control complete September 12; changed-release coverage remains.** 18 live HTTP/MCP Base purchases delivered for 0.09 USDC across an attributed store-version rollout; retained quotes and old certificates survived. Isolated human-order restart passed. | A buyer object must survive the next answering Worker revision. | Preserve the scored evidence and negative detector controls in `research/BUYER_DEPLOYMENT_BOUNDARY.md`. Next actual approved functional/schema release: retained quotes, original certificates and existing orders; independently roll store/doors; add multi-region and other-rail denominators. Real human-order completion remains separate from the passing simulated queued-order control. E22-01–04; no new BUY defect from this bounded control. |
+| B-WAVES | **Four-wave buyer acceptance — Wave 1 partially measured September 12.** Public collection and isolated cold-to-quote cohort complete at their bounded scope; buyer-grade shopping evidence collector built and fixture-tested. | Real buyers need correct goods, recoverable money and consistent terms, not just successful endpoint status. | Complete semantic discovery across all surfaces, recursive concrete-link and all-error coverage; rerun BUY-040/042/044 after repair. Then real cheap-rail scenarios, architecture representatives and offered full shelf in that order under the keeper's ceiling. Require chain reconciliation, correct subject, completed fulfillment and fresh-recipient understanding. No mocked or queued result promoted to paid delivery. EW-01–04; evidence and limits in `research/BUYER_RUN_ORDER.md`. |
+
 
 Ordered 2026-09-03 under his lens: value or potential value
 if the market takes off, not ROI now ("think of it as tech
```

## KEEPER_LIST.md

```diff
--- before/KEEPER_LIST.md
+++ after/KEEPER_LIST.md
@@ -1171,3 +1171,8 @@
 ## HOLD
 
 Empty. Next paste lands here.
+
+## Buyer-wave decisions — September 12, 2026 UTC
+
+- **RULE — total live-audit spending ceiling.** Public Wave 1 work spent nothing. The retained full-shelf grid sums to $3,040.430 at minimums across 163 offered item/rail pairs; the nine architecture representatives add $158.059 for one rail, before cheap retry/concurrency cases and any capacity constraints. Decide the aggregate ceiling and whether to include the human commissions. The exact unspent plan and evidence are in `research/BUYER_RUN_ORDER.md`.
+- **TEST — Solana buyer availability.** No Solana buyer key/file was configured for this wave run. Provide a locally configured, funded test signer for the authorized live rail; do not send secret material in chat. A configured EVM buyer alone cannot exercise Solana settlement. Builds and remaining audit instrumentation are on ROADMAP B-WAVES.
```

## docs/SPEC_READS.md

```diff
--- before/docs/SPEC_READS.md
+++ after/docs/SPEC_READS.md
@@ -821,3 +821,9 @@
 key listing follows the provider's list cursors. Production read failed
 with authentication error 10000; no inventory count was inferred.
 Implementation and limits: `EVIDENCE_READER_COVERAGE_2026-09.md`.
+
+## 2026-09-12 — isolated cold-entry CLI calibration
+
+Read the official [agent-instruction guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md), reached from the OpenAI Codex agents-md guide, and inspected the installed Codex `exec --help`. The attempted non-interactive documentation URL returned 404; no behavior was inferred from it. This run uses separate CLI processes, `--ignore-user-config`, `--ephemeral`, `--skip-git-repo-check` and `project_doc_max_bytes=0` outside the source checkout. These are local CLI observations, not a guarantee that a no-history in-process fork has no store context: two such forks reported inherited AGENTS facts and were excluded.
+
+Six replacement agents report clean initial context, with public-only tool traces retained. The skill entry requests the cheaper `gpt-5.6-luna`; exact resolved model revisions for the other CLI defaults were not captured. Wallet-free quote completion does not establish paid success or spontaneous verification. Evidence and limitations: `../research/buyer-waves-2026-09-12/REPORT.md`.
```
