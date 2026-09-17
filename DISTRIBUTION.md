# SCVD distribution: channels and records

Reconciled September 17, 2026. Start here to find the record; human actions
stay in [KEEPER_LIST](KEEPER_LIST.md#directory-and-listings-press-is-yours-rule-30),
builds in [ROADMAP](ROADMAP.md). This is a channel map, not another queue.

## Where each fact lives

| Question | Authoritative place |
| --- | --- |
| Where is SCVD independently listed? | [Public trust records](https://scvd.store/trust), generated from [EXTERNAL_RECORDS](src/store/trust-signals.ts). Each record has a date, direct listing URL and scope. |
| What does each protocol actually support? | [Protocol scope](src/store/discovery-protocols.ts); [README](README.md#on-other-peoples-records) links the corresponding SCVD page. |
| What needs a human action? | [KEEPER_LIST](KEEPER_LIST.md). Submitted requests keep their issue/form receipt there; admission is not presumed. |
| What needs implementation or host qualification? | [ROADMAP](ROADMAP.md), especially TR-D. |
| What do we submit? | [Registry drawer](registry/README.md), including the [plugin submission packet](registry/plugin-submissions.md). |
| Which paths can crawlers find? | [Findability inventory](scripts/lib/findability.mjs), checked by `npm run findability:check`. Presence is not admission. |
| Are existing listings stale or disappearing? | `npm run listings:check`; [weekly workflow](.github/workflows/listings-check.yml); [recorded baselines](docs/listings/). Baselines already exist, dated September 12. |
| Who have we contacted about citations? | [Scorers register](registry/scorers-outreach.json); its [table](registry/scorers-outreach.md) is generated. `note_sent` refers to the scorers note, not any issue or submission. |
| What evidence supports this pass? | [September 17 findings and receipts](research/distribution-2026-09-17/README.md), [prior admission reconciliation](research/distribution-admission-2026-09-16/README.md), and [spec readings](docs/SPEC_READS.md). |

## Protocol coverage

| Protocol | SCVD entry point | Distribution state at this reading |
| --- | --- | --- |
| x402 | [Conformance desk](https://scvd.store/conformance) · [discovery](https://scvd.store/.well-known/x402) | Confirmed directory records remain in the public trust source. A successful listing does not prove a purchase or settlement. |
| MPP | [Developers](https://scvd.store/developers) | Inspection exists. The fresh Context Anchor quote advertised x402, without native MPP. Curated MPP and MPPScan intake wait on live capability/discovery qualification; see [coverage](research/distribution-2026-09-17/PROTOCOL_COVERAGE.md). |
| MCP | [Store](https://scvd.store/mcp) · [verifier](https://scvd.store/mcp/verifier) | Both official registry entries match their source manifests in the [fresh registry response](research/distribution-2026-09-17/observations/mcp-registry-refresh.json). The old republish instructions are closed. |
| WebMCP | [Browser tools](https://scvd.store/webmcp.js) | Existing directory records are grouped publicly. Browser registration still needs a real browser check; MCP unit tests do not prove it. |
| ERC-8004 | [Registration and domain acknowledgment](https://scvd.store/.well-known/agent-registration.json) | SCVD observed on 8004scan, Agentscan, 8004agents, trust8004 and QuickNode. Indexer parsing conflicts are preserved. [8004scan issue #51](https://github.com/alt-research/8004scan-issue-tracker/issues/51) filed. Others remain in the dated coverage map. |
| A2A | [Agent Card](https://scvd.store/.well-known/agent-card.json) | Existing Agenstry, agent-tools.cloud and community source-catalog records confirmed. Two additional community API attempts failed; no new acceptance claimed. No universal official public registry established by this research. |
| OASF | [Canonical record](https://scvd.store/agents/general-store) · [JWKS](https://scvd.store/.well-known/jwks.json) | Endpoint only. Local signing/name verification of an older record is recorded; Cisco/Anro publication, current-byte signature, federation routing and remote scan status are unverified. [Publication details](registry/agntcy/README.md). |
| UCP | [Roadmap](ROADMAP.md) | Planned inspection experiment. Merchant integration and Google's onboarding are separate work; no current UCP checkout claim. |
| Skills/plugins | [Skill index](https://scvd.store/.well-known/agent-skills/index.json) | Reuse the package across coding hosts; marketplace review remains host-specific. See below. |

## Plugin and skill channels

| Destination | Existing asset / observed status | Admission route or remaining gate |
| --- | --- | --- |
| OpenAI / ChatGPT | [Verifier plugin published](https://chatgpt.com/plugins/plugin_asdk_app_6aaa9b3afcc081918be808a0d8cfd212); keeper reports the skill update completed September 17 | Upload/update task closed; review and publication status of that update have not been independently checked; [packet](registry/openai-plugin-verifier-submission.md). GitHub changes do not update uploaded skills. |
| Awesome Copilot | Root Agent Plugins package submitted as [#3255](https://github.com/github/awesome-copilot/issues/3255); automated skill/manifest/install gates passed | Maintainer review pending. Continue this issue. |
| GitHub Agent Finder | [PR #34](https://github.com/github/agentfinder-catalog/pull/34) already includes both skills plus MCP/plugin entries | Existing review; [drawer](registry/agentfinder/README.md). Tab's previous registry-version blocker is cleared; it is not thereby in this PR. |
| Cursor | Keeper reports already listed; the recorded public URL is [Cursor Directory](https://cursor.directory/plugins/scvd-general-store-repo) | Preserve the existing listing. Reconcile any separate cursor.com marketplace URL before considering another application; no second MCP server or duplicate submission is needed. |
| Claude community marketplace | `.claude-plugin/` wrapper exists; manifest validation passes | [Console submission](https://platform.claude.com/plugins/submit) requires sign-in. Release the prepared MCP-scope fix and qualify a fresh install before submitting; contributor Chrome DevTools moved to an explicit development config. Official curated marketplace has no application route. |
| Kiro powers | Agent Plugins 1.0 package reusable without another wrapper | [Submission form](https://kiro.dev/powers/submit/); contact, published README links and host qualification outstanding. [Prepared fields](registry/plugin-submissions.md). |
| Gemini CLI | Thin extension reuses `skills/` and HTTP MCP | Release the prepared contributor-context correction, qualify a fresh install, then gallery discovery/topic and readback. |
| ClawHub / skills.sh | Existing public skill channels | Latest ClawHub publication comes from [its receipt](registry/clawhub/published.json), not an old queue paragraph. |
| Hugging Face | Dataset exists; verifier Space package prepared | Keep the existing [Space plan](registry/huggingface/README.md) and keeper decision; an artifact is not a deployed Space. |

Additional GitHub catalogs and actual submission status: [catalog findings](research/distribution-2026-09-17/GITHUB_CATALOGS.md).

For Cursor, Claude and Kiro, current primary sources and exact preparation gates
are in the [plugin packet](registry/plugin-submissions.md). Custom-MCP support
in another host is not evidence of a public submission route. Perplexity and
Windsurf remain research candidates, not confirmed marketplace opportunities.

## Keeping this small

Record a confirmed listing once in `EXTERNAL_RECORDS`; its public readers derive
from that source. Store a submission receipt in the dated research folder and
link it from the existing keeper item. Keep capability changes in ROADMAP until
qualified. Do not add pending applications to `sameAs` or describe directory
inclusion as protocol certification. Preserve canonical metadata when an indexer
misparses it; report the conflicting fields to that operator.

The weekly listing check already covers liveness, metadata versions and roster
drift. It does not check private review portals or prove agent-side discovery.
Do not create another monitoring job for those same public URLs.

Earlier channel descriptions and package publication receipts are retained in
[the archived channel notes](docs/archive/DISTRIBUTION_CHANNEL_NOTES_2026-09-17.md).
September 10 package releases are also documented in
[compact packages](docs/COMPACT_CORPUS_PACKAGES_2026-09.md) and
[adoption follow-through](docs/ADOPTION_AND_LATENCY_2026-09.md).


September 17 package milestone: [verified release record](research/package-skill-release-2026-09-17/README.md).
