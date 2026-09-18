# PS3 follow-up — September 17, 2026

This is a local revision following the first eight reader trials. It is not
another usability result by itself. A subsequent approved reader cohort is
recorded in [RESULTS.md](RESULTS.md). All files under the September 16 research directory
remain byte-identical; `baseline-hashes.json` records that boundary. Its
four full passes remain four. The later revised cohort has its own scores
and traces under `readers/`; no Claude reader ran.

## Changes

The package README distinguishes the signing key's authority for a resource
from the buyer's authority to spend. It tells consumers to preserve `scope`
and every `doesNotEstablish` entry verbatim, putting shorter explanations in a
separate field. The verifier, declarations and packaged example did not change.

The new research runner supplies an absolute workspace-local npm cache through
the host environment, so a nested consumer does not select the home cache.
It gives the reader a logger that invokes its own consumer as a separate
process and retains stdout, stderr, exit code, signal and consumer hash per
invocation. A later failed diagnostic cannot overwrite that record. Nested
consumer scripts and outputs are collected automatically, excluding dependency
and cache directories and skipping symbolic links. An existing attempt or
cohort is refused. Raw host traces and failures remain part of the record.

The logger contains neither verifier logic nor an expected result. It runs
the reader's code; code can itself print fabricated JSON. Its writable records
are not independent attestations. A trial still needs source/trace review,
input/package integrity checks, comparison with actual package output, and
accurate final scope interpretation. The old scorer and old cohort remain
frozen as baseline evidence; any future cohort must be scored against its own
retained record layout and protocol, including these additional execution logs.

## Local checks

`reader-harness.test.mjs` passes four tests: nested offline package install
and all four real API outcomes with separate execution logs; preservation of
success followed by a shell failure and of a consumer's nonzero exit; nested
artifact collection without following external symlinks; refusal of an existing
attempt before host launch. Reverting absolute cache handling, nested collection
and recorded exit status separately makes the tests fail; each control log is
retained. These tests invoke local Node/npm only, never a model host.

The existing packed quickstart test also passes, including a strict TypeScript
NodeNext consumer and all four outcomes. Both baseline scorer tests pass.
The full store suite was not repeated for this README/research-only revision;
it remains required before a future commit. No commit or publication occurred.

## Frozen revision and next evaluation

`frozen.json` identifies the new unpublished tarball and README hashes and the
local directory holding them. `verification.json` records source hashes and
local results. The prior cohort cannot qualify these revised bytes. This
revision changes both copy and the trial setup, so a future improvement cannot
be attributed solely to the copy without a separate controlled comparison.

A future authorized cohort can use:

```sh
node research/verifier-ps3-2026-09-17/reader-harness.mjs --run <frozen-input-directory> <new-cohort-directory>
```

This command starts eight external Codex sessions. It was run in the subsequent
approved cohort, with all outcomes retained in `readers/`. The model setting is carried forward from the original cohort, not
an availability claim. Claude's second-host observations remain missing from
the last sign-in check. No sign-in or new host setup was performed. PS4 remains
unstarted.
