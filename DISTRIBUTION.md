# SCVD distribution: channels and records

Reconciled September 19, 2026. Start here to find the record; human actions
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
| MPP | [Context Anchor](https://scvd.store/menu/context_anchor) · [Developers](https://scvd.store/developers) | Context Anchor MPP is live: September 17 unsigned GET advertised EVM charge / Base / 1 USDC alongside x402. That dated read covered the pilot. The [whole-shelf HTTP extension](docs/MPP_WHOLE_STORE_2026-09-18.md) is merged; the [directory metadata repair](docs/MPP_OPENAPI_DISCOVERY_2026-09-17.md) follows its enabled door set. The [native MCP extension](docs/MPP_MCP_CHECKOUT_2026-09-18.md) is now merged in #804; WebMCP and the client packages retain x402. That source change is separate from a live paid qualification. MPPScan qualification found a Base-network parser mismatch, reported as [Merit #1209](https://github.com/Merit-Systems/x402scan/issues/1209); registration completed September 19; parser report remains open. Official directory [PR #991](https://github.com/tempoxyz/mpp/pull/991) submitted with generation, types, build and 34 focused tests passing; review pending. see [coverage](research/distribution-2026-09-17/PROTOCOL_COVERAGE.md). MPPScan: the live shelf was qualified with the pinned discovery package on September 18 ([receipt](research/distribution-2026-09-18/mppscan-live-check.json)); [registration completed September 19](https://www.mppscan.com/server/d58b4c8d9dc872c8308b594e4b4117bff2255f83b47f054e492b2a2fbc0ddb7b): 193 of 195 resources accepted, two URL templates excluded after 404 probes, one endpoint skipped and nonblocking schema/payment warnings retained. [Receipt](research/erc8004-followthrough-2026-09-19/mppscan-registration.json). |
| MCP | [Store](https://scvd.store/mcp) · [verifier](https://scvd.store/mcp/verifier) | Both official registry entries match their source manifests in the [fresh registry response](research/distribution-2026-09-17/observations/mcp-registry-refresh.json). The old republish instructions are closed. [GitHub curated-registry onboarding](https://github.com/github/github-mcp-server/discussions/1257#discussioncomment-18487205) requested; admission pending. |
| WebMCP | [Browser tools](https://scvd.store/webmcp.js) | Existing directory records are grouped publicly. A fresh Chrome session returned 14 registered tools; execution of each tool was not tested. Existing [catalog PR #41](https://github.com/webmachinelearning/awesome-webmcp/pull/41#issuecomment-5719818436) received a scope correction. |
| ERC-8004 | [Registration and domain acknowledgment](https://scvd.store/.well-known/agent-registration.json) | SCVD observed on 8004scan, Agentscan, 8004agents, trust8004 and QuickNode. Indexer parsing conflicts are preserved. [8004scan issue #51](https://github.com/alt-research/8004scan-issue-tracker/issues/51) and [trust8004 issue #1](https://github.com/trust8004/requests-issues/issues/1) filed. Canonical registration/OASF/A2A consistency passed September 18. AgentERC ingestion email sent September 18; HOL ingestion report sent September 19 after exact-identity and domain searches returned HTTP 200/zero hits with a working control. These are query results, not a proven cause. Agentscan taxonomy and AgentRanking availability remain unresolved. [September 18 evidence](research/erc8004-followthrough-2026-09-18/README.md) · [September 19 receipt](research/erc8004-followthrough-2026-09-19/README.md). |
| A2A | [Agent Card](https://scvd.store/.well-known/agent-card.json) | Existing Agenstry, agent-tools.cloud and community source-catalog records confirmed. The [Global A2A Registry listing](https://www.a2a-registry.org/agent/store.scvd.scvd_evidence_agent) was claimed by the keeper September 18; the public Verified label and input/output display repair were confirmed. This is a directory ownership label, not a service audit. The separate [a2aregistry.org record](https://a2aregistry.org/api/agents/3ec62f32-4e67-4382-8d15-2b6bf689f33a) is now registered and confirmed: card/health checks pass, task probe fails; [JSON-input compatibility report #184](https://github.com/prassanna-ravishankar/a2a-registry/issues/184) is pending. No universal official public registry established by this research. |
| OASF | [Canonical record](https://scvd.store/agents/general-store) · [JWKS](https://scvd.store/.well-known/jwks.json) | Endpoint only. Local signing/name verification of an older record is recorded; Cisco/Anro publication, current-byte signature, federation routing and remote scan status are unverified. [Participation/representation request](https://github.com/agntcy/dir/discussions/455#discussioncomment-18487204) sent; [publication details](registry/agntcy/README.md). [September 18 retry](research/distribution-2026-09-18/OASF_FOLLOW_THROUGH.md): refreshed OIDC push still denied; [maintainer confirmed the testbed is read-only and requires our own federated node](https://github.com/agntcy/dir/discussions/455#discussioncomment-18505900). [Federation research](registry/agntcy/FEDERATION.md): recurring-fee hosting declined by the keeper September 18. Anro free external-ingestion request sent the same day; awaiting reply, not send authorization. Anro’s current public route for externally hosted agents is domain-manifest crawling; its publisher search still returns zero. A direct external-record upload route has not been established. [September 18 readback](research/distribution-2026-09-18/README.md). |
| UCP | [Live profile](https://scvd.store/.well-known/ucp) · [payment handler](https://scvd.store/ucp/specs/payment/usdc-x402) | Live September 19: profile advertises catalog, checkout and order. [UCP Checker report](https://ucpchecker.com/check/scvd.store) confirmed with its discovery Verified label and schema warnings. Paid hello/Base evidence is recorded in [#842](https://github.com/seancrecord/scvd-general-store-repo/pull/842); wider product/rail qualification is separate. [Community directory #3](https://github.com/homototus/ucp-directory/issues/3), UCPList merchant form and [Awesome UCP #30](https://github.com/Upsonic/awesome-ucp/pull/30) submitted, review pending. Google onboarding and custom-handler compatibility remain separate. [Readings and receipts](research/ucp-distribution-2026-09-19/README.md). |
| Skills/plugins | [Skill index](https://scvd.store/.well-known/agent-skills/index.json) | Reuse the package across coding hosts; marketplace review remains host-specific. See below. |

## Plugin and skill channels

| Destination | Existing asset / observed status | Admission route or remaining gate |
| --- | --- | --- |
| OpenAI / ChatGPT | [Verifier plugin published](https://chatgpt.com/plugins/plugin_asdk_app_6aaa9b3afcc081918be808a0d8cfd212); keeper reports the skill update completed September 17 | Upload/update task closed; review and publication status of that update have not been independently checked; [packet](registry/openai-plugin-verifier-submission.md). GitHub changes do not update uploaded skills. |
| Awesome Copilot | Root Agent Plugins package submitted as [#3255](https://github.com/github/awesome-copilot/issues/3255); 0.2.4 automated skill/manifest/install gates passed at immutable pin `e7f6c068` | Maintainer review pending. Continue this issue. |
| GitHub Agent Finder | [PR #34](https://github.com/github/agentfinder-catalog/pull/34) already includes both skills plus MCP/plugin entries | Existing review; [drawer](registry/agentfinder/README.md). Tab's previous registry-version blocker is cleared; it is not thereby in this PR. |
| Cursor | [Cursor Directory listing](https://cursor.directory/plugins/scvd-general-store-repo) was updated September 18: current name/description/keywords, both skills, and pinned Tab configuration. [September 18 completion record](research/distribution-2026-09-18/FOLLOW_THROUGH.md). Official publisher application **submitted September 17; review pending**. [Receipt](research/distribution-2026-09-17/observations/cursor-publisher-submission.json). | Both MCP servers loaded and free preflight passed in Cursor CLI. Both skills remained absent in normal Agent mode and a portable-only control; [recheck](research/distribution-2026-09-17/observations/cursor-agent-mode-recheck.json). Native desktop qualification remains. Marketplace acceptance is unverified. |
| Claude community marketplace | **Submitted September 17 for Claude Code; review pending.** [Receipt](research/distribution-2026-09-17/observations/claude-publisher-submission.json). | Follow-up Claude Code 2.1.274 test loaded both skills and completed a plugin-scoped free preflight; [receipt](research/distribution-2026-09-17/observations/claude-host-qualified-followup.json). Marketplace install and Cowork remain untested. Contributor Chrome DevTools moved to an explicit development config. Official curated marketplace has no application route. |
| Kiro powers | **Submitted September 18; review pending.** The form confirmed receipt. | Kiro CLI 2.22.0 with the v3 engine loaded both skills, exposed both MCP servers and completed a free preflight through the installed Power. IDE installation, paid operations and Tab operations remain untested. [September 18 completion record](research/distribution-2026-09-18/FOLLOW_THROUGH.md). |
| Cline | Official catalog [skill PR #122](https://github.com/cline/marketplace/pull/122) and [MCP PR #123](https://github.com/cline/marketplace/pull/123) submitted September 18; review pending | Cline CLI installed the selected skill and remote MCP configuration. Native Cline execution passed September 18 after sign-in: verification skill loaded and one free preflight returned not_ready / L1. [Native receipt](research/distribution-2026-09-18/cline-native-execution.json). [September 18 completion record](research/distribution-2026-09-18/FOLLOW_THROUGH.md). |
| OpenCode | [Official ecosystem PR #49834](https://github.com/anomalyco/opencode/pull/49834) and [community directory PR #736](https://github.com/awesome-opencode/awesome-opencode/pull/736) submitted September 18; review pending | Both skills discovered and both MCP servers connected. Native skill load and free preflight passed through user-authorized ChatGPT OAuth; [receipt](research/distribution-2026-09-18/opencode-native-execution.json). [Setup guide](registry/opencode/README.md) reuses existing assets. Paid and Tab operations untested. |
| Gemini CLI | Thin extension reuses `skills/` and HTTP MCP | CLI 0.60.0 installed the immutable public 0.2.4 package, discovered both skills and connected SCVD MCP. The `gemini-cli-extension` repository topic controls crawl eligibility; [gallery version 0.2.4](https://geminicli.com/extensions/?name=seancrecordscvd-general-store-repo) was opened September 18 with MCP and Skills labels. Model tool execution remains unverified. Google consumer-account login was rejected September 18; [official retirement and receipt](research/distribution-2026-09-18/gemini-auth-retirement.json). Further Gemini qualification skipped at keeper request September 18. |
| ClawHub / skills.sh | Existing public skill channels | Latest ClawHub publication comes from [its receipt](registry/clawhub/published.json), not an old queue paragraph. |
| Antigravity | [Local preview adapter](registry/antigravity/README.md) reuses the existing skills and remote MCP | Google's current format needs a minimal manifest and `serverUrl` mapping. Preview staged and assets checked; native host installation/execution remain unverified. No public third-party plugin intake established. Separate from Gemini gallery admission. |
| HOL plugin catalog | [awesome-ai-plugins PR #349](https://github.com/hashgraph-online/awesome-ai-plugins/pull/349) merged September 19 | Adds the existing skill/MCP package under Tools & Integrations. Required remote contribution gate passed; advisory scanner findings were [reviewed](https://github.com/hashgraph-online/awesome-ai-plugins/pull/349#issuecomment-5731442078). Source README and machine-readable plugins.json both list SCVD, confirmed September 19; [receipt](research/erc8004-followthrough-2026-09-19/hol-plugin-acceptance.json). Separate from HOL's ERC-8004 agent index. |
| Muse | [Submission receipt and scope](research/muse-connector-2026-09-19.md#submitted--keeper-completed-the-final-press); submitted September 19 | Keeper submitted SCVD x402 Verifier; browser confirmed receipt. Existing MCP, five free tools, no payment tools or authentication. Review pending; no public listing or native Muse execution claimed. No paid plan selected; terms were unavailable to the agent. Recurring-fee constraint remains. |
| Hugging Face | Dataset exists; verifier Space package prepared | Keep the existing [Space plan](registry/huggingface/README.md) and keeper decision; an artifact is not a deployed Space. |

Additional GitHub catalogs and actual submission status: [catalog findings](research/distribution-2026-09-17/GITHUB_CATALOGS.md).

For Cursor, Claude and Kiro, current primary sources and exact preparation gates
are in the [plugin packet](registry/plugin-submissions.md). Custom-MCP support
in another host is not evidence of a public submission route. Perplexity and
Windsurf remain research candidates, not confirmed marketplace opportunities.
[Additional host-route findings](research/distribution-2026-09-18/FOLLOW_THROUGH.md#additional-host-routes-checked)
cover Zed, Windsurf, OpenCode and VoltAgent, including the admission requirements
that remain unmet or unverified.

**AIFI:** [PR #13](https://github.com/0xBebis/aifi-directory/pull/13) repairs the failed issue #12 submission workflow, whose token could not create a PR. The replacement PR has a passing build and awaits review. No AIFI listing is claimed.

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
