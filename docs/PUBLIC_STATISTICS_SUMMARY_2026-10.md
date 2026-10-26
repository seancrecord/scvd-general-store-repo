# Hourly public statistics — October 23, 2026

The keeper asked to start with shared public statistics after the October 23
billing audit found repeated historical reads on public pages. This change is
prepared locally, not deployed. It targets request-driven recomputation, not
payment recording or purchased-watch schedules.

## Behavior

A dedicated hourly trigger at :15 UTC runs `refreshPublicStatistics` and returns
before the existing sweeps. The existing :30 and Sunday triggers are unchanged;
this separates reporting from their invocation work budgets. It computes the
existing books, funnel and optional net-by-chain statement, then publishes one
versioned KV value. The core calculations must both finish before publication; failure leaves the previous value and its dates intact.
No expiry is set. This adds one hourly trigger, with no new namespace, dependency
or permission and no resource-limit increase.

`/stats`, `/pulse` and `/pulse.json` each read one summary value for their statistics,
with no historical lists or value walks. The homepage, `/menu.json` and `/skill.md`
use the saved books for their counts. Their other content readers are unchanged.
The homepage and track-record prose show the observation timestamp. The reports
also expose hourly refresh metadata and a stale flag; the HTML pulse names an
overdue refresh. The original computed dates are preserved rather than rewritten
at request time. Existing denominators, correction dates and incompleteness flags
remain in the saved payload.

Before the first successful refresh, or if the stored summary is unreadable, the
statistics reports return `503 statistics_unavailable` with Retry-After. The
homepage, menu and skill still load, omitting optional figures. A visitor never
starts a refresh, including simultaneous requests to a missing or stale summary.
KV propagation can add delay; this is not strongly consistent publication.

Admin diagnostics, `/rails`, the signed house ledger, signed monthly records,
payments and reconciliation retain their original readers. This deliberately
limits the first change to reusable presentation statistics. Other public
historical readers still need their own measured cost cuts. Freshness differs
between a saved public reading and a live accounting read; their dates matter.

## Cost boundary

The audit counted 6,792 July–October legacy monthly-counter values per funnel
calculation, before its other inputs. The summary replaces that calculation on
each public visit with one KV value read. The calculation still runs once per hour
and has to be included in the cost comparison. Global request middleware and
unrelated page content still perform their existing work. No account-wide saving
or final invoice amount is established by local tests.

## Rollout and verification

- Complete the normal PR/CI gate before release. The keeper approved commit,
  push and release on October 23 after reviewing the cumulative cost cuts.
- The first deployment starts with no summary. Deploy shortly before an hourly
  `:15` run after allowing for trigger propagation, or use a staged writer-first
  rollout if uninterrupted statistics availability is required. Cloudflare documents
  up to 15 minutes for trigger changes to propagate. Do not seed invented figures
  or restore a per-visit live fallback to conceal this transition.
- Confirm the first saved date advances, all five consumers show the saved reading,
  and `/pulse` and `/stats` preserve their existing accounting fields.
- Check at least two hourly refreshes and completed-day KV reads, writes and lists
  against the audit baseline. Include refresh work and traffic in the comparison.
- A refresh failure follows the existing Worker-health alert path. The saved
  report becomes visibly overdue; it does not change its date or claim zero.
- The previous release can be restored independently of the retained summary key;
  old code ignores it. Do not roll back into a repeated-rebuild incident without
  accounting for the resulting read cost.

## Review location

The implementation is isolated from the keeper's existing uncommitted work:

- Branch: `codex/public-statistics-summary`.
- Base: `89074bf9c6d030da1cae25834c75314c8d050a45` from `origin/main`.
- Working checkout: `/private/tmp/scvd-public-statistics-summary`.
- Review patch: `research/cloudflare-cost-2026-10-23/public-statistics-summary.patch`
  in the original repository. It includes source, tests and the implementation
  record; apply it to the stated base, not over unrelated dirty changes.

## Validation

Focused service and route tests exercise one-read serving, simultaneous stale
requests, missing/incompatible data, refresh failure preserving the last result,
unchanged calculations, and dated figures on the homepage/menu/skill.
Existing content/accounting tests explicitly publish their seeded fixture before
reading the public pages; the cost tests bypass that helper.

A regression run against the original routes failed nine of ten new tests.
The retained-summary failure test exercises the new writer and does not depend
on route changes. After restoring the routes, all ten new tests and the broader
189-test focused group passed. The final service/route suite has 16 cases,
including actual scheduled-handler execution and preservation after failed writes.

Final verification:

- 25 affected test files: 714 tests passed.
- Discovery/browser group: 3 files, 33 tests passed.
- Final sitemap-derived page test: 1 file, 8 tests passed.
- Total across the final focused groups: 755 tests passed in 29 files.
- The four timeout failures in an earlier overlapping run all passed on rerun
  with two workers, without changing their assertions or timeouts.
- Type checking and all three dry-run bundle checks passed.
- `git diff --check` passed.

An exploratory full-suite run found older page fixtures that expected a live
calculation without first publishing a summary. Those fixtures now explicitly
publish their seeded books. That run had loaded source before the final scheduler
change, so it was stopped rather than presented as a verdict on the final tree.
Its reported failing files are covered by focused reruns. A clean full-suite CI
run remains required before merge; no full-suite pass is claimed here.
