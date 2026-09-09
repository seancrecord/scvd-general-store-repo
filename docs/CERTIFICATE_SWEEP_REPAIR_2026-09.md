# Certificate-key sweep repair — September 9, 2026

Released through [PR #596](https://github.com/seancrecord/scvd-general-store-repo/pull/596) at 21:11:38 UTC on September 9,
as `86b12f40d578d227ca582fce6cdc8b633788a6f6`. Both production Workers
completed deployment by 21:13:07 UTC. Both pre-merge CI runs passed
610 files and 9,543 tests, with one existing skip, and all downstream checks.
The five files still outstanding during a long CI interval also passed
unchanged locally: 639 tests in 118.81 seconds. Neither CI run was restarted.

At deployment, the first production delivery pass had not yet been observed.
The baseline at 20:32 UTC still had no timestamp and unchanged signed bytes.
Subsequent live delivery and independent proof checks are recorded in the
[PR #596 release follow-through](https://github.com/seancrecord/scvd-general-store-repo/pull/596); deployment alone is not proof delivery.
The dated release record is
`research/verification-2026-09-09/reader-followthrough/key-sweep-release.json`.

The implementation and validation below are the pre-release record for
`codex/certificate-key-sweep`. The preceding reader release deployed through
PR #592. The measured gap and private census are documented in
`docs/EVIDENCE_READER_COVERAGE_2026-09.md`.

The census found 262 signed certificates but a patron counter of 261.
Two certificates share number 199; one has no stored anchor. Following
only `patron:<number>` reaches one certificate, so a completed number
cursor cannot establish certificate coverage. The allocation policy is
unchanged; this repair changes the delivery walk.

Each hourly pass retains the existing forward/backfill work and also
scans one bounded page of `cert:` keys. Limits derive from
`CERT_ANCHOR_KEY_SCAN_PER_PASS` and `CERT_ANCHOR_SUBMISSIONS_PER_PASS` in
`src/services/certificate-anchors.ts`. The key scan has its own allowance,
so a busy forward cursor cannot starve it. Bulk reads avoid one request
per listed key. New submissions require an internally valid current or
legacy signature form. Unreadable records and invalid signatures are
counted separately and never treated as missing or verified.

The opaque key cursor is stored in `cert_anchor_key_cursor`. A page with
deferred work retains its starting cursor and is retried. Completed
submissions are skipped on retry. A provider's missing continuation is
reported and never mistaken for a finished enumeration. The final page
clears the cursor so a later cycle can find eventually visible records.
`key_scan_cycle_complete` means the enumeration cycle ended; it does not
establish a consistent inventory, valid signatures on every row, or that
no records were withheld.

A certificate write can succeed before its pending-marker write fails.
The scan restores a missing marker for pending or failed anchors, using
the same per-pass work allowance. A thrown write never advances the key
cursor. The ordinary open-work pass then resubmits or upgrades the proof.
Already completed anchors are not re-submitted. Signed certificate fields,
signatures and signing keys are never rewritten by this repair.

The retained sweep summary includes whether the scan ran, listed rows,
submissions, restored markers, unreadable and invalid rows, deferred work,
remaining pages, a missing continuation, and completion of an enumeration
cycle. These are operational counters, not independent Bitcoin proof checks.
A newly anchored old certificate receives a present-day existence bound;
this cannot prove its historical issue time or backdate it into a key's
service window.

Regression tests cover the two-certificate collision, signed-byte preservation,
submission deferral, corrupt/tampered records, interrupted marker writes,
continuation across capped pages, a missing continuation, and progress while
the forward cursor remains behind. All seven new regression cases were observed failing without the repair,
then passing with it. The full suite passed 610 files and 9,543 tests with
one existing skip (1,741.90 seconds, four local workers). Typecheck, both
Worker builds, all 36 evidence tests, standalone package tests, scalability
and claim checks passed. The scalability audit retains two existing warnings;
the documentation check retains its existing dated-document backlog.
The exact pre-release record is
`research/verification-2026-09-09/reader-followthrough/key-sweep-validation.json`.
Production delivery has not been checked by this validation record.
