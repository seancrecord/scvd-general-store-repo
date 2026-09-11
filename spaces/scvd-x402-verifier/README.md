---
title: SCVD x402 Verifier
emoji: 🔎
colorFrom: gray
colorTo: yellow
sdk: gradio
sdk_version: 6.27.0
app_file: app.py
pinned: false
license: mit
short_description: Five read-only x402 verification tools, as an MCP server.
tags:
  - mcp-server
  - x402
  - agentic-commerce
  - verification
  - conformance
  - signed-artifacts
---

# SCVD x402 Verifier

scvd.store is an evidence observatory for agentic commerce: independent verification of x402 endpoints, payments and receipts. Before an agent pays an x402 endpoint, we check that it can be paid. After it pays, we check the signed receipt. Over time we watch endpoints and publish a dated, signed corpus. Sellers use it to prove a door works; buyers use it before spending. Every artifact is signed, expires, and names what we did not see. Not escrow, not a rating, not a guarantee.

This Space is the store's **read-only verifier door** (`https://scvd.store/mcp/verifier`) with a Gradio face and an MCP endpoint. Five tools, each one call to the door, each answer the store's own and unmodified:

| tool | what it answers |
|---|---|
| `preflight_x402_endpoint` | Does this URL serve a 402 challenge a stock x402 client could sign? Every check named. |
| `verify_x402_receipt` | Is this signed offer or receipt, from any issuer, structurally sound and signed by the key it claims? |
| `lookup_endpoint_readiness` | What the signed weekly corpus holds about one host, with the gaps counted against the store. Never a ranking. |
| `get_defect_definition` | One named x402 defect class from the registered vocabulary, or the whole list. |
| `verify_scvd_artifact` | The exact signed bytes and key behind a certificate, stamp or anchor scvd.store issued. |

## As an MCP server

This Space runs with `mcp_server=True`. Point an MCP client at its `/gradio_api/mcp/` endpoint, or skip the Space and use the door directly:

```
POST https://scvd.store/mcp/verifier
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

The full store, including the paid instruments, is a different door: `https://scvd.store/mcp`. It is deliberately not reachable from here.

## What this Space does not do

It asks for no credentials, keys or wallet secrets, and holds none: every door it calls is free and keyless. It sells nothing and settles nothing, so no payment ever transits Hugging Face. It does not re-derive, re-score or summarise: an answer read here is byte-for-byte the answer the door gives, including every line about what the check could not see. Unknown is reported as unknown, never as a verdict.

## Source

The Space's code lives in the store's repository under `spaces/scvd-x402-verifier/` and is tested there: [seancrecord/scvd-general-store-repo](https://github.com/seancrecord/scvd-general-store-repo). MIT. Operated by Record Creative Co. LLC.
