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

## Follow-up: valid examples reached an unconfigured gate

The [next CI run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35002234961)
failed on a different condition: `/api/buy/launch_check` returned 503. The
server-error assertion caught it. CI tested the branch combined with newer
main (`dcd604d1`), whereas the earlier passing local full run described the
branch tree alone. That earlier result remains valid for its recorded tree;
it did not establish that the later combined tree passed.

Main now supplies actual paid-input examples in OpenAPI. The sweep uses
those examples, so the launch-check products reach their field-wallet
availability gate. The original test supplied no field-wallet binding.
The production refusal is correct. On the combined tree, the unchanged
file reproduced two failures: `launch_check` and `opening_day`; the other
98 cases passed.

The file now passes its own environment to the real app, using the same
public disposable field-key fixture as the buyer harness. It uses a test
execution context and waits for background work. The facilitator still
intercepts outbound calls, and this file asserts zero payment verifications
and zero settlements. No pool-wide binding or production secret is added.
All 100 focused cases pass with the fixture; the server-error assertion,
route eligibility and deadlines are preserved.

Main has been integrated into the branch before final validation, and its
exact lockfile installed in this worktree. The new
[`ci-merged-tree-validation.json`](../research/pq-measurement-2026-09-14/ci-merged-tree-validation.json)
records the tested main parent, failed CI merge, reproduction and final
checks separately from the first repair. The earlier records are unchanged.

The combined-tree full run passed all 722 files: 14,243 tests passed and
1 skipped, without early stopping. It includes all 100 corrected OpenAPI
cases. Typecheck, all 53 offline evidence tests, the audit, claims register
and both Worker dry-run bundles also passed. The focused red/green checks
preceded the clean dependency install; the full run used the exact merged
lockfile. Remote CI on the pushed revision remains the merge gate.
