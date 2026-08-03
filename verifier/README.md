# x402-verify

A zero-dependency verifier for **x402 Signed Offers & Receipts**,
`did:web` identity, and key history. Works on any store's artifacts,
including ours, with nothing privileged about ours.

MIT. Install it, copy the file, vendor it, fork it — that is what it
is for.

```
npm install x402-verify
```

It is one file with no dependencies, so vendoring the file is exactly
as legitimate as installing the package; the package exists so your
`package.json` can say what your code relies on.

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
import { verifyArtifact, formatResult } from "x402-verify";

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

## Anchored key history (optional)

Offline verification answers *"did this key sign this?"*. It cannot
answer *"was this key the issuer's key at the time, and can the issuer
prove they did not rewrite that later?"* — a self-hosted key registry
is editable after the fact.

Some issuers publish an append-only hash chain of their key state at
`/.well-known/anchor-log.json` and submit its digests to
[OpenTimestamps](https://opentimestamps.org), which anchors them into
Bitcoin. Where one exists:

```js
const history = await checkAnchoredKeyHistory("did:web:example.store", keyHex);
// { available: true, found: true, chain_ok: true,
//   first_seen_sequence: 2, bitcoin_confirmed: true, ots_proof_base64: "…" }
```

**The chain is recomputed here, not read.** `verifyAnchorChain()`
rebuilds each entry's canonical form from the snapshot's own fields —
ignoring any `canonical_form` string the issuer supplied — re-hashes
it, checks every `previous_digest` links to the entry before it, and
checks the sequence for gaps. That catches an edited snapshot, an
edited-and-*rehashed* snapshot (the next entry still commits to the old
digest), a deleted entry, and a canonical form that is not the snapshot
printed beside it. Without that, "it's in their anchor log" would mean
no more than "their web page says so."

One confirmed anchor vouches for the whole history behind it — but only
if the chain links, so `bitcoin_confirmed` goes false the moment
`chain_ok` does.

**Running `ots verify` is not the whole check.** That command proves
the digest existed by some Bitcoin block. It says nothing about the
date the *snapshot* claims. The comparison that catches backdating is
block time vs. `first_seen_at`: close together means the entry was
committed when it says it was; a much later block means the snapshot
was written after the fact and stamped later — which no amount of
internal chain consistency would reveal. The result carries
`settle_it_yourself` naming exactly this, because a verifier that
sends you off to run one command without saying what to compare has
handed you a ritual.

Two honest limits. `ots.status` is the **issuer's claim**: this library
has no Bitcoin header source, so it returns `ots_proof_base64` and
`ots_status_is_unverified_claim: true` for you to settle yourself. And
an anchor proves **when** a key state was committed, never **who
should have** held it — a thief with the key could anchor too. It
bounds a compromise window; it does not prevent one.

One thing no chain check catches: if an issuer's storage were wiped
and a fresh chain started at sequence 1, it would look genuine to
anyone who had never seen the old one. Same defence as any
transparency log — if you rely on an issuer's chain, keep the digest
you last saw. A chain that no longer contains it was replaced, not
extended.

An issuer without an anchor log returns `available: false`. That is
information, not a failure — most do not have one, and that is the
honest state of the ecosystem today.

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
so you can point DID resolution at a cache, a fixture, or nothing, and
`digest` is the same seam for the SHA-256 the anchor-chain check uses.

## What it cannot do

It verifies **cryptography and shape**. It cannot tell you whether the
seller actually delivered what it promised — no offline check can,
because that is a fact about the world rather than about bytes. Anyone
claiming otherwise is selling you a feeling.

That gap is real and it is the honest reason a verifier is free: what
can be checked from your own machine should be, and what needs someone
to go and look is a different kind of thing entirely.

## Tested against

The published conformance vectors at
<https://scvd.store/.well-known/conformance/offer-receipt-vectors.json>
— deterministic, regenerable byte-for-byte, signed with a published
test key that has never signed anything real, and including the
teaching cases (a valid signature over an invalid schema; a genuine
HS256 MAC forged with the public key) that real implementations get
wrong. The set carries its own counts and expectations, so this
README does not repeat a number that would rot. If this library and
those vectors ever disagree, one of them is wrong and the suite fails
before a stranger has to find out.

## Reference deployment

This library is developed and battle-tested at
[scvd.store](https://scvd.store), a live x402 store that signs every
artifact it sells and runs this same code behind its free conformance
desk — `POST https://scvd.store/api/conformance/v1` accepts any
issuer's signed offer or receipt (including its competitors') and
returns the same structured verdict this library produces, with the
store's conflict of interest declared in the response. Useful as a
second opinion on your implementation, or as a live counterpart whose
402 responses carry real signed offers to test against
(`GET https://scvd.store/api/buy/hello`). No account, no wallet, no
call home in this file — the store is a deployment of this library,
not a dependency of it.
