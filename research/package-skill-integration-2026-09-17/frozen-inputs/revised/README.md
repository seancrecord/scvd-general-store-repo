# x402-verify

Verify an x402 compact JWS receipt or offer against a public key you supply.
Get a structured result that separates a failed check from unsupported
capabilities and missing evidence. Zero runtime dependencies. MIT.

## Try it locally

**Prepared 1.4.0 preview; unpublished.** Put the locally packed
`x402-verify-1.4.0.tgz` in a new directory, then install it:

```sh
npm install ./x402-verify-1.4.0.tgz
```

A source maintainer produces that file with `npm pack ./verifier` from the
repository root. This is a tarball test, not a registry installation claim.
The status fields below belong to this preview; older registry versions
may not expose them.

Save this as `verify.mjs` and run `node verify.mjs`. It uses a packaged
synthetic receipt and a separate public test-key fixture, with no issuer
network requests. The [fixture provenance](fixtures/start-here/README.md)
traces both to the independently generated and checked matrix.

<!-- quickstart-code -->
```js
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { verifyReceipt } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const load = (file) => JSON.parse(readFileSync(new URL(`./fixtures/start-here/${file}`, entry), 'utf8'));
const scenario = process.argv[2] ?? 'valid';
const file = new Map([
  ['valid', 'receipt.json'], ['tampered', 'receipt-tampered.json'],
  ['unsupported', 'receipt-es256.json'], ['unavailable-key', 'receipt.json'],
]).get(scenario);
if (!file) throw new Error(`Unknown scenario: ${scenario}`);

const { receipt } = load(file);
// Separate fixture key; these synthetic test bytes prove no real service identity.
const { publicKeyHex } = load('issuer-key.json');
const input = scenario === 'unavailable-key' ? { receipt } : { receipt, publicKey: publicKeyHex };
const result = await verifyReceipt(input, {
  subtle: webcrypto.subtle,
  // Make unavailable evidence reproducible. This example never contacts an issuer.
  fetch: async () => new Response(null, { status: 503 }),
});
const { status, reasonCodes, scope, doesNotEstablish } = result;
console.log(JSON.stringify({ status, reasonCodes, scope, doesNotEstablish }, null, 2));
```

Expected output:

<!-- quickstart-output -->
```json
{
  "status": "valid",
  "reasonCodes": [],
  "scope": "Signature valid over the receipt's bytes against the key supplied by the caller; the receipt's fields pass this package's local offer-receipt schema checks (rev 1).",
  "doesNotEstablish": [
    "merchant identity beyond the key the receipt was checked against",
    "payment settlement on any chain",
    "delivery of the purchased service",
    "authorization of the signing key for resourceUrl, now or at issuance"
  ]
}
```

`valid` means the signature and this package's local schema checks passed
against the supplied key. It does not establish delivery, settlement,
merchant trust, or either of these separate authorizations:

- **Signing-key authorization:** did the resource owner authorize this key
  to sign for `resourceUrl`, now or when the receipt was issued? A valid
  signature proves that the key signed the bytes; this check does not
  establish the owner's authorization.
- **Payment authorization:** may your agent spend your money? That decision
  comes from your own payment policy and permission, never this result.

For your own artifacts, establish the signing key and its resource
authorization independently. A key included beside an untrusted artifact
is not evidence of authority.

When displaying, storing or forwarding a result, retain `scope` and every
entry of `doesNotEstablish` verbatim alongside `status` and `reasonCodes`.
Put any shorter explanation in a separate field. In particular, “does not
authorize payment” does not replace the signing-key/resource exclusion:
one concerns your spending decision, the other the signer's authority.
This applies to all four outcomes, including unsupported or incomplete checks.

The same example exercises the other outcomes without editing code:

| Run | Status | Reason to inspect |
| --- | --- | --- |
| `node verify.mjs` | `valid` | No required failures |
| `node verify.mjs tampered` | `invalid` | `signature_invalid` |
| `node verify.mjs unsupported` | `unsupported` | `unsupported_algorithm` |
| `node verify.mjs unavailable-key` | `inconclusive` | `key_unavailable` |

The unsupported receipt is genuinely signed with ES256, which this package
does not implement. The unavailable-key case deliberately simulates a 503
key lookup. Neither result is evidence of bad cryptography. Keep `scope`
and `doesNotEstablish` with the status; a boolean alone loses those distinctions.
The script also ships at `examples/verify-receipt.mjs` inside the package.

