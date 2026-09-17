# PS3 — developer activation

September 16, 2026. Implementation and automated local qualification are
complete on `codex/verifier-developer-activation` in
`/private/tmp/scvd-verifier-developer-activation`. Fresh-reader acceptance is
incomplete. No commit, integration, deployment or publication occurred.
This isolated worktree carries the uncommitted PS1/PS2 prerequisites and
preserves their earlier worktrees.

## What a developer now gets

The [package README](../verifier/README.md) leads with one working local
tarball install and one complete runnable example. The prepared release
is explicitly unpublished; the docs do not tell a developer to install a
registry version that has not been qualified. The example and expected output
are checked against the packaged files, not a workspace import.

The same script runs valid, tampered, unsupported and unavailable-key cases.
It prints status, reason codes, scope and exclusions. Fixture bytes and the
separately supplied public test key are derived from PS2's independent
matrix, with provenance retained. The docs explicitly distinguish separate
test-key files from real service authorization.

Support/runtime tables, reason-code next steps and migration guidance keep
unsupported checks and unavailable evidence distinct from failed signatures.
Optional history and evidence-CLI routes follow the first successful check.
No other package's README needed changing.

The example, provenance and compact fixtures ship in the tarball. The
independently locked TypeScript test tools and all qualification machinery
stay outside it. Runtime dependencies remain empty. Public wording remains
a draft until release review; none was published by this work.

## The TypeScript issue the clean install exposed

The original `subtle` option required the full browser `SubtleCrypto`
interface. A strict NodeNext consumer supplying Node's working
`webcrypto.subtle` failed because unrelated key-generation overloads differ.
Replacing it with the narrow `VerificationCrypto` interface describes only
the actual Ed25519 raw-key import and verification calls. Node's implementation
is accepted without an unsafe cast or a Node-only dependency in the public
declarations. The executable verifier is unchanged apart from a runtime
documentation comment.

The packed-consumer test was observed failing with the original declaration,
then passing after restoration of the fix. The initial activation test also
failed before the packaged example existed. Exact outcomes and source hashes
are in the [qualification record](../research/verifier-ps3-2026-09-16/verification.json).

## Local qualification

The exact frozen tarball was installed into a clean project outside the
repository. The README example ran all four scenarios under Node 22.13.1
and the manifest minimum, Node 18.17.0, with explicitly supplied Node
WebCrypto. The older runtime was downloaded from nodejs.org and matched its
published SHA-256. This does not imply default-global WebCrypto behavior
or parity with every intervening Node version.

A strict TypeScript 5.9.3 / NodeNext consumer with `@types/node` 22.13.1
compiled against the installed package and ran all four outcomes. The
automated gate copies its separately locked compiler/type tools into a
disposable consumer: no repository aliases or Worker ambient types can
hide missing declarations. CI and the manual verifier publish path now
run that installed quickstart gate.

Existing package and independent-vector tests pass in local workerd, and
the complete Node evidence suite, root typecheck, CI gate tests and Worker
bundle dry runs pass. Counts are derived in the qualification record.
The entire store Worker suite was not repeated for these documentation,
packaging and declaration changes; it remains required before committing.
Registry installation after an authorized release remains untested.

## Fresh-reader gate: measured, not passed

The user explicitly approved eight Codex CLI trials after the initial
automatic review rejection. All eight ran against the frozen README and
unpublished tarball: two attempts each for valid, tampered, unsupported and
unavailable-key scenarios. Each used a fresh ephemeral context and separate
directory, requested `gpt-5.6-luna`, and had a 180-second limit. The model
name is the requested CLI setting, not an independently attested backend.
No attempt was rescued, replaced or rerun. All completed within the limit.

The prompt allowed supplied documentation, package declarations, fixture
provenance and consumer execution; it prohibited verifier implementation,
repository, credential and unrelated filesystem access. These prompt limits
are not a filesystem secrecy boundary. Every trace was reviewed. Installed
package files and frozen inputs remained unchanged in all eight trials.

All eight saved API results exactly match the independent frozen-package
baseline for status, reason codes, scope and exclusions. All final answers
state the correct status/reasons and reject permission to pay. Six attempts
meet the execution/protocol checks; four also preserve the signing-key and
resource authorization exclusion in their final explanations. The stricter
combined result is **four passes out of eight**, not a completed PS3 gate.
These are eight synthetic task observations, not a population success rate.

| Attempt | Saved API output | Full pass | Remaining issue |
| --- | --- | --- | --- |
| valid-1 | Correct | No | Compound command failed at trailing git status; trace retains only that error, so successful execution lacks a sufficient witness. |
| valid-2 | Correct | Yes | Recovered unaided from an unexported declarations-subpath lookup. |
| tampered-1 | Correct | Yes | None. |
| tampered-2 | Correct | Yes | Separate, nonblocking git-status error retained. |
| unsupported-1 | Correct | Yes | None affecting the result. |
| unsupported-2 | Correct | No | Final explanation substitutes spending authorization for signing-key/resource authorization. |
| unavailable-key-1 | Correct | No | Same final-explanation loss of precision. |
| unavailable-key-2 | Correct | No | Inspected home npm-cache directory metadata outside its assigned workspace while recovering from an install error. |

The last attempt read no credential-file contents or verifier implementation.
Its nested consumer output and script were recovered from the retained trial
directory after completion; this was evidence collection, not another trial.
The first valid attempt's correct saved output is retained without claiming
that it closes the missing execution witness. The two compressed explanations
are failures of scope communication even though their raw API output includes
the full exclusion. The scorer has a regression control that rejects replacing
key authority with spending authority; it failed before that check was added.

