# Buyer evidence clarification and interruption handling

The schema-5 section below records this repair. The subsequent
[integrated runner guide](BUYER_HARNESS.md) documents schema 6, now required
for new live CLI runs; earlier plans remain readable for previews and scoring.

This follows the [integrated buyer record](../research/integrated-buyer-2026-09-18/REPORT.md)
and the separate [directed-release cohort](../research/takeoff-directed-release-2026-09-17/REPORT.md).
Their outcomes and captured bytes stay unchanged. This is an instrument and
wording repair, not another acceptance result.

## Address hashes and snapshot references

`pay_to.how_to_match` now names the address-hash fields (`digests`,
`changes[].from`, `changes[].to`) separately from snapshot references
(`observed.digest`, `unchanged_since.digest`, `changes[].digest`). It points
readers to the corresponding timeline digest for the latter. The formula,
field values, schema and historical signed bytes do not change. A regression
both checks the guidance and compares those reference values with the actual
seeded timeline; the old guidance failed before the source change.

## Timing that acknowledges interruptions

The native-process runner records UTC elapsed time and monotonic elapsed time,
the first stop request, and process-close time. It samples on an interval,
on output, at the deadline callback and at close. `TIMING_POLICY` in
`scripts/buyer-cold-isolated.mjs` is the single source for the sample period,
maximum callback gap and clock-divergence threshold; every timing record
includes that policy, and the acquisition freezes the instrument source.

A large callback gap, backwards clock or excessive clock divergence stops the
attempt as `timing_interrupted`. A callback that observes either elapsed clock
at the budget also requests a stop, even if the deadline callback has not run.
No time is subtracted and no cap is extended. A capped zero-exit process does
not count as completed. The scorer keeps partial stage findings but marks a
timing-interrupted full journey incomplete, including when a partial stage
records a failure.

These readings do **not** diagnose sleep. Heavy scheduling delays, a stopped
event loop or clock adjustments can also invalidate timing. No process can
request termination while its host is suspended. Stop-request and close times
are separate because termination is not instantaneous. A stop recorded only
after close says no signal was requested; an exited process ID is never
signalled by that final timing check. Independently recorded
host power events can establish sleep; the runner alone cannot. A temporary
idle-sleep assertion does not prevent lid closure or forced suspension.

Tests inject both clocks, including a suspend-like discontinuity, both clocks
advancing during a callback gap, a backwards clock, cumulative divergence and
a deadline reached before its callback. Real dummy child processes verify
retention and termination without launching models. Regular samples remain a
healthy control. The original clock regressions failed against unchanged source.

## Recipient protocol before acquisition

New live CLI acquisition and capability commands require plan schema 5. Earlier
plans remain readable for dry runs and rescoring; importing the low-level
functions still supports historical fixtures. Schema 5 retains the existing
buyer freshness/retention/qualification contract and adds `recipient`:

- `host`: `codex`; `model`: explicitly selected, with no implicit default.
- `network`: `disabled`; `attempts_per_eligible_cell`: `1`.
- `input_scope`: `signed-pair-and-buyer-report`.
- `budgets`: positive `wall_ms`, `tool_calls`, `output_bytes` and advisory
  `output_tokens`, supplied explicitly rather than copied from buyer limits.

The CLI dry run previews the recipient protocol and exact prompt without
creating a run. The runner freezes `recipient-protocol.json` and `recipient-prompt.txt` before
any buyer launches. The protocol records the prompt hash, input names and
clock policy; the plan and instrument hashes also bind it to qualification.
Changing the plan or instrument requires a fresh probe. Recipient-only hosts
are included in the frozen host context but do not become extra online buyer
probes.

`recipientLaunch()` derives the offline adapter, limits and exact prompt from
that same plan. Its supplied subset is:

- The exact captured original as `original-response.json`.
- The separately captured issuer-key response as `issuer-key.json`.
- The buyer's verbatim final report as `buyer-handoff.md`.
- The frozen public `x402-verify.js` and `evidence-bundle.js` modules, with
  module-type `package.json`, identified as review machinery.

