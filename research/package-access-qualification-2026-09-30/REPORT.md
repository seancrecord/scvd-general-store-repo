# Package-access qualification — September 30, 2026

**The buyer cohort did not launch.** Codex passed the installed-report qualification; Claude completed the generic checks but explicitly declined the package installation and execution. Its package qualification is incomplete. The separate offline recipient capability check passed. This is a retained qualification outcome, not a four-buyer failure count. The previous September 28 buyer cohort remains closed at 2 complete journeys / 4.

The keeper explicitly permitted battery operation. The qualification used the merged #932 instrument from source recorded in `freeze.json`, existing models and budgets, x402-verify 1.9.0, zero spend and one attempt per online host plus the separate offline capability check. No attempt was restarted, rescored or given wider permissions. Buyers were conditional on all qualifications passing; that condition was not met.

## Observed behavior

- **Codex:** installed the exact pinned public package with lifecycle scripts disabled; ran its CLI on the synthetic signed fixture; retained all six pinned runtime files, original and generated Markdown report. All hashes matched and the report reproduced independently. A zsh wrapper error occurred and was recovered within the same session; its trace is preserved.
- **Claude:** fetched and retained the public reference and correctly checked the randomized signatures with Node. A `cat` heredoc was denied and a subsequent attempt to run the missing script failed; both remain visible. It then declined npm installation and package execution on its own stated supply-chain grounds. No npm install command was attempted, so this run establishes neither an npm permission denial nor successful access. The exact npm command was present in the frozen allowlist.
- **Offline recipient capability:** completed the local copy and randomized signature checks using OpenSSL after a missing Python dependency and a self-written verifier error. Those errors remain in the trace and retained diagnostics; there was no restarted session. This is a generic offline capability check, not a buyer handoff.
- **Reporting discrepancy:** Claude wrote `commands_denied: ["npm"]` into its own retained report, but the event trace shows the `cat` denial and no npm attempt. Its final text explicitly describes a voluntary refusal. Preserve all three accounts; use observed command events for permission claims. The classifier already returns incomplete package qualification.

This refusal is evidence about this one directed session. It is not proof the package is unsafe, that Claude generally cannot use it, or that another prompt would succeed. The controller's source/hash/provenance checks do not override a native agent's decision. No attempt was made to persuade this session to change its refusal.

## Conditions and public inputs

Preparation first detected a guide mismatch against the older checkout. The live guide and GitHub main agreed: a newly merged paragraph explains protocol-specific `inspection` readings and unmeasured MPP history. The isolated checkout advanced to current merged main before freeze. Initial mismatching readbacks remain saved; no native session ran against them. This changed guide is an additional condition, not a controlled comparison with September 28.

A fresh npm installation matched source and all frozen verifier files; registry signature and provenance checks passed. Public snapshot 10's signature verified and its exact endpoint observation remained within the frozen fourteen-day age limit. These are controller preparation checks, not buyer acquisition. Public-key consistency does not independently establish issuer identity.

The battery waiver, fresh public readbacks, source and plan hashes, CLI context, retained inputs and native traces are preserved. The condition log samples battery state and concurrent test processes; it does not prove absence between samples. No controller software tests ran during native acquisition. See `execution-conditions.json` and `qualification-runs.json` for actual sampled overlaps, timing guards, budgets and advisory token usage.

## Evidence and next step

The private archive `package-access-buyer-2026-09-30/native-reports/` contains verbatim qualification finals with source-trace hashes. The public [native-report index](native-report-index.json) and [complete archive inventory](private-file-hashes.json) identify the retained files; full native traces and host configuration remain private. Qualification evidence includes Codex's generated `installed-report.md`; there are no new buyer journals, buyer finals or recipient handoffs. Earlier AURa and buyer records are unchanged.

The next work is a separate investigation of the refusal and the package's existing inspectability/provenance path. Preserve voluntary refusal as its own observation, distinct from tool denial. Any future qualification must have a new frozen plan and a stated change; do not retry this closed attempt, widen permissions to force a pass, or attribute improvement to one condition. TR3 stays open, and merchant/platform qualification remains downstream.

## Runtime accounting

| Qualification | Wall time | Observed tool calls | Result |
| --- | --- | --- | --- |
| codex | 104.389s | 7 | pass |
| claude | 80.642s | 7 | incomplete |
| recipient | 133.415s | 7 | pass |

All three sessions completed without a hard budget stop or timing interruption. All 65 condition samples recorded battery power. 13 samples recorded concurrent test processes (maximum one vitest / thirteen workerd), from 2026-09-30T13:22:55.745489+00:00 to 2026-09-30T13:27:08.711885+00:00; these were outside this controller. This overlap is a confound, not a causal explanation for the explicit refusal.

The advisory output-token targets were exceeded: Codex reported 4,474 output tokens against 2,500; Claude reported 8,828 against 2,500; the offline recipient reported 6,440 against 1,800. These targets were advisory in the unchanged instrument; wall-time, tool-call and output-byte limits remained hard. Requested Codex model was gpt-5.6-luna; its traces expose no resolved model revision. Claude resolved to claude-sonnet-5. Tool calls are not origin request counts.
