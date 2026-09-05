# Directory API fixtures — 402index + x402scan

Captured 2026-09-04 by CV (house field wallet) for the two directory
readers: 402index free on the hourly walk, x402scan paid per page under the
wallet law. Prices below are as captured; neither directory publishes prices
on any web page — both are discoverable only in the payment challenges.

## x402scan.com — $0.01 per call, USDC on Base

All 14 endpoints in their `https://www.x402scan.com/openapi.json` carry
identical terms: x402 v2, `exact` scheme, eip155:8453, payTo
`0x2EC4545f96A24876764bF2B04D54E66A1351bE71`, 300s maxTimeout. Page count of
a fixture sets a round's cost: a cent a page.

- `resources.json` — paid capture, `GET /api/x402/resources?page=0&page_size=2`
- `merchants.json` — paid capture, `GET /api/x402/merchants?page=0&page_size=2&sort_by=volume`
- `facilitators-stats.json` — paid capture, `GET /api/x402/facilitators/stats`
- `*.terms.json` — the decoded `Payment-Required` 402 header for the same
  endpoint, captured alongside each body (price + payTo + schema evidence).

Header casing note: x402scan sends title-case `Payment-Required` — a buyer
doing case-sensitive header lookup (e.g. only `payment-required` /
`PAYMENT-REQUIRED`) will miss it. Header names are case-insensitive per
spec; normalize before lookup.

## 402index.io — JSON API free, CSV export 500 sats L402

- Free tier: 100 req/min per IP, no auth. (Empirically looser: 140
  cache-bypassing unique requests in 20s did not trip it, 2026-09-04.)
- L402 (Lightning) tier: 1,000 req/min — price only discoverable on breach,
  not captured.
- `services-page1.json` — free capture, `GET /api/v1/services?limit=25&offset=0`
  (the list endpoint named in `/api-docs`).
- Their one concrete paid product, self-listed in their own directory: full
  CSV export at `/api/v1/export.csv` = 500 sats (~$0.40) via L402 Lightning
  invoice. Uncaptured here: settlement needs a Lightning wallet. The 402
  contract: `{"error":"Payment Required","message":"CSV export requires L402
  payment. Add ?l402=require to any API endpoint…"}`.
