# Native qualification — September 17, 2026

**Subsequent acquisition:** [Native isolation repair and eight-buyer result](../takeoff-native-isolation-2026-09-17/REPORT.md) qualifies both hosts under a new adapter. This earlier failed probe remains unchanged. Start with the new report for current pickup.

**The capability gate stopped the next buyer cohort.** Claude passed;
Codex retained the public file but misverified the synthetic signatures.
Both native sessions completed normally. No buyer or recipient cell was
launched, and no product repair is justified by this generic host failure.
The [machine-readable record](probe-native-2026-09-17.json) carries results,
instrument hashes and the manifest of every private file.

This follows [the instrument handoff](HANDOFF.md), merged in
[#774](https://github.com/seancrecord/scvd-general-store-repo/pull/774).
The package/skill release is complete separately in
[#772](https://github.com/seancrecord/scvd-general-store-repo/pull/772);
this work does not start PS5.

## What ran

One native probe per host, using the exact frozen `plan.json` and the
unchanged schema-4 adapter from repository base `ee432b17`. Both hosts
were signed in. The subject answered an operator's unpaid request with
402; that precheck is not a buyer capture or evidence of paid completion.

| Native host | Retained bytes | Signature check | Outcome |
| --- | --- | --- | --- |
| Codex CLI 0.153.4, requested `gpt-5.6-luna` | pass | fail: reported all four false; expected a/b/d true, c false | unqualified |
| Claude Code 2.1.274, requested `sonnet`, resolved `claude-sonnet-5` | pass | pass: a/d false, b/c true | capability pass |

The hosts received different random vectors. Each retained the exact
public response and its correct SHA-256. Codex recorded three shell
commands, two unsuccessful, with no command denial. Claude recorded eight
successful commands and no denial. Neither hit a budget stop; the output
token targets are advisory. The original result and trace files are intact.

## Why Codex failed

Its OpenSSL commands decoded the public key from hexadecimal but supplied
the signature as hexadecimal text instead of binary bytes. It interpreted
the resulting failures as invalid signatures. The attempted Python
crosscheck could not import `cryptography`; it established no verdict.
Repeating the same OpenSSL command was not an independent verification.

An operator rechecked the saved vectors with Node crypto and OpenSSL using
binary files. Both agreed with every expected result. A separate local
reproduction of the exact saved command for vector a failed; changing only
the signature input to decode its hex made it pass. Shell quoting and
process substitution were left unchanged. These are diagnostic checks,
not a repaired acquisition or a new native-host pass.

Claude's trace was reviewed: its curl command retained the file and its
Node command computed the recorded verdicts with `crypto.verify` over an
SPKI-wrapped key. Its capability result is supported by the visible actions.

## Isolation remains unresolved

The Codex trace reports that skill descriptions were shortened to fit the
context budget despite the frozen `skip_host_skill_discovery` and config
controls. No explicit skill reads appear in the visible trace. The warning
does not identify which skill metadata reached the model and does not prove
SCVD-specific contamination. It does prevent treating the intended isolation
as established. No global settings, installed skills or adapter flags were
changed to suppress it.

Local CLI help and OpenAI's current non-interactive/skills documentation
were read; the dated sources and limits are in
[`docs/SPEC_READS.md`](../../docs/SPEC_READS.md#2026-09-17--native-cold-host-qualification).
The offline prompt debugger does not accept exec's `--ignore-user-config`;
its output alone would not prove what the frozen exec launch saw.

## Preservation and validation

The original probe has 31 files; the separate operator diagnosis has seven.
All 38 files were copied and byte/hash verified into the new durable private
directory `~/scvd-takeoff-handoff-2026-09-17/native-capability-2026-09-17/`.
`MANIFEST.json` there contains the same file manifest as the public record;
`probe/` contains the original acquisition and `diagnostics/` the later
operator checks. Raw traces contain local session metadata: keep them private.
The earlier eight-buyer/four-recipient corpus beside this directory is untouched.

The buyer instrument's 114 offline controls passed before launch. Typecheck,
the document check and diff whitespace checks passed for this record, with
every CI shard required before merge. No implementation, frozen plan, permissions,
previous score or published package changed.

## Next bounded work

**Subsequent offline repair:** [SCORING_REPAIR.md](SCORING_REPAIR.md) records
the schema-4 portable-evidence scoring mismatch and its regression controls.
No further native probe or buyer cell was launched for that repair.

1. Establish the actual skill context of the native Codex adapter before
   calling a later cohort cold. Investigate launch controls without changing
   the keeper's global configuration. Preserve this warning and failed probe.
2. If an adapter change is necessary, record a new instrument boundary and
   qualify both hosts again under it. Check probe/cohort instrument equality
   explicitly: the present automatic qualification gate binds plan bytes,
   not equality of every captured instrument file. Do not reuse this Claude
   pass to qualify a changed adapter.
3. Declare any new qualification attempt and its reason before launching;
   do not repeat until green, silently coach the signature answer, or
   overwrite this result. Only a separately recorded pass from both hosts
   permits the frozen eight-cell buyer cohort to proceed.
4. Then follow the original handoff: recheck merchant reachability, run the
   eight cells, review every trace, provide retained usable signed evidence
   to fresh recipients, rescore and preserve originals. Only repeated buyer
   failures on qualified hosts justify product repairs.

The September 7 observation leaves the frozen 14-day window after
September 21. A later run needs newer signed evidence or records that stage
incomplete; do not widen the window. No payment, wallet/private-key access,
directory signing, account creation or outbound admission message occurred.
No probe, buyer or recipient model process remains running.
