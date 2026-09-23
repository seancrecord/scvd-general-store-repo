# Qualification tool errors — September 23, 2026

Both online hosts passed the first qualification after #902; the offline recipient failed. **Zero buyer journeys launched.** The recipient serialized computed results correctly, but its local program treated a verifier usage error as an invalid signature. The existing gate rejected the report. Earlier scores remain unchanged.

## Observed failure

The [freeze](freeze.json) records source `d8a5c0ef81d079e49b21a3c8d64f10408bff8eed` at 20:18:08 UTC. The [plan](plan.json) preserves models, budgets, exact subject, recipient scope, pinned verifier hashes and the fourteen-day freshness limit. All three native sessions completed without a timing interruption; all 29 power samples showed AC. Sampled vitest and workerd counts were zero, which does not establish absence between samples. See the [outcome](qualification-outcome.json).

The offline recipient first attempted Python cryptography, which was unavailable. It then wrote an OpenSSL program using `pkeyutl -inform DER`, captured but suppressed stderr, and mapped every nonzero exit to `false`. Its report and final explanation classified all four signatures as invalid, including the valid vector. Native trace lines 13–21 preserve the failed import, adaptation, saved report and final claim.

[Controller replay](openssl-replay.json) reproduces `Unknown option: -inform` for all four original invocations. Changing that option to `-keyform DER` yields the frozen truth: a=true; b/c/d=false. An independent [Node cross-check](node-crosscheck.json) agrees. These diagnostic replays do not replace native evidence, retry qualification or change its failed score. The copied native program is separately labeled in the private archive. The [hash inventory](private-file-hashes.json) binds private traces, outputs and diagnosis; the keeper retains the archive as `computed-report-buyer-2026-09-23`.

This is an agent-authored verifier invocation and error-interpretation failure. It is not an observed invalid store artifact. One correct serialization does not establish reliable qualification or a causal effect of #902.

## Repair and limits

Both qualification prompts share guidance requiring operational errors to be distinguished from invalid signatures. A nonzero exit alone is not a signature verdict. Verifier stderr, exit status and exceptions are retained in `evidence/verification-diagnostics.txt`. If verification cannot run, the host leaves `capability.json` unwritten and explains the incomplete check; it must not manufacture booleans from tool errors.

The instruction does not supply a verifier implementation, reveal random expected answers, alter scoring or broaden budgets. The existing scorer continues to reject an all-false report even when its wrapper exits successfully. Online and actual offline-launch prompt regressions are shown failing on the old instruction before the repair. Automated tests establish the prompt contract and rejection behavior, not model compliance. A new native run must be separately frozen and must qualify every adapter before buyer acquisition.

The September 20 buyer cohort stays at 1 complete / 4. This attempt adds no buyer denominator. The [buyer milestone](https://github.com/seancrecord/scvd-general-store-repo/issues/803) remains open; merchant proof and platform adoption remain downstream. The candidate endpoint observation ages out at 2026-09-28T01:30:09.376Z. Publication does not refresh that observation.

Local validation passed: 829 files, 15,495 tests passed, 1 skipped, zero failed. All 242 buyer checks, typecheck, production bundle checks and documentation checks passed. Hosted checks and a separately frozen native qualification remain pending. See [validation](validation.json).
