# The contract past its budget, and the test that could not see it — September 19, 2026

The six-doors live read at 02:56 UTC, run after the publication doors
deployed, reported the raw API partial on one check: `openapi.json` at
716,135 bytes, past the 700,000-byte scanner budget
(`store/reader-limits.ts`, the keeper's number) and heading for the
1,000,000-byte cap where a scanner stops fetching it. Every local guard
was green. `test/openapi-headroom.spec.ts` built the document with every
checkout rail enabled and read 662,100 bytes; it had never enabled the
native lane, on since the whole-shelf release, whose per-door rows and
descriptor are 53,001 of the 54,035 bytes the served document carried
that the test never built. Built locally with the rails and the lane, the
document read 715,101: the live number, within the keeper's pages.

## What changed

- **The item-independent rows ride once.** Each of the thirty-five buy
  doors carried the MCP and WebMCP capability rows in
  `x-scvd-payment-capabilities`, identical between doors except for the
  terms the HTTP row already names: 33,463 bytes. The compact catalog has
  carried them once per page since the MCP release. The document now does
  the same: the door keeps its `http` rows, and the root carries
  `x-scvd-native-checkout` with the `mcp` and `webmcp` shapes from the same
  enabled answer (`nativeCheckoutExtension`), so a store with the lane
  withheld carries neither.
- **The metered refusal is one component.** `withRateLimitHeaders` inlined
  the shared 429 on every metered preflight operation to hang the
  RateLimit fields on it: five copies of two kilobytes. `TooManyRequestsMetered`
  in `components.responses` is that object once, and the metered
  operations reference it, the way the 304 went in September.
- **The headroom test builds what production serves.** Every rail and the
  native lane. Measured after: 674,723 bytes with both, against the
  unchanged 700,000.

Untouched on purpose: the inline `Idempotency-Key` on every paid door and
the inline 402, both the reader-that-does-not-resolve decisions of
September 5, and the keeper's budget number.

## What would catch it going stale

- `test/openapi-headroom.spec.ts`: the byte ceiling under every rail and
  the lane (shown failing against the previous source at 715,101); the
  root block equals the catalog's two shapes and is absent with the lane
  withheld; every door's rows are `http` and one is the lane's; the
  metered 429 is one reference that resolves to the shared refusal plus
  the five RateLimit fields.
- `test/mpp-rollout-discovery.spec.ts`: the door's rows are the item
  contract's `http` rows and the root block is the compact catalog's.
- `test/openapi-rate-limit-headers.spec.ts`: now reads through a
  response reference, so the metered 429 still counts as declaring the
  fields on a metered status.
- `npm run doors:check`: the live read that found it.

## Not in this release

The next two levers are parameters, and both wait on a ruling. The
`If-None-Match` parameter is inlined on eighty-three free doors (25,232
bytes) and the negotiated `Accept` parameter on twenty (9,830); OpenAPI's
answer is a `components.parameters` entry and a `$ref`, but the
September 5 note on the idempotency parameter records a scanner that
does not resolve parameter references and reported the referenced
component as floating and unused. Whether a caching header may take that
warning where the payment key could not is the keeper's call; until then
the document holds about 25,000 bytes of headroom, three listings' worth.
