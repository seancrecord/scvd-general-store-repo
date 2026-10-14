# Admin reconciliation evidence export — October 13

Released in [PR #1017](https://github.com/seancrecord/scvd-general-store-repo/pull/1017),
merged October 13 after all required CI passed. The keeper supplied a production
capture that day; its bounded comparison was independently recomputed. No
accounting correction is justified or claimed.

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
All four CI test shards and the required check passed before merge. The
keeper-provided live capture completed from 17:49:20.402Z to 17:49:21.904Z on
October 13 with no reported accounting scan gaps. Independent recomputation
found 579 raw counter purchases, 578 derived payer purchases and 542 retained
settlement rows; the founding allowance makes the displayed counter total 580.
The one-count difference persists. Six added settlement records and matching
counter/payer increases explain the change since the earlier capture; the 536
prior records agree on exported fields. This validates the bounded export and
its arithmetic, not transaction-level payment or delivery. No correction was made.

The first full CI run caught the missing entry in the back shelf's “every room”
list. The download is now listed there as well as on the books page, retaining
the existing admin reachability guard without an exception for this route.
