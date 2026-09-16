# Payment client paths — 2026-09-15

The store supports HTTP x402, paid MCP, and an explicit browser WebMCP
purchase bridge. Finding tools is separate from having a funded signer,
a supported payment network, and authorization to spend the quoted amount.
No additional merchant endpoint is needed just because a buyer uses CDP.

## CDP SDK and HTTP clients

CDP's `CdpX402Client` provides a managed wallet and payment signing to
`wrapFetchWithPayment` from `@x402/fetch`. A buyer can call a product's
`buy_url` with its required inputs; the wrapper reads PAYMENT-REQUIRED,
builds the payment, retries the same request with PAYMENT-SIGNATURE, and
returns the goods and PAYMENT-RESPONSE. The buyer must choose a production
wallet/network for a mainnet offer and configure their own spend policy.
Do not disable a buyer's spend controls to make an expensive product pass.

The same HTTP contract supports other compatible x402 v2 clients. A CDP
account, a Bazaar listing, and a generic wallet are not themselves evidence
that a particular client can sign every offered network or asset.

[CDP buyer quickstart](https://docs.cdp.coinbase.com/x402/buyer/quickstart)
provides the maintained wallet/client setup;
[client configuration](https://docs.cdp.coinbase.com/x402/buyer/client-configuration)
explains the buyer's spend controls. Credentials stay with the buyer.

## MCP clients

Use `https://scvd.store/mcp?payment=tool-result` with standard x402 MCP
payment clients. The compact catalog's per-item `mcp_url` already selects
this profile and limits discovery to that product's purchase tool.
The plain `/mcp` address retains its older JSON-RPC error profile for
existing clients. Choosing the profile explicitly preserves both clients.

An unpaid call returns `isError: true` with matching `structuredContent`
and `content[0].text` payment terms. The buyer retries the same tool and
arguments with `_meta["x402/payment"]`; retain the suggested idempotency
key too. A completed purchase returns goods and
`_meta["x402/payment-response"]`. A generic MCP host still needs a
payment-capable client and buyer approval to supply the signed payment.

[CDP's MCP guide](https://docs.cdp.coinbase.com/x402/buyer/mcp-payments)
describes the wallet adapter and `@x402/mcp` wrapper. Its Bazaar search
server is a directory/proxy, distinct from the store's own MCP endpoint.

## WebMCP browser clients

A compatible browser registers the store's free instruments plus
`quote_store_purchase` and `complete_store_purchase`.
Quoting is free. Completion transports an already-signed x402 v2 payload
from an external buyer-authorized wallet/client. Registration does not
supply a wallet or prove that the browser can authorize a USDC payment.

Preserve the returned body and `payment_response`. Publication responses
also expose `purchase_recovery`: the unchanged private Purchase-Recovery
header, base64-encoded JSON. Decode it privately for `purchase_id` and
`status_token`, then use the free `check_purchase` tool if needed. JSON
goods can carry the corresponding handle in `body.recovery`. These are
private retrieval capabilities; never publish the token. The bridge never
starts a recovery request or signs a replacement payment automatically.

## Evidence and remaining limits

The live Chrome 152 page registered 14 tools. Its free quote calls for
spot_check, small_blessing and daily_fortune returned usable terms. The
browser omitted consequentialHint from its returned annotation object;
our registration includes it, but browser confirmation enforcement was not
established. The signed-payment requirement remains in the bridge itself.

The Node regression executes the exact module served to browsers and
checks private recovery-header retention across a cached repeat, with no
second submission. Its new recovery test failed before the correction.
The served output-schema regression also failed before adding the field.
A stock @x402/fetch test exercises the actual parser, EVM payment payload
construction, retry, receipt and signed store certificate. Wallet signing
and facilitator responses are local doubles. It proves the client/server
handoff, not live signature verification or chain settlement.

The [unsigned live probe record](PAYMENT_INTERFACES_2026-09-15.json) covers
all 35 items returned by `/menu.json` at the observation time. All returned
402 and were decoded by `x402HTTPClient.getPaymentRequiredResponse` from
installed `@x402/core` 2.25.0. Each exposed the five advertised networks;
four products exposed multiple price tiers. This was a quote check, not a
purchase of every tier or a test of signing on every chain.

With an EVM scheme registered and the SDK's default spend controls, 21
quotes selected an offer. The other 14 were refused by its $1 per-payment
cap. These are buyer-budget refusals, not malformed challenges. An agent
needs the buyer's authorization and appropriate spend policy for a more
expensive purchase; the store should not reduce its price or evade that
policy. The live standard MCP quote also returned matching structured and
text terms plus its retry key.

The read-only six-door discovery check found all criteria met except its
advance expiry warning: the installed Edge WebMCP trial token expires
October 15, 2026, and Chrome's expires November 17. Its exit status was 1
for that warning, not a present outage. The existing keeper renewal note
now names both installed tokens. The official MCP registry description
matched the repository, and the API catalog, payment manifest and browser
declarations were reachable. These are dated observations, not a promise
that a directory will route traffic or that every browser supports WebMCP.

The record contains no payment payload or private recovery token. HTTP
observations used GET on each advertised `buy_url`; MCP used an unsigned
`buy_simple` call for `small_blessing` at `?payment=tool-result`. The SDK's
private offer selector was invoked directly to avoid calling a signer;
that selector is an audit detail, not a recommended application API.

Local validation: the focused Worker checks passed (4 files, 24 tests),
and all 13 Node bridge tests passed. The full Worker suite passed 715 files
and 14,064 tests, with one existing OpenAPI test timing out at 30 seconds
under concurrent load and one skipped test. Its unchanged file passed all
9 tests on isolated rerun. No timeout or test was altered; this was not a
single uninterrupted green full-suite run. Typecheck and both Worker builds
passed.
No live payment, CDP account operation, wallet connection, or registration
submission was made. A paid WebMCP purchase and a CDP-managed wallet purchase
remain unverified; successful discovery does not close either gap.

## September 16 follow-through

The #714 branch merge did not reach main. Its existing recovery fix and
client documentation are now integrated locally on the reach release branch;
production release remains gated on the new PR. The earlier observations
and validation above retain their original dates and limits. The current
[reach qualification](PAYMENT_REACH_QUALIFICATION_2026-09-16.md) uses the
public pre-payment hook, distinguishes each network and gives the tested
World USDC allowlist with an explicit atomic spending cap. World was refused
by the locked SDK's default asset policy. Do not disable spending controls
or treat adding the token without a cap as equivalent to a dollar budget.
That configuration reading proves selection only, not funded World or
CDP-managed-wallet settlement. Higher-price purchases still need explicit
buyer approval and an appropriate cap.

The integrated September 16 local full suite passes 732 files / 14,344
tests, one existing skip, exit zero. This is a fresh clean run; the earlier
September 15 run above keeps its timeout/rerun history. The new
[release validation](../research/payment-reach-2026-09-16/release-validation.json)
records the exact source/test hashes and remaining deployment boundary.
