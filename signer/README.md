# x402-sign

Mint spec-conformant **x402 Signed Offers & Receipts** for your 402s:
JWS compact, EdDSA over Ed25519, the extension's exact wire shape.
Zero dependencies, no call home, your seed never leaves your process.

The issuing half of [`x402-verify`](https://www.npmjs.com/package/x402-verify)
— different codebases on purpose, so neither vouches for the other.

```
npm install x402-sign
```

## Why your 402 wants signed offers

A census of every host on the x402 discovery list (2026-08-03, one
GET each, reproducible by anyone via the free public checker at
`POST https://scvd.store/api/preflight/v1`) found **34 of 35 hosts
serve no signed offers at all** — and the one attempting them serves
offers that fail JWS parsing before a verifier reads a single field.

A 402 without a signed offer asks the buyer to pay against terms
nobody committed to. With one, the buyer holds a pre-payment
commitment — price, asset, payTo, expiry — checkable against your
published key by anyone, forever, without asking you. In a market of
autonomous buyers deciding whom to trust mechanically, that is the
cheapest trust signal you can ship, and as of the census almost
nobody ships it.

## Sixty seconds to signed offers

```js
import {
  generateKeypair, didDocument, offersForAccepts,
} from "x402-sign";

// 1. Once: make a key, back up the seed, publish the DID document.
const kp = await generateKeypair();
// Serve this at https://your-domain/.well-known/did.json
// (content-type: application/did+json):
const doc = didDocument({ domain: "your-domain", publicKeyJwk: kp.publicKeyJwk });

// 2. On every 402: sign one offer per accepts entry.
const { extension, skipped } = await offersForAccepts(acceptsArray, {
  resourceUrl: "https://your-domain/api/buy/thing",
  seedHex: kp.seedHex,                       // from your secret store
  kid: `did:web:your-domain#key-1`,
});
// Splice `extension` into your PAYMENT-REQUIRED header JSON and 402
// body: { ...challenge, extensions: { ...challenge.extensions, ...extension } }
```

Receipts after settlement are `signReceipt({...})` with the payer,
transaction and settledAt added.

## What it refuses, on purpose

An offer or receipt missing a required field **throws instead of
signing** — a partial commitment under your signature is worse than no
offer at all. Amounts must be **strings of atomic units** (USDC has 6
decimals: `$0.005` is `"5000"`); a number throws, because dollar-typed
amounts are the classic million-fold pricing mistake. `offersForAccepts`
skips unsignable accepts entries and tells you which (`skipped`),
so silence is never mistaken for coverage.

## Provably conformant, not claimed conformant

Ed25519 signing is deterministic, so this library's output for the
published test vectors' payload and key **reproduces the known-good
vector JWS byte for byte** — that exact assertion runs in CI against
<https://scvd.store/.well-known/conformance/offer-receipt-vectors.json>.
Check anything this signs three independent ways: the `x402-verify`
package offline, the free desk at
`POST https://scvd.store/api/conformance/v1` (works on any issuer's
artifacts, conflict of interest declared in the response), or any
conformant verifier built from the vectors.

## Key handling, plainly

- The seed is a 32-byte secret. Generate it once, back it up offline,
  inject it via your secret store. It is never transmitted by this
  library and there is nothing to call home to.
- `generateKeypair({ seedHex })` is deterministic, so you can
  re-derive the public half from a backed-up seed with no state.
- Publish the DID document, or your `kid` is a name nobody can
  resolve. Rotating keys? Keep the old public key published forever —
  artifacts signed under it still deserve to verify — and consider an
  externally anchored key history; the reference deployment's is at
  `https://scvd.store/.well-known/anchor-log.json`, method included.

## Runtime

Zero dependencies. WebCrypto Ed25519 (Node 18.4+, Deno, Bun,
Cloudflare Workers, recent browsers). No WebCrypto Ed25519? Pass your
own `sign` function — the crypto is a seam, not a lock-in.

## Reference deployment

Developed and battle-tested at [scvd.store](https://scvd.store), a
live x402 store whose every 402 carries offers signed by this same
method and whose free tools check anyone's: endpoint preflight
(`POST /api/preflight/v1`), artifact conformance
(`POST /api/conformance/v1`), published vectors, and the offline
verifier. The store is a deployment of this library, not a dependency
of it.
