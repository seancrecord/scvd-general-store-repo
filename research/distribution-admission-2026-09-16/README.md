# External admission packages — September 16, 2026

Preparation only. No application, comment, message, signature, publication or
infrastructure deployment was made. These packages reuse the canonical records.
Build order remains on ROADMAP TR-D; outward actions remain on KEEPER_LIST.

## GitHub MCP Registry

**State: implementation present / curated admission unobserved / prior request
unknown.** The retained official-registry response names `store.scvd/general-store`
as active/latest and agrees with `server.json`. GitHub's registry API returned
HTTP 200 and an empty result for that exact name. This is a dated query result,
not proof that every possible discovery query misses it. Responses and headers
are under [observations](observations/).

[GitHub's maintainer answer](https://github.com/github/github-mcp-server/discussions/1257)
describes initial manual curation followed by upstream version synchronization.
The discussion is a visible place where onboarding requests are being received;
it is not a published acceptance SLA or exhaustive application-status service.
The keeper should locate any earlier request before sending this draft through
the existing conversation or GitHub's confirmed curation contact.

The separate [Agent Finder PR #34](https://github.com/github/agentfinder-catalog/pull/34)
is **open**, last updated September 16, and already includes both skills, the
MCP descriptor and plugin descriptor. The old local README's statement that
only one entry was submitted is historical. Do not duplicate that PR. Agent
Finder status does not establish curated MCP Registry admission.

### Request draft

Please consider `store.scvd/general-store` for initial GitHub MCP Registry
onboarding. Its canonical descriptor is the active/latest
[official registry entry](https://registry.modelcontextprotocol.io/v0.1/servers/store.scvd%2Fgeneral-store/versions/latest),
maintained from [server.json](../../server.json). Source and installation docs:
https://github.com/seancrecord/scvd-general-store-repo. The remote Streamable HTTP
endpoint is https://scvd.store/mcp. Free preflight and receipt checks work without
credentials; paid goods require a separately authorized payment. SCVD produces
dated signed observations, not a delivery guarantee. Please identify any
additional admission requirements or an existing request we should continue.

### Acceptance after admission

Retain the exact GitHub result and version, install through the default GitHub
registry in a fresh supported Copilot/VS Code environment, list tools, and run
the unpaid buyer task. Separately verify obtained signed evidence and its scope.
A subsequent official-registry release must be observed downstream; no parallel
GitHub-specific descriptor should be created. GitHub documents the supported
[registry installation flow](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp).

## AGNTCY Directory

**State: canonical record/local signing demonstrated in the September 15 record;
shared publication and consumer round trip unverified.** The recorded local CID
and name verification are in [the existing release record](../../registry/agntcy/README.md).
Its shared-node `PermissionDenied` is historical evidence, not a fresh access
check. No new write was attempted to test permission.

The [official testbed discussion](https://github.com/agntcy/dir/discussions/455)
contains a July 24 maintainer reply opening participation to non-steering-group
members. Its older initial-phase restriction is superseded by that reply.
The [current project page](https://dir.agntcy.org/latest/) links that invitation
and the Directory community. General participation does not itself grant
SCVD's identity permission to push into a particular shared node.

### Request draft

We would like to participate in the Agent Directory testbed with SCVD's
canonical OASF record at https://scvd.store/agents/general-store and domain
key publication at https://scvd.store/.well-known/jwks.json. Local push,
record signing and domain-name verification succeeded in our September 15
check; pushing to the shared endpoint was denied. Which supported route should
we use: authorized shared-node publication, an operator import, or federation
with an independently operated peer? We want to test discovery by taxonomy,
signature/name verification and installation from a second participant's node.
Please identify the access or federation information required before we submit.

### Artifact and consumer gates

- Reuse `src/lib/oasf-record.ts`, `registry/agntcy/record.json` and the existing
  taxonomy/canonical-drift checks. Directory signing stays with the keeper.
- **Copy corrected locally; release/signing still pending:** the canonical OASF
  source distinguishes the date, gaps and any declared expiry
  from signature validity; the unconditional expiring annotation is gone.
  The draft was regenerated through `oasf:cut`. Its new bytes need a new CID and
  keeper-held signature after release. The September 15 signed record is retained
  as historical evidence and does not cover this correction.
- Obtain a concrete participant/access decision; do not deploy a new federation
  node or submit duplicate requests to resolve unknown application history.
- From a different peer, search by name, skill, domain and MCP module; pull the
  exact CID, verify signature and name binding, inspect scanner results, and run
  `dirctl install --dry-run` in a fresh supported client. Then complete the same
  unpaid buyer/evidence task. A valid record or local daemon alone is insufficient.
- Record routing publication time/TTL and the observer's peer. Missing or failed
  network reads remain unverified. The [official quickstart](https://docs.agntcy.org/dir/dir-getting-started/)
  distinguishes local records from network discovery, which excludes local rows.

Submission reference/date and the selected external dependency are still absent
for both admission lanes. They remain explicit unknowns, while core buyer work
continues. The retained observations identify the bytes checked in this pass.

## September 17 request reconciliation

The existing Agent Finder PR remains open, unchanged since September 16, with
no comments. The public GitHub onboarding discussion was read through its
returned comments and replies with no remaining pages; no SCVD or keeper-account
request appeared. Account-authored discussion searches in github/github-mcp-server
and the AGNTCY organization returned zero results. These bounded checks do not
exclude private, differently authored, or off-platform applications.
[Read record](reconciliation-2026-09-17.json). No submission was sent.
