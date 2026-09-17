# Cold buyer instrument, plans 2 and 3

The acceptance contract and feature order live in
[the takeoff plan](../docs/TAKEOFF_READINESS_2026-09.md) and `ROADMAP.md`.
This file explains the instrument; it is not another work queue.

## Run

Use an existing signed-in native Codex/Claude host. Authentication stays in
that host; the runner does not collect keys. Host availability describes
the launch context: a sandbox can prevent a locally installed host from
starting or reading its normal sign-in state. Retain such failures.

Inspect the frozen cohort before launching it:

```sh
node scripts/buyer-cold-isolated.mjs --plan research/takeoff-readiness-2026-09-16/plan.json --out /private/tmp/buyer-cold-NEW
node scripts/buyer-cold-isolated.mjs --plan research/takeoff-readiness-2026-09-16/plan.json --out /private/tmp/buyer-cold-NEW --run
```

The first command is a dry run and creates nothing. The second consumes
model usage, creates a new private evidence directory and runs cells
sequentially. It authorizes no spending or writes to external services.
The output directory must not already exist. Change the cohort by saving
a new plan before running, never by editing a completed acquisition.

Each agent starts in a new neutral temporary directory, with user/project
instructions, skills, configured MCP servers and prior sessions disabled
through native host controls. The allowed environment keys are recorded;
wallet/API secrets and parent conversation identifiers are not inherited.
These are context controls, not proof of absence of pretrained knowledge
or a filesystem security boundary against a malicious agent. Review the
trace for local reads and hidden-context disclosures before accepting it.

`intent_search` and `catalogue` prompts omit SCVD's name. `directed` supplies
a public listing and measures subsequent use, with discovery excluded.
Verification can be explicitly prompted or unprompted; do not combine the
two as evidence of spontaneous behavior. The September 16 cohort is all
prompted. No host gets a preinstalled SCVD MCP connection or secret hint.

The runner records the plan, prompts, host versions, launch configuration,
collector source snapshots and hashes, raw events, errors, times, tool events and usage.
Wall time and retained output bytes are bounded. The tool guard stops the
process after observing an over-budget event; host batching/buffering can
expose additional dispatched calls. It is not a hard origin-request quota.
The output-token target is advisory. Failed/capped/missing cells remain in
the denominator. An interruption is not evidence of a store defect.

## Review and rescore

Retain original public response files needed for a claim inside that cell's
evidence directory. Never copy authentication files or signed payment
requests. Each `review.json` is a dated independent interpretation of that
cell's actual trace. It must include:

- `schema_version: 2`, `reviewer`, `reviewed_at`, `transcript_sha256`.
- `isolation: {state: "clean", reason, evidence}` only after reviewing the
  launch, initial disclosure and all tool activity. Otherwise leave it
  unreviewed or mark it contaminated.
- `stages` for `discover`, `connect`, `check`, `decide`, `obtain`, `verify`:
  each has a `state` (`pass`, `fail`, `incomplete`, or bounded
  `not_applicable`), a `reason`, and `evidence` references. Required stages
  cannot be waived into a complete journey.
- References shaped as `{file, sha256, start_line?, end_line?}`. Paths are
  relative to the cell directory; hashes cover the entire original file.
  A line range is optional and one-based. Escaping paths and symlinks,
  changed bytes and nonexistent lines are rejected.
- For discovery success, `discovery` with actual `query`, `result_url` and
  `selected_origin`. Selecting another service is a SCVD discovery miss.
  A bounded miss does not establish SCVD's absence from any catalogue.
- For a passed SCVD check, `observation` with exact `subject`, `observed_at`
  and `stale_after`. Explain the freshness window in the review, using the
  artifact's published scope rather than inventing a store guarantee.
- `fulfillment: "delivered"` for obtained evidence. Quotes and queued orders
  cannot count as delivered. `payment: {state: "not_needed", reason}` is
  required for a full unpaid pass. A correct payment refusal can pass the
  decision while leaving the full journey incomplete.

A verification pass additionally requires `verification.artifact` referencing
the retained original ed25519 envelope, JSON pointers `subject_pointer`,
`observed_at_pointer`, `expires_at_pointer` into its signed payload, a
separately captured `issuer` reference containing `public_key`, public
`issuer_url` at the SCVD origin, and `issuer_evidence` references recording
that public acquisition. Use the existing envelope verifier. A key bundled
with the artifact alone cannot establish issuer identity. Also retain
`recipient: {state: "reviewed", understands: true, evidence}` pointing to a
separate recipient's actual interpretation, not the buyer's own verdict.

Schema 2 retains its original standalone-envelope contract and its explicit
expiry requirement. Do not rescore an old acquisition as if it had captured
files or frozen a different freshness policy.

Schema 3 adds `budgets.artifact_bytes` (at most 32 MiB),
`budgets.artifact_files` (at most 32) and `freshness.max_age_ms`, all positive
integers frozen in the plan before any model runs. A prompted verification
cell gets a generic instruction to save original public responses under
`./evidence`; no service or verifier is named. Unprompted cells get no new
verification hint. The runner creates that empty directory and, after the
process stops, copies complete regular files with hashes into the retained
cell. Symlinks, hard links, over-budget files and incomplete reads are
refused and recorded. This is a retained-file ceiling, not an operating
system disk quota. Empty capture does not prove evidence was unavailable.

For portable verification set `verification.format: "portable"`, with
`artifact` referencing the original response and `issuer` referencing a
separately acquired issuer key document. Both hashes must occur in the
runner's end-of-run capture manifest; a replacement fetched later cannot
qualify. `bundle` may reference a retained portable bundle. If absent, the
existing verifier builds it from the original response. That derived bundle
is review machinery, not a claim that the buyer exported it.

The scorer reuses `verifier/evidence-bundle.js`, including its corpus-v1
canonicalization and attached-evidence binding checks. It compares the
bundle's signed artifact with the original response, verifies with the
separately captured key, and reads subject/time only from verified signed
claims. The JSON pointers must identify the exact endpoint and its
observation time, not the snapshot's publication time. Undeclared expiry
is reported as `not_declared`; the frozen age ceiling still applies. An
explicit declared expiry must parse and must not have elapsed. A partial
capture, missing report, wrong subject, future/stale observation, or absent
recipient review cannot yield a complete pass.

Key-service-window and independently anchored timestamp validation remain
outside this score. Unknown formats remain **incomplete**, not invalid
merchant findings. These are instrument coverage limits.
Review references prove file identity, not the truth of the reviewer's
interpretation. Do not manufacture a passing review from HTTP status.

```sh
node scripts/buyer-cold-isolated.mjs --score /private/tmp/buyer-cold-NEW
```

Rescoring launches no agents. It recomputes signature checks and reports
its current scorer source hash separately from the original collector
hashes. An unsigned/absent review never passes. A buyer-wave directory can
include this whole cohort under `cold/`; `buyer-wave-score.mjs` recomputes
current supported results from evidence and ignores a cached cold score. Historical
schema-1 `reviewed-metrics.json` remains readable with its original scope.

Run `npm run buyer:test` for offline controls. Native live runs are dated
observations, never a mandatory network dependency of the test suite.
