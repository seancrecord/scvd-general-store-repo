# Next roadmap qualification — September 23, 2026

Two previously implemented rows now have their remaining historical/live
qualification reconciled. No deployment or new payment was needed. This closes
D1 and V3 at their stated scope; it does not close buyer acceptance, paid MPP
qualification, or the local batch's release gate.

## V3 — fresh signed protocol census qualified

The public index lists snapshot 8 as latest. Its exact retained response is
`corpus-8.json.gz`, published September 20 at 11:00:28.668 UTC. The existing
verifier validates its signature and digest against the issuer public key
fetched separately over HTTPS. No independent issuer-identity attestation or
Bitcoin proof verification is claimed. The snapshot's measured rows carry
observation dates from September 15 through September 20; publication time is
not substituted for observation time.

All 5,021 rows were counted. There are **860 measured responses**, **4,030
answered without a saved protocol reading**, and **131 unreachable**. Among the
measured responses, 14 speak both protocols, 262 x402 alone, and 584 neither;
there are no MPP-only rows. Missing measurements remain gaps. Speaking MPP does
not mean every MPP check passed. This is the historical `mpp-v1` census battery,
not a claim that the separate core draft-01 reader was retrofitted into it.

Independent recomputation matches the signed round's counts and the public
brief. The retained weather.parklandarchives.com host-history entry preserves
that snapshot's MPP checks and protocol list exactly. This closes the roadmap's
fresh-census gate. The existing MPP-only/mixed/x402 passport cases remain local
regression evidence; no live MPP-only observation or paid transaction was added.

## D1 — the first overnight reading recovered

Source: [x402-list check history](https://x402-list.com/api/v1/services/sean-claude-van-damme-s-general-store/checks).
**Data: x402-list.com (CC BY 4.0).** Three retained pages cover the windows
below; the service caps each page at 100 even when asked for 500. The replay
joins by check ID and refuses inconsistent duplicates. P95 uses nearest rank.

| UTC window | Checks | Median | P95 | Maximum | Indexed doors found |
| --- | ---: | ---: | ---: | ---: | --- |
| September 5, 00:00–12:00, before activation | 45 | 988 ms | 1,619 ms | 1,630 ms | 23–31 |
| September 5, 19:55 through September 6, 12:00 | 60 | 40 ms | 100 ms | 141 ms | 31 on every check |
| September 6, 00:00–12:00, overnight subset | 44 | 36 ms | 101 ms | 141 ms | 31 on every check |

Every captured check reports up/402. The overnight subset has no reading over
500 ms; its largest inter-check interval is about 17 minutes. These are dated
operator records, not continuous availability, a current latency promise or a
controlled attribution of the speed difference solely to the Worker split.
They satisfy the missing overnight acceptance at its original scope.

Fifteen retained GitHub workflow artifacts span activation through the next
morning. The text reports include 13 cold first knocks. Every artifact's JSON
is actually a **separate second run**; 13 of those first knocks are warm. That
second run cannot replace the first run's cold/warm comparison. It also has npm
command banners before its JSON object. Raw artifacts are preserved unchanged,
and the replay explicitly strips only the prefix to inspect the second reading.
All 15 second-run bursts record 32/32 answered 402s. Their 32-door shelf and the
directory's 31 indexed doors are different denominators and remain separate.

## Locally completed instrument repair — not released

The workflow now calls the reader once. `--json-out` writes that acquisition to
a new JSON file while the same run prints its human report; existing files are
not overwritten. The workflow calls Node directly, so npm banners cannot enter
the JSON artifact. An unreachable first door still saves its failed readings
and returns the original failure exit code. Latency thresholds are unchanged.

The regression executes the workflow's actual shell body under GitHub's Bash
error settings with a fixture-only network. Before the repair it fails because
the successful artifact is not JSON and the first-door failure saves no JSON.
Afterward it checks the same first cold knock, timestamp, deployment cutoff,
six warm comparisons, one discovery burst and failure evidence. No live network
or real timing threshold is used by these controls. The cold-reader suite passes
16 tests. Required hosted CI and a post-release artifact readback remain open.

## Replay and provenance

From the repository root:

```sh
node research/roadmap-next-2026-09-23/verify.mjs
```

`manifest.json` pins all 39 source files by decoded byte count and SHA-256,
with source URLs. `summary.json` is the saved replay output. The replay checks
every captured hash, verifies the original signature, independently recomputes
the census, compares its projections, and derives the directory/window readings.
It makes no network requests and no writes. The separately retained old readings
are not rewritten to make their artifact defect disappear.


Validation: all 16 cold-reader/workflow tests and all 17 MPP census/passport
tests pass. Typecheck, the dry-run bundles, documentation checks, the 39-file
offline replay and roadmap/link/whitespace checks pass. The full repository
suite and hosted CI remain required before a later merge; neither was rerun
for this focused batch. No commit, PR, push, deploy or external submission.
