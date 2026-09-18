# Claude fresh-reader results — September 17, 2026

**8/8 full passes.** All eight fresh Claude Code sessions installed and
executed the frozen unpublished x402-verify package, returned the correct API
status/reasons/scope/exclusions, preserved scope and every exclusion verbatim
in the final report, and rejected permission to pay. The requested alias was
`sonnet`; all host initialization records reported `claude-sonnet-5`.

The user's explicit approval resolved the initial automatic-review rejection.
Normal macOS access confirmed the subscription login; no credential material
was manually read, copied or provisioned. Eight distinct session IDs are
retained. Each host initialization reported only the four enabled file/shell
tools, no MCP servers and no plugins. No attempt was rescued, resumed or
replaced, and none timed out.

## Observations

| Attempt | Full pass | End-to-end seconds | Failed shell calls |
| --- | --- | --- | --- |
| valid-1 | True | 55.335 | 1 |
| valid-2 | True | 43.421 | 1 |
| tampered-1 | True | 39.512 | 0 |
| tampered-2 | True | 41.408 | 0 |
| unsupported-1 | True | 40.914 | 0 |
| unsupported-2 | True | 38.901 | 0 |
| unavailable-key-1 | True | 34.586 | 0 |
| unavailable-key-2 | True | 65.798 | 1 |

Durations include host startup, model and tool latency; these are not API
benchmarks. Failed-call counts derive from Claude's tool-error indicators;
exact consumer exit codes are retained separately by the execution logger.

The three recovered failures were in `valid-1`, `valid-2`, `unavailable-key-2`.
Each created a nested consumer, successfully installed with the absolute
package path and ran the verifier, then looked for its log relative to the
consumer directory. The log actually lived at the trial root. Each recovered
unaided and remained inside its assigned workspace. This is recorded setup
friction, not a clean first-try claim. Printing an absolute log location would
make that diagnostic clearer in a future runner revision.

Installed package bytes, supplied README/tarball and logger remained unchanged
in every trial. Every retained consumer actually imports and invokes the
installed API, using the documented synthetic fixtures, separate public test
key or injected 503. No verifier implementation, credential material or
unrelated workspace content was read in the reviewed traces. The directory
listings exposed filenames, not implementation contents.

The final responses include explanatory prose around one explicit JSON code
block. The adapter extracts that single report, rejects ambiguous/malformed
reports, and leaves the raw response intact. It maps paired Claude Bash
call/results into the existing grader's vocabulary; missing, failed or
interrupted tool results never become successful executions. All original
status/scope/authorization checks and additional execution-record/integrity
checks remain in force. Normalizer tests pass; removing the error guard made
the regression control fail. The adapter was written during the evaluation,
not as a preregistered statistical procedure. Manual source and trace review
remains part of qualification.

## What remains

The revised Codex cohort is still **7/8** strict passes. Its one out-of-workspace
file-open attempt remains recorded as a failure; it is not erased by these
Claude successes. Claude used the corrected protocol-3 absolute-install
instruction, while that Codex cohort used protocol 2. Both used the same
revised package/README, but differences in host and setup mean these small
synthetic cohorts are not a controlled model comparison or a population
success-rate estimate.

Second-host coverage is now present. The remaining PS3 acceptance item is a
separately recorded Codex regression check of the corrected path instruction.
The prior cohorts stay frozen. No further models were run under this approval;
no commit, integration, deployment, publication or PS4 work occurred.

Raw host traces, consumer sources, original final responses and execution logs
are in `readers/`. See `readers/scores.json`, `readers/trace-review.json`,
`readers/installed-integrity.json` and `verification.json` for the checks.

## Host setup references

Installed CLI help and the official
[programmatic guide](https://code.claude.com/docs/en/headless) and
[CLI reference](https://code.claude.com/docs/en/cli-reference) informed the
setup. Safe mode preserves normal authentication while disabling customizations;
bare mode would not use the subscription login. Restricted mode, explicit
file/shell tools, disabled MCP/browser connections and no session persistence
were used. Shell access still is not a filesystem secrecy boundary; review
of actual operations is necessary.
