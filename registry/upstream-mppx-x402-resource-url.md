# Upstream note for `wevm/mppx` — the x402 reader's strict resource URL

**Status:** draft for the keeper. Filing an issue on another project's
tracker is the keeper's press (rule 30); this container has no access to
that repository. Goodwill, not a dependency: the store already names the
asked URL in its envelope since
[#804](https://github.com/seancrecord/scvd-general-store-repo/pull/804).

**Where:** <https://github.com/wevm/mppx/issues/new>. Read the tracker
for a duplicate first (rule 61); search `resource does not match response URL`.

## Suggested title

x402 reader throws on `resource.url !== response.url` before native MPP challenges are considered

## Suggested body

In `mppx@0.10.1`, `client/internal/protocols/X402.js` line 21:

```js
if (response.url && paymentRequired.resource.url !== response.url)
    throw new Error('x402 payment-required resource does not match response URL.');
```

The http client collects every protocol's challenges from a 402 (`mpp`,
`x402`, `mcp`). Because the x402 reader throws instead of returning `[]`,
a 402 that carries a native `WWW-Authenticate: Payment` challenge beside
an x402 envelope becomes unpayable by the stock client the moment the
envelope's `resource.url` differs from the fetched URL, even though the
native challenge on the same response is valid and would have settled.

Two things make the difference common in practice:

1. **Canonical resources.** x402 servers commonly declare the door's
   canonical URL as the resource while the door is only ever bought with a
   query (`?summary=...`, `?host=...`). The x402 v2 spec identifies the
   resource by URL; as far as the store has read it, it does not spell out
   a client-side equality check against the request URL including its
   query string. That reading is ours; cite the spec text itself.
2. **Query-bearing doors.** `response.url` carries the query; a static
   resource declaration does not.

Observed on 2026-09-18 by a buyer with a funded wallet against
`https://scvd.store/api/buy/context_anchor?summary=...`: the client threw
before any signature was attempted. The store's envelope then declared
the bare door as its resource; it now declares the asked URL, which is why
the store's own doors are no longer affected. Other stores that mirror
the common canonical-resource pattern still are.

Suggested change, either of:

- compare origin and pathname only (ignore query and fragment), which
  keeps the anti-substitution intent of the check; or
- on mismatch, skip the x402 offers for that response (return `[]`, or
  surface a warning) rather than throw, so the native `Payment` challenge
  on the same response stays usable.

Happy to add a test if you point at the fixture shape you prefer.

## What not to claim

The store's own doors are fixed and qualified; do not describe this as
blocking a purchase today. The spec reading above is the store's; cite
the x402 spec text rather than restating it if the maintainers ask.
