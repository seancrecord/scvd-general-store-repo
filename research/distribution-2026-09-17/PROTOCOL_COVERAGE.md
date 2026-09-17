# Protocol discovery and admission — September 17, 2026

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
| A2A — a2a-registry.org | Different community registry, operator A2ARegistry | Public search returned zero. Documented `/public/ingest` POST returned 404. Public `/submit` UI offers URL scan; its scan/submit flow was not completed. Ownership verification is separate. |
| MPP — mpp.dev/services | Official project's curated service directory | PR to `tempoxyz/mpp`, editing `schemas/services.ts`; generate discovery and run type/build checks per its contribution instructions. Requires a live production MPP service. SCVD native checkout not currently advertised by the tested endpoint. |
| MPP — MPPScan | Merit Systems discovery directory, linked by MPP project | URL registration at `mppscan.com/register`. Needs live MPP challenge and compatible OpenAPI metadata; blocked on activation and discovery qualification. Endpoint-only fallback also needs a valid MPP challenge and input schema. |
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

### MPP release gate

At 18:30 UTC on September 17, an unsigned GET of
`https://scvd.store/api/buy/context_anchor` returned 402 with an X402 challenge,
not a native MPP Payment challenge. This agrees with the
[bounded qualification report](../../docs/MPP_LIVE_RESULT_2026-09-17.md), which
records the pilot and subsequent disabled checkout. Repeat after today's release.

The [MPP project's instructions](https://github.com/tempoxyz/mpp#contributing)
require a live service for its curated directory. Prepare the exact active
routes, method, intent, currency and price from live capabilities after activation;
do not copy Tempo examples into the Base pilot's listing.

[MPPScan discovery requirements](https://www.mppscan.com/discovery/spec) require
structured pricing and protocol entries in `x-payment-info`. SCVD's existing
x402 metadata and proposed native discovery use conflicting shapes, as recorded
in the pilot report. Qualify this integration before registration, preserving
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
