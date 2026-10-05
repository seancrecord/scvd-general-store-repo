# Research Comparison — public closeout, October 5

The implementation shipped in [#912](https://github.com/seancrecord/scvd-general-store-repo/pull/912),
merged September 24 at 18:53:59 UTC. Its final head
`90ac98cebdbdaf115698660abf2c3a5550997d5b` passed quality, all four test shards,
the required `check`, CodeQL and both Worker builds. Today's public readback
confirms the product is deployed. The earlier preparation record remains history.

## What is verified

| Surface | Observation | Retained evidence |
| --- | --- | --- |
| Store catalog | One matching item; 0.01 USDC, one-off, with the purchase and input-contract links. | [Catalog](catalog.json) |
| HTTP quote | Bare request and the original two public example URLs both return 402; each offered x402 rail quotes 10000 atomic units. Missing inputs are named before payment. | [Bare quote](quote.json), [valid-input quote](http-valid-input-quote.json) |
| MCP quote | Missing `urls` returns a free field refusal. Valid inputs return JSON-RPC payment-required code 402 with x402 and MPP terms. An initial connection reset is retained; one retry succeeded. | [Missing inputs](mcp-quote.json), [connection gap](mcp-valid-input-quote.json), [retry](mcp-valid-input-quote-retry.json) |
| Coinbase validator | `valid: true`, simulation `accepted`, and `index.active: true`; the service reports last crawl October 2 at 10:17:32.238 UTC. All returned required checks pass. | [Validation](coinbase-validation.json) |
| AgentCash origin discovery | Its OpenAPI-derived index includes the specific purchase route, fixed $0.01 price and x402/MPP protocols. This is origin discovery, not proof of search placement. | [Projected tool response](agentcash-discovery.json) |
| Unbranded search | The same query, broad setting and first-page limit as September 24 returned ten rows without SCVD. This says nothing about the rest of the index or other queries. | [Search projection](unbranded-search.json) |
| OpenAPI | The purchase operation is served in the public document. | [Operation projection](openapi.json) |

The [current Coinbase seller guide](https://docs.cdp.coinbase.com/x402/seller/get-discovered)
still separates unpaid validation from settlement-triggered indexing. Here the
validator also directly reports an active index entry; that does not establish
which transaction caused it, organic demand, curation or a buyer's completed journey.

## Remaining boundary

No wallet was created or read, no payment was signed, no research content was
purchased, and no new signed comparison was delivered or independently verified
in this pass. Paid/buyer qualification remains deferred by the keeper. This
closes the stale release and public-discovery uncertainty, not that separate gate.
No directory submission or partner outreach was sent.

Captures contain unsigned public responses. Response hashes identify captured
bytes; they do not authenticate a third party's claims. OpenAPI and AgentCash
records are explicitly marked projections. The file manifest detects changes to
this retained record and is not an independent signature.