## Supported checks

| Input or check | Current capability |
| --- | --- |
| Compact JWS, EdDSA / Ed25519 | Signature plus local revision-1 payload profile |
| ES256 / P-256 or ES256K / secp256k1 compact JWS | `unsupported_algorithm` |
| Labelled JWS object or EIP-712 envelope | `unsupported_format` |
| Key supplied by caller | 32-byte Ed25519 key as hex or bytes |
| `did:web` lookup | Selected Ed25519 JWK in a DID document |
| Caller-selected `issuerKeyUrl` | DID document, bare Ed25519 JWK, or `{ publicKeyHex }` |
| Resource authorization, delivery, settlement | Not established by the artifact APIs |
| Key history | Separate optional helpers; never implied by a receipt result |

Payload revision 1 is separate from the x402 payment protocol version.
The local schema still requires offer `validUntil` and does not check every
field type in the current extension. See the [independent fixture matrix](fixtures/independent/README.md)
for signed counterexamples, provenance and unsupported-family controls.
No SCVD key or issuer receives special treatment; there is no call home.

## Integrate your own artifact

One call, bounded evidence back. The key comes from the URL you pass
or the key you hold — never from the artifact, which would be the
artifact vouching for itself.

```ts
import { verifyReceipt } from "x402-verify";

const result = await verifyReceipt({
  receipt,                                        // the compact JWS
  issuerKeyUrl: "https://scvd.store/.well-known/did.json",
});
console.log(result.valid);             // true only when the required checks pass
console.log(result.status);            // "valid", "invalid", "unsupported", or "inconclusive"
console.log(result.reasonCodes);       // stable codes, empty when valid
console.log(result.scope);             // "Signature valid over the receipt's bytes against the issuer key at …"
console.log(result.doesNotEstablish);  // Preserve every exclusion, including signing-key/resource authorization.
console.log(result.verificationUrl);   // the free hosted desk that reproduces this check
```

`verifyOffer({ offer, issuerKeyUrl })` is the same shape for offers.
`fixtures/` in the package holds valid and invalid receipts and
offers cut from the published conformance vectors, and an issuer key
document, so your tests can run against real bytes with no network.

The report underneath, when you want every check by name:

```js
import { verifyArtifact, formatResult } from "x402-verify";

// Resolve the key from the artifact's did:web kid over the network:
const result = await verifyArtifact(jwsFromThePaymentHeader);
console.log(formatResult(result));

// Or check against a key you already hold, with no network at all:
const offline = await verifyArtifact(jws, { publicKey: "a1b2…" });
```

`result.ok` is the legacy yes/no. Only `status: "valid"` sets it to true;
`verifyReceipt` and `verifyOffer` expose the same boolean as `valid`.
A false boolean alone cannot tell a bad signature from missing evidence.
`result.checks` is the report: `parse`,
`alg`, `kid`, `schema`, `key-resolution`, `signature`, and an advisory
`expiry`. Debugging your own implementation? Read the checks — knowing
*which* of the four failed is the difference between a verifier and a
wall.

Expiry is **advisory and never folded into `ok`**: an expired offer is
still a valid artifact, and you may be auditing history rather than
buying. Leeway defaults to 5 seconds and is yours to set — issuance
should be strict, consumption tolerant, because your clock and the
issuer's will differ.

## Result statuses (prepared for 1.4.0; not yet published)

Branch on `status` and `reasonCodes`, rather than parsing the explanatory
prose. The status describes only the checks within `scope`:

| Status | Meaning |
| --- | --- |
| `valid` | Required checks in the stated scope passed. |
| `invalid` | Evidence establishes a required failure: malformed input, local schema failure, or failed signature verification. The reason identifies which. |
| `unsupported` | A required format, algorithm, key representation, resolver or runtime primitive is outside this implementation's support. |
| `inconclusive` | A supported check could not finish: required evidence is missing, ambiguous, malformed, or a provider failed. |

```js
const result = await verifyReceipt({ receipt, publicKey: independentlyTrustedKey });
switch (result.status) {
  case "valid":
    console.log("Signature and local schema checks passed", result.scope);
    break; // Your policy still decides what to do next.
  case "invalid":
    console.log("A required check failed", result.reasonCodes);
    break;
  case "unsupported":
    console.log("Needs another verification capability", result.reasonCodes);
    break;
  case "inconclusive":
    console.log("Verification is incomplete", result.reasonCodes);
    break;
}
```

