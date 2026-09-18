# x402-verify 1.5.0 release and referred buyer qualification

This is a new bounded acquisition following the
[saved-response repair](../buyer-retention-repair-2026-09-17/REPORT.md).
The September 17 native cohort and its failures remain unchanged.

The approved scope is one native capability probe per host, then two unpaid
referred buyer journeys per host if both hosts qualify. Eligible retained
original/key pairs receive fresh offline recipient checks. Catalogue discovery
is excluded: the repair does not change registry selection.

The acquisition uses reviewed source commit
`11c08941d4f1371f1d6200942a07c4919735167c`, preserving the prior buyer prompts,
permissions and budgets. Concurrent PR #783 changed scratch/cache setup and the
buyer prompt; that instrument change is deliberately outside this comparison.
The published verifier and public focused guide are the new product inputs.

Raw native traces and host metadata stay outside the repository. Public records
bind them by hashes. No missing buyer artifact is fetched after an acquisition,
and no failed attempt is retried to manufacture a passing cohort.
