# R2 read resilience — October 5, 2026

Release authorized by the keeper on October 5, 2026. Production recovery must
be checked against the deployed commit; local tests alone do not establish it.
Billing investigation is deferred at the keeper's request.

The supplied alarms report R2 `get` failures with code `10001` across archive
readers and the contact scout. Cloudflare documents this as an internal service
error and recommends retrying. The application previously retried KV operations
but read R2 objects directly. This identifies a resilience gap; it does not
establish the cause or extent of Cloudflare's underlying failures.

## Behavior

- All existing R2 read sites use `r2ReadText`: corpus records, evidence shards,
  ward round rows, and the cold restore reader. Writes are unchanged.
- Only documented transient read codes `10001`, `10043`, and `10058` retry.
  Attempts include obtaining the object and reading its body. Parsing happens
  afterward; invalid JSON and authorization failures do not retry.
- Reuse the existing storage budgets: three request attempts with 150/600 ms
  pauses; five cron attempts with 150/600/1500/3000 ms pauses. Exhaustion throws;
  missing objects remain missing. No fabricated evidence or empty successful
  archive replaces a storage error.
- The HTML corpus index catches both the archive read and the derivation. On
  failure it records an alarm and serves its index without wallet counts,
  explicitly saying they could not be read. An empty archive retains its
  distinct existing wording.
- HTTP alarms for exhausted R2 reads and the degraded index share a six-hour
  email window. Individual route rows, repeat counts, identities, and existing
  mutes remain. Other Worker failures and money alarms retain independent
  notification behavior; the contact scout's cron failure remains independent.
- The grouping uses the existing KV dedupe mechanism. It is best effort across
  concurrent edges, not a guarantee of exactly one email. Rejected or failed
  email sends do not earn a dedupe window.

## Validation

- With only this task's source fixes removed, the two new regression files
  produced 13 failing tests and five passing controls. The source files were
  restored byte-for-byte; unrelated workspace edits were untouched.
- The affected 17-file suite passed all 136 tests before the final alarm-name
  compatibility adjustment. After that adjustment and source restoration,
  all 31 tests in the two regression files and existing alarm-mute suite passed.
- The isolated release branch on current `main` passed the same 17-file,
  136-test suite, typecheck, and production bundle checks.
- `npm run typecheck` passed, including after the final adjustment.
- `npm run build:check` passed for both Workers and the MPP SDK bundle check.
- Full CI shards remain required before merge. No production alarm was muted,
  no manual scout was triggered, and no external email was sent during repair.

Reference: [Cloudflare R2 error codes](https://developers.cloudflare.com/r2/api/error-codes/).
