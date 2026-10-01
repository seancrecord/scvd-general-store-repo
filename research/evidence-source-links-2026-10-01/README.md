# Candidate-source selection implementation — October 1

Adds an offline `sources` command to verifier source version 1.10.0. [Design and limits](../../docs/BUYER_SOURCE_LINKS_2026-10-01.md) explain how unsigned index/history hints become a bounded candidate list without becoming authenticated observations or an absence finding.

[Controller replay](controller-replay.json) uses two hash-checked files from the immutable October 1 archive. It finds the linked snapshot the buyer missed. No original is fetched, no native attempt is launched and no old score changes. Publication and native adoption remain separate gates.

[Validation receipt](validation.json): 257 evidence-tool tests, 303 buyer-harness tests and 12 package-contract tests pass, alongside typecheck, documentation audit and bundle checks. Four command regressions were witnessed red before implementation; a later URL-boundary check also failed before its fix. Full hosted CI remains the merge gate.

The buyer harness now derives pins for its synthetic current-source installations in memory. The historical mixed-quote command pair remains a verbatim parser check; only the synthetic installation variant substitutes current hashes. Frozen acquisition plans, historical command fixtures and production hash gates are unchanged. Early sandbox, stale README and fixture-pin failures are retained in the local validation archive alongside the green reruns. These are software validation attempts, not native buyer attempts.
