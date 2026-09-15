# PR 709 CI repair — September 15, 2026

The failed [CI run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34981080654)
completed 713 files: 712 passed and one failed. It reported 14,048 passing
tests, one failure and one skip. The failure was the 30-second timeout in
`test/openapi-declared-inputs.spec.ts`'s single sweep of undeclared Accept
negotiation across all fixed-path GET operations. It was reported at
15:03:49 UTC; the job ended at 15:58:31 UTC. The later evidence and package
steps were skipped. This was not a failing PQ measurement assertion.

## What changed

The negotiation sweep now derives an individual test case for each eligible
route from the served OpenAPI document. It keeps the original eligibility
filters and three requests per route: baseline, Markdown and HTML. Every
case keeps the existing timeout; adding a route adds a case rather than
more work inside one deadline. No route list is hand-maintained.

The old setup also omitted the facilitator mock required for paid doors.
An unchanged local run passed while those requests returned 500 after real
facilitator capability calls failed. Matching error-page content types were
therefore capable of looking like a successful negotiation check. The file
now installs the standard facilitator mock and keeper-presence fixture, and
rejects server-error responses before comparing content types. The presence
fixture opens the human-fulfilled shelf in test storage; production is untouched.

CI invokes the application suite with `--bail=1`. After a failure it stops
further test execution instead of continuing an already-failed suite for
another 55 minutes, as this run did. Successful runs still execute every
test. An interrupted failing run does not establish coverage of the cases
it did not execute. The local full-suite validation does not use bail.

## Controls and validation

The unchanged file passed all nine tests locally. Splitting the route sweep
produced 99 cases over the same scope. The added server-error guard then
failed on a paid route with the old missing-mock setup. After the facilitator
and presence fixtures were installed, all 99 passed. The CI contract guard
failed before the workflow gained `--bail=1`, then all three tests in its
file passed with the workflow corrected.

The full local application run passed all 713 files: 14,137 tests
passed and 1 skipped, without early stopping. Typecheck, all
53 offline evidence tests, documentation checks, scalability audit, claims
register and both Worker dry-run bundles also passed.

The dated machine-readable record in
[`ci-repair-validation.json`](../research/pq-measurement-2026-09-14/ci-repair-validation.json)
keeps the original remote result, focused controls and final validation
separate. The original publication-validation record remains unchanged.
No production code, payment behavior, dependency version or PQ measurement
changes in this repair. Clean CI on the pushed revision remains the merge gate.
