# x402-sign

Mint spec-conformant **x402 Signed Offers & Receipts** for your 402s:
JWS compact, EdDSA over Ed25519, the extension's exact wire shape.
Zero dependencies, no call home, your seed never leaves your process.

**x402 v2** — this is tooling for the current protocol (the
`@x402/core` v2 ecosystem). Unscoped name, current spec: not related
to the deprecated v1 `x402-fetch`/`x402-axios` family.

**Where this sits in the stack:** x402 has a payment layer (the
facilitator verifies and settles) and a settlement layer (the chain).
This package mints the **trust layer** — the evidence a seller ships
with its 402s: a signed commitment to the terms before money moves,
and a signed receipt after it does, both checkable by a stranger
without asking either party. The payment layers prove money moved;
this layer proves what it moved *for*.

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

## Receipts, the higher-stakes half

A receipt carries a SETTLEMENT claim — who paid you, against what,
when — which makes it the artifact a dispute actually turns on. Same
sixty seconds:

```js
import { signReceipt } from "x402-sign";

const receipt = await signReceipt(
  {
    version: 1,
    network: "eip155:8453",
    resourceUrl: "https://your-domain/api/buy/thing",
    payer: settledPayerAddress,
    issuedAt: Math.floor(Date.now() / 1000),
    transaction: settlementTxHash,   // welcome, not required
  },
  { seedHex, kid },
);
// Return it with the goods: extensions["offer-receipt"].info.receipt
```

The required set is deliberately smaller than the offer's (version,
network, resourceUrl, payer, issuedAt — the terms live in the offer
it answers); extra fields like `transaction` and `amount` are welcome.
Receipts get the same byte-parity proof against the published vectors
as offers do — both halves proven, not one.

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
  resolve.
- **Rotation is where well-meaning operators break everything, so
  plainly: dropping an old public key ORPHANS every artifact you ever
  signed with it.** Each offer and receipt you issued verifies against
  the key that signed it, forever — remove that key from everything
  you publish and those artifacts don't become invalid, they become
  unattributable, which for a receipt is worse. Rotate by ADDING a new
  key (`#key-2`) and keeping every retired public key published
  alongside its service dates. If holders need proof your key history
  wasn't quietly rewritten, an externally anchored log is the strong
  form; the reference deployment's is at
  `https://scvd.store/.well-known/anchor-log.json`, method included.

## Why not a generic JWS library?

Use one if you like — the wire format is standard JWS and any
compliant signer can produce it. What this package adds is the
x402-shaped guardrails a generic library cannot: the spec's exact
required-field lists (shared, tested, with its sibling verifier),
refusal of holes and dollar-typed amounts at mint, the accepts-array
→ offers mapping in the extension's exact wire shape, a resolvable
DID document, and CI proof of byte-parity with the published
conformance vectors. The crypto is the easy part; signing the wrong
shape correctly is how the one prior attempt in the ecosystem ended
up with offers no verifier accepts.

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
