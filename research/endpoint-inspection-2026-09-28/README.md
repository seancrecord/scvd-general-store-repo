# PS6 validation, September 28

The [implementation record](../../docs/ENDPOINT_INSPECTION_2026-09-28.md)
states the scope and release status. [verification.json](verification.json)
records the merged PS5 base, pinned specification hashes, red/green controls,
focused checks and every file matched in fresh local package installations.
These are synthetic observations, not live endpoint measurements.
[completion.json](completion.json) records the subsequent reader fixes, final
checks and refreshed package bytes; the initial installation record above
remains historical.

The replay inputs are in `x402-preflight/fixtures/inspection-inputs.json`;
their headers reuse `test/fixtures/mpp/x402-and-mpp.json` and `evm-clean.json`.
The seven retained report projections live in
`x402-preflight/fixtures/inspection/`. The hosted test compares its actual
result against those records; library and CLI tests replay the same records.
The projections contain only the version, x402 verdict and inspection block,
not the full hosted report. Whole-response preservation is separately asserted.

To repeat the installed-consumer check, pack `x402-preflight/` and `cli/`,
install their tarballs into a fresh temporary directory with scripts disabled,
and copy `consumers/consumer.mjs` and `consumers/consumer.mts` beside that
directory's `node_modules`. Run the JavaScript file. Compile the TypeScript
file with strict checking, ES2022, NodeNext modules/resolution and the DOM
library; run its emitted `.mjs`. The JavaScript and CLI use a local HTTP
fixture server. The TypeScript consumer injects the saved response. No live
store, wallet, credential or model call is involved.

Registry publication, deployment readback and buyer/model qualification are
not established by these checks. The source build is ready for review; merge and publication are separate release steps.
