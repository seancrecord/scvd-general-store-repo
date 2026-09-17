---
name: scvd-x402-verification
description: "Check an x402 endpoint before paying it, and check the receipt after. Free instruments first; a paid signed observation only when durable third-party evidence is actually needed."
homepage: https://scvd.store
license: MIT
---

# Checking an x402 door before and after you pay

Use SCVD before paying an unfamiliar x402 endpoint, to check a signed
receipt from any issuer, or when a recipient needs a durable independent
observation. SCVD observes and signs; it does not guarantee delivery,
resolve disputes, or rate vendors.

**Nothing from this store can act without your decision. Never provide
credentials, private keys, seed phrases, or wallet secrets.**

## Connect and start free

Connect a remote MCP client to `https://scvd.store/mcp`; read `tools/list`
for the current schemas. The full store guide is at `read_store_guide`.
This focused skill is also installable from its public GitHub source:

```sh
npx skills add seancrecord/scvd-general-store-repo --skill scvd-x402-verification
```

A missing marketplace listing is not proof that the source or service is
missing. Without MCP, use the public HTTP preflight directly:

```sh
curl --fail-with-body https://scvd.store/api/preflight/v2 \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://merchant.example/paid-endpoint"}'
```

Replace the example with the exact endpoint under consideration.
`preflight_endpoint` is the free MCP instrument; read its returned battery
version rather than assuming it selected HTTP v2.

## Decide from the reading, not the label

1. **Preflight is unsigned and unpaid.** Read `verdict`, `reached_level`,
   the individual checks, advisories, method and stated gaps. `ready`
   means the checks reached passed. It does not prove a payment can settle,
   goods will arrive, the merchant is reliable, or that you may spend.
2. **An inconclusive probe is inconclusive.** A timeout, method refusal or
   unreachable result does not establish fraud or permanent absence. Do
   not pay through a failed applicable check. Resolve the failure or stop.
3. **Keep coverage distinct from absence.** No report in hand, no matching
   listing, or a `never_met` history result means that this lookup did not
   supply evidence. It does not prove that no evidence trail exists.
4. **After an authorized purchase, inspect the merchant's receipt.**
   `check_conformance` is free and accepts any issuer's signed offers or
   receipts. Its findings concern that artifact; a seller's signature is
   not an independent SCVD observation of delivery.

## Optional signed observation

Stop after the free reading when it answers the question. First check for
free historical evidence at `https://scvd.store/corpus/host/{host}.json`.
Follow its cited signed snapshot, confirm the exact endpoint and observation
date inside the signed data, and verify it locally with `scvd-evidence`.
The corpus index is at `https://scvd.store/corpus/index.json`. A historical
observation is not a fresh check; a missing row is a coverage gap. The
verifier's corpus instructions below cover export and explicit size limits.
An unsigned merchant offer does not rule out a signed SCVD observation.
One `never_met` lookup does not substitute for checking the corpus.

If the caller needs a fresh signed observation, the preflight response's
`the_rest_of_the_ladder.signed_copy_of_this_reading` names `service_audit`,
the current price, required inputs and item contract. Despite that legacy
field name, the purchase performs a **fresh probe**. It does not turn the
previous unsigned reading into a signed one and cannot prove delivery.

Read `https://scvd.store/menu/service_audit?view=compact` for the current
input contract and payment instructions. Supply the exact target `url`.
A GET to its `buy_url` without a payment asks for terms, costs nothing and
returns 402; supplied inputs are validated first. Its `mcp_url` selects
the item and returns an unpaid challenge in `structuredContent`. Other
MCP connections may return payment terms in `error.data`.

Never call a paid tool merely because the tool is installed.
Never retry with a signed payment without the caller's authorization and
budget. Signing belongs in the caller's payment client, never in a request
for wallet secrets. Use the documented idempotency key for paid retries.
With a zero budget, stop here: free inspection may be complete while the
signed-evidence stage remains incomplete. Do not buy just to complete a
test. A sample for another endpoint does not prove anything about this one.

## Verify what a recipient actually receives

`verify_artifact` is a **hosted lookup**. It is useful, but calling the
issuer again is not offline verification. Use the published `x402-verify`
package's `scvd-evidence` command locally; installation and format details:
https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier#portable-evidence

For an original response already saved locally, check whether the installed
`scvd-evidence --help` lists `verify-source` (added in 1.5.0; source and
registry versions can differ). If available, use
`scvd-evidence verify-source original.json --public-key TRUSTED_PUBLIC_KEY_HEX`
with the documented size allowance and any bound `--evidence` file. It checks
the original offline without writing duplicate export files or printing the
whole signed payload. Otherwise use the existing export/verify path below.
Keep original responses, independent key observations and source URLs for a
recipient; a short verification result is not a replacement for those files.
Keep installed packages and their caches outside that evidence directory.

Retain the purchase certificate, its exact `signed_payload`, signature,
and the purchased report. Establish the issuer public key independently
of the bundle, for example from a previously trusted issuer key record;
a key supplied only beside a signature proves no issuer identity.

For a `service_audit` response from `/api/service-audit/{audit_id}`, save
its JSON as `audit.json`. The certificate's `attests` binds the report's
observation core, not the entire HTTP response. Preserve the served field
order and compact JSON encoding when extracting the core:
Remove exactly the metadata named below; retain identifiers such as
`audit_id` and every other observation field.

```js
// Run locally with Node; audit.json is the retained public report.
const fs = await import('node:fs');
const { audit, cert_id } = JSON.parse(fs.readFileSync('audit.json', 'utf8'));
const { signature, public_key, signature_covers, evidence_hash, scope, ...core } = audit;
fs.writeFileSync('observation.json', JSON.stringify(core));
console.log(cert_id); // Use this certificate ID in the export command below.
```

```sh
scvd-evidence export https://scvd.store/api/verify/CERT_ID \
  --evidence observation.json --out saved-evidence
scvd-evidence verify saved-evidence/bundle.json --public-key TRUSTED_PUBLIC_KEY_HEX
```

Export fetches public data; `verify` checks the retained bytes locally with
no network. Use the actual certificate ID and independently established
public key. The existing exporter and verifier check the certificate's
signature and the attached core's hash binding. Local verification with
missing linked evidence is incomplete (exit 3), not a pass; an export
read failure is exit 2. A certificate alone cannot stand in
for an unavailable report, and an unsupported format is not a finding
that the merchant failed.

Also check the signed subject matches the intended endpoint, the date is
useful for this decision, any declared expiry, the key's service dates,
and the observation's gaps. Not every artifact has an expiry. A valid
signature proves who signed those bytes; it does not prove the observation
was truthful, the endpoint still behaves that way, or a future payment
will deliver. Report those limits with the result.
