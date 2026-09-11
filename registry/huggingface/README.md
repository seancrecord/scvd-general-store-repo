# Hugging Face (keeper reviews, keeper presses)

Prepared 2026-09-11. Rule 30 applies.

## What is already there

The corpus dataset, uploaded by the keeper on 2026-09-03:
`https://huggingface.co/datasets/keeper-scvd/x402-endpoint-readiness`
(the `keeper-scvd` namespace). Its card carries the concept DOI; the
store's Dataset nodes carry its URL as `sameAs`.

## What hf-discover indexes, and why the Space is shaped this way

hf-discover — Hugging Face's Agentic Resource Discovery service — reads
two sources: the curated `huggingface/skills` repository (Hugging
Face's own skills; a store skill would be declined on scope) and
**Spaces tagged `mcp-server`**, for which it writes an MCP-registry-
style descriptor whose endpoint is the Space's OWN Gradio streamable-
HTTP MCP endpoint. It does not take a remote URL. So a Space that
merely pointed at `https://scvd.store/mcp` would not be indexed as an
MCP server, and a Space that proxied the full door would put Hugging
Face in the path of x402 payments.

`spaces/scvd-x402-verifier/` is therefore a Gradio app with
`mcp_server=True` fronting the store's existing read-only door,
`/mcp/verifier`: five tools, each one JSON-RPC call, each answer the
store's own bytes. No `buy_*` tool is reachable; no secret is needed
or held; nothing settles. `npm run space:test` compiles it and runs
`test_verifier.py` against a fake transport. On 2026-09-11 it was
launched locally with the MCP server on and its
`/gradio_api/mcp/schema` listed the five tools by the door's names.

## The press

A **fine-grained** token, write on this one Space only, with an
expiry — never the account token, never anything from this repo's
secrets. Create the token at https://huggingface.co/settings/tokens
with "Write access to contents/settings of repos you select" scoped
to the Space once it exists (create the Space first with a
short-lived token, then narrow).

```bash
pip install -U "huggingface_hub[cli]"
hf auth login                    # paste the fine-grained token
hf repo create keeper-scvd/scvd-x402-verifier --repo-type space --space-sdk gradio
hf upload keeper-scvd/scvd-x402-verifier spaces/scvd-x402-verifier . --repo-type space
```

The README's frontmatter already carries `sdk: gradio`,
`sdk_version: 6.27.0`, `app_file: app.py` and the `mcp-server` tag,
so the Space builds and is tagged on the first upload. Watch the build
log once; the first start of a Gradio 6 Space takes about a minute.

## The read afterwards

```bash
curl -sS -X POST https://huggingface-hf-discover.hf.space/search \
  -H 'content-type: application/json' \
  -d '{"query":{"text":"scvd"},"pageSize":10,"federation":"none"}'
```

File the result beside `docs/ard-discovery/2026-09-06/ard-huggingface-scvd-store.json`
(zero results on 09-06). Then the MCP endpoint itself:
`https://keeper-scvd-scvd-x402-verifier.hf.space/gradio_api/mcp/schema`
should list the five tools.

## Kept out on purpose

- The full store door (`/mcp`, eighteen tools, six of them paid).
  ChatGPT's reviewers and hf-discover's readers both see a shelf; the
  verifier is the surface built for a client that should never see one.
- Any token, key or address in the Space. The five doors are free and
  keyless; a Space with a secret is a Space with something to leak.
