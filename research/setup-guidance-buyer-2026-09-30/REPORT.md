# Directed buyer cohort after setup qualification — September 30, 2026

**0 complete journeys / 4; 1 failed interpretation; 3 incomplete journeys.** Three buyers completed their native sessions; the fourth reached the tool-call cap. No offline recipient session launched: the prelaunch guard observed a changed Codex CLI version and environment fingerprint after buyer acquisition. Both Codex buyers have successful retained verification and acceptable buyer explanations, but the missing recipient gate keeps their integrated journeys incomplete. This is not evidence that their cryptographic checks failed or that the product regressed. Earlier cohorts, including September 28's 2/4, remain separate and unchanged.

## Condition and qualification

[The setup repair](../../docs/BUYER_QUALIFICATION_SETUP_2026-09-30.md) is in [PR #948](https://github.com/seancrecord/scvd-general-store-repo/pull/948). This run froze source `fc00e713dd3dd2580867ab5094aadb44e45e36fb` before merge after local validation. It includes the merged #946 literal-command matcher and explicit `capability.setup_guidance: "standalone-node-v1"`. The added instructions affect online qualification only; buyer/recipient prompts, models, budgets, exact package permission, zero-spend policy, source review and fourteen-day observation policy remain unchanged from the prepared source-review condition. This is a separate acquisition, not a retry or causal comparison.

All three [qualification gates](qualification-outcome.json) passed: both hosts fetched generic bytes, checked fresh signature vectors, reviewed pinned source, recorded proceed decisions, installed the exact package, generated reports and retained matching runtime bytes; the offline recipient completed its generic capability check. The controller independently reproduced both generated reports. [Qualification findings](QUALIFICATION.md) retain source-display truncation, partial review, advisory token excess and reporting errors. None of those self-reported source assessments is a package security audit.

Public preparation rechecked the deployed/raw guide against source, all 27 published package files, registry signature/provenance, six source pins, current OpenAPI size and signed exact-subject history. The candidate remained snapshot 10's September 21 observation; publication on September 27 does not refresh it. No controller-fetched evidence was supplied to buyers. The freeze and all native source bytes remain in the archive.

## Buyer observations

| Cell | Wall time | Calls | Retained files | Buyer interpretation | Integrated journey |
| --- | --- | --- | --- | --- | --- |
| codex-directed-r1 | 143.018 s | 9 | 23 | pass | incomplete |
| claude-directed-r1 | 169.404 s | 16 | 13 | fail | fail |
| codex-directed-r2 | 149.767 s | 9 | 19 | pass | incomplete |
| claude-directed-r2 | 159.547 s | 21 | 7 | incomplete | incomplete |

Codex r1 retained four original snapshots and generated four verification reports. All four signatures and exact-subject rows verify independently. It names September 7/14/21 observations and an older row with an unknown observation date, separates unsigned current challenge/history from those individually authenticated claims, and leaves payment and delivery untested. Older or undated rows cannot satisfy the fourteen-day policy; the September 21 row does.

Codex r2 retained one signed original, a separately fetched issuer key, current challenge headers and a generated report. It exercised `--challenge-headers`: the unsigned challenge's payment-address digest matches the selected signed historical row, with no claim that this authenticates the challenge, current terms or payment authority. This is native use of that reporting option, which the September 28 cohort did not exercise. [Controller replay](report-replay.json) reproduces all five buyer-generated reports byte for byte.

Claude r1 installed the package and ran `capabilities`, but retained no signed original or issuer key and ran no artifact verification. Its final report turns the advisory `signed-offers-not-in-challenge` into “no cryptographically signed offer is ever served” and says no signed offer or receipt exists anywhere in the endpoint's history. The sampled unsigned responses do not prove those universal absences. It also misses the separate class of SCVD-signed observations linked by the retained host history. Merchant-signed offers and independently signed observations are different evidence. The full host-history tool result includes `evidence_scope` and the corpus instructions; this record does not establish truncation as the cause. The explanation fails interpretation; acquisition and verification are incomplete. These are model statements, not findings about the merchant's actual defenses.

Claude r2 stopped after the runner observed call 21 against the 20-call limit. Native calls can be emitted before the controller observes the overrun; no additional call allowance was granted. It retained six source files and a decoded unsigned challenge, installed the package, and emitted a CLI-capabilities invocation without a retained result from that call. It produced no final report, source-review receipt, signed original, issuer key or generated verification report. The native Markdown export is explicitly its last message, not a completed final. Setup errors, directory creation and six separate source fetches consumed calls. No attempt was repeated.

Buyer package review remains imperfect. Codex r1 combined source fetching and inspection within a shell call rather than making the inspection a standalone call; hashes/order were visible, but this is a prompt-adherence deviation, not a separately qualified per-buyer source-review pass. The cohort scorer does not add a new retrospective package-compliance criterion. Source display and model source-safety claims do not establish complete reading or safety in any cell.

## Recipient prelaunch boundary

The frozen context named `codex-cli 0.155.0-alpha.16.3`. At the attempted recipient preflight, the installed CLI reported `0.155.0-alpha.16.4`; the environment fingerprint also differed. Claude's version and the disabled local-skill inventory were unchanged. [The retained difference](recipient-context-drift.json) records these observations without guessing which environment variable changed or when the update occurred.

The controller refused before creating an attempt lock, recipient workspace or native process. The wrapper's “recipient started” log means the controller command was invoked, not that a native recipient ran. Three completed buyers were otherwise eligible; none received a recipient. The capped fourth buyer was ineligible independently. No context hash, frozen configuration or score was edited to bypass the guard. No new qualification was grafted onto this cohort. The controller's signature checks and interpretation do not substitute for a native recipient's understanding.

## Retention and limits

[Trace-bound reviews](reviews.json), [frozen scorer output](score.json), [run records](runs.json), [controller verification](controller-checks.json) and [execution conditions](execution-conditions.json) preserve the denominator and every gap. Original snapshots and reports were checked against their captured hashes. There were no timing interruptions. All 80 qualification samples, 124 buyer samples and two recipient-prelaunch samples showed battery power and zero Vitest/workerd processes; sampling is not continuous proof. Battery operation was explicitly approved. No controller software tests overlapped native timing.

All requested model names remain frozen; Codex traces do not expose a resolved model revision, while Claude reports `claude-sonnet-5`. Output-token targets are advisory and exceeded in several sessions; wall, tool and byte limits remain unchanged. No payment, account registration, external message or native credential access was observed.

The private `setup-guidance-buyer-2026-09-30` archive preserves all originals, traces, frozen instrument, commands, setup failures and seven verbatim Markdown message exports: three qualification finals, three completed buyer finals and one stopped buyer's last message. There are no recipient reports to list. [Native report index](native-report-index.json) distinguishes completed finals from the partial message; [file inventory](private-file-hashes.json) records every archived file. Older archives remain untouched.

The next work is to address buyer setup overhead and the transition from an unsigned history summary to its signed originals, then freeze any changed experiment under a stable qualified host context. Do not repeat this unchanged cohort to seek a better score, weaken the recipient gate, or interpret this run as paid-delivery or unbranded-discovery proof. [Milestone #803](https://github.com/seancrecord/scvd-general-store-repo/issues/803) stays open.
