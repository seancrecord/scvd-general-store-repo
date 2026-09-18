# OpenAI submission — SCVD x402 Verifier

**Published September 17, 2026:** [SCVD x402 Verifier](https://chatgpt.com/plugins/plugin_asdk_app_6aaa9b3afcc081918be808a0d8cfd212).
The keeper reports the skill update completed September 17, 2026. The upload/update
press is closed. Approval and publication of the updated version have not been
independently verified. Earlier no-upload notes describe the preceding audit.


Submission copy revised using the OpenAI Developers 1.3.0
`chatgpt-app-submission` skill. Retain the tested fields for subsequent updates.

## Skill update in the existing plugin

Use the existing plugin's edit/update flow and submit its next version. The skill
addition needs updated release notes, review and publication; it does not require
a duplicate plugin listing. [Suggested release notes](../research/distribution-2026-09-17/OPENAI_SKILL_RELEASE_NOTES.txt)
describe just this change. Adjust them if other behavior changed in the draft.
[Official submission guidance](https://developers.openai.com/plugins/deploy/submission).

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

The optional verifier skill is in
[`chatgpt/scvd-x402-verifier/SKILL.md`](chatgpt/scvd-x402-verifier/SKILL.md),
with its MCP dependency in `agents/openai.yaml`. Upload
[`chatgpt/scvd-x402-verifier.zip`](chatgpt/scvd-x402-verifier.zip) in the
portal's Skills section when ready to include it. The ZIP contains that
skill folder and must be rebuilt if either source file changes. File
validation and archive/source equality were checked; activation and
tool routing still need testing in the target ChatGPT environment.
The verifier response now projects out the store's purchase offers, prices
and sales identity fields while keeping the shared probe, checks, gaps and
conflict-of-interest disclosure. The general store door keeps its catalog
guidance. Confirm this projection on the deployed door before submitting.

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

## Current qualification — 2026-09-17

The deployed strict matrix passed 49/49 cases at 13:46 UTC, covering
shared handlers on both doors, stored evidence, refusals, every registered
defect and unknown-defect errors. Direct checks also passed both doors'
SSE listening, trailing-slash redirects and browser CORS, plus all five
positive submission cases (including both offer fixtures). The verifier's
`tools/list` measured 17,062 bytes and the observed example.com preflight
result measured 24,674 bytes before removing its sales framing. These are
observed sizes, not a bound on every possible response.

The unknown-host production branch passed at 13:51 UTC for
`developers.openai.com`: schema-valid `never_met`, zero recorded probes,
and one public queue entry. That ask was generated by this qualification,
not an organic customer request. An earlier candidate, `agentcash.dev`,
already had stored evidence and correctly returned it; it did not exercise
the unknown branch. Raw evidence is under
[`docs/verifier-qualification-2026-09-17/`](../docs/verifier-qualification-2026-09-17/).

## Published — 2026-09-17

The keeper completed publication during this qualification. The portal
shows **1.0.0 Published** and links to
[SCVD x402 Verifier](https://chatgpt.com/plugins/plugin_asdk_app_6aaa9b3afcc081918be808a0d8cfd212).
The approved version names `https://scvd.store/mcp/verifier`, No Auth,
Business — scvd.store, and **Domain verified**. Its listing and all five
annotation justifications match the import JSON. No duplicate submission
is needed.

The approved snapshot still displays output-schema recommendations for
readiness and defect lookup, although the live tools now expose both
schemas. OpenAI's current MCP review documentation says metadata is
periodically re-read; the portal's archived snapshot is not evidence that
the deployed schemas are absent. Client metadata refresh remains subject
to OpenAI's scan and review process.

The verifier-only preflight response correction is a bug fix to the
published free-verification behavior: it removes paid-service offers,
keeping the existing tool definitions, probe results and disclosures.
Verify its deployed output after merge. Direct calls establish the tool
contracts, not ChatGPT web/mobile routing; that distinction remains in
the evidence record even though the directory approved the plugin.

### Release notes for the portal

This resubmission offers SCVD x402 Verifier at `/mcp/verifier`, a focused
server with five free verification tools. It checks unpaid x402 challenges,
signed offers and receipts, stored readiness evidence, defect definitions,
and SCVD artifact signatures. The server now supports the portal's SSE
probe, trailing-slash redirects and browser CORS. Tool hints describe
persistent counters and the public discovery queue, agree with shared
handlers on the general MCP door, and include output schemas for every
tool. Preflight output retains evidence and limits without paid-service
upsells. Tests use public fixtures and stored artifacts; no wallet or
reviewer credentials are required.

The verifier exposes no widget resources or widget CSP metadata.
Its inspected input schemas do not solicit credentials, private keys,
wallet seeds or similarly sensitive identifiers; public keys are public.
A caller-supplied receipt or hostname may still contain contextual
information, and the public queue effect must remain disclosed.

The dated approval and keeper-completed publication are recorded in
`docs/SPEC_READS.md`. The portal did not expose detailed approval grounds.
