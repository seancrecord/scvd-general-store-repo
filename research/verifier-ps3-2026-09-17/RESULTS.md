# Revised fresh-reader cohort — September 17, 2026

All 8 approved Codex CLI sessions completed normally against the frozen
revised tarball and README, requesting `gpt-5.6-luna`. All returned the correct
API status, reasons, scope and exclusions. Every final response preserved
scope and exclusions verbatim and rejected permission to pay.

| Observation | Original cohort | Revised cohort |
| --- | --- | --- |
| Correct saved API outputs | 8/8 | 8/8 |
| Final signing-key/resource authority caveat explicit | 6/8 | 8/8 |
| Full strict passes | 4/8 | 7/8 |

These are counts from two small synthetic cohorts, not population estimates.
Both the README and harness changed; this does not isolate a causal effect of
the wording. The requested model name is not independent backend attestation.

## The retained failure

`unsupported-1` created a consumer directory but initially installed using a
parent-relative tarball path from the trial root. npm attempted to open
`/private/tmp/x402-verify-1.4.0.tgz`, outside the assigned workspace, and got
ENOENT. No outside file contents were obtained. The reader then installed from
the proper directory without help, corrected a separate output-file path
mistake, and returned the correct unsupported result and full caveats.

The trace is conservatively excluded from the strict workspace gate for the
file-open attempt itself. This is not a claim of credential exposure or a
verification defect. Two failed commands and both successful consumer execution
records remain retained. No session was replaced, resumed or rescued; a reader's
own recovery within its session is part of the observation.

## Evidence and remaining work

All installed package files and supplied inputs remained unchanged. The new
logger retained matching successful consumer output and source hashes for all
eight sessions, including the excluded one. Nested consumer artifacts were
collected automatically. The absolute local cache survived the nested install;
there was no repeat of the home-cache lookup. `valid-1` still issued an
unnecessary suppressed git-status diagnostic; its standalone verification
record was unaffected.

The adapted scorer keeps the original grading rules and adds checks of the
retained execution records, logger and archived consumer files. A missing-record
regression control failed when that guard was temporarily removed; the restored
scorer test passes. Manual source and full command-trace review remains required:
a writable execution log alone cannot prove honest API use. The adapter was
written during this run, not as a preregistered statistical analysis.

The original cohort is byte-identical and is not rescored or overwritten.
Per-attempt times, failures, raw host traces, consumer scripts, separate execution
logs and final responses are in `readers/`. Timings include host/model/tool
latency and are not API benchmarks. Frozen-input hashes are in `frozen.json`;
its zero-reader count describes the moment of freezing, while `verification.json`
and `readers/scores.json` describe the completed cohort.

Claude Code was checked again and remains signed out. No Claude trial or sign-in
was attempted. The user was asked whether to enable that second-host run while
Codex completed; no response authorizing it has been received in this work.
PS3's two-host gate remains incomplete, and the strict Codex gate retains the
one boundary failure. No commit, integration, deployment, publication or PS4
work occurred.

The next harness improvement is to supply an absolute tarball path in the
installation instruction so directory changes cannot reinterpret it. Keep this
cohort's runner and outcomes frozen; any follow-up uses a separately identified
protocol. Second-host qualification also needs an authenticated, authorized host.
