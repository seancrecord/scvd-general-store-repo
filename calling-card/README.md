# Agent calling card

Local setup and a portable Node 22+ fetch integration. Public inputs can arrive
in any order; conflicts stop export, missing capabilities stay visible, and the
reviewed profile travels with the integration. No dependency, account, private
key upload, automatic payment, or automatic retry is required.

Open `/bot-auth`, enter an agent name and permitted HTTPS sites, or import
public fields. Conflicting values have their own selection controls; missing
fields have focused inputs. Review the profile, leave report sharing off or
explicitly enable it, and choose **Download configured integration**.

The browser builds `my-calling-card.mjs` locally. Run these explicit commands:

```sh
node my-calling-card.mjs --setup
node my-calling-card.mjs --observe
```

Setup creates an Ed25519 key on your machine and publishes only the public key
and its signed directory proof. The private key stays in
`.my-calling-card.mjs.local/identity.json`, created with owner-only permissions.
Keep that folder private and out of source control. A lost publication response
does not replace the saved key. The second command sends one introduction to
the store receiver and returns its signed observation.

Connect the file to a Node agent's underlying fetch:

```js
import { connectLocal } from './my-calling-card.mjs';

const request = await connectLocal();
const response = await request('https://your-approved-site.example/resource');
// Your application handles the response, including any 402 challenge.
console.log(await request.flushReports()); // sent / failed / dropped; never retries
```

Importing the file sends nothing and generates no keys. `connectLocal` loads
the identity created by setup; it does not silently create or publish one.
The destination's HTTPS origin must be in the reviewed `allowed_origins`.
For a one-request run, explicitly execute:

```sh
node my-calling-card.mjs https://your-approved-site.example/resource
```

That command sends one resource GET, prints a limited diagnostic, and closes
the response body. If sharing was enabled, a separate diagnostic request goes
to the store. It never pays. The imported function returns the original Response,
including its body and payment headers, for the existing client to handle.
Install it as the transport **underneath** that client's spending and retry
decisions. Redirects are returned for a new destination decision.

## Connect an existing x402 client

The supported first payment stack is Node 22+ with `@x402/fetch`. Keep the
client you already configured with its wallet signer, allowed assets, spending
limits and approval hooks. Replace only its underlying transport:

```js
import { wrapFetchWithPayment } from '@x402/fetch';
import { connectLocal } from './my-calling-card.mjs';
import { client } from './your-existing-payment-client.mjs';

const introducedFetch = await connectLocal();
const request = wrapFetchWithPayment(introducedFetch, client);
try {
  // Calling this permits the existing client's configured payment behavior.
  const response = await request(approvedUrl);
  // Handle delivery and settlement using your existing client/application.
} finally {
  await introducedFetch.flushReports();
}
```

`your-existing-payment-client.mjs` represents your application's existing
configured `x402Client`; this integration neither creates a wallet nor asks
for its private key. The payment wrapper goes outside the calling-card
transport so every request, including a payment retry, gets a fresh
introduction. The existing client controls payment creation and any recovery
retry. Its returned payment result still requires the application's normal
settlement and delivery handling.

The integration checks exercise the installed stock client and EVM signing
scheme with an offline fixture: preserved POST bodies, independently verified
introductions on both requests, the stock spending cap, an explicit operator
veto, and no extra retry after an unknown paid response. No live payment or
third-party acceptance is established by that fixture.

## Public inputs

Accepts a JSON object, an array of public objects, or labeled lines:

```text
networks: eip155:8453
name: Research Assistant
allowed_origins: https://your-approved-site.example
```

Supported names and aliases:

| Field | Aliases | Meaning |
| --- | --- | --- |
| `name` | `agent_name`, `display_name` | Self-declared public name |
| `allowed_origins` | `destinations` | Explicit HTTPS origins allowed to receive the introduction; a URL path is reduced to its origin |
| `signature_agent` | `signatureAgent`, `directory_url` | Public HTTPS key-directory reference |
| `public_key` | `publicKey`, `jwk` | Public Ed25519 JWK: `kty`, `crv`, `x` |
| `contact_url` | `contact` | Public HTTPS contact link, retained locally |
| `networks` | `payment_networks` | Declared CAIP-2 identifiers, retained locally |
| `runtime` | `integration` | `node-fetch`; this is also the default |