Validity within scope does **not** establish delivery, settlement, merchant
trust, authorization of the signing key for `resourceUrl`, or permission to
spend. Resolving a key and verifying its signature do not establish that
the resource owner authorized it. Optional key-history helpers are separate
calls; the artifact result does not claim they ran.

Each check retains `ok` and `detail`, and adds `status` and an optional
`reasonCode`. A skipped signature has `status: "unobserved"`, `ok: false`,
and `signature_not_checked`; it is never a successful or failed cryptographic
observation. Advisory expiry never determines the overall status or its
`reasonCodes`.

When outcomes differ, **invalid > unsupported > inconclusive > valid**.
All non-advisory reason codes remain in the result. For example, a known
schema failure remains `invalid` even if the algorithm is unsupported;
the signature stays unobserved. An expired, otherwise valid offer remains
`valid`, with an advisory `offer_expired` check.

| Reason codes | What to do next |
| --- | --- |
| `malformed_input`, `malformed_header`, `malformed_kid` | Check the original compact JWS and required header fields. Do not repair signed bytes and assume the signature survives. |
| `schema_invalid` | Inspect the `schema` check and compare the payload with the local profile described below. A real signature can cover invalid fields. |
| `signature_invalid`, `signature_malformed` | Recheck exact signed bytes, signature encoding and the independently established key. Do not turn a failed verification into a retry success by trusting an embedded key. |
| `unsupported_format`, `unsupported_algorithm`, `unsupported_schema_version` | Keep the artifact unchanged and select a verifier that supports its declared format/version. A labelled object is not accepted as a compact string by this API. |
| `unsupported_did_method`, `unsupported_key_type`, `unsupported_runtime` | Supply a supported independently established Ed25519 key, resolver or crypto implementation. A custom crypto callback cannot enable other algorithms. |
| `key_unavailable` | Supply independently established key bytes or retry the key source. Absence today does not disprove historical validity. |
| `key_document_invalid`, `invalid_public_key` | Fix ambiguous/malformed key evidence. Supplied hex must decode to 32 bytes; malformed supplied keys never trigger a network fallback. |
| `verification_error` | Inspect the injected crypto provider; it must complete with a boolean. Preserve the incomplete result until verification actually runs. |
| `signature_not_checked` | Inspect the preceding algorithm and key-resolution checks; this is not evidence that the signature is bad. |
| `offer_expired`, `expiry_not_checked` | Apply your own freshness policy using the advisory check. Neither reason changes the overall artifact result. |

The accepted input remains a **compact JWS string**. An explicitly labelled
object envelope (including `{ format: "jws", ... }`) reports
`unsupported_format`; this release does not unwrap or verify those objects.
ES256, ES256K and EIP-712 are unsupported. Keys may be supplied as 32-byte
Ed25519 bytes/hex, resolved from `did:web` Ed25519 JWKs, or obtained from the
caller-selected `issuerKeyUrl` (DID document, bare Ed25519 JWK, or
`{ publicKeyHex }`). An invalid supplied key never falls back to the network.

The local revision-1 schema checks are deliberately unchanged: required
field presence, version, and timestamp types. In particular, they still
require offer `validUntil`, which the current extension specification makes
optional. They do not enforce every field type or rule in that specification.
`valid` therefore does not claim complete current-spec conformance. A future
integer payload revision reports `unsupported_schema_version` instead of
being judged by revision 1's fields.

### Migrate from the earlier boolean API

Callers can keep their existing boolean decisions. Consumers
that construct result objects themselves must add the new required fields
when using the updated TypeScript declarations. Provider exceptions now
produce structured incomplete/unsupported reports, rather than being
described as bad signatures or escaping for missing WebCrypto. The low-level
`verifyEd25519` helper retains its legacy contract: boolean, with an exception
when neither WebCrypto nor a custom verifier exists. Use the artifact APIs
for structured outcomes.

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

## The service window: was the key authorized *at the artifact's date?*

Signature validity asks *"did this key sign this?"*. Key resolution
asks *"which key does this selected document publish?"*. Neither asks the third
question: **was the key authorized at the time the artifact claims?**
A stolen *retired* key signing an artifact dated after its own
retirement passes both — the signature is real, the key genuinely was
the issuer's — and the artifact is a forgery all the same, because at
its claimed date that key had no authority to sign anything.

Issuers that publish key history with service dates (scvd.store
serves the shape at `/.well-known/scvd-signing-key`; nothing about it
is specific to that issuer) make the check possible:

