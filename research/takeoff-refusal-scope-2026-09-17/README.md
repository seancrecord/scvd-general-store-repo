# Refusal scope and host qualification — September 17, 2026

Both native hosts passed one fresh generic capability attempt. Each retained
the exact public response and correctly verified four newly minted Ed25519
vectors. No buyer ran, no payment occurred, and the earlier incomplete
qualification and buyer results remain unchanged.

## Narrow repair

The previous Claude attempt stopped after `curl ... && shasum ...` was
refused, then asserted that all Bash commands were unavailable. Separate
cache controls had already executed Node under the same permissions.
The generic host statement now scopes a refusal to the attempted invocation,
keeps untried tools unverified, and explicitly preserves permission boundaries.
It names no service and supplies no new verification recipe.

Capability diagnostics now retain each host-reported command event, including
the full invocation, outcome and trace line. The older first-word lists remain
as indexes for existing consumers. A compound command beginning with `curl`
being denied does not establish that standalone curl is forbidden. A regression
covering a denied compound command and later successful standalone commands
failed before this change and passes with it. Acceptance rules are unchanged.

## Acquisition and interpretation

[freeze.json](freeze.json) was written before launch. It records all seven
instrument hashes and the unchanged [plan](plan.json): models, permissions,
zero-spend boundary, hard budgets and 14-day freshness policy. There was
exactly one new qualification attempt per host, with no replacement attempts.

| Host | Retained exact bytes | Fresh signature vectors | Hard cap |
| --- | --- | --- | --- |
| Codex | Pass | Four correct, OpenSSL | None |
| Claude | Pass | Four correct, Node crypto | None |

[Qualification](qualification.json) and [trace review](review.json) retain
the machine results and reviewed limits. Both native reports exceeded the
advisory output-token target; no hard time, tool or output-byte cap was hit.

Claude encountered no refusal in this attempt. Its fetch included `&& echo
DONE`, which native policy allowed. This is not proof of improved recovery
from a refusal, nor evidence that every compound command is permitted.
Fresh vectors and model nondeterminism prevent attributing the pass to the
new sentence. The earlier failure remains part of the host history.

Codex reported a refused cleanup involving `rm`, then completed the check
without cleanup. Its native trace exposes that refusal as narrative, not a
command event; the diagnostic's empty denied index is therefore not evidence
that no refusal occurred. We do not invent an invocation from the narrative.

## Next gate

The [public registry read](publication-observation.json) still returned
x402-verify 1.4.0. The saved-response repair is prepared as 1.5.0 in
[#784](https://github.com/seancrecord/scvd-general-store-repo/pull/784);
source merge is not package publication. No publication action was taken.

The frozen maximum of eight buyer cells was unused. Defer acceptance of the
saved-response repair until its release and independent fresh installation
are observed. Then freeze the intended buyer plan before running it. Changing
the plan, instrument, CLI, environment or skill inventory requires fresh
qualification; these passing probes are not portable to a changed boundary.
Do not rerun qualifications until green or increase old caps. Catalogue
discovery remains separate from a directed use test of the verifier repair.

[next-directed-plan.json](next-directed-plan.json) prepares two referred
attempts per host under the same subject, models, budgets and freshness limit.
It passes the runner's dry-run validation; it is not an acquisition freeze.
After confirming release/installation, freeze it with the then-current
instrument and qualify it separately. Do not reuse the eight-cell plan's
qualification for this different plan. Every buyer result must retain the
package version actually installed, originals/key observations, verification
commands and scope interpretation; eligible pairs still need fresh recipients.

The September 7 observation leaves the existing freshness window after
`2026-09-21T02:30:20.531Z`. Use newer evidence or record incompleteness.

## Preservation and validation

[provenance.json](provenance.json) inventories the private acquisition files.
Raw traces, prompts, vectors, launch metadata, originals and frozen source
remain under ignored `private/`; the verified backup is
`~/scvd-takeoff-handoff-2026-09-17/refusal-scope-2026-09-17/`.
No native probe or buyer remains running.

All 141 buyer-instrument controls, typecheck and dry-run bundle checks pass.
The full-suite result is recorded separately in [validation.json](validation.json).
Required CI remains the merge gate.
