# Buyer benchmark repair — September 15, 2026

B-BCOLLECT is repaired locally with failing-before controls and **36 passing benchmark/evidence tests**. The command `npm run buyer:test` is now part of local gates and GitHub CI. This is a benchmark repair; it adds no commissioned Aura report or original BUY-001–039 finding.

The collector reads the current published OpenAPI input schema, supports older snapshots, detects disagreement between duplicate schema copies, and distinguishes missing data from contradiction. It preserves nested URL values, literal href punctuation and body-only HTTP 402 quotes; unresolved templates are retained as coverage gaps. The scorer no longer invents historical reproduced findings or inherits old cold-cohort facts. Reviewed findings must reference retained requests.

## Public evidence

A second fresh unsigned run retained eight discovery snapshots, **539 input requests**, **327 direct URL requests**, and **18 unresolved template occurrences**. All **35 items agree on the compared fields**. No 5xx or transport failure occurred. No wallet, payment or new purchase was used.

Five raw 404s in this run were still invented by prose extraction: trailing colons/parentheses and adjacent Japanese/Chinese sentence text. The raw evidence remains unchanged. A new punctuation control failed before the final parser repair and passed afterward; three canonical URLs are checked separately in `url-parser-followup.json`. Do not convert these parser failures into store defects or silently replace the original counts. That follow-up is narrower than another complete run of the final collector.

## Verification and limits

Removing the primary collector/scorer repairs produced seven failing cases and one passing legacy-schema control; exact source restoration was verified. The later punctuation control separately failed before its fix. The final combined benchmark/evidence/deployment-scoring command passes 36 tests. CI YAML syntax parses, and application typecheck/build checks are recorded with the recovery repair.

No aggregate score was generated: no new cold-cohort review or funding-readiness assessment was supplied. The requested all-ten-surface semantics, full recursive crawl, redirect loops, content types, complete error-code coverage, alternative MCP profile and paid cold walks remain open. This batch is uncommitted and unreleased. See `validation.json` for source/log hashes and exact status counts.
