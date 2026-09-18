# MPPScan registration — draft, September 18, 2026

**What is submitted:** the store's origin, `https://scvd.store`, to MPPScan's
"Add Server" flow at <https://www.mppscan.com/register>. The flow reads the
origin's `/openapi.json` (the AgentCash discovery profile x402scan and MPPScan
share) and lists every operation carrying `x-payment-info`. There is no
listing copy to write: the index renders what the document says.

**Why now:** native MPP checkout stands beside x402 on every HTTP door since
[the whole-shelf release](../docs/MPP_WHOLE_STORE_2026-09-18.md), the OpenAPI
document has carried the `mpp` protocol descriptor beside `x402` on each of
those doors since [the metadata repair](../docs/MPP_OPENAPI_DISCOVERY_2026-09-17.md),
and two outside-wallet purchases with the stock client are
[recorded](../docs/MPP_LIVE_RESULT_2026-09-18.md). The keeper authorized
registration on September 18 if it costs nothing.

**Who presses:** the keeper (rule 30). This container cannot reach
`mppscan.com` at all, so nothing here was submitted and the register page
itself was not read from here; its mechanics below are read from search-index
snippets of that page, `mpp.dev/advanced/discovery`, the `tempoxyz/mpp`
README and two third-party write-ups. Re-read the page before pressing
(rule 61).

## What was measured, live, before drafting

[Receipt](../research/distribution-2026-09-18/mppscan-live-check.json), read
with `@agentcash/discovery@1.7.5`, the package `apps/scan` in
`merit-systems/x402scan` pins and npm's `latest`:

| read | result |
| --- | --- |
| `GET https://scvd.store/openapi.json` | 200, 715,037 bytes, `access-control-allow-origin: *`, OpenAPI 3.1.0, `x-guidance` present, `x-discovery` absent |
| paid operations in that document | 38, every one with `responses.402` and the structured `price` shape; 35 carry `[{x402}, {mpp: {method: "evm", intent: "charge", currency: <Base USDC>}}]`; the 3 without `mpp` are the almanac and open-for-business pages, which sell over x402 only |
| `check https://scvd.store/api/buy/context_anchor?summary=probe` | `GET paid 1 USD [x402, mpp]` |
| `check https://scvd.store/api/buy/small_blessing` | `GET paid 0.005 USD [x402, mpp]` |
| `check https://scvd.store/api/buy/spot_check?host=example.com` | `GET paid 0.001 USD [x402, mpp]` |
| `check https://scvd.store` and `check .../openapi.json` | `L3_NOT_FOUND`: the checker audits one paid path, and neither URL is one; expected, not a defect |
| bare `GET /api/buy/context_anchor` (a crawler's unpaid probe of a query-required door) | 402 with both `WWW-Authenticate: Payment` and `payment-required` |
| `discover https://scvd.store` (the whole-origin crawl the register flow runs) | Source `openapi`, 196 routes: 38 paid, 35 of them `[x402, mpp]`, 157 unprotected; three warnings, none on a paid door: `L2_ROUTE_COUNT_HIGH` (196 routes), and the purchase-status bearer scheme read as no auth mode (`L2_AUTH_MODE_MISSING`, `L3_AUTH_MODE_MISSING`), which `PAYMENT_RAILS.md` records as left as written because respelling it would break the door. [Full output](../research/distribution-2026-09-18/mppscan-discover.txt) |

## What could reject it, and what was done about each

- **The index labels the network wrong.** The pinned checker formats every
  MPP `evm/charge` option as `tempo:${chainId}`, so a Base door reads
  `tempo:8453` in probe mode, and it drops `methodDetails.decimals`. Reported
  as [Merit #1209](https://github.com/Merit-Systems/x402scan/issues/1209) on
  September 17 with a deterministic reproduction; still open at this read.
  This is their display, not our document: the static descriptor and the
  challenge both say Base. A listing that shows `tempo:8453` is a known
  mislabel to cite, not a reason to change the challenge. "Spraay x402
  Gateway" is already listed there as "x402 and MPP on Base", so a Base
  server is not refused by the index.
- **The document is large and the crawl is wide.** 715 KB; the checker
  gives a fetch 5 s and a single read from here took 0.69 s. The crawl
  then probes every paid route with eight methods (its TRACE attempts fail
  inside Node, not at the door) and re-reads the whole document once per
  route, about 3.2 s each from here, so a whole-origin discover is minutes
  of serial work; the first run here completed inside its 590 s window
  with every door answered. MPPScan's server-side reader may have its own
  budget. If the flow reports a fetch failure or a timeout, the document's
  size is the first thing to measure, not the descriptor.
- **Ownership proof.** `x-discovery.ownershipProofs` is optional. The store
  omits the key rather than sending an empty array, because
  [Merit #1046](https://github.com/Merit-Systems/x402scan/issues/1046) shows
  `[]` breaking their server page. An owner claim, if the page offers one,
  is a separate keeper decision; the listing does not need it.
- **Probes of query-required doors.** A bare knock answers 402 with both
  offers on every door (`bare_probe_answers_402: true` in the store's own
  payment guide), so a crawler that probes without inputs still reads a
  paid door.

## What to press, and what to bring back

1. Open <https://www.mppscan.com/register>. If the page asks for anything
   beyond the origin URL (a sign-in, a wallet connection, a fee), stop: none
   of the sources read here mention one, and the keeper's authorization was
   conditional on the listing costing nothing.
2. Enter `https://scvd.store` and press Add Server.
3. Bring back the result page URL (their server pages look like
   `https://www.mppscan.com/server/<64 hex>`), the count of resources it
   reports accepted, and any error text verbatim. Expected on the numbers
   above: 38 resources, or 35 if the index lists only operations carrying an
   `mpp` descriptor.

The outcome is recorded, dated, in `docs/SPEC_READS.md` and
`DISTRIBUTION.md`; an accepted listing joins the trust records only after it
is read back from their public page, and a `tempo:8453` label in that readback
is cited beside Merit #1209 rather than corrected on our side.
