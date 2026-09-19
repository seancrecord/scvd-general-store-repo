# ERC-8004 follow-through — September 18, 2026

Scope: finish ERC-8004 discovery corrections while the keeper's UCP release is in testing. UCP submission follows release; this pass does not inspect or change that build. Recurring-fee distribution/hosting is declined.

## Fresh findings

- The canonical [registration](https://scvd.store/.well-known/agent-registration.json), [A2A card](https://scvd.store/.well-known/agent-card.json) and [OASF record](https://scvd.store/agents/general-store) returned HTTP 200 around 20:40 UTC. Registration still has Base agent 86957, matching registry, web/MCP/A2A/OASF, x402Support true and supportedTrust reputation. OASF reciprocates the exact identity, and its skills/domains agree with the registration. The A2A version agrees with the current card. No canonical metadata defect was established in these checks; no new chain transaction or on-chain read was made.
- [AgentERC](https://agenterc.com/explore/base/86957) still renders Agent not found. [Odd Units](https://www.oddunits.dev/) identifies AgentERC as its project and publishes hello@oddunits.dev. A sent-mail duplicate search returned no match; the ingestion/reindex request was then sent from sean@recordcreativeco.com, asking for the free route. Gmail confirmed Message sent and the sent-message readback. No account, paid listing, duplicate identity or wallet operation was performed.
- [HOL exact identity query](https://hol.org/registry/api/v1/search?registries=erc-8004&metadata.nativeId=8453%3A86957&includeAggregations=false) and [domain keyword query](https://hol.org/registry/api/v1/search?q=scvd.store&includeAggregations=false) now return HTTP 200 with zero hits. An unfiltered ERC-8004 control returned another Base identity from the same registry. This establishes no match in these two queries, not the cause or a complete absence across all HOL indexes. It supersedes prior unavailable-read notes. HOL operator follow-up was sent September 19; [receipt and fresh queries](../erc8004-followthrough-2026-09-19/README.md).
- [AgentRanking](https://app.agentranking.io/) returned HTTP 522. Listing and claim status remain unverified.
- [Agentscan](https://agentscan.info/agents/0711e5ab-eca5-42cc-a7ca-38b433689d56) still shows the separate AI taxonomy Image Generation / Banking. Those differ from the canonical OASF declarations. Operator contact/report remains outstanding; no canonical taxonomy rewrite is warranted by that panel.
- Existing [8004scan #51](https://github.com/alt-research/8004scan-issue-tracker/issues/51) and [trust8004 #1](https://github.com/trust8004/requests-issues/issues/1) remain open and their comment API returned no comments. No duplicate reports or unchanged-state nudges sent.

## Sources and limits

Read [ERC-8004 identity/registration/domain verification](https://eips.ethereum.org/EIPS/eip-8004), [HOL search documentation](https://hol.org/docs/registry-broker/search/), and its [OpenAPI](https://hol.org/registry/api/v1/openapi.json) on September 18. Web-reader fetches for several live endpoints failed, while direct HTTPS and rendered browser reads supplied the evidence above. HOL OpenAPI succeeded over direct HTTPS despite a web-reader 503.

Evidence: [readback](readback.json), [registration](registration.json), [OASF](oasf.json), [HOL exact](hol-exact.json), [HOL keyword](hol-keyword.json), [HOL control](hol-control.json). No runtime code change, payment, protocol activation or test-suite run in this pass. No newly accepted listing is claimed.
