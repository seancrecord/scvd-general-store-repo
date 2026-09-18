# Published verifier and four directed buyers — September 17, 2026

**One of four complete referred journeys passed; two failed interpretation and one remained incomplete at recipient handoff.** All four buyers finished, retained complete snapshot/key pairs, and executed successful local signature checks. Two fresh offline recipients finished; two stopped without final reports. No payment was attempted. This is directed usability evidence, not discovery, organic demand, paid completion or takeoff readiness.

The directory date uses the keeper's local day (America/New_York). Recorded executions were September 18 UTC. This acquisition is distinct from every earlier qualification; their failures remain unchanged.

## Release and acquisition boundary

Verifier **x402-verify 1.5.0** was already published by the separately authorized [release workflow](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35276254796). [PR #787](https://github.com/seancrecord/scvd-general-store-repo/pull/787) preserves that publication and the older adapter qualification, including Claude's incomplete report and its four unlaunched buyers. This task did not publish again.

After [#786](https://github.com/seancrecord/scvd-general-store-repo/pull/786) and [#788](https://github.com/seancrecord/scvd-general-store-repo/pull/788) merged, a fresh registry install matched all **24 shipped files** to source; npm verified the registry signature and provenance attestation. The public focused skill matched the checked-out bytes. See [release readback](release-readback.json).

The new [freeze](freeze.json) uses merged source `82a419ff`, the per-session npm cache and the narrower refusal guidance. One generic attempt per host passed public-byte retention and fresh signature vectors; only then did the [four-cell plan](plan.json) run once. [Qualification](qualification.json), [launch record](buyer-launch.json), and [recipient protocol](recipient-protocol.json) retain the boundary. There were no native retries, changed permissions or widened freshness windows during acquisition.

The referred public entry was the focused verification skill; the subject was `https://lionx402.com/api/x402/wallet-screen-json`. The buyer models were gpt-5.6-luna and Sonnet. Each buyer had nominal limits of 240 seconds, 20 tool events, 4 MB output, 32 MB/32 retained evidence files and zero spend. The token target was advisory. All four buyer processes completed within the recorded wall limit.

## Reviewed outcomes

| Cell | Buyer local signature / retention | Interpretation | Fresh offline recipient | Full journey |
| --- | --- | --- | --- | --- |
| Codex r1 | Pass / complete | Appropriately bounded | Completed; subset caveat below | Pass |
| Claude r1 | Pass / complete | Wrong paid-delivery instrument; overextends signed history | Completed | Fail |
| Codex r2 | Pass / complete | Appropriately bounded | Stopped without final report | Incomplete |
| Claude r2 | Pass / complete | Misstates signed message; overextends authenticated history | Stopped without final report | Fail |

[Reviewed score](score-reviewed.json) is computed by the existing scorer from hash-bound reviews. [Review summary](review-summary.json) records each basis, runtime, retained-byte identity and recipient limitation. The unreviewed [acquisition score](score-acquisition.json) remains separate; it is not silently replaced.

Codex r1 fetched public verifier source and recovered from a missing sibling/setup error. Codex r2 installed the registry package into its permitted scratch/cache space, recovered from an incorrect executable path, then successfully used `verify-source`. Its retained buyer evidence does not independently pin the installed package version; the separate parent registry readback does. Both Claude buyers used local Node cryptography and successfully verified the snapshot bytes. They fetched the public key document separately, but their verification code used the snapshot's embedded key; review checked equality with the separately retained document. Do not describe this as independently resolved organizational identity.

Every captured pair independently passes the existing portable verifier against the separately retained key. Each authenticates snapshot 6 and its exact subject row at `/round/hosts/50`, observed **2026-09-07T02:30:20.531Z**. No artifact expiry is declared. The frozen 14-day historical policy admits this observation at acquisition and ceases to admit it after September 21 at that time; this policy is not an issuer-declared expiry and must not be extended to make another run pass.

Only snapshot 6 was authenticated. The host summary contains earlier observations, but verifying one snapshot does not authenticate every week in that unsigned summary. Claude r1 describes independently signature-verified continuity across roughly three weeks. Claude r2 similarly extends verifiable continuity and says the signature verified against the digest, although both digest-message attempts returned false and verification of the serialized snapshot returned true. These are interpretation failures despite working cryptography. Neither reported a paid delivery.

## The product error the buyer repeated

Preflight's `the_rest_of_the_ladder` sent L4–L6 delivery-evidence seekers to **The Night Watch** (`standing_watch`). That instrument only makes unpaid structural probes. Claude r1 repeated the recommendation, adding `conformance_watch`, which also does not purchase from the observed merchant. This is partly a defect in our supplied guidance, not solely a model failure.

The separate `codex/preflight-delivery-evidence` repair changes that recommendation to the existing **Launch Check**, a screened, authorized and capped paid attempt, and states that it can stop short. Its regression resolves the recommended item's actual `reads` class; the old response fails because it resolves to `subject_fetch` instead of `subject_purchase`. A dated public correction records the previously served claim. No buyer in this acquisition paid for either instrument, and the frozen acquisition predates the repair.

## Recipient boundary and timing limitation

Each fresh recipient received the captured original, captured key, verbatim buyer report and two public verifier modules. Network access was disabled. No missing original or key was fetched afterward. Parent verification and recipient interpretation are distinct checks.

The recipient subset deliberately omitted the unsigned host summary and fresh live preflight/direct responses, although buyers had retained them. The two completed recipients correctly limit the signed evidence to one historical observation and flag unsupported current/multi-week claims within their subset. Codex r1's recipient says current responses were “not retained”; that is inaccurate about the full buyer capture and accurate only about what the recipient was supplied. Its cryptographic, subject, date, expiry and delivery interpretation passes with this caveat. A future handoff should label the subset expressly or include all cited material; this acquisition is not repaired after the fact.

Codex r2's recipient exposed 12 tool calls and useful intermediate work but no final report. Claude r2's recipient exposed zero tool calls and no final report. Both record `budget_stop: wall_ms` and SIGTERM. **Recorded start-to-close intervals were 630.650 and 629.762 seconds, despite the nominal 240-second cap.** A retrospective [host power-log readback](host-interruption.json) confirms sleep from 20:30:44 to 20:37:21 local (397 seconds), overlapping both recipients, plus an earlier short sleep. This establishes a host-interruption confounder, though stop-request time was not recorded and every millisecond is not attributed. The collector's generic statement that wall time is bounded does not establish precise 240-second termination in these attempts. This timing/enforcement discrepancy must be resolved before using another timed cohort as acceptance evidence. No cap was intentionally widened and neither recipient was rerun.

A separate [dummy-process timing control](timing-control.json), with no native agent or network, exercised the unchanged runner after acquisition. A one-second limit stopped a normal process in 1.014 seconds; a process ignoring SIGTERM was killed in 2.007 seconds, including the configured one-second escalation. Normal termination works in this control. It does not reproduce the native delay or qualify behavior during suspension/event-loop delays.

Some recipient sessions overlapped other sessions; full repository tests also ran on the host. Host sleep is independently documented; neither the overlap nor the power log proves either recipient would have completed without interruption. The record does not isolate additional model, package or concurrency effects.

The Claude adapter's nominal command declaration also did not prevent `ls`, `cat`, `echo` and compound invocations in the exposed trace. No private-file reads or wallet activity were observed, but the declaration alone is not a demonstrated hard command boundary. Claude r1's self-report that it tried no compound commands contradicts its trace. Model-authored tool summaries are not the instrument record.

## Next work

1. Merge/deploy the delivery recommendation and read the public preflight back. Keep the correction and frozen old evidence.
2. Make elapsed-time reporting interruption-aware: distinguish UTC elapsed time, monotonic runtime, stop-request time and close time, and test interruption handling with an injected clock. Do not launch another native cohort merely to replace these incomplete attempts.
3. Make a recipient handoff's supplied scope explicit and retain all material it is expected to assess. Preserve unsigned versus authenticated history in the buyer explanation.
4. Any further buyer acceptance needs a new justified freeze and qualified adapter, without changing this cohort or widening its freshness policy. Two complete journeys per host/lane are still required by the roadmap; discovery and merchant/platform flows remain separate.

Validation and preservation are recorded in `validation.json` and `private-inventory.json`. Raw transcripts, captured public bytes, prompts, instrument copies and reviews live in ignored `private/` and a hash-checked keeper backup. None of the raw buyer responses is republished as a new observation by this report.
