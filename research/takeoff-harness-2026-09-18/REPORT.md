# Recipient scope and live readback — September 18, 2026

The delivery recommendation is merged and publicly observed. The new handoff preparer supplies an explicit recipient inventory. This is
instrument repair and an offline preparation control, not another buyer cohort.
The September 17 acquisition, reviews, scores and raw captures remain unchanged.

## Deployed guidance

[PR #792](https://github.com/seancrecord/scvd-general-store-repo/pull/792)
merged as `fb9bb6f02c0449119424a7fd2c62363cb87518f1`, with required checks green.
[Public readback](live-delivery-readback.json) records both actual preflight
POST responses against the original public merchant: L4–L6 now names
`launch_check`. The linked compact contract returns 200, the unsigned purchase
request returns 402 with payment terms, and `/corrections` publishes the dated
withdrawal of the unpaid-watch recommendation. No payment was signed or sent.
This does not establish successful merchant delivery.

## Integration boundary

The parallel [PR #799](https://github.com/seancrecord/scvd-general-store-repo/pull/799)
implements interruption-aware timing and schema-5 recipient protocol freezing
in the same runner. This PR deliberately leaves those changes to that work. The common integration point here adds the
preparer to the exact frozen instrument and supplies a backwards-compatible
raw-byte evidence reader. Rebase and reconcile the instrument list when the
parallel work merges; do not keep two timing implementations.

The schema-5 launch helper currently freezes a signed-pair subset with fixed
input names. This preparer is not automatically wired into that launch helper:
the controller must reconcile the chosen input names and scope and freeze the
exact recipient prompt and manifest before use. In particular, do not supply a
whole-report inventory while still launching the old subset prompt, or replace a
previously frozen prompt after acquisition. Once-per-cell execution and actual
offline launch enforcement remain controller duties.

Timing remains required before a new acceptance run: record UTC and monotonic
elapsed time, actual stop/escalation requests and close, preserve partial findings,
and prevent a late clean exit from passing qualification. Observation gaps do
not establish their physical cause. [Node's timer contract](https://nodejs.org/api/timers.html#settimeoutcallback-delay-args)
does not guarantee exact callback timing. Keep this instrument limitation
separate from the original product interpretation failures.

## Recipient contract

[`buyer-recipient-handoff.mjs`](../../scripts/buyer-recipient-handoff.mjs)
prepares files only. It does not launch a model or enforce network isolation.
A separate qualified runner must supply those controls and frozen budgets.

The caller selects every captured file exactly once. Each choice declares
whether it is supplied, cited, and a signature candidate, issuer key, unsigned
context or other material. These are reviewer labels, not authentication
verdicts. The preparer checks hashes and sizes for supplied **and omitted**
captures, binds the source run and transcript, and extracts final buyer text
verbatim. A stopped buyer or a trace without a successful terminal event cannot
be relabeled as a final handoff. It uses raw bytes, including Unicode and non-UTF-8 bodies.

`signature_subset` expressly allows omissions and tells the recipient that
retained-but-omitted material cannot be assessed in its workspace. `buyer_report`
refuses to omit anything marked cited. For a complete retained capture, supplying
all files is the conservative way to avoid incorrect citation selection. Missing
capture entries remain disclosed; the helper cannot prove that the capture or
reviewer's citation inventory contains everything the buyer discussed.

The recipient prompt asks for actual signature results, the exact signed
message, subject, date, expiry and gaps. It distinguishes a single signed
observation from unsigned history and current delivery claims. The public
verifier modules are labeled reviewer-supplied machinery, never a buyer export.

[Offline preparation control](handoff-control.json) copies all 27 retained files
from the existing Codex r1 capture, totaling 11,547,036 bytes. Every supplied
hash matches. This control creates a new workspace and does not alter the old
recipient, acquisition or outcome. No recipient was launched.

To prepare a future handoff, write a selection like this, with one row for
**every** entry in the source run's `retained_artifacts.files`:

```json
{
  "schema_version": 1,
  "scope": "buyer_report",
  "files": [
    {"file": "evidence/original.json", "supply": true, "cited": true, "role": "signature_candidate"},
    {"file": "evidence/key.json", "supply": true, "cited": true, "role": "issuer_key"},
    {"file": "evidence/preflight.json", "supply": true, "cited": true, "role": "unsigned_context"}
  ]
}
```

```sh
node scripts/buyer-recipient-handoff.mjs RUN_DIRECTORY SELECTION_JSON NEW_RECIPIENT_DIRECTORY
```

Review the generated `input-manifest.json` and `recipient-prompt.txt`, then freeze
those exact inputs with the future offline runner and its budgets. The command
refuses an existing destination. Supplied documents remain untrusted data.

## Validation and next acceptance

[Validation receipt](validation.json) records the test commands, source identity,
and results. The 156 focused buyer tests, typecheck and Worker/SDK bundle
checks pass. The full Worker run reports all 782 files but initially fails four
files, including setup timeouts. All four pass unchanged on a one-worker rerun
(269 tests); reconciled coverage is 15,045 passing tests and one intentional
skip. The original failed run is retained as failed. Removing the cited-omission guard makes the whole-report test red.
The Unicode/binary test was red before switching to a raw-byte reader.

Next: merge this preparer through the normal CI gate, integrate the parallel
timing and frozen recipient protocol work, freeze a new justified
qualification, and run generic host capability checks with the exact new bytes
before spending usage on any buyer or recipient. Run sessions serially and avoid
host suspension or competing full-suite load. Do not retry the old cells or
change their outcomes. Do not widen their 14-day freshness policy: the historical
snapshot ceases to qualify after September 21 at 02:30:20.531 UTC. A later test
must explicitly choose suitable evidence and state its own policy before launch.

The next buyer acceptance still needs two complete journeys per host/lane.
Discovery/admission remains separate; merchant and platform flows follow a
dependable buyer flow. This change does not close takeoff readiness.
