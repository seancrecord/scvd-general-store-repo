# Native MPP live results — 2026-09-18

Status: the first native purchase from an outside wallet with the stock
client passed on the HTTP door, after the resource-URL fix the same client
had surfaced. The MCP door's live result is recorded below when it lands.

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

## MCP: pending

CV's live buy through the MCP door with the stock MCP client wrapped by the
MPP client is in progress; its purchase id, transaction and the keeper's
inspection reading go here when reported. Until then the MCP lane is
qualified by fixtures and the shared lifecycle only.
