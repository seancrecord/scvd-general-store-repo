# scvd-corpus-client — changelog

Versions are immutable once published. Minor versions add functions and
never change an existing function's result.

## 0.1.0 — 2026-09-10

Initial release preparation: `corpus`, `freshSet`, `hostHistory`, `month`,
`feeds`, `diff`, `defects`, `withDenominator`, `CorpusHttpError`, and
`corpusIndex` with `CorpusIndexOptions`. Zero dependencies.

The original readers were implemented September 3 (roadmap C5). Compact
discovery was added September 10: one metadata page per call, caller-controlled
pagination, gaps and verification limits preserved. Existing readers keep
their original responses. The package reads evidence; it does not verify it.
