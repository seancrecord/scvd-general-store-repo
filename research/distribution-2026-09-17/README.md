# Distribution follow-through — September 17, 2026

**Release follow-through:** the keeper completed the OpenAI skill update and authorized PR/merge. [Current release and host-check record](RELEASE.md) supersedes the earlier local-only status notes below.

The foundation already exists. Reuse the published identity and plugin assets;
finish external discovery and correct indexer readings. This is a dated evidence
record and submission package, not a third work queue. Hands remain on
KEEPER_LIST; implementation remains on ROADMAP TR-D.

After the keeper authorized straightforward submissions, Awesome Copilot
[issue #3255](https://github.com/github/awesome-copilot/issues/3255) and 8004scan
[issue #51](https://github.com/alt-research/8004scan-issue-tracker/issues/51) were
opened. Copilot automated quality/install checks passed; maintainer review remains.
Two community A2A registration attempts failed. No claim, signature, topic change,
commit, push or deployment was made. See [protocol coverage](PROTOCOL_COVERAGE.md)
for the OpenAI skill update steps and expanded A2A/MPP/UCP admission map. Work is isolated on `codex/distribution-followthrough`, based on public
commit `b4c0bbdbde412a435129b00f07f2b1eb401e98ab`, because the original checkout has
unrelated edits and predates the published assets.

## MPP activation follow-up

At 21:13 UTC, after the keeper reported activation, Context Anchor advertised
MPP EVM charge / Base / 1 USDC alongside x402. Menu and OpenAPI capability
declarations agree. Other products are upcoming. This unsigned read did not
exercise payment; directory discovery compatibility remains open.
[Receipt](observations/mpp-context-anchor-live.json) and
[coverage](PROTOCOL_COVERAGE.md#mpp-activation-and-remaining-discovery-gate).

## Canonical identity is already connected

The public Base RPC `tokenURI(86957)` resolves to
https://scvd.store/.well-known/agent-registration.json. That HTTPS file includes
the matching registration, `x402Support: true`, `supportedTrust: ["reputation"]`,
and web, MCP, A2A and OASF services. Its OASF endpoint is
https://scvd.store/agents/general-store; that record reciprocates with the
ERC-8004 registry/agent annotation. The domain acknowledgment is already live.
Raw public reads are in [observations](observations/), with hashes in
[the manifest](evidence-manifest.json).

The keeper's follow-up requested protocol organization and public attribution.
This branch now adds the identity and protocol-record links to the full agent
guide, organizes README discovery links by protocol, and groups `/trust` and
`/.well-known/trust.json` from the same record list. The public groups include
x402, MPP, MCP, WebMCP, ERC-8004, A2A, OASF, UCP, skills/plugins and general
records. UCP is explicitly planned; OASF origin publication is distinct from
federated admission. Four dated ERC-8004 index records and one community A2A source record are added to the existing
flat list and therefore flow into homepage discovery links. QuickNode/BaseScan
remain separate identity viewers. None of this local work has been deployed.

The [current ERC-8004 draft](https://eips.ethereum.org/EIPS/eip-8004) includes
OASF in its registration example and allows the domain-verification file to
contain the full registration. Its illustrative OASF version is not an
instruction to downgrade SCVD's current schema.

Keep the working HTTPS OASF endpoint for now. The September 15 directory CID is
historical: corrected record bytes were subsequently released and require a new
CID and signature. A Directory content identifier does not establish that an
IPFS gateway can resolve it. Only add an immutable URI after fetching and
verifying its exact bytes through the intended resolver. Do not update the
on-chain identity just to trigger indexing without first requesting a refresh.

## External observations

Browser observations below were read directly from the rendered pages. They
are field notes, not saved screenshots or complete API captures. Empty searches
are bounded observations, not proof of global absence. HTTP failures establish
an unavailable read, not a missing registration.

| Destination | September 17 observation | Next concrete action |
| --- | --- | --- |
| [Cisco AI Catalog](https://ai-catalog.outshift.io/) | Search `scvd`, no trust/media filters selected: no records match. | Continue the existing AGNTCY admission package; obtain shared publication, then inspect the exact CID, domain/signature verification and scan status independently. |
| [Anro](https://directory.anroagents.com/) | Public API filter `publisherId = 'scvd.store'` returned HTTP 200, zero items. | Keeper publishes the current signed record through the supported Anro flow; confirm second-peer discovery. No blanket alias search claim. |
| [8004scan](https://8004scan.io/agents/base/86957) | Correct identity, description and MCP/A2A/OASF endpoints; OASF taxonomy shown. Cached MCP health says HTTP 405. | Send the reproducible transport discrepancy below and request metadata/health refresh. |
| [Agentscan](https://agentscan.info/agents/0711e5ab-eca5-42cc-a7ca-38b433689d56) | Search `scvd` returned SCVD Base 86957 with the correct description, plus two unrelated substring matches. | Detail page subsequently read: current registration and OASF fields present, but separate AI taxonomy says Image Generation / Banking. Claim flow not tested. |
| [8004agents](https://8004agents.ai/base/agent/86957) | Search returned SCVD, Base, active, and the owner. | Detail page subsequently read: MCP/A2A/OASF endpoints and x402Support true present; its metadata timestamp remains September 15. Claim flow not tested. |
| [trust8004](https://trust8004.xyz/agents/8453%3A86957) | Correct identity; x402 shown unsupported. MCP tools and A2A skills display the four OASF taxonomy labels. Expanded cached JSON has `x402support: false`, `supportedTrusts: []`, `registrations: []`. | Request source refresh and investigate normalization/service separation. Cause is not yet established. |
| [QuickNode](https://erc-8004.quicknode.com/agents/base-mainnet/86957) | HTTP 200 and SCVD profile title in returned HTML. | Presence confirmed; full protocol parsing/claim flow not tested. |
| [AgentERC](https://agenterc.com/explore/base/86957) | Search `scvd` returned two unrelated BNB records; direct Base identity URL displayed Agent Not Found. | Ask about Base ingestion and reindexing of the existing identity. |
| [HOL registry](https://hol.org/registry/) | Documented search by `q=scvd.store` and exact ERC-8004 native-ID filter both returned HTTP 504. | Retry the API when available; no absence conclusion. |
| [AgentRanking](https://app.agentranking.io/) | Browser ended on HTTP 522; independent HTTP request timed out. | Retry before inspecting a claim flow. No wallet prompt or claim attempted. |
| x402synthex | Assumed `.com` host did not resolve; search surfaced an agent by that name, not a verified directory destination. | Obtain the intended directory URL before treating it as an indexing channel. |
| AIFI Map, 8004.directory, Agent Arena | Not checked in this pass. | Lower priority after the primary publication and parser corrections. |

No directory claim was completed. Successful profile reads are not ownership
claims, independent verifications, endorsements or score approvals.

## OASF publication and feedback

The [existing AGNTCY record](../../registry/agntcy/README.md) records local
push/sign/name verification and shared-node `PermissionDenied`. It does not
prove Cisco publication, routing announcement, scanner clearance or remote
consumer discovery. The [existing admission package](../distribution-admission-2026-09-16/README.md)
and [participation discussion](https://github.com/agntcy/dir/discussions/455)
remain the access path; do not open a duplicate request if a private one exists.

After access is resolved: cut the current canonical record, have the keeper
sign it, publish/announce it, and query from a separate peer by name, taxonomy
and MCP module. Retain returned CID, signature verification, name verification,
scan outcome, routing lifetime and observation time as separate facts. A domain
JWKS at https://scvd.store/.well-known/jwks.json is already present but does not
by itself confer a directory badge. Apply the same exact-record check at Anro.

Ready-to-review community and parser messages are in
[FOLLOWUPS.md](FOLLOWUPS.md). The 8004scan report and [trust8004 report](https://github.com/trust8004/requests-issues/issues/1) have been sent; other operator messages remain drafts.

## Coding-agent distribution

The public repository already has an Agent Plugins 1.0 root `plugin.json`,
`mcp.json`, and both the general-store and x402-verification skills. Keep that
one package rather than rebuild or fork the assets for each host.

**Awesome Copilot:** [current contribution rules](https://github.com/github/awesome-copilot/blob/main/CONTRIBUTING.md)
direct external plugins to an issue form with an immutable public source, then
automated validation and maintainer review. The complete
[submission fields](COPILOT_SUBMISSION.md) are derived from the current public
manifest and pinned commit. Do not manually edit `plugins/external.json`.
The separate [Agent Finder PR #34](https://github.com/github/agentfinder-catalog/pull/34)
already exists with both skills and MCP/plugin descriptors; it is not this
Awesome Copilot submission and must not be duplicated.

**Gemini:** a root extension manifest already wraps the same MCP and skills.
This branch removes `contextFileName: AGENTS.md`, which would load internal
keeper/build/commit instructions into consumer sessions. Gemini's
[reference](https://geminicli.com/docs/extensions/reference/) documents optional
context and automatic `skills/` discovery. The
[release documentation](https://geminicli.com/docs/extensions/releasing/)
requires a public repository tagged `gemini-cli-extension` for gallery crawling;
it describes daily crawling subject to validation, not instant admission.
The repository API returned 20 topics, none with that tag. Proposed outward
change: replace generic `agentic-ai` with `gemini-cli-extension`, preserving
the remaining topics, after the context fix is released. Then verify a fresh
Gemini installation and the actual gallery entry. No Gemini CLI was available
here, so host installation is not claimed.

**OpenAI:** the [submission record](../../registry/openai-plugin-verifier-submission.md)
records SCVD x402 Verifier 1.0.0 Published on September 17, pointing at
`/mcp/verifier`. The [existing skill ZIP](../../registry/chatgpt/scvd-x402-verifier.zip)
contains the exact current SKILL.md and agents/openai.yaml; the byte comparison
is [retained](observations/openai-zip-check.json). Add it to the existing verifier
plugin through its available edit/upload flow, then review and publish the
updated version. This pass did not access the authenticated portal or verify
its current upload controls. Preserve the five-tool verifier scope; do not
silently attach the full commerce skill or full `/mcp` server to that plugin.

## Local validation and limits

- The new Gemini regression failed against the original `AGENTS.md` context
  setting and passed after its removal; all four manifest tests passed.
- `npm run listings:test`, `npm run typecheck`, and `npm run build:check` passed.
  Wrangler could not write its default external log file but returned success
  for both dry-run bundles and the MPP SDK build check.
- Affected Worker suites were run (the protocol regression was first demonstrated failing); the full suite was not run and no commit was made. Run required commit gates
  before a later commit. No local Copilot/Gemini fresh install or paid operation was
  exercised. The subsequent Copilot intake ran and passed its own installation
  smoke test; the receipt is retained in observations/copilot-submitted.json.
- Public MCP bare GET returned 405, JSON-RPC initialize returned 200, and
  GET with `Accept: text/event-stream` returned 200 and a listening comment.
  The bounded SSE read timed out intentionally after its initial response;
  this does not establish long-lived connection reliability.

The keeper subsequently authorized straightforward submissions. The actions
actually taken are recorded below; signatures, protocol activation and deployment
were not performed.

## GitHub requests and subsequent browser reads

September 17 duplicate searches through the GitHub connector returned no issues
for `repo:github/awesome-copilot scvd` or
`repo:alt-research/8004scan-issue-tracker 86957`. These are bounded searches and
must be repeated before posting. The official Awesome Copilot external-plugin
form and 8004scan bug-report template were read. Required outward requests:

| Protocol | Request | Submission state | Reference |
| --- | --- | --- | --- |
| Skills / MCP | Awesome Copilot external plugin | Submitted; automated gates passed; maintainer review | [Issue #3255](https://github.com/github/awesome-copilot/issues/3255) · [Fields](COPILOT_SUBMISSION.md) · [official form](https://github.com/github/awesome-copilot/issues/new?template=external-plugin.yml) |
| ERC-8004 / MCP | 8004scan cached health discrepancy | Submitted; operator response pending | [Issue #51](https://github.com/alt-research/8004scan-issue-tracker/issues/51) · [Issue body](8004SCAN_ISSUE.md) · [official form](https://github.com/alt-research/8004scan-issue-tracker/issues/new?template=bug_report.yml) |
| OASF | AGNTCY admission and taxonomy feedback | Sent; response pending | [Request](https://github.com/agntcy/dir/discussions/455#discussioncomment-18487204) |
| ERC-8004 | trust8004 field normalization; AgentERC ingestion | [trust8004 #1](https://github.com/trust8004/requests-issues/issues/1) filed after fresh reproduction; AgentERC draft remains | [Follow-ups](FOLLOWUPS.md) |
| ERC-8004 / OASF | Agentscan AI taxonomy conflict | Finding recorded; not sent | [Profile](https://agentscan.info/agents/0711e5ab-eca5-42cc-a7ca-38b433689d56) |

The keeper's queue links this record. No issue number is invented for a draft.

Direct profile follow-through: 8004agents renders SCVD's owner, canonical URI,
MCP/A2A/OASF and x402Support true; it also displays a September 15 metadata
update. Agentscan renders the current 14-service registration with mcpTools
and the correct OASF service taxonomy. Its separate AI-classified taxonomy
panel instead says Image Generation and Banking. This is a third-party
classification conflict, not a reason to rewrite correct canonical metadata.
The two fetched HTML files are app-shell reads; these profile findings came
from the subsequently rendered browser pages, not the raw HTML alone.

## Final local checks for the protocol organization

Seven affected Worker spec files passed, 87 tests total. Listings/manifest
checks passed all 36 tests. Typechecking and both Worker dry-run bundles plus
the MPP SDK build check passed. The new protocol regression failed against
the unchanged route before implementation. The guide fingerprint also caught
the deliberate new links; a regression now proves removing only those links
reproduces the previous document digest. Final logs are retained under
`observations/protocol-*`. Full-suite and commit/release gates remain for an
approved later commit; no commit or deployment was made. Two GitHub issues were subsequently created
and are linked above.


## Tracking reconciliation and additional plugins

The existing [distribution guide](../../DISTRIBUTION.md) is now the starting point,
with links to the registry drawer, public trust source, findability inventory,
keeper/build queues, outreach register and existing weekly checks. Its older
channel notes remain in the archive. Pending applications do not enter public
trust records. Four ERC-8004 directories and the existing A2A source catalog
were added to the contact register; no scorers-note send was inferred from an issue.

The September 12 listing baselines, current ClawHub publication receipt and fresh
MCP registry response close obsolete keeper tasks. The response marks both source
manifest versions latest. OpenAI's published status and Agent Finder's existing
entries now lead their drawer pages. OASF's current-byte signature is distinguished
from the historical local signature; the public JWKS is already available.

[Cursor, Claude and Kiro submission material](../../registry/plugin-submissions.md)
is prepared. Cursor and Claude rendered sign-in requirements; neither application
was sent. Kiro requires host qualification, the published README links and a
publisher contact. No marketplace admission or completed host test is claimed.

A Claude packaging defect was found while tracing actual loader inputs: the
root `.mcp.json` is added to the inline manifest and carried contributor Chrome
DevTools. Its config now lives in an explicitly loaded development file. The
regression failed with the original config and passes after the move. This
joins the already prepared Gemini contributor-context fix. Both remain local.

Final checks after the tracking cleanup: 37 listing/manifest tests, six outreach
checks, TypeScript typechecking and Worker bundle check passed. Strict Claude
manifest validation passed (including a staged directory without the marketplace
manifest); it reported no content tests. Red/green output, registry response and
validation records are in `observations/`. The affected Worker tests documented
above remain the runtime checks for the earlier protocol changes. No full suite,
commit, push, deployment or new publisher application was performed in this pass.


### Follow-up: existing plugin updates and GitHub catalogs

Keeper clarification, corrected September 17: SCVD has the plugin package and
the cursor.directory community listing; official Cursor marketplace admission
remains outstanding. The latest clarification supersedes the earlier claim of
marketplace inclusion. Qualify and submit the existing skill-plus-MCP package
through Cursor's publisher application. OpenAI is an update to the existing
verifier plugin, with new release notes for the skill.

[Additional GitHub catalog findings](GITHUB_CATALOGS.md) include the submitted
[Awesome ERC-8004 issue #111](https://github.com/sudeepb02/awesome-erc8004/issues/111),
awaiting review. This is a third GitHub issue in the overall distribution pass;
it is not yet an external listing. Other candidate catalogs remain unsubmitted.


### Cursor publisher application — September 17 follow-up

The official [Cursor publisher application](https://cursor.com/marketplace/publish)
was submitted for the existing repository, with the SCVD logo, website, privacy
and support links. The page confirmed **Thanks for applying** and receipt.
[Application record](observations/cursor-publisher-submission.json).
This supersedes the earlier unsubmitted status above; marketplace admission is
still pending and the cursor.directory community listing remains separate.

[Cursor CLI qualification](observations/cursor-host-qualification.json) is partial:
both MCP servers loaded, and one free preflight of `https://example.com` returned
the expected `not_ready` / L1 / HTTP 200 negative control. The two bundled skills
were not visible to the model. Native desktop automation timed out. The application
disclosed these limitations and optional paid services. Skill discovery and desktop
qualification remain on ROADMAP TR-D; review follow-up is on KEEPER_LIST. No
marketplace acceptance was added to the public trust signals.


### Claude qualification reconciliation

The later Claude Code 2.1.274 test supersedes the first attempt's incomplete
plugin MCP qualification. Both skills loaded and the plugin-scoped free preflight
completed against `https://example.com/`; the expected negative control returned
`not_ready`, L1, HTTP 200. [Sanitized follow-up](observations/claude-host-qualified-followup.json).
The account connector was separated by a session-only setting. The original
failure remains retained. No marketplace installation, Cowork runtime or paid
operation is claimed. Console submission still requires sign-in.


### Cursor normal Agent-mode follow-up

[Three bounded discovery checks](observations/cursor-agent-mode-recheck.json)
found neither skill in the model-visible catalog: the unchanged package loaded
with `--plugin-dir`, the documented local-plugin directory, and a portable-only
copy without other host wrappers. The earlier Ask-mode result therefore is not
explained by mode alone. The cause remains unisolated; native desktop discovery
is still outstanding. No package change or duplicate application was made.


### Claude community application submitted

After the keeper signed in and explicitly authorized contact sharing and the
Software Directory Terms, the existing package was submitted for **Claude Code**.
Cowork was left unselected because it remains untested. Anthropic confirmed
**Plugin submitted for review** and receipt of the submission.
[Sanitized application record](observations/claude-publisher-submission.json).
Review is pending; no accepted listing is added to public trust signals.


## MPP directory follow-through

Official catalog [PR #991](https://github.com/tempoxyz/mpp/pull/991) submitted for Context Anchor only;
maintainer review pending. Generation, typecheck, production build and 34
focused upstream tests passed. MPPScan’s pinned parser maps EVM/Base to
`tempo:8453`; [Merit #1209](https://github.com/Merit-Systems/x402scan/issues/1209)
contains an isolated reproduction. Its registration remains unsubmitted, and
SCVD’s additive OpenAPI MPP descriptor is implemented in the
[compatibility repair](../../docs/MPP_OPENAPI_DISCOVERY_2026-09-17.md), with the
compiled local directory reader recognizing both protocols without endpoint
warnings. Deployment readback is tracked with that repair.
[Catalog receipt](observations/mpp-directory-submission.json) and
[MPPScan audit](observations/mppscan-qualification.json).

The full local SCVD suite ran in four shards: 742 of 761 files passed initially;
all 19 initially failing files passed the lower-concurrency rerun (2,664 tests).
The reconciled main branch typecheck and 37 listing checks passed.
[PR #785](https://github.com/seancrecord/scvd-general-store-repo/pull/785) merged
after quality checks, all four full-suite shards, CodeQL and Worker builds passed;
runtime and plugin assets were unchanged by that tracking follow-up.
