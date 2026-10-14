# scvd-mcp-starter

A zero-dependency MCP server over stdio that serves
[scvd.store](https://scvd.store)'s five free x402 verifier tools
to stdio MCP clients: `preflight_x402_endpoint`, `verify_x402_receipt`,
`lookup_endpoint_readiness`, `get_defect_definition`,
`verify_scvd_artifact`. It answers discovery or the legacy handshake locally and forwards
`tools/list` and `tools/call` to `POST https://scvd.store/mcp/verifier`
over HTTPS. Nothing here can pay: the upstream door has no paid
tool to reach, and this file holds no key and asks for nothing.
Calls record traffic statistics upstream. Readiness lookups for eligible
unprobed hosts publish their names in the asked-for queue for a later sweep.

```
npx scvd-mcp-starter
```

Claude Desktop, Cursor, or any stdio MCP client:

```json
{ "mcpServers": { "scvd-verifier": { "command": "npx", "args": ["-y", "scvd-mcp-starter"] } } }
```

## Why a starter

The whole server is one file. Copy it into your project or change
`SCVD_MCP_UPSTREAM` to a compatible, stateless JSON verifier endpoint.
Its discovery describes the default free verifier. If you adapt it to a
different service, update that description and check the upstream contract.

## Compatibility

- Modern clients can start with `server/discover`, then call tools without
  an initialization handshake. Each request needs protocol version and
  client capabilities in `params._meta`.
- Legacy clients keep using `initialize`, `notifications/initialized`,
  `tools/list` and `tools/call`. Initialization returns the requested
  supported legacy revision, or the existing default when unsupported.
- Unsupported modern versions return an explicit error with supported
  versions. Discovery reports the version list from the implementation.
- Cancellation stops the upstream request and suppresses late replies.

The upstream adapter expects single JSON responses, as served by the default
verifier. It is not a general Streamable HTTP client: SSE, upstream sessions,
authentication and custom tool-parameter headers are not implemented.
The runtime still has no dependencies. Repository checks use the official
MCP SDK's legacy client and its stdio transport for explicit modern probes;
those checks do not establish support in every desktop host.

The `0.2.0` compatibility update is prepared locally, not published. Until
release, `npx scvd-mcp-starter` installs the existing published version.

## What it is not

Not the store's full MCP door: that is `https://scvd.store/mcp`, which
lists the paid shelf beside the free instruments. This starter reaches
the verifier door only, on purpose, for a client that should never see
a paid tool. Every answer names its checks and what it cannot tell you;
never a ranking.

## Versioning

Versions are immutable once published. Minor versions add methods and
never change an existing answer's shape. The dated record is
`CHANGELOG.md`.