Per-attempt durations and command failures are retained in
[the scores](../research/verifier-ps3-2026-09-16/readers/scores.json).
Durations run from host startup through the completed response, including
model/tool latency; they are not verification latency or a speed promise.
[Raw traces, scripts, outputs and manual reviews](../research/verifier-ps3-2026-09-16/readers/)
retain all attempts, including the failures. The research scoring code was
written after observation; it is not a preregistered statistical evaluation.

Claude Code remains installed but not signed in on recheck. No sign-in was
attempted. The agreed second-host observations remain missing, so two-host
acceptance is incomplete. Local API tests cannot substitute for that evidence.

The first cohort identified these follow-up changes: preserve the key-authority exclusion verbatim
in reader summaries, pass local npm-cache settings explicitly even when a
consumer creates a subdirectory, and capture verification separately from
optional diagnostics. Any changed README/package must get new frozen hashes
and a new recorded cohort; these eight attempts cannot qualify revised bytes.
Second-host trials require an available authenticated host. No further trials
were run under this eight-attempt approval. PS4 has not started.

## September 17 — scope and logging revision locally qualified

The README now separates signing-key/resource authorization from payment
authorization and requires scope/exclusions to remain verbatim beside any
shorter explanation. A revised trial runner sets an absolute local npm cache,
logs each consumer execution separately, collects nested outputs automatically,
and refuses to replace existing attempts. The local logger preserves consumer
stdout, stderr and exit status even if a later command fails; it does not
supply expected answers or remove the need to inspect reader code and traces.

Four harness tests, the packed JavaScript/strict-TypeScript activation test,
and both baseline scorer tests pass. Three controlled reversions each failed
as expected. The verifier runtime, declaration and example bytes are unchanged.
The original research record remains byte-identical. The new README/tarball
have separate frozen hashes in the
[September 17 record](../research/verifier-ps3-2026-09-17/verification.json).

No new reader trials ran, so the original four-of-eight result remains the
only fresh-reader observation. Improved comprehension remains unmeasured;
second-host acceptance is still incomplete. These are local draft changes,
with no commit, publication or PS4 work.

## September 17 — revised reader cohort completed

The next eight approved Codex trials returned eight correct API results and
eight final explanations preserving scope and all exclusions verbatim.
Seven pass the strict protocol, compared with four in the original cohort.
One reader attempted to open a nonexistent tarball outside its workspace
because of a relative-path mistake; it recovered unaided and read no outside
file contents, but that attempt remains a boundary failure. All sessions now
have successful separate verification records, including the excluded one.

The original results remain byte-identical. Both copy and the harness changed,
so these small synthetic cohorts do not isolate the cause of the improvement.
[Full comparison and retained failure](../research/verifier-ps3-2026-09-17/RESULTS.md)
include the source review, package-integrity checks, timings and raw traces.
Claude is still signed out after a fresh check. PS3 acceptance remains open;
no publication or PS4 work occurred.

## September 17 — absolute installation path locally qualified

A separate protocol-3 runner now supplies an exact, shell-quoted absolute
path to the frozen tarball, usable from either the trial root or a consumer
subdirectory. Both regression tests failed before the fix and pass afterward,
including directory names with shell punctuation. The package and previous
cohorts remain unchanged; no replacement reader trial ran.
[Path-fix record](../research/verifier-ps3-2026-09-17-path-fix/verification.json).
Claude remains signed out on recheck; its task is to independently repeat the
four scenarios twice and preserve their verification limits.

## September 17 — Claude sign-in confirmed; transfer approval pending

Claude Code's own status check now confirms the user's sign-in when run with
normal macOS access. The prepared eight-session runner uses the same frozen
package and protocol-3 installation instructions. Automatic approval review
blocked launch pending explicit approval to transmit the unpublished package,
README and synthetic trial data to Anthropic. No Claude trial has started.
[Prepared runner and launch record](../research/verifier-ps3-claude-2026-09-17/README.md).

## September 17 — Claude cohort completed: eight of eight

After explicit payload/destination approval, all eight fresh Claude Code
sessions passed. Each returned the correct API outcome, retained the full
scope/exclusions verbatim and denied payment authorization. Raw execution
records and installed package hashes were checked; no workspace-boundary
violation was observed. Three nested consumers recovered from looking for
logger records in the wrong subdirectory; those failed calls remain retained.
All sessions reported claude-sonnet-5. [Claude result record](../research/verifier-ps3-claude-2026-09-17/README.md).

The second-host evidence is now present. The Codex cohort remains seven of
eight strict passes under the prior installation instruction. A separately
recorded Codex regression check of the corrected path instruction remains;
Claude's successful protocol-3 cohort does not erase that earlier failure.
No commit, publication or PS4 work occurred.

## September 17 — focused Codex path regression closes local PS3 qualification

Two separate fresh Codex readers passed using the corrected absolute tarball
instruction: one installed and ran from the trial root, the other from a nested
consumer directory. Both produced the correct unsupported result, kept scope
and exclusions verbatim, denied payment authorization, and retained successful
execution records. Installed package bytes and supplied inputs were unchanged;
no workspace-boundary violation was observed. The nested reader recovered
unaided from a missing-directory tool refusal, retained in its commentary.

The prior revised Codex cohort remains seven of eight strict passes and Claude
remains eight of eight. These two targeted corrective passes are separate
evidence, not a replacement full cohort. Together with the existing four-case
coverage and local package/runtime checks, they close local PS3 qualification.
[Regression evidence and limits](../research/verifier-ps3-codex-path-recheck-2026-09-17/README.md).
Original and revised research records remain byte-identical. Integration,
public wording approval and publication remain pending. PS4 has not started.
