# Protocol discovery and admission — September 17, 2026

**September 18 readback:** [current follow-through](../distribution-2026-09-18/README.md) confirms Gemini gallery 0.2.4, the deployed A2A display repair, and the remaining account/Anro admission gates. Earlier observations below retain their dates.

Canonical home: https://scvd.store. Public protocol records are grouped at
`/trust` by the prepared implementation; this document retains submission
state and missing prerequisites. A pending issue is not an admitted listing.
This is a bounded coverage audit, not a claim to have checked every directory.

The keeper clarified that the new OASF work is the endpoint only, and authorized
straightforward distribution submissions in this task. No domain ownership,
wallet transaction, protocol activation or deployment was performed.

## Actions completed

- **Awesome Copilot:** [issue #3255](https://github.com/github/awesome-copilot/issues/3255)
  submitted for the existing skill + MCP plugin, public commit
  `b4c0bbdbde412a435129b00f07f2b1eb401e98ab`. Automated manifest validation,
  both skill checks, installation smoke test and version check passed.
  [Intake receipt](https://github.com/github/awesome-copilot/issues/3255#issuecomment-5719364859).
  Status: ready for maintainer review, not marketplace admission.
- **8004scan:** [issue #51](https://github.com/alt-research/8004scan-issue-tracker/issues/51)
  reports the cached MCP 405. A fresh September 17 read still showed that
  result, now labelled two hours old. Fresh initialize and negotiated SSE GET
  returned 200; bare GET returned 405. The report asks about probe method and
  cache timing without asserting an unproven cause.
- **A2A Directory:** found SCVD already in the
  [community source catalog](https://github.com/sing1ee/a2a-directory#readme),
  including its Agent Card and x402 service entry. Added this dated source
  observation to `trust-signals.ts`; no duplicate PR needed. The
  [downstream website](https://a2aprotocol.ai/a2a-agents) did not show SCVD in
  the fetched list, so source inclusion and website inclusion remain distinct.
- **Two community A2A APIs:** checked duplicates and attempted registration of
  `https://scvd.store/.well-known/agent-card.json`. Neither succeeded; details
  below. No listing or verification badge is claimed.

## OpenAI skill update — keeper completed September 17

The upload/update task is closed. Review approval and publication of the updated version remain unverified. The procedure below is retained for reference.

The existing SCVD x402 Verifier plugin can combine its remote MCP server with
the prepared verifier skill. This is a plugin-version update. The documented
flow is submission, review, then publication; skills are submission snapshots,
so changing GitHub files alone does not update a published plugin.

1. Open the existing plugin in the [OpenAI plugin portal](https://platform.openai.com/plugins)
   and start its next version/update draft. The precise version button label
   has not been inspected in the authenticated portal.
2. Retain the verifier MCP URL `https://scvd.store/mcp/verifier` and its existing
   authentication choice. In **Skills**, upload
   [scvd-x402-verifier.zip](../../registry/chatgpt/scvd-x402-verifier.zip).
   This is the verification-only skill, matching the published plugin's scope.
3. Review the skill scan, current MCP tools, prompts and test cases. Use the
   existing submission materials in
   [the verifier package](../../registry/openai-plugin-verifier-submission.md).
   The ZIP was checked against its source tree; that check is not a host-side
   skill installation or a substitute for testing the combined draft.
4. Describe the change in release notes, submit for review, then publish the
   approved version from the portal. No skill upload was performed here.

Suggested release note: “Adds the SCVD x402 Verifier skill to guide use of the
existing verification tools and explain evidence limits. The skill uses the
existing verification-only MCP endpoint.”

Sources: [submission and published-version rules](https://developers.openai.com/plugins/deploy/submission),
[skill packaging](https://developers.openai.com/plugins/build/skills).

## Coverage by protocol

| Protocol / destination | What it is | Current state and next action |
| --- | --- | --- |
| OASF — Cisco AI Catalog / AGNTCY Directory | Project/public deployment and federation | Origin record is live. No Cisco listing confirmed; shared push previously denied. Resolve admission, recut/sign current bytes, publish/announce, then verify CID, name/signature, scan and remote discovery separately. |
| OASF — Anro | Additional directory peer | Publisher search returned zero. Same current signed record needs publication through its supported flow. Do not reuse the historical CID for changed bytes. |
| OASF ↔ ERC-8004 | Canonical cross-link | Already live in both directions; keep the working HTTPS record until a new immutable resolver is verified. |
| ERC-8004 indexers | On-chain event/metadata discovery | Five confirmed views; parser/probe discrepancies retained in [the audit](README.md). 8004scan issue filed. trust8004, Agentscan and AgentERC follow-ups remain. |
| A2A — standard Agent Card | Official protocol discovery mechanism | Live card advertises 0.3.0 at `/.well-known/agent-card.json`; do not call it 1.0 conformance. Existing directory records include Agent Tools and Agenstry. |
| A2A — sing1ee/a2a-directory | Community source catalog | SCVD already listed; newly recorded in signals. No new PR. Downstream a2aprotocol.ai rendering not confirmed. |
| A2A — a2aregistry.org | Community registry, operator prassanna-ravishankar | Initial documented search returned zero. Registration POST returned 503 `unconditional drop overload`; subsequent search also failed. Persistence cannot be confirmed; search again before retrying. |
| A2A — a2a-registry.org | Different community registry, operator A2ARegistry | The earlier documented `/public/ingest` POST returned 404. A fresh web search found no SCVD; the public scan/confirm form subsequently registered [SCVD Evidence Agent](https://www.a2a-registry.org/agent/store.scvd.scvd_evidence_agent). Listing opened and confirmed, explicitly unclaimed. Claiming/ownership verification remains separate. [Receipt](observations/a2a-registry-submission.json). |
| MPP — mpp.dev/services | Official project's curated service directory | PR to `tempoxyz/mpp`, editing `schemas/services.ts`; generate discovery and run type/build checks per its contribution instructions. Requires a live production MPP service. Context Anchor now advertises native MPP EVM charge / Base / 1 USDC, with matching menu and OpenAPI capability declarations. Official [PR #991](https://github.com/tempoxyz/mpp/pull/991) submitted; generation, types, build and 34 focused tests passed. Review pending. This catalog request remains scoped to Context Anchor; the later whole-shelf HTTP extension is tracked in [#790](https://github.com/seancrecord/scvd-general-store-repo/pull/790). |
| MPP — MPPScan | Merit Systems discovery directory, linked by MPP project | URL registration at `mppscan.com/register`. Needs live MPP challenge and compatible OpenAPI metadata; native Context Anchor challenge is now live; the [additive OpenAPI repair](../../docs/MPP_OPENAPI_DISCOVERY_2026-09-17.md) now describes both protocols and passes the compiled local directory-reader check. Deployment readback is tracked with the repair. Pinned discovery 1.7.5 parses the live EVM/Base MPP option as `tempo:8453` and omits decimals; reported in [Merit #1209](https://github.com/Merit-Systems/x402scan/issues/1209). Registration remains unsubmitted. |
| MCP / WebMCP / x402 | Existing discovery surfaces | Existing records preserved and grouped in README/trust. No new universal WebMCP registry was established by this pass; browser tool registration and MCP indexing are distinct. |
| Skills + MCP — Awesome Copilot | Official GitHub-hosted community catalog | Submitted #3255; all automated gates passed; maintainer review pending. Agent Finder PR #34 remains a separate existing request. |
| Skills + MCP — OpenAI | OpenAI plugin directory | Existing verifier published. Keeper completed the skill update September 17; updated-version review/publication remains unverified. |
| Skills + MCP — Gemini | Extension gallery discovery | Thin extension exists. Consumer-context correction prepared locally. After release, set the documented repository topic and verify crawl/install; no gallery presence claimed. |
| UCP — protocol discovery | Official profile standard | Planned SCVD inspection experiment. A business implementation would publish a truthful `/.well-known/ucp`; this is not itself admission to a shopping platform. No placeholder profile or merchant-support claim added. |
| UCP — Google Merchant Center | Official Google platform onboarding | Technical implementation first, then interest form, selected-merchant integration hub, sandbox validation and review. Needs Merchant Center/account/product information and operational commitments not established here. Not submitted. |

### Why A2A and UCP do not have one checkbox

The [A2A discovery documentation](https://a2a-protocol.org/latest/topics/agent-discovery/)
defines Agent Cards and describes curated registries, but does not standardize
their API or designate one mandatory public registry. Community sites using
“official” in their copy are not thereby endorsements by the standards project.
The [official partners page](https://a2a-protocol.org/latest/partners/) is a
partner roster, not evidence that an individual endpoint is indexed.

[UCP core concepts](https://ucp.dev/documentation/core-concepts/) use profiles
and capability negotiation for permissionless discovery, with optional separate
platform onboarding. The current SCVD roadmap describes read-only inspection;
merchant checkout participation is a separate scope decision. Google's
[integration hub process](https://support.google.com/merchants/answer/16992327?hl=en)
and [interest form](https://support.google.com/merchants/contact/ucp_integration_interest?hl=en)
are real admission routes, not general-purpose listings for UCP inspectors.

### MPP activation and remaining discovery gate

At 18:30 UTC on September 17, an unsigned GET of
`https://scvd.store/api/buy/context_anchor` returned 402 with an X402 challenge,
not a native MPP Payment challenge. This agrees with the
[bounded qualification report](../../docs/MPP_LIVE_RESULT_2026-09-17.md), which
records the pilot and subsequent disabled checkout. That is the earlier observation,
not current activation status.

At 21:13 UTC, after the keeper reported activation, the same unsigned GET
returned both an MPP `WWW-Authenticate: Payment` challenge and x402
`PAYMENT-REQUIRED`. The decoded MPP request specifies EVM charge, Base chain
8453 and 1 USDC. The compact menu and OpenAPI
`x-scvd-payment-capabilities` agree. [Retained live read](observations/mpp-context-anchor-live.json).
This read made no purchase and does not establish settlement or delivery.
That dated read covered Context Anchor HTTP GET. The later
[whole-shelf HTTP extension](../../docs/MPP_WHOLE_STORE_2026-09-18.md) and
[metadata repair](../../docs/MPP_OPENAPI_DISCOVERY_2026-09-17.md) have separate validation records.

The [MPP project's instructions](https://github.com/tempoxyz/mpp#contributing)
require a live service for its curated directory. Prepare the exact active
routes, method, intent, currency and price from the observed live capabilities;
do not copy Tempo examples into the Base pilot's listing.

[MPPScan discovery requirements](https://www.mppscan.com/discovery/spec) require
structured pricing and protocol entries in `x-payment-info`. The 21:13 UTC
OpenAPI read now has structured price and protocol entries, but its protocols
array still contains only x402; MPP appears in the separate SCVD capability
extension. Qualify that remaining integration before registration, preserving
existing x402 consumers. The URL form was inspected; no MPP listing was created.

## September 17 release follow-through

OpenAI update completed by the keeper. Gemini CLI 0.60.0 installed the public 0.2.4 package, discovered both skills and connected SCVD MCP; no model tool call or gallery listing is claimed. Copilot intake passed again for 0.2.4. [trust8004 #1](https://github.com/trust8004/requests-issues/issues/1) now records its reproduced metadata conflict. [Release record](RELEASE.md).

## Evidence and remaining scope

Public response captures and the successful Copilot intake receipt are retained
in `observations/`, with hashes in `evidence-manifest.json`. UI observations are
dated notes, not screenshots. New local changes remain uncommitted and undeployed.
Operator authentication, signing keys, wallet claims and pending protocol builds
remain prerequisites where listed. No automatic recurring monitoring was set up.

Final local verification after the added A2A record: 36 affected trust/discovery
tests passed; typecheck and whitespace checks passed. The existing evidence-limit
test caught the first entry wording; corrected wording passed the rerun. No full
suite or commit was run in this follow-up. Prior bundle and broader affected
checks are recorded in README.md.


### MPPScan qualification follow-up

The pinned `@agentcash/discovery@1.7.5` endpoint check finds the required
`summary` query parameter, input/output schemas and 1 USD price with no warnings,
but its static protocols remain x402-only. Explicit unpaid probe mode finds the
MPP option and incorrectly labels its Base chain as `tempo:8453`; it also omits
`methodDetails.decimals`. An isolated mocked-response reproduction confirms
the parser behavior independently of SCVD metadata.
[Report #1209](https://github.com/Merit-Systems/x402scan/issues/1209) and
[qualification receipt](observations/mppscan-qualification.json).
The linked discovery source repository returns 404; the public scanner imports
the same pinned library, so the report asks maintainers to transfer if needed.
The website widget and completed CLI origin audit both found 194 routes.
The CLI reports high route count and one route with missing auth mode at both
discovery layers; Context Anchor has no warnings but is statically x402-only.
This is discovery evidence, not registration or paid invocation. Fixing our protocol descriptor and
resolving the method/network parser remain separate prerequisites.


### Official MPP catalog submission

[PR #991](https://github.com/tempoxyz/mpp/pull/991) proposes only SCVD Context Anchor’s live
HTTP GET endpoint, EVM charge method and Base USDC terms. The description
names the required summary input. Generation, typecheck, production build
and 34 generator/catalog tests passed. Adding EVM exposed a generated-JSON
type assertion error; the PR includes a documented boundary cast correction.
[Submission receipt](observations/mpp-directory-submission.json).
Admission is pending; no accepted listing or broader MPP checkout is claimed.


### Additive OpenAPI repair

The x402-only observations above describe the retained pre-repair reads. The
[metadata repair](../../docs/MPP_OPENAPI_DISCOVERY_2026-09-17.md) adds the enabled
MPP method, intent and currency while preserving x402 fields. The pinned reader
recognizes both protocols, 1 USD and the required summary from the compiled
local Worker, with no endpoint warnings. Deployment readback is tracked with
the repair; the runtime parser issue and directory admission remain separate.
