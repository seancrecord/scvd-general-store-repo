# Inspecting and running buyer acceptance

The harness asks a fresh agent to assess a merchant before spending, preserves
its original evidence, then asks a separate offline agent to verify and interpret
the handoff. It produces files you can inspect. A completed process is not a
passing journey: a reviewer checks what actually happened against the evidence.

## Start by reading results

- [Directed buyer report](../research/takeoff-directed-release-2026-09-17/REPORT.md):
  buyer-by-buyer outcomes, retained originals, interpretation failures and limits.
- [Separate integrated cohort](../research/integrated-buyer-2026-09-18/REPORT.md):
  a different acquisition, with its own outcomes. Do not pool or replace the two.
- [Current integration and draft next plan](../research/takeoff-recipient-integration-2026-09-18/REPORT.md):
  what the revised instrument does and what still needs live qualification.

- [Full-inventory schema-5 cohort](../research/full-inventory-buyer-2026-09-18/REPORT.md):
  zero complete journeys out of four; capture and interpretation gaps remain.
  This acquisition predates the schema-6 controller and does not qualify it.

- [Retained receipt controls](../research/receipt-verifier-controls-2026-09-19/REPORT.md):
  published-verifier checks of real historical and paid certificates, wrong keys,
  tampering and missing evidence. Controller checks, separate from native journeys.

Historical reports describe the software at their acquisition date. Their
outcomes remain unchanged after a repair. Public records omit raw local traces;
those stay in the private acquisition directories and keeper backups.

## Preview without launching an agent

Run these from the repository root. This shows the buyer prompts, recipient
instructions and budgets. It does not create the output directory or call models.

```sh
npm run buyer:cold -- \
  --plan research/takeoff-recipient-integration-2026-09-18/plan.json \
  --out /tmp/scvd-next-buyers
```

To check the instrument with local fixtures, without native agents or payments:

```sh
npm run buyer:test
```

The next plan is a **draft**, not an acquired or qualified cohort. It keeps the
existing zero-payment and historical-freshness limits. The September 7 snapshot
used by earlier buyers leaves that 14-day window on September 21 at
02:30:20.531 UTC. A later buyer needs suitable newer evidence or an honest
incomplete result; never widen the window to obtain a pass.

## Qualify, acquire, then hand off

The following commands launch real model sessions and consume model usage,
although the plan permits no payments. They are operating instructions, not a
record that these sessions have run. Use new output paths for a new experiment.
Do not run overlapping native sessions or heavy tests, and keep the host awake;
any detected timing interruption remains part of the result.

First freeze the intended plan, models, budgets and instrument. The capability
phase tries public-byte retention and local signature checks for buyer hosts,
then separately tests local work using the offline recipient adapter. It does
not prove a buyer journey or comprehensive sandbox isolation.

```sh
npm run buyer:cold -- \
  --capability research/takeoff-recipient-integration-2026-09-18/plan.json \
  --out /tmp/scvd-next-capability --run
```

Inspect `/tmp/scvd-next-capability/capability.json`. The offline recipient must
pass before acquisition. Failed buyer-host probes are recorded and their buyer
cells are skipped. Changing the plan, instrument, CLI, environment or detected
local skills invalidates qualification; do not edit the saved qualification.

```sh
npm run buyer:cold -- \
  --plan research/takeoff-recipient-integration-2026-09-18/plan.json \
  --out /tmp/scvd-next-buyers \
  --qualified /tmp/scvd-next-capability --run
```

The buyer phase runs serially. Before it starts, it freezes the plan, source,
host context and exact recipient prompt. Every buyer gets its own `run.json`,
`events.jsonl` and retained `evidence/`. It does not automatically launch recipients.

For an eligible cell, preview its handoff first. Use an exact cell ID from the
plan; the example below is one of that plan's directed cells.

```sh
npm run buyer:cold -- \
  --recipient /tmp/scvd-next-buyers --cell codex-directed-r1
```

Add `--run` to execute that cell's recipient once:

```sh
npm run buyer:cold -- \
  --recipient /tmp/scvd-next-buyers --cell codex-directed-r1 --run
```

Repeat serially for the other eligible cell IDs, never for the same cell twice.
An eligible buyer completed successfully without a budget stop or timing
interruption. Its capture can still contain gaps, which remain explicit and
prevent full acceptance. The recipient receives all captured files, unchanged,
plus the buyer's verbatim final report. No reviewer chooses a flattering subset,
fetches a replacement or labels a file authenticated before the recipient checks.

## Retain the original and check signed scope

The focused buyer skill supplies separate commands to save the complete cited
snapshot and issuer-key response before inspecting either. The inventory
recipient prompt includes a one-call example using the two supplied verifier
modules, with the size allowance derived from the frozen plan. No new package
or evidence fetch is required. The example prints only exact-subject rows from
successfully verified `signed_claims`, with observation and publication times
separate; it refuses incomplete evidence and unsupported artifact shapes.

This is [guidance and example validation](BUYER_RETENTION_SCOPE_2026-09-18.md),
not a fresh native acceptance result. The example is part of the frozen prompt,
so earlier qualification cannot be reused after this change. Budgets, offline
qualification, one-attempt gates and the observation-age policy stay unchanged.

## What to inspect after a handoff

Within each buyer's `recipient/` directory:

| File | What it establishes |
| --- | --- |
| `attempt.json` | The single reserved attempt. Its directory prevents a retry, including after a crash. |
| `inputs/input-manifest.json` | Source hashes, every supplied file, capture gaps and separately supplied verifier machinery. |
| `inputs/buyer-handoff.md` | The buyer's verbatim final explanation. |
| `launch.json` | Exact prompt, offline adapter arguments, model, budgets and input-manifest hash. |
| `events.jsonl` | What the recipient actually did and its final explanation, if any. |
| `run.json` | Completion, stop reason, timing, trace hash and the exact buyer/input-manifest binding; review is still required. |
| `failure.json` | Preparation/launch failure, when present. The attempt stays consumed. |

The agent works in a separate temporary copy; pre-launch input bytes remain in
`inputs/`. Network access and web search are disabled through the existing Codex
adapter settings. A prompt is not itself an isolation boundary, and the generic
probe is not proof against every possible escape.

A reviewer records interpretations and hash-bound evidence in each buyer's
`review.json`, following the existing [review contract](../research/BUYER_COLD.md)
and the examples in the saved cohorts. For schema 6,
`recipient.run` must reference `recipient/run.json` with its SHA-256, and
`recipient.evidence` must include `recipient/events.jsonl` with its SHA-256.
A stopped, malformed, missing-final or altered recipient cannot establish full
acceptance. Correct signatures alone do not establish correct interpretation.

Only score the new cohort after preserving its acquisition score separately:

```sh
npm run buyer:cold -- --score /tmp/scvd-next-buyers
```

This command writes `score.json`; it is not a read-only report viewer. Never use
it to overwrite a historical acquisition or reviewed score. Review files remain
necessary: the harness does not let a model award itself a pass.
