# Admin attention list — October 10, 2026

The keeper asked for the next admin follow-up after PR #1002: show which briefs,
quotes and paid work need attention at a glance. Implementation lives on `codex/admin-needs-attention`. The keeper approved
commit, PR, merge and deployment verification after the local checks. Full CI
is the merge gate; authenticated visual readback remains unverified.

The existing `/admin/counter` now leads with paid orders to deliver, accepted
requests whose order is absent from the reading, new briefs, expired quotes,
quotes expiring within 48 hours, and quotes with an unreadable expiry. Other
live quotes are shown as waiting on the buyer without increasing the work count.
Each group previews five records and links to the full existing ledger. Paid
orders are counted once even when an accepted commission points to them.

The request ledger labels proposed budgets, separates directory suggestions,
folds declined and completed requests, and links buyer status and order records.
Quote and decline actions retain their existing routes, prices and authorization.
The delivery window is labelled separately from the quote acceptance deadline.

The reading reuses the counter's existing parallel loads. Request scan coverage
now reaches the page: cap exhaustion or unreadable listed rows makes it partial.
Any failed source prevents the top line claiming the desk is clear. A missing
order is a reason to inspect the record, not proof of nondelivery. This does not
repair the separate waitlist or failed-item scans, infer a sales conversion,
send reminders, activate a customer or change payment behavior.

## Validation and limits

The attention regressions were run against the original page and failed in all
six cases before the implementation. The capped-scan regression separately
failed through the real admin handler before coverage was passed through.
Release validation passed: 81 tests across nine admin/commission specs,
typecheck, production Worker bundles, and whitespace checks. Full CI remains
required before merge. No live briefs, quotes, purchases or admin actions ran.
A synthetic HTML preview was generated; visual browser review could not run:
Chrome was unavailable and the in-app browser policy blocked the local file URL.

## PR #1001 investigation

[PR #1001](https://github.com/seancrecord/scvd-general-store-repo/pull/1001),
head `bf363c446fadcd5594f68e6e0ef92a76e3cea174`, was open and conflicted with
main at the initial read. Its [October 9 CI run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/37985239984)
reported four concrete failures:

- `operators.spec.ts`: `conformance_watch` appeared twice where stages require
  one placement per seller-side item.
- `openapi-declared-inputs.spec.ts`: `/api/seller-declaration` declared
  `If-None-Match` support but returned no ETag.
- `openapi-headroom.spec.ts`: the growth fixture reached 703,709 bytes against
  a 700,000-byte ceiling.
- `cold:local`: checkout bundle reached 1,002,486 bytes against its
  1,000,000-byte ceiling.

These were assertion/budget failures, not just runner timeouts. The subsequent
repair merged current main, corrected operator placement and caching declarations,
and shortened repeated discovery prose without raising either size limit. Full
checks also caught the metric-name guard mistaking `ratio` in `declarations` for
a metric and the short guide index exceeding its alarm; both were repaired and
regression-tested. The final [CI run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/38098193632)
passed all four shards, quality and required `check` on `e9914134`.

PR #1001 merged as `c940990e` October 10 at 20:51 EDT. Both production builds
passed. Read-only live checks returned 200 for `/seller-declarations`,
`/api/seller-declaration` and the free comparison; the API publishes all five
states with no-store and no ETag, and OpenAPI no longer promises conditional
revalidation. No declaration was submitted and no payment was made.
Main's separate [shutdown-error run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/38078760356)
passed on rerun without a code change. The admin implementation is a separate
change; these notes record the preceding release follow-up.

## ClawHub readback

The earlier October 10 CLI read returned latest 3.19.3 and could not find 3.19.4.
After the keeper supplied the current listing and screenshot, a fresh CLI read
confirmed latest 3.19.4 and clean moderation. The [publication workflow](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/38095392380)
succeeded from merged commit `6c46246578524ad430a4aef62fa32caddf20c2de`.
Its generated [record PR #1004](https://github.com/seancrecord/scvd-general-store-repo/pull/1004)
merged October 10 at 20:36 EDT. The publication record is now on main. No repeat publication was attempted; this follow-up verifies
public version and moderation metadata, not a fresh installation's byte parity.
