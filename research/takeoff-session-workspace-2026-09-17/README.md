# Buyer scratch workspace repair — September 17, 2026

This follow-up changes the trial runner, not a store endpoint or public
skill. No new model trial was launched for this repair.

## Observed cause

Both referred Codex runs in the native-isolation cohort encountered an npm
cache `EPERM` under the native workspace sandbox. The first recovered with
a temporary cache and completed. The second installed its tooling under
`./evidence/tooling`, where dependency files consumed capture capacity.
That run also duplicated a large snapshot/bundle and reached its time cap.
The repair addresses the cache location and evidence-directory confusion;
it does not establish that those were the only causes of the incomplete run.

The original traces remain private in the native-isolation cohort backup.
These identities and completed-command line numbers locate the observations:

| Cell | Trace SHA-256 | Relevant JSONL lines |
| --- | --- | --- |
| `codex-directed-r1` | `9a4a866635c898f45e6735c95408d00271a247b429efbed5d710feb628825603` | 21: default-cache refusal |
| `codex-directed-r2` | `42c538f28ab086bf54440c48cc9ed9a8d6402efcbed821edf4ec86b250be573f` | 37: default-cache refusal; 39: install into the evidence directory |

## Repair and limits

- The common child launcher creates `./work` and supplies a per-session
  npm cache at `./work/npm-cache`. Uppercase and lowercase configuration
  spellings agree; parent npm cache settings are not inherited by the
  allowed environment. No global settings or native permissions change.
- Buyer prompts distinguish scratch tooling from retained decision
  evidence. The folder names come from the same workspace definition used
  by the launcher. No service identity, verification answer or package is
  added to discovery prompts.
- Launch and run records name the workspace policy. Both native hosts,
  capability probes and buyer cells use the same launch function.
- The collector and all capture/time/tool budgets are unchanged. A buyer
  that still puts extra files inside `./evidence` can still exhaust its
  allowance. Scratch is not silently added to its evidence afterward.

Offline regression tests use real child processes and the installed npm
CLI to resolve and write the configured cache. They check both host launch
paths, preserve a clean user-home fixture, and demonstrate that scratch
dependencies do not crowd out an original/issuer pair under a two-file
capture budget. A third evidence file still makes that capture incomplete.
All three new tests failed before the implementation; all 130 buyer controls
pass after it. This checks the launcher, not a live model's use of it or
whether a native host preserves every environment setting in its own tools.

Pre-commit validation also passed typecheck, the Workers bundle check and
the full local suite: 761 files, 14,698 tests passed and one skipped. The
documentation check and source-trace identity checks completed as well.

The runner source and buyer prompt have changed. A future cohort needs a
new freeze and fresh qualification of both hosts using this instrument.
Do not use the earlier host pass or change that acquisition's retained
files, score, caps or interpretation to claim this repair worked live.

## Interpretation findings still open

The referred Claude reports confuse paid observation with proof of delivery
and, in one case, generalize a single verified round into multiple verified
rounds. The saved preflight and focused skill already distinguish a fresh
shape audit from delivery evidence. Repeating that disclaimer is not a
demonstrated repair of these model conclusions.

There is a concrete navigation defect in the focused skill: it says the
corpus instructions are “below,” but its detailed corpus procedure lives
in the linked verifier README. That reference should point to the actual
large-snapshot section. Keep this separate from the runner repair so a later
comparison can distinguish public-guidance changes from host changes.

No paid/free wording, directory publication or public skill changed here.
The remaining test is a newly declared, bounded qualification and buyer run,
with original attempts retained regardless of outcome. No retry-until-green
policy is introduced.

September 17 follow-through: the [separate native qualification](../takeoff-workspace-qualification-2026-09-17/README.md)
confirms cache propagation and writes on both hosts. Codex passed the generic
probe; Claude left it incomplete, so the buyer cohort remains gated. The
navigation correction and an error in the first cache control are recorded
there without changing the original buyer attempts.
