# Admin reporting fixes — September 29

Implements the [PR1 review](../research/admin-reporting-2026-09-29/README.md)
and the keeper's follow-up request for faster, easier-to-scan admin tabs.
Work is local; this document is not a deployment or production readback.

## Reporting changes

- Monthly native MPP summaries have one reader, shared with the all-time
  reader. It validates original totals, applies house corrections once, and
  attributes unsplit pilot sales to their existing product. Raw evidence and
  legacy x402 counters are unchanged.
- The office, glance and growth headline totals now include native MPP
  sales and revenue. Older glance caches without native coverage cannot be
  displayed as complete monthly totals; the desk refreshes them, and the
  one-read glance shows unavailable until refreshed.
- Pulse keeps the meaning of its existing x402 funnel fields and adds
  `total_organic_settled` and `mpp_organic_settled`. The public HTML states the
  split, and admin instruments use the combined sale count. An x402
  conversion rate still compares x402 settles with x402 asks. Combined counts
  are registered with their sources, exclusions and bounds. All-time pulse
  totals retain older months when the displayed monthly window advances. Frozen growth
  logs are retained as written.
- The MPP sales desk returns original `house` evidence alongside
  `effective_house`, the validated correction when present, and a
  classification status. Corrupt corrections remain visible as unclassified
  rows. Months that failed to load are excluded from “Months read.”
- Protocol arrivals and paid-door totals are nullable when unavailable.
  Successful zero readings still display zero. A failed market read no
  longer says that no ward round exists. The page shows the warning once.
- The protocols desk now shows existing discovery descriptions beside
  checkout configuration derived from purchase capabilities. It separates
  support from recorded use and points to the canonical profiles. No new
  protocol catalog, paid qualification or external listing claim was added.

## Reading and navigation

Every page using the shared admin shell has its own browser-tab title,
page heading above the report directory, a compact “Browse reports” menu,
and section links derived from its existing headings. Existing anchors,
all report links and the desk's money-first order remain intact. The shell
adds a skip-to-report link, explicit current-page markers, visible keyboard
focus and quieter alternating table rows. Warning text has higher contrast.

The menu and section links are plain server-rendered HTML. They add no
JavaScript, data requests, storage writes or polling. Each page retains its
own sources, limits and actions; this is a shared navigation/readability
change rather than a rewrite of every specialized report.

PR #947 security follow-through: section-label extraction now uses the existing
bounded tag stripper and encodes any remaining angle brackets while preserving
already escaped entities. A malformed-heading regression failed before the fix.
The discovery test uses the runtime HTML parser to exclude script blocks rather
than treating a regular expression as an HTML parser.

## Less work per read

- Growth shares monthly ledger reads with pulse. Previously both requested
  each month separately; the regression test checks the reader call count.
  Porch reads remain separate because they measure a different population.
- The MPP desk loads original sale rows and corrections with one SQL join
  and one Durable Object request per month. It does not issue an extra
  request for every sale or scan retained purchase objects.
- The glance remains a single cached-key read. Its normal display does not
  trigger the heavy reports, and navigation does not prefetch them.

These are verified reductions in work, not a claimed production latency
benchmark. Warm/cold production timings remain to be measured after release.

## Validation

Thirteen regression tests failed against the original source for the
expected missing behavior; source edits were restored afterward. A separate
free-check ratio regression also failed before its final correction.
Additional tests cover duplicate sales/corrections, month boundaries, pilot
rows, tampered corrections, unknown readings beside real zeros, old caches,
configured-off checkout and safe section navigation.

Local browser checks use synthetic records, not production data. The report
menu expands and section links land on the right heading. Desktop and
phone-width sales previews remain within the viewport; the table scrolls
within the page. Authentication and report reachability remain covered by
the existing route tests.

Type checking and all three Worker dry-run bundle checks passed. The main
focused run passed **139 tests across 14 files**. Later checks passed
**94 tests across eight files**, including the count register and the
all-time pulse boundary; the latter was also witnessed red before its fix.

The full local suite completed: **848 files passed, three failed; 15,771
tests passed, four failed and one skipped**. Those four failures identified
an old heading-text selector in the census test, two missing count-register
descriptions, and the office title's literal apostrophe. All were fixed
while the full run was in progress and the affected files passed their
targeted reruns. A final combined rerun of all three failed files plus the
new regression file passed **55 tests across four files**. This is a full
run plus repairs and reruns, not a claim that
the original full command exited green. CI's full-suite gate is still
required before merge.

The document check completed with its existing age reminders, and
`git diff --check` passed. PR2 public reporting, PR3 discovery/AEO/SEO and
PR4 external listings remain separate review stages; the shared pulse
repair is carried forward into PR2. No commit, PR, deployment or authenticated
production readback was performed in this implementation pass.

## Release closeout — October 1, 2026

[PR #947](https://github.com/seancrecord/scvd-general-store-repo/pull/947)
merged September 30 after all four test shards and the required gate passed.
Both merged-commit Worker builds passed. The [public readback](../research/protocol-reporting-release-2026-10-01/README.md)
passed all retained checks, including independent verification that the older
monthly signed records are unchanged. A [partial authenticated admin readback](../research/admin-reporting-live-2026-10-01/README.md)
now covers the desk, protocols, MPP sales and growth, plus buyer-page reachability;
the remaining live checks are still open. No package publication, external correction or buyer
qualification was performed.

The separate [guide cleanup](../research/guide-readability-2026-09-30/README.md)
released in #951 after the required checks passed. Its [live readback](../research/guide-release-2026-10-01/README.md)
verified the smaller developer guide, configured alias parity, complete sections
and unchanged full-guide bytes.