```js
import { checkKeyServiceWindow } from "x402-verify";

const result = checkKeyServiceWindow(keyHistory, publicKeyHex, artifact.date);
// { status: "after_retirement",
//   window: { in_service_from: "2026-07-22", retired_on: "2026-07-31" },
//   detail: "the artifact is dated 2026-08-15, after this key retired…" }
```

`status` is one of `in_service`, `before_service` (a key cannot sign
before it exists — a backdated artifact), `after_retirement` (the
stolen-retired-key shape), `unknown_key` (no published window exists
to check), or `undated` (the artifact carries no parseable date —
reported, never guessed at).

The window is **inclusive at both ends**, deliberately: service dates
are calendar dates, and a handover is two moves that cannot be
simultaneous — the announcement deploys while the old key still
signs, the secret swaps after. An artifact dated on the retirement
day itself is the expected shape of a key's last honest signatures,
not a finding.

One honest limit, the same one the anchor section carries: the window
comes from the issuer's **own published registry**, which the issuer
can edit. Where the issuer anchors key history, `checkAnchoredKeyHistory`
bounds how far back that registry could have been quietly rewritten.
The two checks are halves of the same question.

## Runtime

The JavaScript library uses WebCrypto or a caller-supplied verifier. The
quickstart is a Node example and explicitly supplies Node's built-in
`webcrypto.subtle`; it does not require a global WebCrypto object.

| Environment | Qualification for this preview |
| --- | --- |
| Node 22.13.1 | Packaged README example and four outcomes; independent matrix |
| Node 18.17.0 (manifest minimum) | Packaged quickstart: all four outcomes with explicit `webcrypto.subtle`; no claim about default-global crypto |
| Local Cloudflare workerd 1.20260815.1 | Independent matrix through the artifact APIs; Node example does not run in an isolate |
| Deployed Workers, browser, Bun, Deno | Not exercised for this preview |
| TypeScript | TypeScript 5.9.3, NodeNext/strict, `@types/node` 22.13.1; compiled consumer runs all four outcomes |

Missing Ed25519 capability produces `unsupported_runtime`, not a failed
signature. If your runtime lacks it, supply a verified Ed25519 implementation:

```js
await verifyArtifact(jws, {
  publicKey,
  verify: (signingInput, signature, key) => yourEd25519Verify(signingInput, signature, key),
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

## Common x402 integration failures, and which tool catches them

Written from the literal error strings developers actually hit,
because the moment of failure is when anyone searches for any of this.

- **Stuck returning 402 even after attaching `PAYMENT-SIGNATURE`** —
  usually the wrong network: the endpoint's `accepts` offers
  `eip155:84532` (Base Sepolia) or points at a testnet-only
  facilitator while the buyer pays on Base mainnet (`eip155:8453`).
  A free endpoint probe flags this:
  `POST https://scvd.store/api/preflight/v1` with `{"url": "..."}`.
- **"Invalid payment header format" / "No X-PAYMENT header provided"**
  — the challenge or payment header is malformed. The preflight
  checks the challenge half (is `PAYMENT-REQUIRED` base64 JSON with
  signable `accepts`); this library checks the signed-offer half.
