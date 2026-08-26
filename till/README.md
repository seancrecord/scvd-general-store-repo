# The till

The browser purchase path for scvd.store: one file, no build step, no
dependencies, served byte-for-byte at `/till.js`.

## Why it exists

Until 2026-08-26 nobody could buy anything from this store in a
browser. There was no wallet code on the site at all; the only script
the origin ever served was an analytics beacon. `/try` — the page whose
own copy says *practice on us, the till is real* — was a page of
instructions telling the reader to go and write an HTTP client. Every
sale the store had ever made required the buyer to write code or run an
MCP client.

Nobody decided that. It was the shape left behind by building the agent
door first and never coming back. House rule 53 names it: a buyer who
cannot pay is a design failure, not a segment we do not serve.

## What it does

The four steps of a paid x402 v2 request, and nothing else.

1. `GET` the buy URL. The store answers `402` with the terms in the
   `PAYMENT-REQUIRED` header (base64 JSON).
2. Pick an offer this wallet can pay, on the chain the wallet is on —
   the **cheapest** one, never the first.
3. `eth_signTypedData_v4` over an EIP-3009 `TransferWithAuthorization`.
4. Repeat the request with `PAYMENT-SIGNATURE`, and render what comes
   back: the goods, the certificate id, and its verify URL.

## What it never does

- Ask for, read, store or transmit key material. The wallet signs; the
  key never leaves it. That is bit-for-bit what every agent buying here
  already does.
- Write to `localStorage`, `sessionStorage`, IndexedDB or a cookie.
- Call anything but this origin. No RPC endpoint, no price oracle, no
  analytics, no third party of any kind.
- Report a success it did not observe.

The first four are enforced by `test/browser-till.spec.ts`, which reads
this file's source and fails on the words. The last one is the subject
of most of `till.test.mjs`.

## Money fails closed

Every path out of `purchase()` lands on one of four outcomes:

| outcome | meaning |
|---|---|
| `delivered` | the store answered 200 and the goods are in hand |
| `declined` | the store answered, definitively, no. Nothing moved |
| `refused` | this till stopped **before** anything was signed |
| `uncertain` | a signed authorization went on the wire and we do not know what happened to it |

`uncertain` is never softened into either neighbour. Rounding a silence
down to "failed" makes the buyer retry and pay twice; rounding it up to
"worked" makes them walk away from goods they own. Both are lies with a
price tag. When the answer is not known this says so, and hands over
the three facts that let the buyer settle it themselves: the
idempotency key that makes one retry free, the unix second the
authorization stops being spendable, and where to look a certificate
up.

## Progressive enhancement, in the strong sense

The pages this runs on render their instructions server-side and are
complete without it. The server adds exactly two things — an
`application/json` island and a `<script>` tag — and neither renders.
The till builds its own UI at runtime, and only when a wallet is
actually present: no provider, no markup, no difference. There is no
empty state and no dead button.

`test/browser-till.spec.ts` asserts this at the mechanism: the same
page rendered with and without a till differs by exactly the appended
block and at no other byte.

## Known limits

- **EVM only.** `window.ethereum` covers Base and Polygon in one path.
  Solana / Phantom is a second pass and is not pretended at; a
  Solana-only offer is skipped with its reason shown.
- **EIP-1193 via `window.ethereum` only.** EIP-6963 multi-wallet
  discovery is not implemented, so with several extensions installed
  this signs with whichever won the injection race.
- **EOA signatures only.** A smart-contract wallet (ERC-1271, ERC-6492)
  produces a signature this refuses, because EIP-3009 is checked by the
  token contract against an ECDSA recovery and a contract signature
  reverts there.
- **No chain switching.** On the wrong network the till says which
  networks are payable and stops. Moving somebody else's wallet between
  chains to make a sale is not a thing this store does uninvited.

## Tests

```
npm run till:test      # node --test till/till.test.mjs — the client itself
npx vitest run test/browser-till.spec.ts   # the server's half
```

The client is tested under Node rather than the Worker pool on purpose:
workerd forbids dynamic code evaluation, so a spec there could only
check that bytes went out, and bytes going out is not a payment path.

Licence: MIT, same as the repository it ships in.