The same fields are recognized inside `identity` and `agent` objects. Inputs
are limited to 16 KiB, with bounded lists and nesting. Unknown fields are
counted and excluded. Conflicting aliases stop export. Names and at least one
destination are required. No network, wallet, or missing identity is guessed.

Only public information belongs here. Known secret-field names, private JWKs
and common private-key/Bearer forms are refused, but this is not a general
secret scanner. The profile is not uploaded or saved to browser storage. The
optional directory-check button sends only its public URL to the existing
store checker when pressed.

## Existing signers and directory lifecycle

The default guided setup hosts a public directory at
`/bot-auth/keys/{public-key-thumbprint}` for up to 30 days. `--renew` explicitly
renews publication with a fresh local proof; `--revoke` records a separate
revocation tombstone. Revocation propagates through KV rather than promising
instant global invalidation. The tombstone lasts 31 days, covering the remaining
maximum directory term and clock tolerance. Use a new key when replacing an
identity: revoke the old one and set up a newly named download. External cached
copies are outside this receiver's control.

This receiver recognizes the hosted exact-path directory. Third-party
verifiers may require an origin-owned well-known directory and registration;
hosting here does not register an agent with Cloudflare or grant site access.

Choose **Use my existing integration and signer** to keep the original
`connect({sign})` path. No guided key creation or automatic reporting is added
to that mode.

Add both `signature_agent` and the matching public Ed25519 JWK. Then connect
the private signer already held by your application:

```js
import { connect, webCryptoSigner } from './my-calling-card.mjs';

const sign = webCryptoSigner(existingPrivateCryptoKey);
const request = connect({ sign });
```

Alternatively supply `sign(bytes): Promise<Uint8Array>` from a local signer.
The integration verifies its output against the profile's public key before
sending. A configured signer failure stops the request; it does not silently
send an unsigned introduction. For a command-line run of a signed card, pass
a local module exporting that `sign` function as the second argument.

Publish the directory on your own HTTPS host, using the same signer:

```js
import { configuredCard, createDirectoryResponse } from './my-calling-card.mjs';

// Return this from your own server's directory route.
const response = await createDirectoryResponse({ card: configuredCard, sign });
```

When `signature_agent` names an origin, serve the response at
`/.well-known/http-message-signatures-directory`. When it includes a path,
serve that exact path. Keep the directory available and rotate the profile
and signer together. That advanced path uses your own hosting; private-key
custody and third-party verifier registration remain yours in either mode.

Requests carry a User-Agent declaration and, when configured, HTTP signature
headers following Cloudflare's documented Web Bot Auth profile. The signature
covers destination authority and the Signature-Agent reference; it does not
authorize payment or bind the request body. Nonces and a short expiration are
emitted, but replay protection requires the receiving verifier to enforce it.
Existing identity-signature headers are refused instead of overwritten.

## What the result means

An optional `onResult` callback gets fixed outcome labels, HTTP status and
bounded payment hints, without URLs, headers, bodies, keys or payment payloads.
Callback failures cannot change the delivered response into a failed request.

HTTP 200 alone leaves identity acceptance `not_observed`. A receiver's explicit
`Calling-Card-Recognition: signature_verified` becomes
`receiver_reported_verified`; that label reports the destination's statement,
not an independently verified claim about an arbitrary site. Our
`/bot-auth/observe` endpoint verifies the hosted key, signature and time window
before emitting that header and a signed observation. The observation covers
only the authority/directory signature. Replays within its window are not
deduplicated and receive no authorization privileges.

A 402 is a payment challenge, not failed settlement. A bounded x402 v2
`Payment-Required` header can identify an unsupported version, malformed offer
shape, unknown wallet networks, or whether a declared network is offered. That
last result establishes no balance, permission, asset or scheme compatibility.
When the challenge is in a response body, the body is left unread for the
existing payment client. A lost response is an unknown
outcome: reconcile it before retrying. Site acceptance, real operator identity,
wallet control, payment settlement and delivery are separate facts this
integration cannot establish.

## Optional production reports

Sharing is off by default. An explicit checkbox in the download records the
operator's choice; `connectLocal({shareReports:false})` disables it for a run,
and `connectLocal({shareReports:true})` explicitly enables it. Each submitted
event includes only an approved site origin, a random event ID, HTTP status
and fixed outcome labels. Paths, queries, request/response bodies, credentials
and payment payloads are excluded. The client signs its consent and report
with the registered key. Reporting uses a separate transport, a queue of at
most eight pending events, a three-second network deadline and no retries.
Call `await request.flushReports()` before ending a short-lived process;
delivery failures and dropped events are counted locally.

