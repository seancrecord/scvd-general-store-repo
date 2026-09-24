# BiX Creator Edge — seller qualification

Case S-001. Dated September 24, 2026. Stage: explicit historical request;
current schema read unavailable. **Not qualified for a paid test yet.**

## Why this candidate

[Merit issue #1197](https://github.com/Merit-Systems/x402scan/issues/1197)
contains the seller's September 14 request for a first buyer/design partner
or small paid canary. It names an OpenAPI document, a paid route, Base, and
a price. It also says settlement is deliberately disabled until a real
buyer is ready. This establishes a request for help with a commercial loop,
not substantial buyer volume or demand for recurring independent evidence.

## What was actually read

- `merit-issue-1197-network`: GitHub API returned the open issue with zero
  comments at collection time. Seller claims remain attributed to the seller.
- `bix-openapi-network`: one unauthenticated GET to
  `https://bix-creator-edge.liara.run/openapi.json`, at
  2026-09-24T15:15:18.906005Z, returned HTTP 503 and an HTML application-error
  page. No valid OpenAPI schema was obtained.
- `bix-held-history`: SCVD's existing unsigned host-history summary returned
  200. It reports zero probed rounds, one gap since first sighting, and a
  possible cap-related coverage gap. This is an SCVD coverage limitation,
  not an assertion that the paid endpoint failed historically. No original
  corpus signature was independently verified in this task.

The initial sandbox request failed DNS resolution; the network-enabled
capture is separate. Only the latter supports the observed HTTP response.
No request was sent to the paid route. No cause for the 503 is established;
the route may have moved, been intentionally disabled, or been temporarily
unavailable. Do not describe this as all buyers being turned away.

## Eligibility sheet

| Requirement | Evidence / current status |
| --- | --- |
| Seller wants a small buyer-path test | Explicit in the public issue; current willingness not reconfirmed |
| Published live schema | 503 on one read; method, body and expected output unknown |
| Network and price | Seller-reported Base and 0.005 USDC; no current challenge read |
| Scheme and asset | Not confirmed; issue saying v2/Base does not establish exact EIP-3009 eligibility |
| Settlement ready | Seller described a deliberate gate; current state unknown |
| Launch Check compatibility | Unknown; GET/body/scheme checks cannot be completed without the schema/challenge |
| Expected usable delivery | Unknown; must be supplied or publicly documented |
| Purchase authority and cap | No attempt designated or funds authorized in this evidence package |

## Smallest useful next exchange

Reply to the seller's existing request, identify SCVD, and offer a free,
bounded outside check once ready. Name the dated OpenAPI response without
diagnosing their hosting. Ask for the current public schema/route and whether
the settlement gate is ready for a controlled buyer. The operator can supply
a synthetic example input and a definition of successful delivery; no keys
or credentials are requested.

If compatible, propose a single baseline and at most two cold preparation
runs, stopping before payment, followed by one specifically authorized paid
attempt. If incompatible, record why and select another willing seller rather
than forcing the request through the instrument. No automatic retry or
scheduled probe is created.

Falsifier: a successful later schema read supersedes the access observation
for that later time; it does not erase the saved 503. The next read should be
triggered by an operator response or a specific follow-up, not a polling loop.
