# ERC-8004 follow-through — September 23, 2026

This pass finishes the checks available without a new identity, payment or
wallet claim. It leaves external dependencies explicit. A pause is reasonable
after the tracking PR merges; this is not a monitoring schedule.

## Canonical identity checked

At Base block **51702240**, read-only `tokenURI(86957)` returned
`https://scvd.store/.well-known/agent-registration.json`.
[Chain receipt](onchain.json). The HTTPS document acknowledges the same Base
registry and identity, advertises x402 and reputation, and links MCP, A2A and
OASF. OASF reciprocates the identity; skills, domains and schema version agree;
the A2A registration version agrees with the card. All nine consistency checks
passed. [Checks and limits](canonical-check.json), [registration](registration.json),
[OASF](oasf.json), [A2A](a2a.json).

No canonical repair or on-chain write is indicated by these checks. They do
not establish federation publication, a current-byte OASF signature or paid
service qualification. A separate Python urllib MCP initialize request was
refused HTTP 403; the 8004scan interactive tester below succeeded. Those two
client observations are retained without assigning a cause.

## Directory outcomes and next triggers

| Directory | Current observation | Next trigger / remaining action |
| --- | --- | --- |
| [8004scan](https://8004scan.io/agents/base/86957) | Present. Cached MCP badge still says unhealthy / HTTP 405, checked about nine hours earlier. Its own **Test MCP endpoint** result identifies scvd-general-store v0.5.0, lists 21 tools and displays 1016 ms. The cached badge remains unchanged. | Added this new same-site reproduction to [existing #51](https://github.com/alt-research/8004scan-issue-tracker/issues/51#issuecomment-5802036939). Await operator response; no tool invocation or payment. |
| [trust8004](https://trust8004.xyz/agents/8453%3A86957?tab=metadata) | Present. Expanded Raw Agent Data still has x402support false, supportedTrusts empty, registrations empty and nine services. Refresh profile did not visibly change those fields; canonical document has 14 services and the correct fields. | [Existing #1](https://github.com/trust8004/requests-issues/issues/1) remains open without replies. Await refresh/parser correction; no redundant nudge. |
| [Agentscan](https://agentscan.info/agents/0711e5ab-eca5-42cc-a7ca-38b433689d56) | Present. Metadata refreshed September 23 and correctly displays 14 services, x402, identity and declared OASF skills/domains. Separate AI taxonomy still says Image Generation / Banking. | The official footer links [Alias X](https://x.com/Alias_labs) and [Telegram](https://t.me/ILoveAliasAI1). X is signed out in this browser. [Prepared report](../erc8004-followthrough-2026-09-19/README.md#prepared-agentscan-report--unsent) remains unsent; operator contact needs a signed-in channel. Do not file against the unrelated validator codebase. |
| [QuickNode](https://erc-8004.quicknode.com/agents/base-mainnet/86957) | Rendered identity, canonical URI, Base registration, x402 label and MCP/A2A/OASF endpoints confirmed. | No correction established in this scoped read. No wallet claim attempted. |
| [AgentERC](https://agenterc.com/explore/base/86957) | Confirmed earlier September 23, with operator acknowledgment. | Earlier ingestion request resolved; [receipt](../distribution-2026-09-23/listing-readback.json). |
| [8004agents](https://8004agents.ai/base/agent/86957) | Prior September 17 detail read confirmed identity, MCP/A2A/OASF and x402. | Existing listing retained; not freshly reread in this pass, claim flow untested. |
| HOL ERC-8004 index | Exact nativeId and scvd.store searches both HTTP 200 / zero hits; control returns one hit and nonzero total. | September 19 ingestion request remains submitted. No fresh inbox check or operator reply established in this pass. Wait for ingestion or reply; [original receipt](../erc8004-followthrough-2026-09-19/hol-contact-receipt.json). HOL plugin catalog acceptance is separate. |
| [AgentRanking](https://app.agentranking.io/) | Homepage and documented free identity API both HTTP 522. | Retry when service recovers; listing/claim flow unverified. |
| [Agent Arena](https://agentarena.site/api/agent/8453/86957) | HTTP 404 for SCVD, HTTP 200 for its own Base 18500 control. Its docs describe automatic indexing and a paid new-registration route; a free operator correction route was not established. | Await a working existing-identity correction route. Do not mint a second identity to solve an index gap. |
| [8004.directory](https://8004.directory/) | DNS resolution failed from this client. | Retry on recovery; not proof of delisting. |
| AIFI | [Replacement PR #13](https://github.com/0xBebis/aifi-directory/pull/13) remains the existing submission route. | Await review; no new duplicate submission or acceptance claim. |
| x402synthex | Earlier research did not establish the intended directory URL. | Keep deferred until an authoritative destination is supplied; no speculative submission. |

[HTTP observations](readback.json). Browser entries are dated operator
observations, not saved raw DOM snapshots. Public scores and directory badges
are not adopted as SCVD audit or certification claims.

## Pause point

SCVD's identity chain and cross-links are consistent. Remaining work is a
maintainer response, service recovery, or signed-in Agentscan contact. Keep
those requests open, retain their existing URLs, and resume on a concrete
response or changed result. OASF federation, other plugin admissions and buyer
qualification remain separate queues. No recurring-fee service was selected.
