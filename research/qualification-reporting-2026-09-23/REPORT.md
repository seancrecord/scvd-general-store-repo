# Qualification reporting failure and repair — September 23, 2026

**Both online buyer hosts passed the fresh qualification; the offline recipient failed because its saved report contradicted its verifier. Zero buyer journeys launched.** The existing gate rejected the mismatch. This change asks all qualification hosts to write computed verification results directly to their report, then derive their final explanation from that saved report.

## Observed failure

The keeper authorized a separate qualification after the earlier power interruption. The [new freeze](freeze.json) is at 19:10:36 UTC on `4be8dc24c2b44021bd3b1ed3226185af0551532b`, after fresh public readback of the merged #899 guidance. The [plan](plan.json) retains the earlier models, budgets, exact subject, verifier hashes and fourteen-day observation-age limit. The prior interrupted qualification remains closed and unchanged.

Codex and Claude passed the online checks. The offline Codex recipient retained the reference bytes exactly and completed its local OpenSSL command. That command reported `a=false, b=false, c=true, d=false`; the recipient then wrote `a=true` in its report and final answer. Reading the saved report did not correct that discrepancy. Independent Node crypto verification of the retained bytes agrees with OpenSSL and the frozen expectations. See the [controller cross-check](recipient-report-crosscheck.json).

The private recipient trace records the actual command result at line 13, the incorrect claim at line 14, the saved report readback at line 18 and the final report at line 19. [File hashes](private-file-hashes.json) bind those private traces and captures without republishing host configuration. The raw archive is retained with the keeper as `signed-row-buyer-2026-09-23-r2`.

All three probes completed without timing interruption; all 31 power samples showed AC. The controller launched no heavy tests during qualification. Zero to two workerd processes were sampled, so this is not a claim of an otherwise idle machine. The [outcome record](qualification-outcome.json) preserves runtime, tool counts and timing separately from interpretation.

This is a reporting failure in a generic qualification, not a failed cryptographic library or a product evidence verdict. The buyer cohort never launched. Earlier qualification and buyer scores are unchanged; no failed attempt is retried or relabeled by this change.

## Guidance change and checks

The online buyer and offline recipient qualification prompts now share one instruction: serialize the computed hash and signature results in the same local program that verifies them, avoid manually transcribing booleans, and derive the final answer from the saved report. If verification or report writing cannot complete, report incompleteness. No verifier implementation, expected answer or product-specific workaround is supplied.

The scorer, random tampered vectors, report comparison, retention checks, attempt policy, models, budgets and freshness rules are unchanged. A regression reproduces correct tool output followed by an incorrect retained boolean and confirms rejection. The prompt regressions fail on the previous online and offline guidance; all 207 focused instrument checks pass after the change. The integration fixture computes and serializes actual Ed25519 results through the offline adapter. [Validation](validation.json) separates local/hosted checks from native evidence.

These checks establish the instruction contract and existing rejection behavior. They do not establish that a model will follow the instruction or that buyer reliability improved. Changing the instrument invalidates the old qualification for future acquisition; another live experiment needs a new freeze and fresh qualification of both buyers and the offline recipient. The [buyer milestone](https://github.com/seancrecord/scvd-general-store-repo/issues/803) remains open. The separately owned OpenAPI repair is outside this change.
