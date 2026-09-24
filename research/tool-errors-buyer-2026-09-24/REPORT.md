# Directed buyer cohort after qualification repairs — September 24, 2026

**2 complete journeys / 4; 2 interpretation failures; no incomplete journeys.** All four buyers retained valid signed originals and separate key records, and all four offline recipients completed correct verification and interpretation. Both Codex journeys pass. Both Claude buyers ran successful cryptography but made inaccurate claims in their final explanations.

The [buyer milestone](https://github.com/seancrecord/scvd-general-store-repo/issues/803) remains open: two complete journeys per required host/lane are not yet established. This cohort is directed, prompted and unpaid; it does not establish unbranded discovery, paid delivery, organic adoption or causal improvement over earlier cohorts.

## Frozen experiment

The [freeze](freeze.json) is dated 2026-09-24T13:41:17.258Z on source `9bc3abce46345d3c0bb726fb3a0cc268c52089f3`, including #899, #900, #901, #902 and #903. Plan hash: `37ca4a7ed7a06687ce4d3f04cbc758d7154460061f61717691a48e60b9d10d90`. The [plan](plan.json) retains the September 20 models, budgets, exact subject, recipient scope, pinned verifier hashes and fourteen-day observation-age rule; only the stated purpose changes. The September 23 preparation stopped before freeze or native launch while the Mac was on battery; it is not a fifth buyer or an additional qualification attempt.

Fresh public readback found the guide byte-identical to source, valid candidate snapshot bytes, and OpenAPI below its unchanged read budget. Those controller reads were not supplied to native buyers and do not count as native acquisition. The candidate exact endpoint observation is dated September 14 at 01:30:09.376 UTC; it reaches the fourteen-day limit September 28 at that time. September 20 snapshot publication does not refresh observation age.

Both online hosts and the offline recipient passed the [new qualification](qualification-outcome.json) once. They retained the correct bytes and reported the randomly generated signature results correctly. Qualifications still had visible command-handling errors: Claude repeated a denied compound invocation and inaccurately called a simplified successful curl invocation identical; an attempted temporary write outside its workspace was denied. The offline recipient's verification program wrote correct results and diagnostics before its shell wrapper failed on zsh's read-only `status` variable. Subsequent readback confirmed the saved results. These caveats are retained; a capability pass is not proof of perfect instruction compliance. No permissions were widened and no controller supplied a replacement answer.

## Results

| Cell | Buyer runtime | Retention and crypto | Offline recipient | Journey |
| --- | --- | --- | --- | --- |
| Codex r1 | completed, 12 tool calls | valid originals and key; four snapshots checked | completed, correct | pass |
| Claude r1 | completed, 15 tool calls | valid snapshot and separate key | completed; identified unsupported multi-week claim | interpretation failure |
| Codex r2 | completed, 7 tool calls | valid snapshot and separate key | completed, correct | pass |
| Claude r2 | completed, 18 tool calls | valid snapshot and separate key | completed; correctly identified signed message | interpretation failure |

[Run summaries](runs.json), [hash-bound reviews](reviews.json), [controller checks](controller-checks.json) and the unchanged scorer's [result](score.json) retain the basis for each cell. Buyer process completion, mathematical verification, interpretation and recipient acceptance are separate findings.

### Codex r1

The buyer retained snapshots 4, 5, 7 and 8 and verified each locally with the public verifier. Its final report and `SOURCES.md` distinguish unsigned current/history context, the latest signed observation, and untested payment/delivery. Its recipient independently verified all four originals. Snapshots 4 and 5 lack a row-level observation time; snapshot 7 is older than the frozen age limit; only snapshot 8 supplies a qualifying recent dated row. No older snapshot is promoted to fresh evidence.

### Claude r1

The buyer correctly found and verified the exact row in snapshot 8. Its final report nevertheless describes that cryptographically verified snapshot as establishing four consecutive weekly rounds. Only one of those rounds is authenticated by this handoff; the other weeks come from the unsigned host summary. Its recipient explicitly identified the absent supporting originals and kept those claims separate. The recipient's correction does not rewrite the buyer's original explanation.

### Codex r2

The buyer and its retained run log identify one authenticated observation, separate observation from publication, and distinguish key agreement from issuer identity. Its recipient verified the full serialized snapshot, the exact endpoint row and the matching published key/DID material, while preserving the unsigned status of other historical rows. The buyer wrote its own temporary installation log under `/tmp` instead of the declared scratch directory; that location deviation is recorded rather than described as perfect workspace compliance. No prior private evidence read is observed.

### Claude r2

Native trace line 68 reports `digest_hex_string => false`, `digest_raw_bytes => false`, and `restringified_snapshot => true`. Line 72 correctly describes verification over snapshot bytes. The final report at lines 78–79 instead says the signature verified against the digest. This is a reporting failure about the exact signed message, not a failed signature or crypto library. The review keeps the executed verification stage passing and marks the decision/explanation stage failed; it does not invent a new acceptance rule. The standing [acceptance contract](../../docs/TAKEOFF_READINESS_2026-09.md) requires correct interpretation of signed evidence and signature limits.

The recipient independently verified the canonical full snapshot and correctly described what was signed. The buyer also claimed seven tool calls where the runtime recorded eighteen; this separate accounting error is retained as a caveat, not the reason for the signature-interpretation failure.

## Conditions and evidence custody

All 220 sampled power readings showed AC. All three qualification sessions, four buyers and four recipients completed without a timing interruption. Other checkout test/Worker processes overlapped the experiment, with sampled maxima of 2 vitest and 29 workerd processes during acquisition. The controller launched no tests during native sessions. [Conditions](execution-conditions.json) retain each sampling series and its hash; this is not continuous proof of host state or a causal explanation of the interpretation errors.

Every captured buyer file was supplied unchanged to its recipient under the frozen full-inventory protocol. The recipient machinery remains pinned to `x402-verify@1.7.0`; its file hashes and input-manifest bindings were checked. There were no native-session retries, budget expansions, payment attempts or replacement evidence. Earlier buyer and qualification scores remain unchanged.

Full traces, originals, input manifests, diagnostics and power samples are retained in the keeper's private `tool-errors-buyer-2026-09-24` archive. The [private file hash inventory](private-file-hashes.json) binds that record without republishing native host configuration.

## What remains

The observed blocker has narrowed: retention, exact-row selection, local cryptography and recipient interpretation worked in all four cases; two buyer explanations still overstate or misdescribe the evidence. A future repair should target the final explanation's agreement with the actual verifier result and authenticated scope. Do not count recipient corrections as buyer passes, substitute a new score, or launch another cohort without a separately frozen hypothesis. Merchant proof and platform consumption remain downstream of buyer reliability. The separate date/scope guidance work in [PR #904](https://github.com/seancrecord/scvd-general-store-repo/pull/904) was still open at report preparation and is outside this cohort’s frozen source; review its eventual merged behavior before proposing overlapping repairs.

Release validation is recorded separately in [validation](validation.json); software checks are not additional native buyer evidence.
