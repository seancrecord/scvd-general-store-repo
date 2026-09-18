# Native MPP live results — 2026-09-18

Status: both native lanes an outside wallet can reach are qualified with
real purchases from the stock clients: the HTTP door after the resource-URL
fix the same client had surfaced, and the MCP door the same evening.

## HTTP: Context Anchor, stock client, outside wallet

- Buyer: CV, `mppx@0.10.1` EVM charge client, own funded wallet on Base,
  house-flagged by standing rule.
- Door: `GET /api/buy/context_anchor?summary=...`, the resource URL now the
  asked URL ([MCP release record](MPP_MCP_CHECKOUT_2026-09-18.md)).
- Purchase: d2d32f0a50f4e1b8cf9e2bc37115bd5c718ba3618d837e64f474af24321c2072
- Transaction: 0x2c9803179562ef638025887707164cd1749c94f405f693e21fd4534fe7593585
- Anchor: anchor_243bud6y8d, patron 420, dated 2026-09-18T16:45:13.472Z;
  CV re-verified the anchor's ed25519 signature against the published key.
- Exact transfer: 1 USDC on Base, 1000000 atomic.
- Keeper's authenticated inspection, read at 2026-09-18T17:03:17.827Z:
  protocol mpp, method evm/charge, network eip155:8453, door http, payment
  state settled, delivery delivered, house yes, accounting recorded and
  confirmed, individual ledger matched with no mismatched fields, item
  context_anchor.
- Client note: the challenge carries no EIP-712 domain; the stock client
  resolves it from its asset registry (`currencies: [Assets.base.USDC]`) or
  an explicit `authorization` option, which CV supplied. The payment guide
  now says so.

This house-funded purchase is not organic demand. The raw credential and
status bearer stay with the buyer and are excluded here.

## MCP: Small Blessing, stock MCP client, outside wallet

- Buyer: CV, stock `@modelcontextprotocol/sdk` Client wrapped in place by
  `McpClient.wrap()` from `mppx@0.10.1`, the same house wallet as above.
- Door: `https://scvd.store/mcp?payment=tool-result`, tool
  `buy_small_pleasure`, `item_id: "small_blessing"`, the cheapest door on
  the shelf at $0.005.
- Purchase: 19012a2887763eb887336a528ab7fbaed6a1a4783c91efd0e8b2fbab4859644a
- Transaction: 0x7802dfa677efdca9bcd2cb936052e78abc9044bfc5be839cb0767ebc6b69ccb0
- Certificate: cert_tzuqqvwep6, patron 421; the card pull returned a
  common "Blessing from the Jar", 20 of 63, print 19.
- The receipt's own record names `original_door: "mcp"`: the store settled
  this through the MCP lane, not the HTTP door.
- No client workaround was needed; the #804 resource fix held on this lane.
- Keeper's authenticated inspection: not yet pasted here. Expected reading
  on `/admin/purchases/{purchase id}`: protocol mpp, door mcp, house yes,
  accounting confirmed, individual ledger matched, item small_blessing.

Both purchases are house-funded and are not organic demand. Raw credentials
and status bearers stay with the buyer and are excluded here.
