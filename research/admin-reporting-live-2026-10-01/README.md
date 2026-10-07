# Authenticated admin readback — October 1, 2026

Partial production readback following #947. The guide release and its complete
public readback are recorded [separately](../guide-release-2026-10-01/README.md).
This note retains observations, not private customer rows or screenshots.

## Access

The Codex in-app browser returned `ERR_INVALID_AUTH_CREDENTIALS` for `/admin`.
The route uses HTTP Basic Auth; a signed-in Brave session loaded the reports.
That establishes an authentication failure in the embedded browser, not a
production outage. It does not establish the underlying browser bug or a fix
for it. No credentials were copied, and authentication was not changed.

## Observed in production

| Page | Observation | Limit |
| --- | --- | --- |
| `/admin` | Desk, cached-reading timestamp, all-time/month separation, combined x402/MPP monthly scope and x402-only funnel note rendered. Section links and collapsed report directory were present. | Cached numbers were not independently reconciled with raw production rows. |
| `/admin/protocols` | All six capabilities rendered separately from arrivals, sales by door and rail requests. Missing rail counters displayed dashes with an explicit explanation. The report directory expanded, and MPP sales navigation worked. | Successful source reads only; no production failure injection. Desktop screenshot inspected, no phone-width production check. |
| `/admin/mpp-sales` | Rows, organic/house labels, pilot-product label, successful-month coverage and purchase/settlement links rendered. Sub-cent amounts remained visible. | Links were observed, not followed into customer purchase details. No correction was applied. |
| `/admin/growth` | Month columns, partial current-month label, combined-sales scope, x402 ask scope, free-check denominators and unmeasured-market labels rendered. | No independent accounting reconciliation or latency benchmark. |
| `/admin/buyers` | Authenticated page, distinct title, report directory and section navigation rendered. | Shell/reachability observation only; buyer qualification was not performed. |

The protocol report identified its reading as 2026-10-01 15:14Z. No refresh,
repair, send, purchase or other operational button was pressed. The counter
and reconciliation pages, which acknowledge an inbox on GET, were not opened.

## Repairs from the readback

The desk's source explanation pointed to `/admin/item-events`, which has no
registered route. The working route is `/admin/events?item=...`, and the item
names in the desk ledger were plain text. The repair takes the reader to the
ledger and makes each item name open its retained event history. Item keys are
URL-encoded and visible names remain escaped.

Empty conversion/tier cells now use a dash instead of a stray comma. The
headline request ratio now names its units: organic 402s per porch visit.
The expanded explanation says this is a request ratio, not purchase
conversion, and a missing ratio displays “not available.” No metric formula,
stored record, revenue rounding or authentication behavior changed.

The navigation regression failed against the original source, then passed
with the repair. It follows the generated link to the real authenticated
route with an item key containing a colon, spaces and an ampersand. Focused
validation passed 23 tests across three files; type checking, all three Worker
bundle checks, the document check and whitespace validation passed. The full
CI suite remains required before merge.

## Still open

Production readback is incomplete. Repeated native-browser focus changes
interrupted further navigation. The continuations below include the ward and MCP ward; both eventually loaded. Production phone-width layout and meaningful warm/cold timings
remain unmeasured. The source/local tests from the original review do not
stand in for these checks.

The repairs in this note still need release and live verification. Do not
mark PR1's production readback complete on the strength of this partial pass.


## Continued live pass and additional fixes

The continued Brave pass loaded `/admin/glance`, `/admin/take`,
`/admin/instruments`, `/admin/signals` and `/admin/funnel`. The glance showed
its cached-read timestamp. The take separated protocol, network and currency
counts from MPP money and certificate money. Instruments showed scan caps,
measurement start dates and request-versus-sale caveats. Signals separated
purchase doors from reader activity. The funnel exposed its capped retained
window and separated price asks from recorded refusals. Instruments normally
writes the comparison baseline when opened; no operational button was pressed.

Two findings required repairs:

- Growth omitted x402 house reclassification while the instruments/Pulse
  figures included it. Growth now applies the same monthly certificate-derived
  adjustment to its organic count, revenue, ratios and hypothesis. It shares
  the correction walk with Pulse, avoiding a second certificate scan. The
  applied adjustment is visible; original item/rail counters and previously
  frozen month records retain their original values. A failed or truncated
  correction read fails the Growth read rather than claiming raw counts are
  corrected organic totals.
- The funnel inferred that inputs could not explain two groups with zero
  settlements. It now states the observational limit and points to recorded
  input refusals. Different clients/items are not a controlled experiment.

The instruments report's month headings now participate in the shared section
navigation, so a reader can jump directly to a month.

The two Growth regressions and the updated funnel regression were witnessed
failing against the preceding source. Growth/Pulse/instruments/desk validation
passed 70 tests across five files; the separate full funnel file passed all
23 tests. Type checking and all three bundles passed after the Growth
change. Final validation and release evidence belong to the follow-up PR.

The later continuation below completed the ward/MCP-ward reads. Repeated
focus changes still prevented a stable phone-width pass and latency benchmark;
neither is claimed, and PR1 remains open for release/readback.


## Ward continuation

Both `/admin/ward` and `/admin/mcp-ward` loaded in the authenticated Brave
session after the initial focus interruptions. The ward displayed its saved
September 27 round timestamp, probed-versus-listed denominator, measured MPP
coverage, incomplete discovery limits and a link to the separate MCP ward.
The MCP ward separated its in-flight cursor from the last completed pass and
all-pass register; it explicitly said listings are not endpoint probes. No
walk, freeze, directory-pass or other operational button was pressed.

Two stale descriptions were corrected in the follow-up source batch. The
heartbeat counts all recorded host rows, including not-probed listings, and
now labels them that way without changing its count or stored records. Both
ward pages now link the public signed corpus instead of claiming the x402
per-host rows are never published. This is a wording correction, not a new
publication or a change to the corpus. The desktop reading covered labels and
navigation; all table rows were not individually inspected.

The ward's old one-GET description also predated the shared method reader.
The page now describes unpaid probes, declared methods and the single
method-refusal fallback, and drops an unmeasured runtime estimate. Probe
requests and the signed observations themselves are unchanged.


## Release evidence

The desk/Growth/funnel repairs released in [#958](https://github.com/seancrecord/scvd-general-store-repo/pull/958)
after all required checks passed; both merged-commit Worker builds passed.
The final ward descriptions are a separate follow-up. A post-deployment
browser attempt reported that the user was actively interacting with Brave,
so the remaining live verification was not claimed. [Receipts and current
boundaries](../reporting-publication-2026-10-01/README.md).
