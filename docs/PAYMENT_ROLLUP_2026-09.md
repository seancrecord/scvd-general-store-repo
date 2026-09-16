# Payment breakdown — September 16, 2026

The keeper asked for one homepage purchase count split by payment protocol,
with network and currency detail on a shared page, and approved building and
merging it. `/rails` is that existing page; no second books page is introduced.

## Source and scope

The existing till's two `recordSettlement` callers are the HTTP payment gate
and the MCP x402 payment path. Their counters, including historical counters,
record x402 purchases in USDC. `SETTLEMENT_ACCOUNTING` names that contract once,
and new settlement events carry its protocol and currency alongside the
reported network. No buyer-controlled protocol label is accepted.

`computeStatsDiagnosed` applies the existing house reclassification first,
then derives `payments` from disjoint payment sources. The homepage, public
rollup, stats API, full menu, MCP resource and admin take share this object.
The existing skill/catalog track-record prose also names the protocol. No
second counter is incremented, so this display adds no retry/double-count path.

The public split uses **organic purchases**, retaining the existing separate
house, pre-meter and artifact totals. Protocol, currency and network are three
views of the same count, not three counts to add. An unavailable or inconsistent
network split is null; the page says so. Known network gaps remain explicit.
The existing network history and trade-counter section stay on `/rails`.
House totals are also shown by protocol/currency on `/admin/take`; its existing
certificate revenue, product detail, refunds and reconciliation remain intact.

## Extension boundary

This does not enable MPP checkout. The MPP census measures outside endpoints,
not store purchases, and contributes no sales. A future checkout must provide
its own disjoint accounting source, confirmed-payment/retry identity and
currency-aware money records before it joins these views. It must not call the
legacy x402/USDC recorder and have its payments labelled x402.

The grouping function accepts multiple protocols and currencies; tests use
synthetic MPP/USDC and MPP/EUR sources to verify aggregation. Those fixtures are
not a live acceptance claim. The currency table counts purchases; it does not
sum money across assets, convert currencies, or publish new revenue estimates.
