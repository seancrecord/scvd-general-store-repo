# x402 EXTENSION COVERAGE

**Generated 2026-09-14 from `specs/extensions/` at `x402-foundation/x402@HEAD`. Do not hand-edit — run `npm run extension-coverage`.**

9 extensions published: **2 read in full**, **1 adjacent**, **6 unread**.

`none` is a legitimate answer. The matrix exists so that it is a decision rather than an accident — and an extension the spec adds with no row here fails the generator rather than sliding in unremarked.

| Extension | Reads | Where | What it is |
| --- | --- | --- | --- |
| `bazaar` | **full** | src/services/preflight.ts | The `bazaar` extension enables **resource discovery and cataloging** for x402-enabled endpoints and MCP tools. Resource servers declare their endpoint |
| `builder-code` | — | — | The `builder-code` extension enables **on-chain attribution tracking** for x402 payments by appending [ERC-8021](https://eip.tools/eip/8021) Schema 2  |
| `eip2612GasSponsoring` | — | — | The `eip2612GasSponsoring` extension enables a "gasless" approval flow to the `Permit` Contract for tokens that implement **EIP-2612** for the [`schem |
| `erc20ApprovalGasSponsoring` | — | — | The `erc20ApprovalGasSponsoring` extension enables a **gasless ERC-20 approval flow** for the [`scheme_exact_evm.md`](../schemes/exact/scheme_exact_ev |
| `auth-hints` | — | — | The `auth-hints` extension provides authentication hints for specific payment requirements within x402. It enables clients to discover which `accepts[ |
| `extension-offer-and-receipt` | **full** | src/services/preflight.ts (`signed-offers`), src/services/ward-round.ts, src/services/market.ts | The Offer and Receipt Extension adds **server-side signatures** to x402, enabling: |
| `http-message-signatures` | adjacent | src/services/bot-auth-card.ts and the RFC 9421 work behind the signature agent card | The `http-message-signatures` extension establishes the **identity** of the paying agent through cryptographic signatures (RFC 9421). This extension i |
| `payment-identifier` | — | — | The `payment-identifier` extension enables clients to provide an `id` that serves as an idempotency key. Both resource servers and facilitators consum |
| `sign-in-with-x` | — | — | The `sign-in-with-x` extension enables [CAIP-122](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-122.md) compliant wallet-based authentic |

## Adjacent — the machinery exists, the reading in this position does not

### `http-message-signatures`

We sign and verify RFC 9421 for agent identity, but not as an x402 extension inside a 402. The machinery exists; the reading in this position does not.

**Cost:** Low — the verifier is already built. What is missing is recognising the extension where a challenge declares it.

## Unread

### `builder-code`

ERC-8021 attribution in settlement calldata: which application exposed the endpoint, which facilitator settled it.

**Cost:** Low to read. Worth noting that it is an attribution channel a directory could use to count us, which is a discovery question rather than a battery one.

### `eip2612GasSponsoring`

Gasless EIP-2612 permit approval for exact/EVM, facilitator pays gas.

**Cost:** Low to read, and the reading is buyer-relevant: it changes who pays gas, which changes what a quote actually costs.

### `erc20ApprovalGasSponsoring`

The same for ERC-20 tokens with no native gasless approval.

**Cost:** Low to read; same argument as its EIP-2612 sibling.

### `auth-hints`

Declares which accepts[] entries need authentication, so a client can register before committing to a payment method rather than after a wasted round trip.

**Cost:** Low, and squarely in this battery's job: it is a pre-payment fact a buyer needs, which is the whole thesis of the preflight.

### `payment-identifier`

An idempotency key carried in PaymentPayload, consumable by resource server and facilitator alike. This store has its own idempotency story — Idempotency-Key, idempotency.suggested_key on every 402 — built before the extension existed and not reconciled with it.

**Cost:** Low to READ (recognise and report it in the battery). Medium to SPEAK (emit it beside our own key, which is a wire change on a paid path and therefore a keeper's ruling).

### `sign-in-with-x`

CAIP-122 wallet authentication; lets a server skip payment for an address that has already paid. Server↔client only, no facilitator.

**Cost:** Low to read. We already read the extension's shape indirectly — sign-in-with-x.md is where #3133 bound the SIWX challenge to the request origin.

## What this matrix does not say

- **That `full` means complete.** It means the battery reads the extension where a challenge declares it, not that every MUST in its specification is checked.
- **That `none` is wrong.** Several of these are facilitator-side or settlement-side and a pre-payment reader has no view of them. The entry says what reading would cost so the decision can be made on a number.
- **Anything about adoption.** This counts what the specification publishes, not what any door actually serves.
