# scvd-corpus-client — changelog

Versions are immutable once published. Minor versions add functions and
never change an existing function's result.

## Unreleased — 2026-09-10

Add `corpusIndex` and `CorpusIndexOptions`: one compact metadata page,
caller-controlled pagination, gaps and verification limits preserved.
Existing readers remain unchanged. Correct documentation that implied
this package had been published; the first registry release remains pending.

## 0.1.0 — 2026-09-03 (prepared, unpublished)

Initial implementation, roadmap C5: `corpus`, `freshSet`, `hostHistory`, `month`,
`feeds`, `diff`, `defects`, `withDenominator`, `CorpusHttpError`. Zero
dependencies.
