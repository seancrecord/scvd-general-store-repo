# Admin reconciliation evidence export — October 13

Keeper approved the scoped admin download and its PR/merge. Production capture
and accounting investigation follow deployment; no correction is claimed.

The reconciliation page links **Download reconciliation evidence** at
`/admin/export/reconciliation.json`, behind the existing admin authentication.
The response is a private JSON attachment with `no-store` on success and
authentication refusals. It reads legacy `payer_settle:` and `payer:` records,
monthly `paid`, `paidh` and `nopayer` counters since opening, house
reclassifications and the one retained latest raise record. It writes no
accounting records. Selected accounting fields are exported; arbitrary extra
fields and malformed raw values are omitted.

The file names missing, invalid, oversized or unreadable records and capped or
failed scans. Limits are 5,000 keys per source, 10,000 overall, 64 KiB per input
value and 4 MiB of serialized rows (file formatting and metadata add overhead).
An incomplete accounting source suppresses the comparison summary; `complete`
describes this bounded capture, not historical completeness or correct books.
The comparison uses the same captured records, including payer floors and the
founding allowance. Missing historical house/transaction fields remain unknown.
Native MPP, certificates, retained purchase objects and chain evidence remain
outside scope. KV reads are sequential and eventually consistent, not atomic.

Validation: the three route/page tests failed before implementation, then passed.
Seven focused test files passed (38 tests), covering authentication, attachment
headers, field selection, absence of accounting writes, arithmetic, incomplete
reads and malformed records alongside existing reconciliation, counter-raise
and tax-export behavior. Typecheck and all production bundle dry-runs passed.
Full required CI and authenticated live readback remain release gates. After
release, obtain the capture and compare transaction records with payer/item/month
totals; the current pasted evidence still does not justify a correction.