The prompt explicitly says **not supplied does not mean not retained**. It
cannot establish key-acquisition provenance, current responses or other history
from files outside that subset. One verified snapshot does not authenticate
all weeks in an unsigned summary.

The helper prepares a launch; it does not fetch evidence, select eligible
pairs, assemble files or run recipients automatically. The next acquisition's
controller must check the frozen protocol/prompt hashes, retain an exact input
manifest, use a new output directory once per eligible cell, and pass the
helper's budgets unchanged to `runChild`. It must retain incomplete attempts
and review the actual trace. A declared one-attempt policy is not a retry lock.
Do not claim recipient acceptance from this helper's deterministic tests.

## Before the next native experiment

State a new question and freeze its subject, freshness policy, buyer and
recipient limits, supplied subset and model choices before either probe or
acquisition. Use the new CLI plan format and a fresh generic qualification.
Keep host activity controlled and record actual sleep events alongside the
runner's readings. Retain all cells; do not rerun the old incomplete cells,
rewrite old scores or pool the two earlier cohorts.

The historical September 7 observation leaves its original 14-day window on
September 21 at 02:30:20.531 UTC. A later experiment needs appropriate newer
evidence or an honest incomplete result; this repair does not widen that window.

## Full-inventory protocol integration

The current live controller uses schema 6 through the [operating guide](BUYER_HARNESS.md).
The schema-5 paths below remain usable for preparation and historical inspection;
they do not establish the controller's offline qualification or completed-recipient gate.

The schema-5 preparer compatibility path can choose
`input_scope: "all-retained-and-buyer-report"` before qualification. This is
an alternative to the original signed-pair subset, not a reinterpretation of
that subset or the historical cohorts. The runner freezes the inventory-aware
prompt and the same explicitly supplied recipient budgets before acquisition.
The prompt reads `input-manifest.json` and `artifacts/`, and identifies the
buyer report and public verifier machinery separately. Its wording comes from
the same function as the standalone preparer.

Use the preparer with the frozen cohort when this scope is chosen:

```sh
node COHORT/instrument/buyer-recipient-handoff.mjs \
  COHORT/CELL SELECTION_JSON NEW_RECIPIENT_DIRECTORY \
  --frozen-cohort COHORT
```

The selection must use `buyer_report` and supply **every** retained file,
including files not marked cited. Preserve capture failures in the inventory;
a complete transfer cannot recover material that was never captured. The CLI
checks the exact plan bytes against qualification and the buyer cell against
that plan. Preparation then checks the subject, full-supply scope, frozen
protocol fields, input names, prompt and prompt hash before creating files.
The manifest binds the recipient protocol and canonical parsed plan content
(`plan_content_sha256`; distinct from the qualification's raw plan-file hash).

Generate the offline launch with `recipientLaunch` using that same frozen
plan and host context. The prepared prompt must match its prompt byte for byte;
pass its returned budgets unchanged to `runChild`. Read the frozen instrument
and verify its manifest hashes before preparation and launch. The controller
still owns input-manifest verification immediately before launch, a fresh
output directory, one attempt per eligible cell, timing/power observations and
retention of all outcomes. The preparer launches nothing and is not a retry
lock or a new host qualification.

Offline controls cover the actual frozen-prompt path, CLI preparation, byte
preservation, wrong subject, changed prompt/protocol/budgets/input names,
subset scope and even uncited omissions. Native qualification and buyer
acceptance remain pending under issue #803.

Integration validation on base `745e2d4a126dc77a252db9d22dfd5b59066d7f73`:
194 offline buyer tests pass. Removing the frozen-handoff guard makes all
seven mismatch controls fail; restoring it makes them pass. Typecheck and
both bundle checks pass. The full Worker suite passes all 782 files:
15,047 tests passed, one intentional skip, zero failures. The normal PR CI
gate still covers integration with subsequent main changes. No native host
probe, buyer or recipient was launched by this validation.
