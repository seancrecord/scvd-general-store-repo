# Empty-source-directory qualification — October 1, 2026

**Closed: Codex online pass, Claude incomplete at the call cap, offline capability pass. No buyers or buyer-recipient handoffs launched.** Prior qualification and buyer scores are unchanged. This is not a buyer acceptance result.

## Change and freeze

PR #954 adds explicit `package_source_directories: true`: empty parent directories derived from the existing pinned review paths, prepared before online process startup. Prompts disclose them and run records retain them. No source files, answers or review decisions are preloaded. Budgets, models, permissions, source-review choice, scoring and offline recipients remain unchanged. The code was locally validated and frozen at `b03a5532f791f5139836fa0caca8fb1dd3981bb0` before hosted CI/merge; later record commits do not alter its instrument.

Fresh public and source readbacks matched source. All 27 installed x402-verify 1.9.0 files matched, and registry signature/attestation checks passed. The exact-subject candidate observation remains September 21, within the unchanged fourteen-day policy at preparation. Preparation evidence was not supplied to native agents. Four regression controls failed before the software repair; all 90 qualification and 295 buyer controls, typecheck and build checks pass. Eight closed prompts reproduce byte for byte without the new condition.

## Observed sessions

| Session | Result | Wall time | Calls |
| --- | --- | ---: | ---: |
| Codex online | Pass, installed report reproduced independently | 108.951 s | 9 |
| Claude online | Incomplete; call-cap stop before installed report | 87.648 s | 21 observed / 20 cap |
| Codex offline capability | Pass | 96.486 s | 10 |

Both online run records name `evidence/source` as prepared. Codex used 5,200 output tokens versus the advisory 2,500 target; offline capability used 4,313 versus 1,800. Claude's final usage is unavailable, not zero. All 60 condition samples show AC power and zero Vitest/workerd processes. No controller tests ran during native qualification. No native timing interruption occurred. No causal speedup or general reliability inference follows from this small changed-condition comparison.

Claude's trace records a compound curl plus trailing echo denied at lines 7–9, then a successful standalone curl at 20–21. Its recorded `commands_denied: ["curl"]` is overbroad: the trace proves a refusal of that invocation, not inability to run curl. A compound mkdir/curl command was denied at 35–37 even though the source folder was already prepared. All six standalone source downloads then succeeded at 39–50; the earlier absent-folder write failures did not recur in this attempt.

The source hash-check/display succeeds at 52–53, with a 2 KB preview of a 78.1 KB persisted display. The agent spends additional calls reading slices, including a mistaken first match for payment-identity before a corrected section read. A proceed decision is written at 81–82 and the exact pinned installation succeeds at 84–85. Call 21 attempts to write the synthetic original at 87; no result for that call, original fixture, installed runtime copy, CLI report or completed final remains. The last available message at line 86 is exported as a last message. Basic retention and signature-vector checks pass, but the package-report gate is incomplete. There was no package refusal.

## Workspace-boundary observation

Claude used Node to read the host's same-session persisted inspection display under its project tool-results directory, outside the neutral workspace. The trace exposes this at lines 58, 63, 68, 73 and 78. A post-run copy of that exact display is retained under `host-output/`, with path/hash metadata. Reproducing the inspection over captured source bytes gives the same display byte for byte. This does not introduce replacement evidence, prove a full source read, or establish compliance with the workspace-only instruction. No unrelated private content is observed; the broader filesystem-isolation claim is not established by this run. The frozen automated capability scorer does not decide that separate manual observation, and the failed qualification is not rescored.

Review prose is retained as written, including safety and full-read claims the controller does not endorse. A source hash, truncated display, comments saying no call home, or a model's pattern scan is not independent proof of safety or comprehension.

## Evidence and next step

The private archive contains every actual trace, error, prompt, launch, retained artifact and frozen instrument, plus two verbatim completed finals and one labelled last message. Both evidence catalogs link every Markdown file. All byte inventories are destination-hash checked. No buyer score or acceptance denominator was added.

The empty-directory condition is implemented and its behavior observed, but it did not produce a complete Claude qualification. Further work should review the qualification workflow as a whole: source inspection's large output, host-persisted output outside the workspace, redundant tool probes and compound-command refusals. Do not rerun this unchanged condition until it passes, add another warning as a claimed fix, relax the evidence gate, or increase limits without explicitly defining a new experiment. Signed-original acquisition and interpretation remain separate buyer findings. TR3, merchant/platform qualification and deferred PS5 buyer/model qualification remain open.

Archive index correction: the archived controller report labels the first host-output read as line 59 (its result); the command is line 58, corrected above. The archived report and native trace remain unchanged.
