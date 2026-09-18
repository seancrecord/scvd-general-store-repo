# Vendored UCP schemas

`2026-08-25/` is a verbatim copy of `source/schemas/` from the Universal
Commerce Protocol specification repository, taken at the frozen release
this store implements and advertises.

| | |
|---|---|
| Repository | https://github.com/universal-commerce-protocol/ucp |
| Ref | `release/2026-08-25` (tag `v2026-08-25`) |
| Commit | `cd78fb38e819de77d9b527d110476eccb876f1bd` |
| Copied | 2026-09-16 |
| Path | `source/schemas/` |
| Licence | see `LICENSE` in the upstream repository |

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
