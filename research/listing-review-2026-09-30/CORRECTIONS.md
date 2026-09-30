# Prepared corrections — September 30, 2026

Drafts and exact targets, not sent or applied externally. Use the existing
[distribution map](../../DISTRIBUTION.md) and keeper entries. No duplicate
requests; no buyer qualification, paid scan or directory subscription.

## Repair connections and mixed identities first

| Record | Exact correction | Existing route / status |
| --- | --- | --- |
| MCPpedia, store.scvd/general-store | Store is hosted Streamable HTTP at `https://scvd.store/mcp`. Remove the Tab description, `npx wrangler` stdio config and inferred zero-tool assertion. Tab is the separate `store.scvd/tab` / `scvd-tab` package. | Existing [#172](https://github.com/BbekShr/MCPpedia/issues/172) open September 30. Retain fresh evidence for that thread. |
| mcp.so, scvd-store | Replace `npx wrangler kv namespace create ORDERS` with the client’s remote HTTP MCP configuration pointing to `https://scvd.store/mcp`. That command creates storage; it does not start this server. | Existing [#4325](https://github.com/chatmcp/mcpso/issues/4325) open September 30. |
| m8ven, repository record | Separate remote-store tools from Tab tools such as `contribute_anonymized_delta` and `confirm_entry`. Read `/.well-known/mcp` for the store and the pinned Tab package for Tab. | Prepare a record-specific correction through the existing listing process; none sent. |
| signal402 | Remove Free labels from paid `spot_check`, `small_blessing` and `settlement_attestation` entries. Replace generic POST/prompt example with each current GET URL and required parameters (`host` for spot_check). Use current menu/challenge amounts. | No new request sent. Do not pay or execute the directory’s example. |

## Refresh stale descriptions after source release

GitHub About replacement (within its existing length limit):

> An evidence observatory for agentic commerce. Free x402/MPP endpoint inspection, signed-offer and receipt checks, endpoint watches and settlement attestations. Bitcoin-anchored observation corpus. Scoped findings and explicit gaps; current checkout methods at scvd.store/menu.json.

The current About says every verdict is signed and verifiable offline; free
endpoint inspection is an unsigned observation. Proposed topics: retain the
current set except redundant rail topics `base`, `polygon`, `solana` and
`x402-protocol`, replacing those four with `mpp`, `webmcp`, `a2a`, `ucp`.
This keeps the existing topic count. No repository setting was changed.

General directory description:

> SCVD is an evidence observatory for agentic commerce. Inspect x402/MPP endpoints without paying; check signed x402 offers and receipts; read dated endpoint observations with explicit gaps. The hosted MCP endpoint is https://scvd.store/mcp. A2A offers scoped evidence tasks; UCP advertises its enabled catalog and checkout; WebMCP registers tools in compatible browsers. Current item and checkout capabilities are at https://scvd.store/menu.json. Inspection is not proof of settlement or delivery.

Use the portion relevant to each directory, not a claim that each protocol
performs all those jobs. The prepared short MCP/plugin description is in
`server.json`, mirrored by the existing parity guards. Specific refreshes:

- **skills.sh:** replace retired “we badge what’s safe”/trust-layer text with
  the current canonical skill. No safety badge or merchant trust verdict.
- **mcpservers.org repository record, Glama, MCP Market, ZBS and Licium:**
  update stale positioning and rail lists; avoid “every purchase gets a
  certificate.” Human fulfillment first returns a ticket; publications have
  their own response format. Licium’s old probe remains a dated observation.
- **Circle partner page:** update the old $0.004 minimum/three-chain summary
  from current catalog terms, and scope signed/anchored claims to actual
  signed artifacts and corpus snapshots.
- **Agent Tools MCP and registry mirrors:** ingest the corrected MCP card
  and prepared registry description after release/publication.
- **WebMCP Directory:** request a fresh browser registration scan of the
  declared tool surface. Its one-tool display is not a new browser check by us.
- **agentage, MCP Marketplace, Ronin Forge and lightnow:** older tool counts
  are dated observations. Request fresh captures; do not silently rewrite them
  to the current server-card count or equate MCP counts with WebMCP counts.

## Release boundaries

Prepared locally: store MCP manifest **0.2.4**, portable plugin wrappers
**0.2.6**, CLI **0.4.0**, preflight SDK **0.3.0**. Defects **0.21.0** was already
prepared. The five other audited npm package versions match publication.

The source OASF JSON was regenerated, not signed, pushed or admitted. The
local Agent Finder draft now targets the prepared MCP version; **publish and
verify that version before updating external PR #34**. Its currently submitted
0.2.3 record is valid for the version still published today. Do not break it
by sending the unpublished URL early.

ClawHub’s retained publication receipt is historical; this pass did not
establish a fresh scan/admission result. Gemini remains paused for execution
qualification. Form-only submissions and inaccessible listings remain
unverified in this pass. Nothing here authorizes a new outreach round.
