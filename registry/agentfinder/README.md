# GitHub Agent Finder

Reconciled September 17, 2026. Continue
[github/agentfinder-catalog#34](https://github.com/github/agentfinder-catalog/pull/34).
It currently contains both skills and MCP/plugin descriptors; the October 16 refresh below supersedes that proposed set. The older instructions
to open a second PR or add missing skill entries are superseded by the
[admission reconciliation](../../research/distribution-admission-2026-09-16/README.md).
An open PR is not an indexed result.

| Local descriptor | Resource |
| --- | --- |
| `catalog/seancrecord/scvd-general-store.json` | Store skill |
| `catalog/seancrecord/x402-before-you-pay.json` | Pre-payment skill |
| `deferred/scvd-general-store-mcp.json` | Reference only: official registry descriptor; withheld from Agent Finder |
| `catalog/seancrecord/scvd-general-store-plugin.json` | Claude-compatible plugin descriptor |

`npm run listings:test` checks descriptor shape, source URLs and metadata parity.
The dated `PR_BODY.md` is retained as draft history, not an instruction to replace
the current PR body without reading it.

The [fresh official MCP registry read](../../research/distribution-2026-09-17/observations/mcp-registry-refresh.json)
now finds both store and tab at their source-manifest versions. Tab's former
version blocker is cleared. There is no tab entry in this drawer or proven in
PR #34; adding one remains distinct from observing its registry release.

After merge, read the generated catalog and search
[Agent Finder](https://agentfinder.github.com/api/v1/search) for SCVD before
recording admission. The service implements Agentic Resource Discovery; the
store's own [ARD document](https://scvd.store/.well-known/ard.json) does not prove
that somebody else's index ingested it.

Awesome Copilot [#3255](https://github.com/github/awesome-copilot/issues/3255) is
a separate plugin submission. It passed automated intake but was rejected
September 24 as not a fit for the repository; the issue is closed. This does
not change the separate Agent Finder PR's open status. [Current channel map](../../DISTRIBUTION.md).

Hugging Face has its own [drawer](../huggingface/README.md) and keeper item;
Agent Finder review does not publish the verifier Space.

## September 30 local draft refresh

The local MCP descriptor now follows prepared `server.json` version 0.2.4 and
its x402/MPP inspection description. The official registry still serves 0.2.3.
Do not forward this draft to existing PR #34 until 0.2.4 is published and its
version URL is read back. [Evidence and exact sequence](../../research/listing-review-2026-09-30/CORRECTIONS.md).


## October 1 publication and prepared external refresh

MCP 0.2.4 is now independently verified on its exact version URL and as the
registry's active latest entry. The external refresh also corrects the
plugin description and the store skill's blanket signing claim. Its catalog
regeneration, validator and nineteen tests pass. Applying the patch to
existing PR #34 needs the owning `cv-scvd` account; the connected account has
no write access to that fork. [Validated patch, replacement body and evidence](../../research/reporting-publication-2026-10-01/README.md).
No second PR was opened and admission remains unverified.


## October 16 task discovery draft

The existing skill and plugin descriptor descriptions now name concrete tasks:
endpoint comparisons, payment diagnosis, evidence reports and (in the broad
store skill) contribution discovery and local Tab costs. This updates owned
source files only. Apply these changes to existing PR #34 using its owning
account after the task-guide release; preserve the current URLs and identifiers.
No new submission or indexed-result claim is made here.


## October 16 task-discovery refresh

The connected GitHub account still has `push: false` on the `cv-scvd` fork.
The existing PR remains the destination. `task-discovery-update.patch` compares
all four local descriptors with its head
`9f5fff8216af4d400f623680da6ad715d2e0d0e5`; the owning account can apply it on
`add-scvd-general-store`. No duplicate submission was opened and no external
update or index inclusion is claimed. Local listing validation passes.

## Current upstream rules and conflict resolution (October 16)

The October 13 contribution guide requires Claude manifest references to use
`application/vnd.anthropic.claude-plugin+json`. It also accepts MCP references
through GitHub's versioned mirror, not the official registry URL used by the old
PR. The live GitHub MCP catalog contained no SCVD entry and its exact store
0.2.4 mirror URL returned 404 on October 16. The official MCP registry entry
remains public elsewhere; it is retained under `deferred/` as a reference, not a
submission candidate. Do not fabricate a mirror URL or count this as admission.

The replacement `task-discovery-update.patch` updates the two skills/plugin and
removes the unsupported MCP proposal from existing PR #34. It supersedes the
earlier four-descriptor patch. The PR also conflicts in generated `ai-catalog.json`.
Merge current upstream first, apply this patch, regenerate that file with the
current generator, and run the upstream tests and generator check before pushing
the existing branch. A local prepared merge passed 46 upstream tests and both
generation checks; it is not pushed because the owning account is unavailable.
The current browser has only `seancrecord` signed in, and the fork still reports
`push: false`. No duplicate submission, account change or external message was made.
