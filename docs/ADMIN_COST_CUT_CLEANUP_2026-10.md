# Admin follow-through after the October cost cuts

The keeper requested this cleanup on October 24 after PR #1064 deployed.
The admin should preserve useful counts and controls without presenting retired
free-visit detail as current measurement.

## Changes

- Growth labels the stopped free-visit client and referring-host collections as
  retained history. Aggregate instrument counts and MCP handshake counts remain live.
- Instruments labels client lists, daily samples, unknown-visitor splits and
  free-call-to-purchase joins as historical. Existing drill-downs remain available.
- Referral reports no longer interpret an empty scan as nobody clicking a link.
  Retained host counts and continuing price-quote/payment evidence remain visible.
- Client traces describe retained events and disclose missing new free visits;
  an empty trace no longer declares a free-only journey.
- Outreach states that scouting requires a press and keeps its manual button.
  Sent-note audits remain automatic; their displayed cadence now matches the
  hourly sweep rather than claiming a half-hourly tick.

No collection, scan limits, payment logic, scheduling, admin authentication or
form actions change in this follow-up. The bell page and shared admin collection
notice were already updated in PR #1064. Recount and payment census remain based
on continuing price/payment evidence.

## Verification

The six new regression cases failed against the released pages before the
cleanup. Focused admin tests and type checking are recorded with the release
result in the original checkout's `research/cloudflare-cost-2026-10-23` directory.
Full CI remains required before merge.

Public verification on October 24 at 11:51 UTC found both `/stats` and
`/pulse.json` returning 200 with the same fresh hourly summary, computed at
11:22:06.854 UTC. Homepage and unsigned checkout checks also passed.

A one-time follow-up is scheduled in the originating Codex task for November 24,
2026 at 09:00 America/New_York to compare the invoice and complete usage days,
check reporting and paid-job health, and reassess cuts. The cost target remains
unproven until that usage is measured.
