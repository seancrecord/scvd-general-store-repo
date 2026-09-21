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

## Measurement 3 — the deployed door, after the fix merged

`#865` merged and deployed at 19:30 UTC the same day. Their checker,
run again against the live store with nothing stubbed:

| door | GET | HEAD |
| --- | --- | --- |
| `/api/buy/hello` | clean, 6 payment options | clean, 6 |
| `/api/buy/the_statement` | clean, 6 | clean, 6 |
| `/almanac/notes-from-a-tuesday-in-oak-city` | clean, 18 | clean, 18 |

A fourth door, `/api/commission/pay/25`, was probed directly rather
than through their checker (see the note on load below): 402 with both
`payment-required` and `WWW-Authenticate` down each method.

### The stall, named so nobody re-chases it

Their probe fires all eight HTTP methods at one path at once and leaves
every response body unread. Through this sandbox's HTTPS proxy that
sometimes strands one of the eight for minutes. It stranded a different
request on each run, never the same one twice, and did not reproduce on
a clean re-run of any door — which is this house's own rule for load
rather than defect (AGENTS.md, the timeout note). Measured directly,
every door answers every method in under 1.5s over HTTP/1.1 and HTTP/2
alike. It is the reading, not the door.

Header blocks while we were looking, against Node's 16,384 cliff that
`test/challenge-header-budget.spec.ts` guards: 7,923 bytes at the
commission rung, 9,905 at the almanac page, 11,306 at the widest shelf
door — and HEAD measures a byte or two BELOW its GET every time, never
above. Quoting a HEAD spent nothing against the limit, because each
response still carries one copy of the challenge.

## What this does not show

That MPPScan's hosted register flow is the same code path as the
published package, or that their listing will change. Their server is
not ours to read, and the egress here cannot reach their site at all.
The claim this evidence supports is narrower and sufficient: the
published checker, applied to our live door, produces those exact 36
warnings from the HEAD record and none from the GET record, and stops
producing them once the HEAD record carries what the GET record
carries. The listing itself is a thing to re-read, not a thing to predict: this
session's egress answers 403 on CONNECT for their site and for the
`*.workers.dev` branch preview alike, so both the listing and the
pre-merge preview were out of reach from here. What measurement 3
establishes is the deployed door's own answer, which is the half that
was ours to fix.
