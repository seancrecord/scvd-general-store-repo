# Partner evidence — September 24, 2026

Execution record for the [SCVD Partner Evidence Pilot Plan](../../docs/PARTNER_EVIDENCE_PILOTS_2026-09.md).
The keeper-approved [Merit note](https://github.com/Merit-Systems/x402scan/issues/1014#issuecomment-5817308384)
was posted and verified on September 24; response pending. Repository publication authorized by the keeper; merge qualification in progress.
No paid transaction, registration,
wallet access, or new production behavior. Research captures and dossiers are
unsigned. A checksum preserves bytes; it is not an SCVD signature.

## First results

| Case | Current result | Useful next action |
| --- | --- | --- |
| [Merit](MERIT.md) | Reproduced the documented hybrid payment-info mismatch; approved note posted and verified on #1014 | Await intended-contract clarification; response and usefulness unknown |
| [BiX seller candidate](BIX.md) | Seller explicitly asked for a first buyer, but its published OpenAPI URL returned 503 on our one current read | Ask whether the schema/route has moved and whether the deliberately disabled settlement path is ready; no purchase yet |
| [Browserbase](BROWSERBASE.md) | Public contract uses POST; current main has a bounded POST fallback with an empty body. Input defaults and wire compatibility remain unqualified. Held host history is unsigned and mixes endpoint paths | Scope a method-correct study with a reviewer; do not call a host-level history a signed session-purchase result |

Partner demand, decision use, and repeat requests: **not established for any
of these cases**. The seller is not yet qualified as compatible. This first
pass closes dossier preparation, not partner recruitment or pilot execution.

## Evidence and reproduction

- `captures/*.json`: direct request metadata, timestamps, status, byte cap,
  truncation and SHA-256. A matching `.body` is present only if bytes arrived.
- Initial six records without `-network` show sandbox DNS failures. They are
  collector failures, not target failures. Fresh network-enabled attempts have
  separate IDs and retain those earlier failures.
- `capture-public.py`: bounded, GET-only reader. No credentials, payments,
  redirects, or installation. Use a new ID for a new observation. It records
  selected headers, not complete transport evidence. Reviewed public URLs
  only; this is a research utility, not a public arbitrary-URL fetch service.
- `merit-reproduction.json`: actual local four-case result, package version,
  runtime version, archive integrity and extracted-code hashes.
- `reproduce-merit.mjs`: repeat the local evaluation from the preserved
  archive: `node research/partner-evidence-2026-09-24/reproduce-merit.mjs` from
  the repository root. It does not install dependencies or run the CLI.
- `findings.json`: case states and separated technical/action/usefulness fields.
- `merit-outreach.json`: exact approved and verified posted comment, permalink and send checks.
- `merit-presend-issue.json`: issue/comments read through the GitHub connector before sending.
- [PILOT_WORKSHEET.md](PILOT_WORKSHEET.md): ready-to-fill scope and cold-run
  protocol. No participant or payment authorization has been invented.

The npm archive's SHA-512 matches the registry response captured in this run.
That checks artifact identity against that response; npm signature provenance
was not independently verified. The upstream repository URL returned 404;
the distributed package, not a guessed repository checkout, is the tested
implementation. The x402scan documentation was captured at a recorded commit.

No inference about the deployed register-origin service version is made.
No full CLI, live registration, paid Browserbase fulfillment, BiX challenge,
or signed corpus-original verification was performed. Host-history endpoints
were read as unsigned summaries, preserving their explicit evidence scope.

## Publication and next handoff

All three dossiers are reviewable. The first outward act is complete: the
keeper-approved factual Merit issue note was posted and its exact text verified.
Before sending, the issue was still open with two existing comments and npm
still returned 1.7.5 with the same archive integrity. Response, usefulness and
adoption remain unknown. No automatic follow-up is scheduled. Browserbase and
BiX have not been contacted; their scope/eligibility limits remain visible.

Retain existing licenses for source artifacts. Do not publish partner-private
material here. These new files are not wired into a public route. The keeper authorized merging this partner-evidence package. Other outreach
and new partner-private material still require their own scope.
