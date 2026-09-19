# Vendored UCP schemas and transport contract

Two verbatim copies from the Universal Commerce Protocol specification
repository, both taken at the frozen release this store implements and
advertises:

- `2026-08-25/` — `source/schemas/`, the JSON Schemas every document
  this store emits is validated against.
- `2026-08-25-rest/shopping.openapi.json` —
  `source/services/shopping/rest.openapi.json`, the REST transport
  contract: which operations exist, at which paths, with which
  methods and bodies.

| | |
|---|---|
| Repository | https://github.com/universal-commerce-protocol/ucp |
| Ref | `release/2026-08-25` (tag `v2026-08-25`) |
| Commit | `cd78fb38e819de77d9b527d110476eccb876f1bd` |
| Schemas copied | 2026-09-16 |
| Transport contract copied | 2026-09-19 |
| Licence | see `LICENSE` in the upstream repository |

## Why the transport contract is here too, three days late

It was read carefully on 2026-09-16 and not copied, on the reasoning
that spec-pins already watched it for drift. That distinction — watched
but not vendored — is exactly the gap it fell through. A pin notices
when the upstream file CHANGES; nothing noticed that this store
advertised `dev.ucp.shopping.checkout` and
`dev.ucp.shopping.catalog.lookup` while serving neither Update Checkout
(`PUT /checkout-sessions/{id}`) nor Get Product
(`POST /catalog/product`), because the only copy of the operation list
was in a reviewer's memory of a file that was never in the tree.

`test/ucp/transport-contract.spec.ts` now reads this copy in CI and
joins it to the profile the store actually serves: every operation of
every capability the profile advertises must have a route, and the
join between operation and capability is derived from the schema file
the operation's bodies point at rather than written down. Advertising
a capability is a promise about operations; this is the test that the
promise is kept.

## Why a copy rather than a fetch

The conformance gate (`npm run ucp:conformance`) validates the catalog
this store actually emits against these files. A gate that fetched them
at run time would be a gate that passes when the network is down and
changes its mind without a commit — which is the opposite of what a
conformance check is for. The copy makes the contract reviewable in the
diff that changes it.

## Keeping it honest

These files are NOT edited here. `scripts/lib/spec-pins.mjs` carries two
pins against the same ref (`ucp-shopping-schemas`, `ucp-shopping-rest`),
so a backport landing on the snapshot shows up as drift on the weekly
screen rather than as a silently stale copy. When it does: re-copy from
the same ref, re-run the conformance gate, and re-pin.
