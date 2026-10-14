# Source-review qualification — September 30, 2026

**Both online package qualifications are incomplete; the offline capability check passed. No buyer cohort launched.** The two online failures have different causes: Codex completed the package workflow but the frozen command recognizer rejected its equivalent shell quoting; Claude recorded a voluntary decline because it expected to exceed the remaining call budget. The earlier qualification and the latest actual buyer cohort (2 complete journeys / 4) remain unchanged.

This is one separately frozen attempt per required host, using source commit `4cbf7ea9` from PR #946 before that PR's hosted CI/merge. Local validation had passed. The plan explicitly adds source review, with public source commit `25be137d516d502a536062145058176e91e1ce78` and the same x402-verify 1.9.0 runtime hashes. The models, budgets, zero spend, recipient protocol and fourteen-day observation policy remain unchanged. Battery operation was keeper-approved. It is not a causal comparison with the earlier run.

## Native observations

**Codex:** fetched all six source files; their retained hashes match the pin. Its inspection command completed before installation. The host rendered that command with concatenated single/double-quoted fragments, which the frozen recognizer's finite string list did not recognize. The retained native decision is `proceed`. Installation and CLI execution completed; all six installed runtime files match, and the generated signed-fixture report reproduces independently. The recorded result nevertheless remains `incomplete: no completed source inspection`. That is a controller recognition defect, not an observed package failure or model refusal. The inspection tool output contains a truncation marker; subsequent selective source inspection is visible. Retained complete source bytes do not prove complete native reading or comprehension.

**Claude:** completed generic fetch/retention and randomized signature checks, after denied curl, heredoc/compound and Node invocations and several calls reaching for a Write tool not present in this session. These are invocation-specific outcomes, not proof curl or Node are generally unavailable. It fetched all six matching source files, ran the provided inspection command, and wrote a `decline` receipt. Its stated reason is anticipated call-budget exhaustion, explicitly not a source-safety objection. No npm installation or installed CLI attempt occurred. The controller observed 17 tool calls and completion before the wall deadline, without a hard stop. The claim that it needed at least four or five more calls is the agent's own estimate, not a measured impossibility. Its source-safety statements are untrusted model output, not this report's assessment.

**Offline capability:** passed the independent local copy/hash/signature check. This is a generic recipient capability probe, not a buyer handoff. No new buyer journal or buyer-recipient report exists.

## Instrument correction, after closure

After all three native sessions ended, the retained Codex command was used in a synthetic regression. It failed against the frozen recognizer. The follow-up matcher compares literal shell argument vectors, handling concatenated quoting without executing or evaluating the recorded command. Expansion, operators, redirects, extra arguments, nested shell wrappers and compound commands are rejected. The same valid native spelling now passes the synthetic fixture; malicious/nonliteral controls remain rejected.

**No original score was recomputed or replaced.** The correction belongs to a later source state in PR #946 and requires a new frozen qualification before use. The native archive retains the exact pre-correction instrument. This correction alone does not address Claude's setup friction or establish a complete cross-host workflow. No replacement native attempt was run.

## Retention and limits

The private archive `source-review-buyer-2026-09-30` contains the complete traces, prompts, launch context, frozen instrument, original public readbacks, pinned source copies, native review decisions and three verbatim Markdown finals under `native-reports/`. Public [report index](native-report-index.json), [run summaries](qualification-runs.json), [controller checks](controller-checks.json) and [archive inventory](private-file-hashes.json) bind the observations to retained bytes. Native reports are untrusted and may contain errors or ephemeral links; they remain verbatim.

The immutable public source bytes matched the runtime pin before launch; a fresh npm installation and registry signature/provenance check also passed. Those are controller preparation checks, not a native provenance audit or a safety warranty. Candidate historical evidence remained fresh under the existing policy, but was never supplied to a buyer because no buyer launched.

All hard budgets and timing guards stayed fixed. Advisory output-token targets were exceeded. Condition sampling cannot establish uninterrupted absence of competing processes. No controller software tests overlapped native acquisition; tests of the correction began after the qualification process ended. Any future experiment must identify its changed condition, preserve refusals and every attempted run, and clear all host gates before buyers start. Merchant/platform acceptance remains downstream.

## Runtime accounting

| Qualification | Wall time | Tool calls | Frozen result | Output tokens (advisory target) |
| --- | --- | --- | --- | --- |
| codex | 132.564s | 8 | incomplete | 6,277 (2,500) |
| claude | 201.033s | 17 | incomplete | 18,835 (2,500) |
| recipient | 105.664s | 7 | pass | 4,724 (1,800) |

All 88 condition samples recorded battery power; 4 samples contained external test processes (maximum one vitest and two workerd), between 2026-09-30T14:17:02.179237+00:00 and 2026-09-30T14:18:28.169104+00:00. No session had a timing interruption or hard budget stop. The overlap is disclosed without attributing a model decision to it.

Requested Codex model was gpt-5.6-luna; its trace exposes no resolved revision. Claude resolved to claude-sonnet-5. Native output-token accounting differs by host and is reported as supplied; tool events are not origin request counts.
