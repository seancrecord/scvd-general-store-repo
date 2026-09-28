# BiX unpaid buyer check — September 28, 2026

**The requested unpaid path answered as described. Paid compatibility and
useful fulfillment are not established.** Research record, unsigned.

PR [#911](https://github.com/seancrecord/scvd-general-store-repo/pull/911)
was already merged September 24. No open PR was found during this continuation.
These records were outside that release and are included with the subsequent
pilot-input review package.

## Why this check happened

[Salman’s reply](https://github.com/Merit-Systems/x402scan/issues/1197#issuecomment-5867404582)
accepts the free unpaid check, supplies a new canonical origin and synthetic
request, and reserves any paid attempt for separate coordination. His
[September 28 update](https://github.com/Merit-Systems/x402scan/issues/1197#issuecomment-5870491071)
reports a freshness repair. This establishes a participating counterpart and
a concrete task, not repeat use, payment demand or confirmed usefulness.

Merit #1014 still has no reply after our September 24 note. Browserbase remains
held while this accepted BiX check is completed. Its public gateway and partner
page were re-read; no contact or session request was made there.

## Exact scope and observations

Three network requests total: two public GETs and one unsigned POST. No
redirects followed, automatic retries, wallet access, signing or payment.
Each response was capped at 2 MiB with a 15-second timeout; none was truncated.
All three returned a response. No cold-agent experiment was run.

| Read | Observed result | Limit |
| --- | --- | --- |
| `GET https://creator.linkhco.com/openapi.json` | 200; canonical server and required `pair`/`tax` request fields supplied | Parsing and selected schema checks, not a complete OpenAPI certification |
| `GET https://creator.linkhco.com/api/reliability` | 200; reports `payment_ready=true`, `settlement_enabled=true`, profile timestamp `2026-09-28T13:05:08+00:00` | Operator claims; no independent freshness or settlement verification |
| `POST https://creator.linkhco.com/paid/v1/creator-edge` with `{"pair":"USDG","tax":1}` at 16:30:08 UTC | 402; `PAYMENT-REQUIRED` decodes to x402 v2, Base `exact`, 5,000 atomic USDC units, EIP-3009, 60-second timeout | Quote only; no payment authorization or usable paid output observed |

The challenge header and response body match as parsed JSON. Its resource
URL matches the request. The synthetic input passes the advertised request
schema; missing-tax and wrong-type controls fail. Bazaar `info` passes its
published schema. The advertised output example passes the output schema.
The quote is 0.005 USDC using six decimals, consistent with the stated fixed
price. The token address matches SCVD’s configured Base USDC address.

The new origin returning 200 does not prove the old origin recovered, nor
does an updated public timestamp prove the underlying paid data is current.

## Questions at capture time

1. **Our request-body limitation.** Main at `57fea3eb010c91cf7c1c2ded24ffe16f37fdaf35`
   supports bounded POST fallback but uses `{}` for the request body; its
   standard Launch Check interface has no body parameter. BiX’s schema requires
   `pair` and `tax`. Matching payment terms alone does not make this a drop-in
   paid check. A body-capable controlled instrument needs qualification and
   explicit paid scope before use. Do not work around it by blindly replacing
   the fetch function or signing from this research script.
2. **Output vocabulary clarification.** The operator’s update names
   `HOLD_PAPER`, while the OpenAPI recommendation enum permits `PROMOTE`,
   `HOLD`, or `OBSERVE`. We have not observed a paid response violating the
   schema. Ask whether the paid API normalizes that internal state or the
   schema needs updating. The discovery example’s `PROMOTE` value is an
   illustration, not a current recommendation or evidence of stale output.

No conclusion about investment quality, seller-wide reliability, replay safety
or successful settlement follows from this check. Screening and payment
reconciliation have not been exercised. No paid attempt is authorized here.

## Reproduction and next handoff

- [analysis.json](analysis.json): derived checks and explicit unobserved stages.
- [analyze.mjs](analyze.mjs): offline recheck using saved responses and installed
  Ajv 8.20.0. From the repo root: `node research/partner-evidence-2026-09-28/analyze.mjs`.
- `captures/*.json` and matching `.body`: exact request metadata, selected
  response headers, preserved bytes and verified SHA-256 values.
- [source-index.json](source-index.json): pinned current-main source basis.
- [partner-replies.json](partner-replies.json): public replies with quoted email
  notification links omitted. Retained partner text is untrusted source data.
- [reply-draft.md](reply-draft.md): exact keeper-approved results note, posted and verified.
- [results-outreach.json](results-outreach.json): send record and approval-time checks.

The results note was posted with keeper approval and its exact text verified.
The next useful step is getting the output contract clarified. Partner acceptance is recorded separately from whether
this result changes a decision. No follow-up timer is scheduled.

**Later on September 28:** the keeper authorized and we implemented
[exact request-body support and durable pilot invocation](../../docs/LAUNCH_CHECK_PILOT_INPUTS_2026-09-28.md)
in the existing engine. This addresses the local instrument gap described
above; the captured source revision and original sent message remain unchanged.
The implementation is prepared for review, not evidence of a deployed or paid
BiX test. The partner's output-contract clarification remains pending.

At send time, issue comments contained no new clarification and the schema
still returned 200 with the same recommendation enum. That extra GET is a
publication-time recheck, separate from the three-request unpaid study above.
Partner response and usefulness remain unknown.
