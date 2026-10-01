# Reporting and publication follow-through — October 1, 2026

## Admin release

[PR #958](https://github.com/seancrecord/scvd-general-store-repo/pull/958)
merged at `bbb93e315127da5c912ac92e082c50d6e20fa3df` after all four test
shards, quality and the required check passed in
[run 36886197146](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36886197146).
Both merged-commit Worker builds passed. The release corrects Growth's x402
house adjustment, shares its correction read with Pulse, repairs desk event
navigation, labels request ratios and removes the funnel's causal inference.
The [authenticated review](../admin-reporting-live-2026-10-01/README.md)
covers twelve pages at the stated depth. The post-deployment admin readback
remains unverified because Brave reported active user interaction. Production
phone-width layout and latency are also unmeasured; no credentials were copied.

The final ward continuation found obsolete descriptions of private rows and
GET-only probing, plus a heartbeat label that called all host rows probed.
The follow-up source changes correct the descriptions, link the public corpus
and preserve the existing arithmetic and stored observations. Twenty focused
ward tests, type checking and six Agent Finder descriptor checks passed.
[PR #963](https://github.com/seancrecord/scvd-general-store-repo/pull/963)
merged at `fe5fddf0` on October 1 at 16:59:32 UTC after all four test shards
and the required check passed. Both merged-commit Worker builds succeeded.
The authenticated post-deployment visual read remains pending: the next
attempt again stopped when Brave reported user interaction.

## Publications

The user approved publication in this task. All five dry runs passed before
these dispatches. Each actual run used the merged commit above and its existing
workflow; no credential or authentication configuration changed.

| Release | Publication run | Independent readback |
| --- | --- | --- |
| scvd-cli 0.4.0 | [36891159997](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36891159997) — succeeded | Initial exact-version read returned 404 during registry processing. |
| scvd-preflight 0.3.1 | [36891166220](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36891166220) — succeeded | Initial exact-version read returned 404 during registry processing. |
| scvd-mcp-starter 0.2.0 | [36891172284](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36891172284) — succeeded | Initial exact-version read returned 404 during registry processing. |
| scvd-defects 0.21.0 | [36891179621](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36891179621) — succeeded | Initial exact-version read returned 404 during registry processing. |
| store.scvd/general-store 0.2.4 | [36891186831](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36891186831) — succeeded | Exact version and latest registry entries read back; every source manifest field matches, and the official metadata marks it active/latest. |

The npm publisher explicitly reported that packages were being processed and
could take a few minutes to become available. Successful publication is not
substituted for tarball readback. Do not publish these versions again merely
because the public registry is still processing them. The first failed reads
are retained separately. `read-packages.py <checkout> <new-output-directory>`
checks current source versions, registry integrity, every packed file, and
provenance payload bindings to this repository/workflow/source commit. It does
not independently verify the attestation signatures. A later reading is new
evidence, not a rewrite of the initial 404s.

### Later npm readback — October 1, 20:32–20:33 UTC

All four submitted versions are now publicly available and tagged latest.
[The retained readback](package-readback-verified.json) verifies each tarball
against registry SHA-512 integrity and every packed file against source,
including the publication commit named in the provenance payload. All four
passed. Attestation signatures were not independently verified by this script.
The earlier 404s remain evidence of the observed processing delay; no repeat
publication was needed.

Before publication, both live MCP doors passed SSE content type, trailing-slash
308, CORS OPTIONS and tools/list checks. The three shared verifier handlers had
identical behavioral annotations. SSE connections were deliberately bounded at
15 seconds after reading their successful headers; curl's timeout exit does
not mean the stream returned an HTTP failure. No paid tool was invoked.

## Listing corrections and remaining hands

The repository About description and topics were updated and independently
read back. The blanket claim that every verdict is signed was withdrawn;
free endpoint inspection is an unsigned observation. The topics now include
MPP, WebMCP, A2A and UCP while keeping the same topic count and homepage.
Before/after metadata is retained. This does not establish a search recrawl.

Existing [Agent Finder PR #34](https://github.com/github/agentfinder-catalog/pull/34)
was read before preparing its refresh. The MCP/plugin descriptions and store
skill description now reflect their scoped capabilities; the skill no longer
claims every artifact is signed. The catalog was regenerated using its own
current public feed; its validator and all nineteen tests passed. The retained
patch includes that generated refresh and three SCVD descriptors.

The fork belongs to `cv-scvd`; the connected `seancrecord` account has read but
no push permission. No new PR or duplicate request was opened. To continue
from the owning account: apply `agentfinder-refresh.patch.gz` to branch
`add-scvd-general-store` at `9f5fff8216af4d400f623680da6ad715d2e0d0e5`, regenerate
and check the catalog against the current feed, then update the existing PR
using `agentfinder-pr-body.md`. The prepared local commit is
`ee1e30d`; no external branch or PR body was changed. MCP 0.2.4's version URL
is now verified, so that former publication dependency is cleared. Admission
still requires a merge and a separate index read.

[MCPpedia #172](https://github.com/BbekShr/MCPpedia/issues/172) and
[mcp.so #4325](https://github.com/chatmcp/mcpso/issues/4325) remain open and
already contain the required connection corrections; no duplicate messages
were sent. Other record-specific drafts remain in the
[September 30 correction packet](../listing-review-2026-09-30/CORRECTIONS.md).
Unreadable/form-only venues remain unverified. No new outreach, buyer
qualification, paid scan or directory subscription was performed.

The October 15 AEO checkpoint is scheduled for 09:00 America/New_York as the
one-time task heartbeat `october-aeo-checkpoint`. It uses the existing hand-check
procedure, fixed modes and missing-cell rules. Scheduling is not a completed
engine observation or a visibility improvement.
