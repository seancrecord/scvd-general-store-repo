# The byte budgets measure what production serves — September 19, 2026

Three times in one night a live read found a surface past a budget that
every local guard held green: the [OpenAPI document](OPENAPI_READ_BUDGET_2026-09-19.md)
(716,135 bytes against 700,000), the [widest 402's header block](HEADER_BUDGET_LANE_2026-09-19.md)
(14,017 of Node's 16,384, measured 11,494 here) and, found while auditing
the rest, the largest one-item compact contract: `/menu/settlement_attestation?view=compact`
served 17,543 bytes live against the 16,000-byte target while
`test/machine-buyer-entrypoints.spec.ts` measured it at 15,903 and passed.
The cause was the same each time. The fixture enables fewer checkout
rails than production and never the native lane, and the lane's rows and
challenges are exactly the bytes that grew across the September releases.

## What changed

- **One shape, spelled once.** `test/helpers/production-shape.ts`:
  every checkout rail with fixture recipients, the lane on with a fixture
  challenge key. The guards that judge a byte budget read through it.
- **The one-item contract has its own target.** `COMPACT_ITEM_CONTRACT_BUDGET_BYTES = 18,000`
  in `store/reader-limits.ts`, with the reason beside it: the contract
  shared the catalog page's 16,000 from the day it was cut with 60 bytes
  to spare, and three approved releases put the lane's three rows on it
  (about 1,400 bytes on every item). 18,000 admits the contract as the
  keeper approved it, 457 bytes of room on the largest item; the catalog
  page keeps 16,000 (13,715 served). Whether the item contract is thinned
  back under 16,000 instead is the keeper's ruling, named on the list:
  the levers are the checkout contract it repeats from the page (1,867
  bytes) and the artifact prose the full listing also carries.
- **The guards read the production shape.** `machine-buyer-entrypoints`
  (item contracts and single-item tools), `review-consistency` (a fourth
  configuration, production's, through the real bindings),
  `mpp-rollout-discovery` (the item contract against its own target) and
  `discovery-budget` (every well-known document). Under the shape the
  x402 discovery documents read 397,554 bytes against their 500,000
  ceilings, the compact page 13,715 against 16,000, the largest
  single-item tool listing 5,171 against 10,000.
- **One ceiling, spelled once.** `agent-catalog-readability` held a typed
  620,000 beside the scanner budget; it reads `SCANNER_BUDGET_BYTES` now.

Nothing served changed. The guards now see it.

## What would catch it going stale

- `test/machine-buyer-entrypoints.spec.ts`: every one-item contract under
  18,000 and every single-item tool listing under 10,000, under the
  production shape. Shown failing at the old target: Settlement
  Attestation, 17,543, the live number.
- `test/review-consistency.spec.ts`, `test/mpp-rollout-discovery.spec.ts`,
  `test/discovery-budget.spec.ts`, `test/agent-catalog-readability.spec.ts`
  as above.
- `npm run doors:check` reads the live surfaces; a budget it reports
  partial that the suite holds green is the shape drifting again.

## Not in this release

The MCP tool catalogue, static and lane-independent, sits 204 bytes under
its 152,000 ratchet; `llms.txt` moves 26 bytes with the lane, well under
its 30,000; the trust, MCP and ARD documents do not move at all.
