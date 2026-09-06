# Buyer input-survival audit — September 6, 2026

**Six new findings, including a paid case file that retains the previous buyer claim.** Fixes are queued in [the running buyer audit log](BUYER_AUDIT_LOG.md), alongside the four findings from the required-input audit. No production fixes were made.

## Scope and result

Audited revision `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa` in an isolated worktree, using the real Worker HTTP routes and MCP tools. The live menu and `tools/list` supply the roster and schemas; no production argument mapper supplies the expected values.

- 32 paid items; 116 item/field pairs; 34 distinct published input names, including optional fields.
- 402 primary purchases: two distinct canaries per item, HTTP and every applicable MCP shelf, on all three advertised rails. All primary purchases returned goods after exactly one mocked settlement call.
- 450 recorded observations including 12 changed-claim purchases, six payload-only nonce checks, six direct #481 subject controls, and 24 first scheduled observations.
- 39 tests: 33 fail the stricter acceptance standard, 6 pass. Failures are retained deliberately; this is an audit, not a claim that the suite is green.
- All 402 primary certificate signatures independently verify. Returned same-origin API retrieval links answer successfully. All 24 queued orders complete, remain readable through HTTP and MCP polling, and deliver to the exact canary callback URL.

Evidence: [complete revision-stamped observations](buyer-input-survival-2026-09-06.json). Each primary row contains submitted arguments, expected values, exact paths where fields appear in goods/storage/retrieval, actual responses, persisted records, certificate verification, observation signature/binding checks, and retry results. Counts refer to test observations, not unique live customers or real payments.

## New findings

1. **BUY-005, SEV-1 — old claim in a new paid case file.** A fresh purchase about the same transaction with a corrected claim settles and returns the original claim. Six corrected purchases reproduce it on HTTP/MCP × Base/Polygon/Solana. The reuse index only considers transaction and mandate.
2. **BUY-006, P1 — four observation signatures are overwritten.** Spot Check, Passport Refresh, Provenance Check and Trust Profile return the certificate signature in place of the observation signature: 48 failed standalone-observation checks. Their certificates and evidence-hash bindings remain valid. Do not mistake the certificate's successful verification for proof that the promised independent observation envelope is intact.
3. **BUY-007, P1 — Solana does not retrieve the cached purchase.** 132 identical retries call the facilitator again and return a new certificate under a successful-rebroadcast fixture. The mock returns the same transaction ID for the repeated transaction; this does not establish a second chain debit. Two more HTTP retries hit the stock refusal below first.
4. **BUY-008, P1 — stock refusal blocks HTTP recovery.** After both Collab slots sell, replaying either purchase returns `409 sold_out`, with no original good. Six HTTP retries reproduce this; Base/Polygon MCP recovery works.
5. **BUY-009, P1 — within-limit text changes meaning.** `vector<int>` loses `<int>` and line breaks disappear in 201 purpose values, 12 human-order details, and six Bitcoin labels. The unique canary substring survives, which is why this suite compares the full value, not merely a substring.
6. **BUY-010, P2 — discovery forbids a supported input.** `buy_simple` omits `purpose` with `additionalProperties:false`, though its items and theme shelves advertise the field. Eighteen MCP observations expose the contradiction across its three eligible items and three rails.

The running log contains repair directions and source locations. Items are **open on the audited baseline**; concurrent work in the shared checkout has not been evaluated here.

## How the canaries are checked

A request gets `SCVD-E2E-{fixed-test-timestamp}-{random}`, with distinct field suffixes. Free text uses that value directly. URL paths/queries contain it; hashes/digests/addresses derive from its SHA-256, so they remain valid inputs. A hostname is lowercased before submission. Enums and numeric/time controls use valid non-default or derived values; a network cannot literally carry an arbitrary canary. The tested subject network is Polygon, independently of the payment rail.

The first purchase uses ordinary text. The adjacent second purchase adds meaningful type notation, Unicode and a line break to fields promising verbatim retention. Both purchases remain in state before retrying each original request, so the test can catch stale values, altered goods and stock-sensitive recovery. Only the explicitly added replay note/metadata is ignored in response comparison.

The attestation bundle must preserve both transaction identifiers. `payment_payload` is checked through its extracted nonce, including a separate case without an explicit nonce. Pass renewal, mandate links and launch-check references use IDs obtained from real local prerequisite purchases. The confession's `sign_as` overrides `agent_name` intentionally; privacy is not treated as a missing-name defect. No active paid item publishes `grievance`, so that retired field is not resurrected for coverage.

Signatures are checked with WebCrypto Ed25519. Nested observations use their documented served-order preimage; separately wrapped observations are checked against their record and the supplied signature. Evidence hashes must match the certificate, including the bundle's ordered aggregate. The verification endpoint's signed fields are compared against what it displays. Signed request-independent payment terms are not expected to echo arbitrary buyer data.

Persisted business records are read separately from the purchase response. Successful immediate goods can also survive in the delivered signed artifact plus the original-request recovery path; absence from a dedicated KV record is not automatically called a defect. The report retains those paths rather than pretending every product stores an identical order shape.

Watch/Opening Day/Operator's Statement tests buy through the public door, run the actual scheduled sweep locally, and read the public history. Each first signed row retains its subject and verifies; the scheduled watch canonical serializers are used only to reconstruct that published signature preimage, not to determine the expected subject. Human work is completed through the local admin route with a synthetic deliverable identifying the canary request; this verifies delivery plumbing, not the quality of a human's work.

## Verification and reproducibility

The #481 subject control passes on the baseline. Temporarily replacing the URL mapper with an empty string made that control fail on the first purchase's missing URL; the production file was restored byte-for-byte. The prior required-input suite still records 1,598 observations with its same 25 failing acceptance groups and 11 passing controls. The four existing payment regression files add 19 passing tests. Typecheck passes. A second full run produced the same 450 observations, test outcomes, classifications and defect counts.

```sh
BUYER_INPUT_REPORT=/private/tmp/scvd-survival.json \
BUYER_INPUT_SCOPE='Local Worker buyer input-survival audit; mocked payments' \
npm test -- test/buyer-input-survival.spec.ts \
  --reporter=default --reporter=./scripts/buyer-input-reporter.mjs
npm run typecheck
```

The audit command exits nonzero while the logged defects remain. The shared harness lives at `test/helpers/buyer-harness.ts`; the prior omission suite now uses it too. The reporter preserves failing and passing rows.

## Limits

No real payment, merchant purchase, webhook, deployment or commit was made. All egress is intercepted; unknown requests fail. The facilitator accepts local payment fixtures, so these results establish application behavior and settlement calls, not cryptographic acceptance of real payment payloads or chain finality. In particular, the Solana fixture is a wire-shape fixture, not a signed mainnet transaction; test real facilitator duplicate/ambiguous outcomes before claiming a chain-level consequence.

External reads use local endpoint/chain fixtures; the fixture chain mostly has no matching transactions. This establishes that the intended subject/query survives, not that every real-world chain match is commercially correct. All three *payment* rails are exercised; this is not every possible *subject-chain* encoding. First scheduled observations are checked, not whole seven-/thirty-day terms. Bitcoin's accepted digest/label and certificate/proof record are checked, not a completed real Bitcoin timestamp. Short-term identical-request recovery is exercised; TTL expiry and authenticated wallet-claims recovery belong to the broader recovery suite. Other discovery surfaces, browser presentation, cross-door recovery, and adversarial artifact-quality tests remain separate prompts.
