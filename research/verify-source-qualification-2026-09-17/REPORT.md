# Published verifier; native qualification stopped at the host gate

**x402-verify 1.5.0 is published and registry-qualified. The new buyer cohort
was not launched because Claude's capability probe timed out.** This is a
host-completion finding, not a verifier or merchant failure. No buyer or
recipient result is claimed for this freeze; takeoff readiness remains open.

## Release

The keeper explicitly authorized the release. The existing provenance workflow
published from merged commit `b8c19fbb13ee46c9832f7a88875e6cb2871b6d42`:
[successful publication](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35276254796).
The package's tests, independent vectors, installed quickstart and publication
step all passed. npm initially processed the release and cached a missing
tarball response. We waited until a normal registry installation succeeded;
no buyer was exposed to that known propagation gap.

The fresh npm installation has a verified registry signature and provenance
attestation. All **24 shipped files** match reviewed source byte for byte.
The attestation binds the package digest to the expected repository, merged
commit and workflow. The installed `verify-source` command verifies the prior
retained original with its separately captured key. This is an installation
control, not a new buyer completion. See [publication.json](publication.json),
[provenance statement](provenance-statement.json) and
[propagation record](registry-propagation.json).

## Frozen comparison and observed probes

The [plan](plan.json) keeps the four referred cells, two per host, and the
previous models, budgets, permissions and fourteen-day historical-age policy.
The public guide and registry package are new product inputs. Acquisition uses
reviewed commit `11c08941d4f1371f1d6200942a07c4919735167c`, with the prior
buyer prompts and collector. Concurrent [PR #783](https://github.com/seancrecord/scvd-general-store-repo/pull/783)
changed the scratch/cache setup and buyer prompt; it is deliberately excluded
from this comparison. This record does not qualify that newer adapter.
The schema-4 scoring correction already merged before this freeze is retained.

[freeze.json](freeze.json) binds the source, plan and public guide before the
probes. The native qualification additionally binds CLI versions, allowed
launch environment and local skill inventory. No instrument or cap changed
during either attempt. A separate unpaid operator request returned 402 from
the merchant; it is not buyer evidence.

| Host | Capability result | Observed behavior |
| --- | --- | --- |
| Codex | Pass | Retained exact public bytes; optional Python crypto was unavailable, then built-in Node crypto verified all four vectors and saved the required report. Two commands, no denied command. |
| Claude | Incomplete | Retained exact public bytes; Node returned the correct four signature results. No further exposed event followed that tool result. The 240-second cap ended the process before the required report or final answer existed. Two commands, no denied command. |

Claude's missing report is not invalid cryptography. Its correct intermediate
calculation is also not completed qualification. The trace does not identify
why the host stopped progressing. No sign-in failure or denied command was
observed. We did not extend the time budget, repair the report, or retry.
The [qualification record](qualification.json) preserves both outcomes.

The freeze required **both hosts** to pass before launching the cohort.
Consequently all **four planned buyer cells remain unlaunched**, and no
original/key pair exists for a new recipient check. Do not describe this as
four observed buyer failures or remove those planned cells from the record.
[acquisition.json](acquisition.json) states the gate and counts explicitly.
The prior cohort's 1/4 referred result and its original failures remain intact.

## What follows

The package release is complete. Native acceptance of the retention repair is
still unmeasured. Diagnose host completion separately before another explicitly
frozen qualification; preserve this capped attempt. A future run using the
newer scratch/cache adapter must identify it as another instrument boundary.
There is no evidence here justifying a verifier, guide, permission or timeout
change. Catalogue discovery remains a separate distribution question.

The old subject observation leaves the fourteen-day window after
`2026-09-21T02:30:20.531Z`. Use newer evidence or record incompleteness; do not
widen that window. No payment, wallet operation, account registration, external
admission message or new buyer acquisition occurred.

## Preservation and validation

Raw host context, complete native events, retained bytes, release metadata,
attestations and validation logs are stored privately under
`~/scvd-takeoff-handoff-2026-09-17/verify-source-qualification-2026-09-17/`.
The [manifest](private-manifest.json) binds the exact private files. Reproducible
npm cache and installed dependency directories are excluded; the exact registry
tarball and lockfile are preserved separately. Public records accompany the
backup. No prior research or main-checkout work was changed.

The 59 focused controls for the frozen runner and 62 for integrated main pass,
as does the integrated typecheck. This branch changes research records and the
roadmap only. [validation.json](validation.json) retains log hashes. All full CI
shards and the aggregate check remain required before merging this record;
the final merge receipt records that gate.
