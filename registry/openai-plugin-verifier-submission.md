# OpenAI submission — SCVD x402 Verifier

Draft revised 2026-09-16 using the OpenAI Developers 1.3.0
`chatgpt-app-submission` skill. Review before uploading. No portal
submission or deployment is performed by this file.

## Connection and app info

- Server: https://scvd.store/mcp/verifier
- Authentication: none.
- Site: https://scvd.store
- Privacy: https://scvd.store/privacy
- Terms: https://scvd.store/rights
- Support: https://scvd.store/what

The import file is [`chatgpt-app-submission.json`](../chatgpt-app-submission.json).
It contains the listing fields, the served tool names and hints,
five positive cases and three non-trigger cases. The signed-offer
prompts contain the complete public fixtures and public verification
key; there are no paste-later placeholders.

**Name:** SCVD x402 Verifier
**Subtitle:** Check x402 doors and receipts
**Category:** DEVELOPER_TOOLS

SCVD x402 Verifier checks payment challenges without paying, verifies signed x402 offers and receipts, reads recorded endpoint readiness, explains defect classes, and checks SCVD artifact signatures. Results describe evidence and limits; they do not establish delivery or guarantee a provider. All tools are free and no wallet or login is required. Calls record usage statistics. Readiness lookups for eligible hosts with no recorded probe add the hostname and ask count to a public queue for a later discovery sweep; caller identity is not included in that queue.

## What changed after inspecting the implementations

The earlier guide called every tool read-only. Every tool records
traffic, and the submission skill explicitly counts logging as a
state change. This draft therefore uses `readOnlyHint: false`.
Repeated calls can add records, so `idempotentHint` is also false
on this verifier door. No purchase tool is exposed.

Readiness lookup has a further effect: for an eligible host with no
recorded probe, `heldHalfOf` calls `recordAsk`. The hostname and ask
count enter the publicly visible asked-for queue and may feed a later
outbound discovery sweep. Caller identity is not included in that
queue. This behavior remains enabled and is now disclosed; its
`openWorldHint` stays true.

Artifact verification reads the store's own records and keys, so its
`openWorldHint` is false. Its result is `valid`, `kind` and `note`;
the description no longer promises to return signed bytes or keys.

### Tool justifications

**preflight_x402_endpoint**

`readOnlyHint: false`; `openWorldHint: true`; `destructiveHint: false`.

Performs an unpaid probe and writes internal traffic and rate-limit counters without initiating a payment.
Fetches a caller-selected public HTTPS endpoint, subject to the server's address restrictions.
The probe sends no payment authorization and cannot delete records or move funds.

**verify_x402_receipt**

`readOnlyHint: false`; `openWorldHint: true`; `destructiveHint: false`.

Computes signature, structure and time checks while recording internal traffic statistics.
May fetch the issuer's did:web document from an external host named in the artifact; supplying a public key avoids that fetch.
Checks a supplied signed artifact without submitting a payment, modifying it or revoking access.

**lookup_endpoint_readiness**

`readOnlyHint: false`; `openWorldHint: true`; `destructiveHint: false`.

Records traffic and, for eligible hosts without a recorded probe, updates the publicly visible asked-for queue with the hostname and ask count.
Can enqueue a caller-selected hostname for a later sweep of external discovery documents and discovered endpoints.
Updates a bounded discovery queue without deleting caller-owned data, revoking access or moving funds.

**get_defect_definition**

`readOnlyHint: false`; `openWorldHint: false`; `destructiveHint: false`.

Reads the registered defect vocabulary and records internal traffic statistics for the call.
Uses the store's built-in vocabulary without contacting external hosts.
Does not modify the vocabulary, delete records, send messages or initiate payments.

**verify_scvd_artifact**

`readOnlyHint: false`; `openWorldHint: false`; `destructiveHint: false`.

Checks a stored artifact signature and records internal usage and verification statistics.
Reads artifacts and verification keys held by the store without contacting an external issuer.
Checks existing artifacts without changing their signed bytes, revoking them or moving funds.

## Tests and their limits

The positive cases cover every exposed tool. Offer verification calls
the same tool twice to distinguish the valid fixture from its tampered
copy. The negative cases are genuinely out of scope: purchasing,
provider/investment rankings, and wallet custody or signing.

An own-host preflight refusal remains a useful additional check, but
is not a non-trigger case: it intentionally invokes the preflight tool.

Live checks on 2026-09-16 at 13:42 UTC returned the expected results
for example.com, both offer fixtures, wrong-network, api.onesource.io,
certificate cert_et6zuesrrn and the own-host refusal. The defect
vocabulary was v18; tests should read its returned version instead of
assuming v17. Readiness dates and coverage may advance with new rounds.

These were direct MCP checks, not ChatGPT web/mobile routing tests.

## Before submitting

1. Deploy the reviewed source changes, including the listening channel,
   trailing-slash and CORS repairs already on the submission branch.
   At 13:43 UTC the live endpoint still returned JSON to an event-stream
   request, 404 on the trailing slash and 405 on OPTIONS.
2. Re-read live tools/list and confirm its hints match the JSON. The
   import file describes the corrected source, not the older deployment.
3. Run the cases in ChatGPT on web and mobile. Confirm the deployed privacy
   policy includes the corrected traffic-statistics and public asked-for
   queue disclosures, matching the tool and import descriptions.
4. Confirm account/domain verification in the portal. The earlier guide
   reported business verification completed September 15; this session
   did not inspect the account or confirm domain verification.
5. Add outputSchema to lookup_endpoint_readiness and get_defect_definition
   for more reliable tool result handling. Their absence is a skill
   warning, not a JSON-generation blocker.

The verifier exposes no widget resources or widget CSP metadata.
Its inspected input schemas do not solicit credentials, private keys,
wallet seeds or similarly sensitive identifiers; public keys are public.
A caller-supplied receipt or hostname may still contain contextual
information, and the public queue effect must remain disclosed.

After the keeper submits, record the dated outcome and stated review
grounds in docs/SPEC_READS.md. No approval outcome is implied here.
