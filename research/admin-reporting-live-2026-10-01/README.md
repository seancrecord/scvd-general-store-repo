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
interrupted further navigation. `/admin/glance`, `/admin/take`, instruments,
signals, funnel, ward and the remaining inventoried reports still need their
live pass. Production phone-width layout and meaningful warm/cold timings
remain unmeasured. The source/local tests from the original review do not
stand in for these checks.

The repairs in this note still need release and live verification. Do not
mark PR1's production readback complete on the strength of this partial pass.
