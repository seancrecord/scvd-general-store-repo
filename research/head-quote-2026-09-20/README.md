# The 36 warnings were the HEAD record — 2026-09-20

MPPScan's listing of this store
(`www.mppscan.com/server/d58b4c8d…`, read back with a receipt in
`research/erc8004-followthrough-2026-09-19/mppscan-registration.json`)
carried **73 warnings, 36 of them on paid endpoints**, every one of
them the same pair:

> Paid endpoint is missing an input schema.
> Paid endpoint did not return payment options in the 402 response.

Their checker is published — `@agentcash/discovery@1.7.5` — so the
question could be answered rather than guessed at. It was, twice.

## What their checker reads

`getProbe` knocks on a path with **every method in `HTTP_METHODS`**, and
`getAdvisoriesForProbe` emits one advisory per method that answered a
usable status. Warnings are computed per advisory
(`getWarningsForL3`): a `paid` advisory with no `inputSchema` raises
`L3_INPUT_SCHEMA_MISSING`, and one from a probe with no
`paymentOptions` raises `L3_PAYMENT_OPTIONS_MISSING_ON_PAID`. Both
`inputSchema` and `paymentOptions` are read off the `payment-required`
header and the `WWW-Authenticate` challenge of the response in hand
(`resolveProbeSchemas`, `extractPaymentOptions3/4`).

So a door whose GET quotes and whose HEAD does not earns exactly that
pair, on the HEAD advisory, while the GET advisory stays clean.

## Measurement 1 — their checker, our live door, no stubs

`node checker-live.mjs https://scvd.store/api/buy/hello`, run
2026-09-20 before the fix deployed:

| method | authMode | inputSchema | paymentOptions | warnings |
| --- | --- | --- | --- | --- |
| GET | paid | yes | 6 | none |
| HEAD | paid | **no** | **0** | both of them, verbatim |

The two strings match the listing's wording exactly. 38 paid routes,
less the two template paths their probe recorded as
`[404] Probe failed: not_found` (`/almanac/{slug}` and
`/open-for-business/{week}`), is 36.

## Measurement 2 — their pipeline, the fixed worker's headers

`checker-over-dumped-headers.mjs` runs their `checkEndpointSchema`
unmodified and substitutes only the transport: a request to the door is
answered from a JSON dump of the headers this store produced under
test, and everything else (their own OpenAPI read) goes to the live
origin untouched.

Fed the LIVE headers, the stub reproduces measurement 1 exactly —
which is what makes it usable as an instrument at all. Fed the headers
the fixed worker produces:

| method | authMode | inputSchema | paymentOptions | warnings |
| --- | --- | --- | --- | --- |
| GET | paid | yes | 6 | none |
| HEAD | paid | yes | 6 | none |

## What this does not show

That MPPScan's hosted register flow is the same code path as the
published package, or that their listing will change. Their server is
not ours to read, and the egress here cannot reach their site at all.
The claim this evidence supports is narrower and sufficient: the
published checker, applied to our live door, produces those exact 36
warnings from the HEAD record and none from the GET record, and stops
producing them once the HEAD record carries what the GET record
carries. The listing itself is a thing to re-read after deploy, not a
thing to predict.
