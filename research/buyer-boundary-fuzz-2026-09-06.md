# Buyer boundary fuzzing — 2026-09-06

Audited snapshot: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, in an isolated worktree. This is evidence against that frozen revision, not certification of subsequent shared-checkout changes. Payments, upstreams, storage and human completion were local fixtures. No real money moved and no production fixes are retained.

## Outcome

All 32 paid products were exercised through HTTP and MCP over Base, Polygon and Solana: **116 product/field memberships and 14,460 boundary observations**. Of these, 12,102 settled in the simulator and 2,358 safely refused. There are 3,360 failing observations and 11,100 passing observations. The 32 aggregate product tests intentionally remain red. A passing certificate signature alone did not establish preservation of the purchased input.

Supplemental display, format and optional-input controls add 263 observations: 249 pass and 14 fail. Combined evidence contains 14,723 behavioral observations, plus 116 field-coverage records. Supplemental tests comprise two passing and four failing tests. All settled certificates in the core matrix verified, and all tested returned API artifact links were retrievable; damaged or changed inputs can still be signed and retrieved successfully.

Four new findings are in the [running fix log](BUYER_AUDIT_LOG.md):

- **BUY-026, P1 — Unicode corruption.** A name containing 79 ASCII characters followed by one emoji fits the published 80-character limit but settles with a lone high surrogate in its signed name. Separately, an intact signed name containing 42 ASCII characters followed by an emoji and `Z` is damaged by SVG badge clipping. Both doors reproduce both paths. The core matrix has 402 split-surrogate observations across affected text boundaries.
- **BUY-027, P1 — malformed optional constraints billed.** Invalid observation payer/recipient/nonce values can remain literally in signed queries; invalid amounts or payment payloads can disappear. Good Buyer declarations also fall back to defaults. This is stricter than the implementation's intentional leniency: a supplied invalid constraint must not silently become a different check.
- **BUY-028, SEV-1 local reproduction — renewal becomes another purchase.** After creating a valid pass, renewing its id plus `?` settles a new payment and issues a different pass, leaving the original unextended. All six door/rail combinations reproduce it. This is not a claim of a live-money incident.
- **BUY-029, P1 — invalid callback discarded.** Aura Walk purchases with `callback_url:"x"` settle on both doors. Completing the local orders produces zero callback attempts. The order remains retrievable, but the requested completion channel has disappeared.

Existing BUY-001, BUY-004 and BUY-009 also recur: required NUL text can become empty after validation, long inputs can be silently clipped, and supposedly verbatim text can lose meaningful whitespace or characters. Findings overlap: the core labels occur 2,274 times for changed/missing text, 1,086 times for invalid/ignored/changed nontext input, 804 times for accepted values above a published character limit, and 402 times for split Unicode. The nontext label includes malformed values retained literally; it does not mean all those inputs were discarded.

## Coverage and interpretation

The roster and fields come from the catalog and served input schemas. Every field gets empty, one-character, boundary-length, Unicode, emoji, combining-character, newline, tab, decoded NUL, literal `%00`, encoded separator, quote, ampersand, question-mark, 16,384-character query-value, uppercase and outer-whitespace probes. HTTP also receives repeated query parameters. JSON MCP arguments cannot express duplicate object properties, so that case is HTTP-only. Each other case runs through both doors on every offered rail; MCP uses one matching shelf per product.

Seventy-four memberships publish a character cap in schema or prose. Their max−1/max/max+1 probes use that cap, with extra Unicode-at-boundary probes. The other 42 use explicitly labelled 2,047/2,048/2,049 stress lengths, not fabricated maxima. Supplemental tests derive four finite format bounds from regular expressions and exercise the documented hours bound. This leaves 38 memberships without an explicit character maximum; numeric and opaque formats need not share text-length semantics. All 90 supplemental format-boundary observations pass, including valid maximum-size bundle and transaction inputs and safe above-limit refusals.

Safe normalization is allowed for URL/host canonicalization, EVM hexadecimal case, identifier outer whitespace, network case/whitespace, and documented name whitespace collapse. Optional empty input counts as omission; confession sign-as identity takes precedence over agent_name. Network comparison uses the observed subject chain, not the payment rail. Payment-payload probes remove the explicit nonce so the payload is the sole nonce source.

For settled requests the suite inspects the response, changed business storage, certificate and returned local API links. It independently verifies certificate signatures with WebCrypto and detects lone surrogates. Private storage counts as input survival here; the separate wrong-good audit asks the stronger recipient-visible proof question. Display controls inspect JSON, HTML verification responses and SVG bytes, not browser screenshots or layout.

Five query controls pass: separators remain data, literal percent escapes are not decoded twice, and repeated identical/distinct/reversed values consistently select the first occurrence. Duplicate acceptance alone is not labelled a defect. The additional badge sweep tests all 78 eligible emoji positions in the published name bound through both doors; two observations expose the clipping defect.

## Verification and reproducibility

Run `node scripts/buyer-boundary-run.mjs` for the core matrix. It collects the product roster, starts a fresh local Worker for each product, and checks field/case/door/rail completeness. Exit 1 means findings, exit 2 means incomplete evidence. Set `BUYER_INPUT_REPORT` to choose the output file. Run the three supplemental specs with `npm test -- test/buyer-boundary-display.spec.ts test/buyer-boundary-formats.spec.ts test/buyer-boundary-optional.spec.ts --reporter=./scripts/buyer-boundary-reporter.mjs`.

An initial recorder attempt failed on raw lone-surrogate witnesses; the recorder now escapes them safely. A later monolithic run stopped with incomplete evidence and was discarded. Fresh Workers per product produced the complete matrix; the cause of that monolithic interruption is not established. The authoritative report combines complete per-product runs, replacing two products with reruns after correcting harmless identifier/network normalization in the detector. Coverage was reconciled against every declared field and expected case/door/rail tuple.

A temporary diagnostic moved the sanitizer cut and made badge clipping code-point-safe. All three display tests then passed (165 observations). Both source files were restored byte-for-byte; rerunning the baseline again produced the original six failing observations. The shifted limit is not a correct production fix and is not retained. Typecheck passed. These intentionally failing audit suites are not a claim that the repository's full suite is green; no commit was made.

This work does not establish funded-chain settlement, live facilitator/RPC behavior, production edge query limits, long-term persistence, or actual human work quality. The previous audits retain those gaps and related open findings.

## Evidence

- [Core matrix](buyer-boundary-fuzz-2026-09-06.json)
- [Display, query and Unicode controls](buyer-boundary-display-2026-09-06.json)
- [Format-boundary controls](buyer-boundary-formats-2026-09-06.json)
- [Renewal and callback controls](buyer-boundary-optional-2026-09-06.json)
- [Temporary diagnostic results](buyer-boundary-control-2026-09-06.json)
- [Validation record](buyer-boundary-validation-2026-09-06.json)
