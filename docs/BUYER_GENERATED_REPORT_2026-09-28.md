# Generated evidence reports — September 28

The [September 28 buyer cohort](../research/guidance-buyer-2026-09-28/REPORT.md) completed all eight sessions but only one of four full journeys. Two buyer explanations transcribed a payment address incorrectly; another expanded one authenticated snapshot into four weeks. A recipient also mistyped a digest. The original reports and scores stay unchanged.

`x402-verify` source version 1.9.0 extends the existing `scvd-evidence verify-source` command with `--format markdown --report-out NEW_FILE`. It saves exact computed identifiers and selected signed rows without overwriting an existing file. Original-file and signed-message hashes remain distinct; verified snapshot count comes from this invocation, not the snapshot sequence or unsigned history. Missing observation dates remain unknown. The default JSON workflow and verification exit meanings remain available.

Optional `--challenge-headers FILE` reads the retained final HTTP 402 response, preserves every offer's exact fields, and compares address digests with selected authenticated exact-subject rows. The Worker and CLI share the existing digest implementation. Unsigned headers cannot establish their origin, current terms, valid addresses or payment authority; missing, duplicate, malformed and unsupported inputs remain gaps. Incomplete signed rows cannot support a conclusive mismatch. Nothing fetches replacement evidence, chooses a rail or spends.

The public verification guide asks agents to cite the generated report instead of retyping identifiers or broadening its authenticated scope. Library or independent-cryptography users can save their own computed result with the same provenance. Report text is bounded; issuer-controlled strings stay within a JSON code block. This does not establish that a model will follow the guide or accurately explain the result.

Frozen recipient handoffs now retain and hash all six current runtime files. Older four-file releases retain their contract; a current package missing either new runtime module is refused. Published installation is checked separately from these source hashes.

## Controller replay and validation

The [generated report](../research/buyer-reporting-2026-09-28/controller-replay.md) uses the unchanged September 28 original, public-key record and unpaid challenge headers. The [replay receipt](../research/buyer-reporting-2026-09-28/controller-replay.json) records their archive paths and hashes. It reproduces one verified snapshot, the exact signed row and observation date, both distinct source hashes, and the retained address's matching digest. This is an offline controller replay, not a native buyer attempt, retry or rescore.

Regression controls were observed failing before the repairs for generated output, unknown dates, report-file creation, output limits, blank addresses, package runtime inventory and installed CLI execution. The checks also cover wrong keys, changed signed bytes, omitted rows, conflicting subjects, malformed or duplicate challenges, base58 case, hostile Markdown and existing-file protection. The [validation receipt](../research/buyer-reporting-2026-09-28/validation.json) records checks separately from interrupted or intermediate attempts; pending release gates remain named.

## Release and acceptance gate

Source preparation is not npm publication. After the normal PR and complete CI gate, publish the exact merged package and read back its installed files and help. Read back the deployed guide, freeze new hashes, and qualify each required host/lane before a new zero-spend cohort. Keep the existing budgets and fourteen-day observation-age policy. Preserve every actual attempt and its verbatim report; the earlier cohort is immutable.

The package also includes the already merged PS5 Ed25519 JWS-envelope implementation. This reporting work does not stand in for PS5's deferred buyer/model qualification. TR3 remains open until the required complete buyer/recipient journeys actually pass.

## Released result

[PR #929](https://github.com/seancrecord/scvd-general-store-repo/pull/929) merged after every hosted test shard passed. Version 1.9.0 is published; its clean installation matches all 27 merged files and passes registry-signature and provenance verification. The [release receipt and separately frozen native cohort](../research/generated-report-buyer-2026-09-28/REPORT.md) record **2 complete journeys / 4**, with no change to earlier attempts. Both Codex buyers used generated reports; Claude's frozen adapter does not permit ordinary npm installation. All four recipients correctly interpret the supplied evidence and age policy, including the missing-original case. Buyer acquisition and reporting remain unresolved; the next qualification must exercise the installed report path in both adapters.
