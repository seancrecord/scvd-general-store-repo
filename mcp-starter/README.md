# scvd-mcp-starter

A zero-dependency MCP server over stdio that serves
[scvd.store](https://scvd.store)'s five read-only x402 verifier tools
to any MCP client: `preflight_x402_endpoint`, `verify_x402_receipt`,
`lookup_endpoint_readiness`, `get_defect_definition`,
`verify_scvd_artifact`. It answers the handshake itself and forwards
`tools/list` and `tools/call` to `POST https://scvd.store/mcp/verifier`
over HTTPS. Nothing here can pay or act: the upstream door has no paid
tool to reach, and this file holds no key and asks for nothing.

```
npx scvd-mcp-starter
```

Claude Desktop, Cursor, or any stdio MCP client:

```json
{ "mcpServers": { "scvd-verifier": { "command": "npx", "args": ["-y", "scvd-mcp-starter"] } } }
```

## Why a starter

The whole server is one file. Copy it into your project, keep the
handshake, and change `SCVD_MCP_UPSTREAM` (or the constant) to your own
MCP door when you have one: the framing, the error shapes and the
forwarding are the parts every stdio server needs and nobody wants to
write twice.

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
