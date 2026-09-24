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

## Free signed history; a fresh signed observation costs money

Stop after the free reading when it answers the question. When the caller
asks for independently verifiable evidence, check the free signed history
before deciding that the remaining evidence requires payment. The host-history
lookup is unsigned; the signed snapshot it links and the public issuer-key
record are free to retrieve. Start at `https://scvd.store/corpus/host/{host}.json`.
Follow its cited signed snapshot, confirm the exact endpoint and observation
date inside the signed data, and verify it locally with `scvd-evidence`.
The corpus index is at `https://scvd.store/corpus/index.json`. A historical
observation is not a fresh check; a missing row is a coverage gap. Follow the
verifier's [large corpus snapshot instructions](https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier#large-corpus-snapshots-130)
for export and explicit size limits.
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
A zero budget rules out a fresh paid observation, not the free signed
history above. If no suitable signed history is available, report that gap;
do not buy just to complete a test. A sample for another endpoint does not
prove anything about this one.

## Verify what a recipient actually receives

`verify_artifact` is a **hosted lookup**. It is useful, but calling the
issuer again is not offline verification. Use the published `x402-verify`
package's `scvd-evidence` command locally; installation and format details:
https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier#portable-evidence

Save the whole original **before** inspecting it. For a cited corpus snapshot,
replace `ACTUAL_CITED_SNAPSHOT_URL` below with the exact URL from the lookup.
Create `./evidence` if it does not exist, then run each command separately:

```sh
node -e "require('node:fs').mkdirSync('./evidence', { recursive: true })"
curl --fail --output ./evidence/original.json "ACTUAL_CITED_SNAPSHOT_URL"
curl --fail --output ./evidence/issuer-key.json "https://scvd.store/.well-known/scvd-signing-key"
```

Use distinct filenames for additional responses; do not overwrite retained
originals. Use one shared `./evidence/journal.md` for source URLs, acquisition times,
request outcomes, key-source observations and verification results. Add one entry
per retained response, naming its file; keep the verifier's exact result there
alongside your interpretation. Label these notes as unsigned acquisition context.
Do not create separate URL, timestamp and note files for each response. Keep
optional headers or diagnostic excerpts in the same journal unless their original
bytes are required evidence. Preserve every required original and bound evidence
file separately and unchanged; a journal cannot replace them. Check the caller's
file and byte allowance before adding optional captures. If a limit is reached,
report the gap; do not delete or overwrite earlier evidence to make a run pass.
Inspect bounded fields from the saved original afterward. A response too large
to print can still fit the caller's declared file allowance; retain its complete bytes.
If capture fails or exceeds that allowance, report incomplete evidence rather
than substituting a summary, shortened payload or placeholder signature.
A separately fetched issuer key records what that source served; identifying
the issuer still requires a trusted key binding independent of the artifact.

For a saved corpus snapshot, check that `scvd-evidence --help` lists both
`verify-source` and `--subject` (the exact-subject option was added in 1.6.0;
source and registry versions can differ). Replace the key with your independently
established issuer key, `CALLER_MAX_BYTES` with the caller's allowed input size,
and `EXACT_ENDPOINT_URL` with the full requested endpoint, including its query:

```sh
scvd-evidence verify-source ./evidence/original.json \
  --public-key TRUSTED_PUBLIC_KEY_HEX --max-bytes CALLER_MAX_BYTES \
  --subject 'EXACT_ENDPOINT_URL'
```

This verifies the original offline and selects only exact-URL rows from its
signed claims. It avoids duplicate exports and printing the whole snapshot.
Require `valid: true`, `evidence_complete: true` and
`subject_evidence.status: "present"`; exit 0 alone does not establish a match.
Read `subject_evidence.observations` and `omitted_observations` before reporting
what was checked. Each selected row's `value.observed_at` is its observation date;
`snapshot_taken_at` is publication time. A missing `observed_at` means the row's
observation date is unknown, even when its signature is valid.
Do not substitute snapshot publication time, download time or an unsigned timeline
date. A row with an unknown observation date cannot satisfy an observation-age
limit; retain it as historical evidence with that gap. A different dated row must
match the exact endpoint and satisfy the caller's limit on its own.
An absent match, omitted row, invalid signature or missing bound evidence remains
a stated gap. A valid signature alone does not establish freshness or
payment/delivery.

Keep signed observations and unsigned context separate in both the final answer
and saved verification notes. The host-history lookup's tier, coverage fraction
and other weeks do not become claims of this snapshot because it verified.
Describe only the selected signed rows as authenticated; attribute other history
to the unsigned lookup. To claim several authenticated weeks, retain and verify
each cited original and state the result and observation-date gap for each one.
Count only successful checks actually returned by the verifier; attempting a loop
or seeing one successful result does not establish that every iteration passed.
Do not guess whether a signature covers a digest or JSON bytes: use the existing
verifier's format handling.

If the installed command lacks `--subject`, use the documented bundle API below
or the published package installation above. For other artifact families, use
`verify-source` with any bound `--evidence` file; the corpus subject selector is
not their verification contract. Keep originals, the verifier's result, separate
key observations and source URLs for a recipient; a short result cannot replace
the originals. Use the shared journal for these notes and results. Keep installed
packages and caches outside the evidence directory.

When using the existing `x402-verify/bundle` API, call `createEvidenceBundle`
and `verifyEvidenceBundle` with the documented size allowance and an
independently established `publicKey`. Require both `valid` and
`evidence_complete` before reporting authenticated observations. Read those
observations only from the returned `signed_claims`, not adjacent response
metadata or a host-history summary. For a corpus snapshot, match the exact
endpoint in `signed_claims.round.hosts` and report its `observed_at` separately
from the snapshot's `taken_at`. One signed row cannot authenticate other
weeks in an unsigned history. Publication does not refresh an observation;
apply the caller's age limit to the observation date.

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
signature authenticates those bytes against the supplied key; it does not
by itself identify the issuer or prove the observation was truthful, the endpoint still behaves that way, or a future payment
will deliver. Report those limits with the result.
