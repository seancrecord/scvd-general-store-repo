# x402-verify

A zero-dependency verifier for **x402 Signed Offers & Receipts**,
`did:web` identity, and key history. Works on any store's artifacts,
including ours, with nothing privileged about ours.

MIT. Copy the file, vendor it, fork it — that is what it is for.

## Why it exists

Checking a signed offer or receipt properly means doing four separate
things, and most of the value here is that they stay separate:

1. Parse the JWS without trusting any of it.
2. Resolve the `kid` to a key you got from **somewhere other than the
   artifact** — otherwise you asked the artifact to vouch for itself.
3. Check the signature against that key.
4. Check the payload against the spec's schema.

**Steps 3 and 4 are not the same check.** A payload can carry a
perfectly valid signature over a schema-invalid body: the signer really
did sign it, and it is still not a conformant offer. That case is in
the published conformance vectors as a teaching artifact because it is
the mistake real implementations make. This library's test suite runs
against those vectors and asserts it fails for the right reason.

## Use

```js
import { verifyArtifact, formatResult } from "./x402-verify.js";

// Resolve the key from the artifact's did:web kid over the network:
const result = await verifyArtifact(jwsFromThePaymentHeader);
console.log(formatResult(result));

// Or check against a key you already hold, with no network at all:
const offline = await verifyArtifact(jws, { publicKey: "a1b2…" });
```

`result.ok` is the yes/no. `result.checks` is the report: `parse`,
`alg`, `kid`, `schema`, `key-resolution`, `signature`, and an advisory
`expiry`. Debugging your own implementation? Read the checks — knowing
*which* of the four failed is the difference between a verifier and a
wall.

Expiry is **advisory and never folded into `ok`**: an expired offer is
still a valid artifact, and you may be auditing history rather than
buying. Leeway defaults to 5 seconds and is yours to set — issuance
should be strict, consumption tolerant, because your clock and the
issuer's will differ.

## Runtime

Zero dependencies. Ed25519 verification uses WebCrypto (Node 18.4+,
Deno, Bun, Cloudflare Workers, recent browsers). If your runtime lacks
Ed25519 in WebCrypto, pass your own:

```js
await verifyArtifact(jws, {
  publicKey,
  verify: (signingInput, signature, key) => yourEd25519Verify(...),
});
```

The crypto is a seam on purpose. `fetch` is injectable the same way,
so you can point DID resolution at a cache, a fixture, or nothing.

## What it cannot do

It verifies **cryptography and shape**. It cannot tell you whether the
seller actually delivered what it promised — no offline check can,
because that is a fact about the world rather than about bytes. Anyone
claiming otherwise is selling you a feeling.

That gap is real and it is the honest reason a verifier is free: what
can be checked from your own machine should be, and what needs someone
to go and look is a different kind of thing entirely.

## Tested against

`../conformance/offer-receipt-vectors.json` — 2 valid and 3 invalid
artifacts, deterministic, regenerable byte-for-byte, signed with a
published test key that has never signed anything real. If this library
and those vectors ever disagree, one of them is wrong and the suite
fails before a stranger has to find out.
