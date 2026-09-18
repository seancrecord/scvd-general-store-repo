# Current send status — September 18

The AGNTCY participation follow-up was also [sent September 17](https://github.com/agntcy/dir/discussions/455#discussioncomment-18487204).
Continue that request; do not send the historical draft again. September 18
A2A and HOL follow-through is recorded [separately](../distribution-2026-09-18/README.md).

8004scan [#51](https://github.com/alt-research/8004scan-issue-tracker/issues/51) and trust8004 [#1](https://github.com/trust8004/requests-issues/issues/1) are sent. Continue those issues, not duplicate reports. AgentERC remains an unsent draft; the September 18 note below identifies a published operator contact. Exact trust8004 sent body: [TRUST8004_ISSUE_BODY.md](TRUST8004_ISSUE_BODY.md).

# Directory follow-ups — submission status

The text below preserves submission preparation; the current status above governs which messages still need sending.

Recheck each live finding and any existing request immediately before sending.
Messages below ask for bounded corrections; none requests a trust score or
favorable rating. Where a contact route is unknown, resolve it from the
operator's current site rather than guessing an address.

## 8004scan — MCP health request

Destination: [official issue tracker](https://github.com/alt-research/8004scan-issue-tracker).
Title: Base 86957: cached MCP HTTP 405 versus working Streamable HTTP initialization

SCVD General Store's Base identity 86957 is listed at
https://8004scan.io/agents/base/86957. On September 17 its Services panel showed
MCP unhealthy with an HTTP 405 check from two days earlier. The endpoint is
https://scvd.store/mcp. A bare GET currently returns 405, while these protocol
requests succeed:

```sh
curl -i https://scvd.store/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"directory-repro","version":"1.0.0"}}}'
curl -i --max-time 4 https://scvd.store/mcp \
  -H 'Accept: text/event-stream'
```

Initialization returned HTTP 200. The second request returned HTTP 200 and an
initial SSE comment; its timeout is intentional. Could you refresh this check
and confirm its request method/Accept negotiation? We cannot infer from the
cached result which request the checker sent or whether the endpoint behaved
differently at that earlier time. An initialize-based check would distinguish
a transport failure from a bare-GET refusal. No payment or authentication is
needed for initialization.

## trust8004 — metadata normalization and protocol labels

Destination: operator's verified support/issue route; not yet identified.
Title: Base 86957 metadata differs from canonical x402Support and service fields

On September 17, https://trust8004.xyz/agents/8453%3A86957 showed SCVD with x402
unsupported. Its expanded JSON showed `x402support: false`, `supportedTrusts: []`
and `registrations: []`. MCP Tools and A2A Skills each displayed the four OASF
taxonomy labels.

The on-chain agentURI resolves to
https://scvd.store/.well-known/agent-registration.json. The source currently
contains `x402Support: true`, `supportedTrust: ["reputation"]`, the Base
registration, MCP `mcpTools`, and a separate OASF service with its own skills
and domains. Could you refresh this source and check field normalization and
service-specific parsing? We have not determined whether the discrepancy
comes from caching, parsing or both. OASF taxonomy labels should remain
distinct from MCP tool names and A2A skill IDs.

This is a metadata correction request, not a request for a reputation score.
Please share the source fetch time and any rejected fields if the refreshed
view still differs.

## AgentERC — existing Base registration ingestion

September 18 follow-through: [Odd Units](https://www.oddunits.dev/) identifies
AgentERC as its project and publishes hello@oddunits.dev. Email remains unsent.
The Agent Not Found result was reproduced. Its homepage reports Base indexing
last updated September 13 while Ethereum is current; ask about ingestion lag
before treating this as a canonical registration error.

Destination candidate: hello@oddunits.dev, from that public project page.

Could you check ingestion of Base ERC-8004 identity 86957, registry
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`? On September 17 a search for `scvd`
returned two unrelated BNB results, while
https://agenterc.com/explore/base/86957 displayed Agent Not Found. The on-chain
URI resolves to https://scvd.store/.well-known/agent-registration.json and
includes MCP, A2A and OASF services. Is this Base registration within your
current ingestion range, and can its existing record be reindexed? We are
not creating another identity to obtain a listing.

## AGNTCY/OASF — extend the existing participation request

Destination: [Directory participation discussion](https://github.com/agntcy/dir/discussions/455),
or the existing request if the keeper has one. Continue, do not duplicate,
the [September 16 draft](../distribution-admission-2026-09-16/README.md).

SCVD's current OASF record is https://scvd.store/agents/general-store, with its
domain key at https://scvd.store/.well-known/jwks.json and reciprocal ERC-8004
identity at https://scvd.store/.well-known/agent-registration.json. Local
signing/name verification succeeded in our September 15 run, but shared-node
publication was denied. The record was subsequently corrected and will need
a fresh CID/signature. A September 17 Cisco AI Catalog search for `scvd`
returned no match.

Which supported admission/publication path should we use to make this record
discoverable through the shared catalog and a second peer? We would also
appreciate feedback on the taxonomy and MCP module: SCVD offers free x402
verification and separately authorized paid signed observations. Is that
representation idiomatic, and which fields should an independent consumer
query to find it? Please distinguish signature/name verification, routing
publication and security scanning requirements so we can retain evidence
for each rather than infer one status from another.

## ERC-8004 community — interoperability findings

Destination: [the specification's discussion](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098),
after opening or resolving the operator-specific reports above.

We tested discovery of SCVD General Store, Base 86957, across several public
indexers. The same identity appears on 8004scan, Agentscan, 8004agents,
trust8004 and QuickNode. Its canonical file is
https://scvd.store/.well-known/agent-registration.json, with web/MCP/A2A/OASF
services and domain acknowledgment.

Two interoperability findings may be useful for registration fixtures:
one rendered view loses the canonical `x402Support` value and labels OASF
taxonomy skills as MCP tools/A2A skills; another shows a cached MCP 405 even
though a current initialize request and negotiated SSE GET succeed. We are
asking the operators to distinguish stale fetches from parser/probe behavior.
Would maintainers welcome a small cross-indexer fixture covering these
field names, per-service skill separation and transport-aware health checks?
We are seeking accurate discovery and evidence boundaries, not ratings.

## Agentscan — source taxonomy versus AI classification

Destination: operator support route to confirm from the current site; the
footer links Alias Labs and its GitHub repository, but this pass has not
established that repository as the Agentscan bug tracker.

SCVD's profile at
https://agentscan.info/agents/0711e5ab-eca5-42cc-a7ca-38b433689d56 correctly
renders the current registration and its OASF service. A separate panel headed
“OASF Taxonomy — Automatically classified by AI” instead labels it Image
Generation / Banking. Could the source-provided OASF taxonomy take precedence,
or could the inferred taxonomy be distinguished so consumers do not mistake
it for the agent's declared capabilities? Canonical record:
https://scvd.store/agents/general-store. Observation: September 17, 2026.
