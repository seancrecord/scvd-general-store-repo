# Operating cost cuts — October 23, 2026

Prepared locally at the keeper's direction: rank the value and remove optional
work aggressively. These changes extend the hourly public-statistics work in
`codex/public-statistics-summary`. The keeper approved release on October 23
after reviewing the cuts and local validation. Release proceeds through the
normal PR/CI gate; deployment and live savings still require verification. The original checkout's unrelated edits remain untouched.

## Value order and decisions

| Rank | Value | Decision |
| --- | --- | --- |
| 1 | Deliver purchases, recover interrupted payments, reconcile obligations | Keep existing schedules, records and eligibility checks. |
| 2 | Signed observations, verification, evidence retention and essential failure alerts | Keep. The store's product and its proof must survive the cuts. |
| 3 | Sales totals, coarse discovery counts and named campaign attribution | Keep monthly/weekly counts and bounded venue counters. Public books/funnel use one dated hourly publication. |
| 4 | Historical traffic classification | Reduce scheduled passes to 00:30, 06:30, 12:30 and 18:30 UTC. Keep the existing completeness rule and publication date. |
| 5 | Recent sales and homepage decoration | Keep recent sales on page load; remove minute polling and bounty/trade gauges. Read only enough sale records to fill the window. |
| 6 | Detailed free-visit analytics and automatic prospect scouting | Stop raw free-visit rows and free-visit client/referring-host map updates. Pause automatic contact scouting; retain the manual action and sent-note audits. |

Monthly ledger readers also stop fetching counter kinds that cannot contribute
to their result. Listing caps and truncation warnings remain unchanged.

## What the changes buy

These are measured or directly testable changes in work, not invoice savings:

- A basic admitted free visit keeps two logical aggregate updates, month and
  week, instead of adding a raw event. A visit to a censused instrument with an
  external referrer drops from five logical updates to two. A declared venue
  still adds its bounded campaign counter. The existing per-isolate admission
  limit stays; it is not an account-wide cost ceiling. Counter-object coalescing
  and retries mean logical updates are not identical to billed KV operations.
- The sales reader fetches five values when the newest five of 200 indexed sales
  qualify, versus fetching all 200 previously. House or missing rows require
  further batches, up to the unchanged scan cap. Page loads and direct JSON
  requests still read sales; this is not a saved sales snapshot.
- Historical corrections get four scheduled opportunities per day instead of
  24 hourly opportunities, plus removal of the weekly duplicate. This is 75%
  fewer regular scheduled passes, not a 75% bill reduction.
- The prior live monthly-key inventory found 1,977 unused values out of 6,792.
  Those values can now be skipped by this reader. That 29.1% applies only to
  the inventoried reader component, not all storage reads or the account bill.
- Automatic browser sales requests, automatic contact-scout passes and the
  two optional homepage gauge calculations are removed.

## Measurement tradeoffs

Free-visit history stops prospectively when this release is deployed. Existing
raw events retain their original 90-day expiry; they are not deleted. Free-page Signature-Agent claim census collection also stops. Historical
client/referrer maps remain readable, but will no longer describe new free
visits. Admin pages and the growth JSON identify the collection change. Named
campaign counts still update; the MCP initialization census remains separate.
Quote, decline, settlement and verification writers are unchanged. No new
sampling denominator is introduced into conversion figures.

The archive still contains old free-visit events. Their cost does not disappear
on deployment, and historical correction scans continue to enumerate them until
they expire. The old correction publication was already stale on October 19;
reducing frequency does not repair that stalled collector and can lengthen cache
warm-up. The existing experimental incremental collector has not been activated.
Its correctness and bounded cost remain a separate follow-up.

The recurring R2 read errors and duplicate alert emails remain open. R2 had no
charge on the inspected invoice. Alert suppression is not a cost fix and was
not used here.

## Release and budget

The target remains roughly $5–$10/month, with no guarantee yet. The earlier
completed-day averages were 1.754M reads, 86,988 writes and 67,676 lists/day.
Engineering targets are at most 250k reads, 20k writes and 20k lists/day, leaving
room within the plan's included operations for bursts and paid work. These are
monitoring targets, not enforced spending caps.

Release through the normal PR/CI gate. Confirm the dedicated hourly summary
publishes before judging the public figures; missing summaries explicitly report
unavailable and never trigger a visitor-driven rebuild. Compare complete UTC
usage days after release against the earlier seven-day baseline, alongside
traffic and paid-job completion. Check correction freshness separately.

## Review and validation

Implementation: `/private/tmp/scvd-public-statistics-summary`, based on
`89074bf9c6d030da1cae25834c75314c8d050a45`. A cumulative patch, including the
prior hourly-statistics work, is retained in the original repository at
`research/cloudflare-cost-2026-10-23/operating-cost-cuts.patch`. Do not apply it
on top of the earlier statistics patch or unrelated dirty work.

Validation results are recorded alongside the patch in
`operating-cost-cuts-validation.json`. Full CI remains required before merge.

Final local verification:

- 874 tests passed across 44 affected reporting, accounting, page and scheduler files.
- Another 22 tests passed across four direct free-visit caller files: bot claims,
  weekly twins, observatory and infrastructure exclusions. Total: 896 tests in
  48 files, with no failures in these final runs.
- Type checking passed, including the final bot-claim test update.
- All three bundle dry runs passed; nothing was deployed.
- Four initial cost regressions failed against the earlier behavior. Three more
  targeted regressions failed with automatic scouting/homepage scans restored
  and the traffic interval changed back to hourly. Implementation was restored
  before the passing runs. The original public-statistics red proof is recorded
  in its separate implementation note.
- Diff whitespace checks passed, and the cumulative patch was checked against
  the recorded base using a temporary index without touching the checkout.

An intermediate affected run passed 109 tests and failed two obsolete
expectations (the second homepage script and raw free-visit venue events).
Those expectations now assert the approved behavior; exact venue text is still
covered on quote events. The final runs above supersede that intermediate run.
