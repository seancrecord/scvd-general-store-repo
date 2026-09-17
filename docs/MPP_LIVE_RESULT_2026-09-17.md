# Native MPP qualification — 2026-09-17

Status: bounded live qualification passed for HTTP Context Anchor / EVM / Base / USDC, with the replay-before-expiry observation gap recorded below.

- Purchase: 2400af3fd88b666a61ca02b741476fe2692d9863ba744f4dcbc6df98575a3549
- Release: c3b3befcea2a714e9605cf45c3aa2d8b41c029eb
- Client: mppx@0.10.1 EVM client with Rainbow EIP-1193 signer
- Transaction: 0x0f6a01f88f78b794812c11c880409c78119225a8f10d22a4d6bcf3adb6948369
- Exact transfer: 1 USDC on Base, from the approved house buyer to the store.
- Anchor: anchor_5jkyq5gd68; certificate: cert_5aa8cb3n33. Both signatures verified locally against the published current key.
- Private status: settled and delivered.
- Original replay after expiry: same goods and receipt; charged_again false.
- Original replay with checkout disabled: same goods and receipt; charged_again false.
- Replay before expiry: not observed; permission arrived after expiration. No new payment was signed to fill that gap.
- MPP aggregate: 1 house purchase, 1000000 atomic USDC, 0 organic. Replays did not increase counts. x402 remained 106 organic and 320 house.
- Public homepage and rails: 106 organic purchases, 106 x402 and 0 MPP.
- Checkout disabled and unsigned offer checked; x402 still available. Shutdown versions: store 0473a99f-2f18-417b-ac3f-a3a6cda620fd, doors a74d1bd7-b973-4ccc-99f4-734ee2a092c9.
- Authenticated per-purchase accounting: passed. Keeper pasted the admin reading dated 2026-09-17T14:23:14.122Z: settled, delivered, house yes, accounting_recorded yes, accounting_check confirmed, individual ledger state matched, no mismatched fields. Purchase ID, transaction, payer and exact 1000000 atomic amount agree with the independently checked payment. Source: keeper-provided authenticated reading, not an agent-authenticated fetch.

Only the HTTP Context Anchor / EVM / Base / USDC combination was exercised. This house-funded purchase is not organic demand. Original credentials and recovery capabilities remain in the private journal and are excluded from this report.

## Evidence limits and release state

This is a sanitized operator record of the checks and the keeper's authenticated
admin reading. The transaction is independently inspectable on
[BaseScan](https://basescan.org/tx/0x0f6a01f88f78b794812c11c880409c78119225a8f10d22a4d6bcf3adb6948369).
The raw executable payment, status bearer and buyer journal are deliberately
excluded. The report is not itself a signed settlement attestation.

Successful provider acceptance proves this one authorization flow on this
account at this time. It does not establish provider commercial terms or every
failure mode. Before-expiry replay remains covered by fixtures, with no live
observation in this run. This qualification and its accounting checks do not
constitute blanket whole-store MPP availability.

## Follow-through in the rollout-readiness PR

- Preserve original native sale/admission evidence, with authenticated per-sale
  house corrections and exact count/amount adjustments in shared rollups.
- Show bounded HTTP request outcomes by declared protocol in admin. These count
  requests, including retries, and never substitute for the settlement ledger.
- Derive enabled HTTP capabilities from checkout configuration and the same
  native offer terms in menu, compact contracts, OpenAPI and the payment guide.
- Keep both deployment flags false. Ongoing activation is a separate release.

The [MPP discovery draft](https://github.com/tempoxyz/mpp-specs/blob/main/specs/extensions/draft-payment-discovery-01.md) and the current x402/AgentCash extension both use
`x-payment-info` with incompatible schemas. This PR preserves x402's existing
shape and uses the explicit store-specific `x-scvd-payment-capabilities` extension.
It does not claim draft-compatible native discovery or independent indexer
interoperability. Resolve and qualify that integration before directory claims.

Next: review and merge the readiness changes after full CI, then make a scoped
activation decision for the already qualified HTTP Context Anchor/Base/USDC
lane. MCP, other products/fulfillment families, networks, assets, refunds and
subscriptions remain separate implementation and qualification work.
