# Unpaid observation scope — October 1, 2026

David Batista's reply to the September 5 DELX outreach requested the
request method and time, raw challenge, freshness policy, and explicit
separation of DELX Commerce, DELX Protocol, settlement and image delivery.
The keeper authorized the corrections and their PR merge on October 1.

The retained image-endpoint row in corpus snapshot 5 has challenge bytes
but no individual request timestamp. The snapshot's September 1 timestamp
cannot substantiate the September 5 probe date in the email. The September 5
public correction already records the same class of date mistake; this
change closes the remaining legacy fallback rather than recovering a date.

- Outreach uses the full recorded request timestamp and method; missing
  values stay unknown. The scope is the exact endpoint, not the operator's
  other products or protocols. No DELX-specific identity mapping is added.
- The passport summary carries the exact URL, recorded method, source
  snapshot and raw capture link when retained. Its HTML renders the same
  fields beside the result. Paid settlement and successful delivery are
  explicitly untested by the unpaid request, including without modules.
- Legacy request dates remain unknown in history, verdict transitions,
  citations, tier summaries, the fresh set and OKF export. Feed publication dates
  remain available, labeled separately from unknown observation dates.
- A passport refuses an undated latest reading as `observation-undated`
  with an `INDETERMINATE` decision. The eight/sixteen-day policy is unchanged.
- A refresh stores its recorded method. Its passport never borrows the
  prior census's endpoint, method or raw challenge. A dated refresh after
  an undated row's snapshot can establish newer evidence; an older refresh
  cannot silently outrank the undated row.
- Existing signed artifacts retain their original bytes. The dated public
  correction explains the narrower claims; no historical evidence is invented.

Regression: `test/observation-scope.spec.ts` was run before changing source;
all four original tests failed on the intended assertions. Additional
coverage exercises undated later rows and refresh provenance. Existing
tests that asserted a snapshot date as a request date are corrected;
ordinary passport fixtures now supply explicit request timestamps.

Validation: TypeScript checking, all three Worker dry-run bundles, the
claims register and corrections-index tests pass. The final affected-test
run passed all 467 tests across 34 files, including all eight observation-scope
regressions. The full run was stopped after a separate rerun confirmed
an unrelated failure in `test/feature-surfaces.spec.ts`: the pre-existing
checkout-discovery changes add `/ucp/v1/checkout-sessions/{id}` and its
`/cancel` route without a feature-register entry. That work is outside this
repair. That registration repair is present on the current main branch used
for this isolated PR. The pre-commit rerun on that base passed all 519 tests
across 35 files, including the feature-register check. Typecheck, all three
dry-run bundles, claims and corrections-index checks passed again.
The complete CI suite remains required before merge.

The PR contains only this repair. No email is sent by this work.
