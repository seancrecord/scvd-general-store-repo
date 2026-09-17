# Saved-response verification repair — September 17, 2026

The next bounded repair is an offline `verify-source` command in x402-verify,
prepared as 1.5.0. It verifies an original SCVD response already on disk,
writes no duplicate export files, and prints compact findings with the exact
source-file SHA-256. It reuses the current corpus canonicalization, bundle
constructor and verifier. Existing export/verify commands, cryptography,
formats and result semantics remain unchanged.

This is a measured product repair, not a new buyer-completion result. The
[previous eight-cell cohort](../takeoff-native-isolation-2026-09-17/REPORT.md)
remains 0/4 catalogue completions and 1/4 referred completions. No original
acquisition, score or retention budget was changed.

## Diagnosis

Both referred Codex buyers encountered an unwritable default npm cache and
recovered using a temporary cache. The second installed package files inside
its evidence directory, exported a bundle plus another signed-payload copy,
and exceeded the 32 MiB/32-file retention policy. Its signature check worked,
but its handoff was incomplete when the time cap ended the run.

An [offline replay](offline-replay.json) using the already-retained original
from the first buyer reproduces a separate, deterministic duplication issue:

| Measurement | Bytes |
| --- | ---: |
| Original response | 11,485,079 |
| Independent issuer-key observation | 3,139 |
| Old bundle plus payload copy, excluding README/OTS | 34,706,231 |
| Old verification stdout | 12,873,400 |
| Original plus key retained by the new path | 11,488,218 |
| New verification stdout | 769 |
| Unchanged experiment retention ceiling | 33,554,432 |

The old export alone exceeds that ceiling before retaining the original.
The new path stays below it without compression, changing the signed bytes,
or increasing the experiment's cap. The small report retains validity,
missing-evidence findings, timestamp status and scope limits. Only the
repeated signed claims are omitted; those remain available in the original.

This does not remove every cause of the failed buyer: dependency placement,
time use, and unsupported scope claims remain distinct. The documentation
keeps packages/cache outside retained evidence and gives a per-command local
cache option. No global setting or ownership was changed.

Both Claude referred reports misinterpreted scope, but the retained paths do
not establish one defective shared sentence. The first skipped the linked
free signed snapshot and generalized that authenticity required payment; the
second verified one snapshot but grouped `service_audit` with delivery
observation and generalized one verified snapshot to several rounds. The
skill and preflight they actually read already distinguish free history,
new signed shape audits, and payment/delivery evidence. This repair does not
rewrite those limits or claim to solve those reader failures. The prior
[review record](../takeoff-native-isolation-2026-09-17/reviews.json) retains the
actual commands and incorrect reports.

## Controls and release boundary

Two regressions failed against the old CLI before implementation and pass
with the new command. They exercise an 11 MiB synthetic signed corpus,
blocked network access, unchanged input, no extra files, compact output,
explicit byte limits, absent/wrong independent keys, unsupported corpus
versions, tampering with and without recomputing the digest, and missing or
modified certificate attachments. Existing command tests still pass.

The complete offline evidence suite passes. A [fresh local tarball install](installed-package.json)
verifies the retained public response and matches the reviewed package bytes.
It is an installation control, not an independent buyer or registry-release
claim. Test and build log hashes are in [validation.json](validation.json).
The primary cache-setting read is recorded in [SPEC_READS](../../docs/SPEC_READS.md#2026-09-17--saved-response-verification-and-npm-cache-boundary).

`verify-source` has no network fallback. It accepts only locally supplied
originals and attachments; the independently established public key is still
required. Original responses, source URLs and key observations remain the
recipient's evidence. A short result file is not a substitute. The in-memory
bundle retains its existing size ceiling and supported-format boundary;
Bitcoin, identity, observation truth, freshness and paid delivery remain
outside this command's verification claim.

## Next gate

Registry publication is separate from merging this source. The prepared
version is 1.5.0; inspect installed `--help` before using the new command. The
existing publication workflow requires the keeper's release press or explicit
release authorization. No new publication has been requested by the code.

After the reviewed package is published and a fresh registry installation
matches its bytes, freeze a new referred-lane plan and qualify both native
hosts before two buyer attempts per host. Preserve every attempt; do not
rerun until green. Keep catalogue discovery separate because this command
does not alter registry selection. The old September 7 observation leaves
its 14-day policy window after 2026-09-21T02:30:20.531Z; use newer evidence or
record incompleteness, never widen the window. Native acceptance of this
repair is untested at this stage.
