# S8 and L13 release readback — October 5

## Release status

[Reporting #972](https://github.com/seancrecord/scvd-general-store-repo/pull/972)
merged October 2 at 20:39 UTC; [S8 #975](https://github.com/seancrecord/scvd-general-store-repo/pull/975)
merged at 20:58 UTC. Both final PR heads passed quality, all four test shards
and `check`. Main `08c1e80086abd3569d639aeb36206c18a1540ca4` also passed those
gates in [run 37063973008](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/37063973008),
and both Workers Builds on that commit report success.

## What production answered

These are unpaid observations at the response's `inspection.observed_at`, not
payment attempts, delivery evidence or directory-ingestion findings. HTTP
responses are retained beside this file with a [hash manifest](capture-manifest.json).
Neither transport agreement nor these capture hashes independently verifies the
underlying third-party response.

- **HTTP and MCP:** the x402scan merchants endpoint returned `not_ready` under
  v3 and `ready` in its same-response v2 comparison. The only failed v3 check
  was `discovery-info-validates`: three fields required by the declared schema
  were absent. See [HTTP](x402scan-v3.json) and [MCP](mcp-x402scan.json).
- **WebMCP:** the actual registered `preflight_endpoint` tool on `/try` returned
  the same version, verdict and sole failed check at
  `2026-10-05T10:50:15.573Z`, with v2 `ready`. This is a tool readback recorded
  in the task, not a retained raw HTTP capture in this directory.
- **Controls:** [ReadX](readx-v3.json) passed its discovery check; the older
  corpus advisory is not treated as a current defect. [Nansen](nansen-v3.json)
  failed discovery and an existing transfer-method check, so it does not alone
  demonstrate the v2-to-v3 verdict change.
- **Census:** the new [week 40 snapshot](https://scvd.store/corpus/11.json)
  contains 48 v3 rows, 4,799 v2 rows and 108 rows without a battery field. One
  row fails the new discovery check. Older observations retain their recorded
  batteries. [Projection and limits](census-summary.json); this pass did not
  independently verify the snapshot signature or timestamp proof.
- **Offer/challenge:** no offer-contradiction row was found in that snapshot
  (or in the week 39 snapshot read October 3). This is not a claim that none
  exists elsewhere. Both contradictions are exercised by the released regression
  tests across free checks, MCP, paid-audit code and census code. A live offer
  contradiction and a newly purchased signed audit were **not** exercised.
- **L13:** [the public inflow response](inflows.json) still contains only week
  35, published August 29. Its HTML says authorization pairing was not measured;
  the JSON exposes the new field descriptions without inventing values in the
  old reading. This establishes the reader's deployment, not a new measurement.

## Follow-up fixes from the readback

The [MCP introduction](mcp-initialize.json) still directed callers to v1 even
though its tool runs v3. `/try` and OpenAPI's `info.x-guidance` had the same
stale link. These now derive the current version. The free report also used
the v1 ladder explanation regardless of its battery; it now calls the existing
version-aware explanation. The two new failed checks now map to repair guidance
as checks, while retaining their advisory mappings. The verifier output schema
accepts the additional optional mapping. Vocabulary v22 records that change
and corrects a discovery hint that claimed failed ingestion without observing it.

Regression evidence: the MCP-instruction test failed before its fix. Five
additional assertions failed before the explanation, mapping and guide fixes.
No score, signing code, retained report or stored counter changes in this follow-up.
The final focused run passed 72 tests across six files; type checking, all
production dry-run bundles and the documentation check passed. Full CI remains
required before a future merge. These follow-up edits are local until their own
release.

## Still open

PR #976's first full CI run caught the package snapshot still at vocabulary
v21. The follow-up regenerates it, prepares `scvd-defects` 0.22.0 and updates
its TypeScript field, signal lookup and package-content manifest. A new Node
regression failed before the lookup fix and passes afterwards. Registry
publication of 0.22.0 remains separate; this is a source release, not a claim
that npm has updated.

The keeper explicitly deferred authenticated checks October 5. L13's first
current admin reading and the remaining one-settlement reconciliation therefore
remain open. No publish, replace, raise, repair or counter-adjustment action was
performed. Lack of a retained sale event cannot by itself establish the historic
cause or justify lowering a counter.

An incidental release-status read found the October 3 scheduled
[listings check](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/37126521915)
red: two external inventory counts differ and several venues were unreadable
from that runner. This is separate from the green release checks, and does not
establish delisting. No resubmission or outreach was made.