- **A directory lists the endpoint but probing it finds nothing** —
  the "listed but functionally absent" failure (a majority of one
  directory's listings, per independent probing). The preflight's
  first check is exactly this.
- **`invalid_exact_evm_payload_signature`,
  `invalid_exact_evm_payload_recipient_mismatch`,
  `settle_exact_failed_onchain`** — facilitator verify/settle
  failures. These belong to a specific payment attempt (wallet state,
  signature, chain conditions) and **no conformance tool can catch
  them in advance** — a tool that claims to is selling adjacency.
  What CAN be checked beforehand is whether the signed offer you're
  paying against verifies: that is this library, offline, or the
  conformance desk hosted.
- **Amounts off by a factor of a million** — x402 amounts are atomic
  units (USDC has 6 decimals: `$0.005` is `"5000"`). A decimal point
  in an `accepts` amount is almost always dollar-typed pricing; the
  preflight flags it.

## Reference deployment

This library is developed and battle-tested at
[scvd.store](https://scvd.store), a live x402 store that signs every
artifact it sells and runs this same code behind its free conformance
desk — `POST https://scvd.store/api/conformance/v1` accepts any
issuer's signed offer or receipt (including its competitors') and
returns its own versioned conformance report using this library, with the
store's conflict of interest declared in the response. Useful as a
second opinion on your implementation, or as a live counterpart whose
402 responses carry real signed offers to test against
(`GET https://scvd.store/api/buy/hello`). No account, no wallet, no
call home in this file — the store is a deployment of this library,
not a dependency of it.

## Portable evidence

The installed preview also includes a portable-evidence CLI. For a saved
SCVD certificate or corpus snapshot, use it after the local install above:

```sh
npx --no-install scvd-evidence export https://scvd.store/api/verify/CERT_ID --out saved-evidence
npx --no-install scvd-evidence verify saved-evidence/bundle.json --public-key TRUSTED_PUBLIC_KEY_HEX
```

From a checkout of this repository:

```sh
node verifier/evidence-cli.mjs export https://scvd.store/api/verify/CERT_ID --out saved-evidence
node verifier/evidence-cli.mjs verify saved-evidence/bundle.json --public-key TRUSTED_PUBLIC_KEY_HEX
```

Use the public key you established independently, never simply the key in
the bundle. The export retains exact signed bytes, the signature, a captured
issuer document where available, and the original response as **unauthenticated
context**. Verification uses only the exact signed payload for its findings.
It makes no network request and does not trust the response's `valid` label.

Attach a local evidence file with `--evidence observation.json` at export.
It must hash to a top-level `attests`, `saw` or `body_sha256` field in the
signed payload. Missing linked evidence is listed; this first format does
not recursively collect nested documents or assert population completeness.
Only JSON-object signed payloads with Ed25519 are supported. Other formats
refuse rather than silently dropping fields. Inputs and the combined bundle
default to an 8 MiB cap, with at most 32 attachments. Existing output directories
are never overwritten. Export reads the chosen URL and its same-origin key
document only; redirects are refused and embedded URLs are never fetched.

Where available, `payload.json.ots` wraps the store's raw calendar operations
as a standard detached timestamp file. Run `ots verify payload.json.ots`
with an independent OpenTimestamps installation and trusted Bitcoin headers.
This command does **not** verify Bitcoin, infer issue time, or authenticate
key-history snapshots. Its timestamp result is always absent or unverified.
A removed proof likewise cannot yield a verified timestamp.

Exit codes: 0 means the signature and supplied evidence bindings verify;
1 means invalid evidence or no independently supplied key; 3 means valid
signed bytes with missing linked evidence; 2 means invalid arguments or a
read/export failure. A zero exit never establishes factual truth or delivery.

The dependency-free API is exported at `x402-verify/bundle`;
copy both evidence-bundle.js and x402-verify.js when vendoring it.
The API needs WebCrypto in its runtime; the Node CLI supplies Node's built-in
WebCrypto when the global is unavailable.

### Large corpus snapshots (1.3.0)

The CLI also accepts `/corpus/{sequence}.json` records. It rebuilds
only the fixed corpus-v1 canonical field order, checks the published digest,
and exports the original signed bytes. Unknown snapshot versions refuse.
Start with `/corpus/index.json`: a compact, paginated metadata index with
no embedded newest snapshot. Follow `next` until null. `has_more: true`
without a next URL is an incomplete enumeration. Metadata availability
is not proof that the linked R2 object exists or that its signature verifies.
The original `/corpus.json` response remains available to existing clients.

Opt into a larger bound on **both** commands:

```sh
scvd-evidence export https://scvd.store/corpus/6.json --out saved-corpus-6 --max-bytes 33554432
scvd-evidence verify saved-corpus-6/bundle.json --public-key TRUSTED_PUBLIC_KEY_HEX --max-bytes 33554432
```

`--max-bytes` is an integer byte ceiling for the source, local inputs and
combined bundle, up to 64 MiB. The library accepts the same ceiling as
`maxBytes`. The default remains 8 MiB; an artifact cannot increase its own
allowance. A bundle repeats signed content in unsigned context, so budget
for the bundle, not just the source response. The saved September 9 largest
snapshot was 11,483,825 bytes; its minimal-context bundle was 23,221,351
bytes and verified within 32 MiB. Oversized input refuses explicitly.

One successful verification establishes one snapshot's signature against
your selected key. Verify adjacent `previous_digest` values yourself for
chain continuity; this command does not enumerate the whole corpus or
check Bitcoin headers. Deployment and publication status:
[`EVIDENCE_READER_COVERAGE_2026-09.md`](../docs/EVIDENCE_READER_COVERAGE_2026-09.md).