The store retains reports privately for seven days as
`client_report_unverified`. They are an opt-in sample, not independently
verified site behavior, unique-agent counts or a success rate. Server input
size and request budgets are bounded; KV quota and duplicate handling are
best effort under concurrency. A signer-derived event digest is used only
as the storage key; the retained diagnostic row omits the public key.

The existing admin login protects `/admin/calling-card` and
`/admin/calling-card.json`. Both paginate retained reports without claiming
the first page is the latest or complete. Nothing automatically publishes
contributed reports. The public `/privacy` page and trust document describe
the collection and retention.

Setup and downloads are free. The existing optional Signature Agent Card
purchase records the store's signed observation of a public key directory,
at its current shelf price. It does not certify the runtime or grant access.

This first integration supports Node fetch. It does not alter browser
automation, solve CAPTCHAs, translate payment protocols, or promise that most
sites will accept the agent. Production compatibility and usage have not yet
been measured for this build.

## Maintenance

`npm run calling-card:test` exercises the downloaded module in Node, including
independent signature verification, tampering, conflicts, refused private
inputs, payment-response preservation and no automatic retry. Worker route
and directory-check regressions live in `test/calling-card*.spec.ts`.

Primary reference: [Cloudflare Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/).
Dated reads and limitations are in `docs/SPEC_READS.md`.

### Initial build verification — September 24, 2026

- 17 Node integration checks passed; 115 Worker checks passed across the
  calling-card routes, directory signatures, existing Web Bot Auth, API
  descriptions, reader budgets, guide, feature registry and room contracts.
- Both Worker dry-run bundles passed. Typechecking passed on an isolated
  tracked checkout with this change applied. The original workspace typecheck
  is blocked by existing, untracked MPP files whose required types are missing.
- Browser checks covered a configured download, conflicting inputs, known
  private-field refusal, stale-review invalidation and a narrow viewport.
- The full suite was started and stopped after existing failures were
  identified. Cadence, bounty and passport failures reproduced against the
  preceding source, including the same local configuration for the bounty
  board; the unfinished MPP specifications also failed. This is not a claim
  that the full suite passed. The guide digest and API error-documentation
  failures caused by this build were corrected and passed the focused rerun.
- Not committed or deployed. No production acceptance or payment was tested.

### Follow-through — September 24, 2026

The generated guided download was exercised end to end against an isolated
local Worker: local key creation, public directory publication, actual signed
introduction, independent verification of the receiver's returned signature,
opt-in report retention, authenticated admin readout, and refusal after
revocation. Only temporary fixture identities and local storage were used.
This establishes the implemented path locally; it does not establish
third-party acceptance or live payment compatibility.

- 23 Node checks passed. All 124 focused Worker checks passed across the
  final run and the API-contract rerun after correcting the observation
  endpoint's no-cache declaration.
- The complete change typechecked in an isolated tracked checkout and both
  Worker dry-run bundles passed. Existing unfinished MPP files still prevent
  a clean typecheck in the shared workspace; the full-suite limitations above
  remain.
- Browser verification covered simple setup, explicit conflict selection,
  the generated download, sharing off by default and the final setup commands.
  The generated-download end-to-end check passed again after the local key
  permissions and saved-identity changes.
- Source and setup-script URLs are content-versioned so a newly rendered page
  does not reuse an older cached integration. Not committed or deployed.

### Release preparation — September 24, 2026

The calling-card changes were ported onto current main in an isolated release
checkout, preserving its newer payment, documentation and deployment changes.
The shared preview checkout's unrelated work is excluded. The installed stock
Node x402 client is now exercised by three additional integration checks and
has a matching setup recipe on the page and in these instructions.

Typechecking, all 26 Node checks, focused Worker checks, the scalability and
claims audits, and the production dry-run bundles passed during preparation.
The old guide fingerprints reproduced with only the prior guide restored; the
calling-card link and text have new fingerprints. Compact-reader limits stayed
unchanged. Two full-suite local attempts stopped on Worker runtime internal
errors before producing usable suite results, including a two-worker rerun.
They are not full-suite passes. The repository's required CI shards and merge
gate must pass before this release can reach production.
