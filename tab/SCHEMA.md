# The Tab — storage schema, v0.2

The contract for `~/.scvd/tab.jsonl`: one JSON object per line,
append-only, written by the server alone. This document is the
build-order step that "follows mechanically from the tools" — every
field exists because a tool in THE_TAB.md asks a question that needs
it, and no field exists for any other reason.

## The envelope (every entry)

| field | type | written by | notes |
|---|---|---|---|
| entry_id | string | server | `tab_` + 16 hex |
| server_timestamp | ISO datetime | server | when the write happened; cannot be supplied by the caller |
| schema_version | string | server | "0.2" |
| event | enum | caller | `trial_started`, `paid_started`, `canceled`, `replaced`, `renewed`, `price_changed`, `consent_changed` |

`consent_changed` entries carry only `{contribute: bool}` beyond the
envelope. Every other event carries the tool fields below.

## Tool-event fields

| field | type | required | validation |
|---|---|---|---|
| tool_name | string | yes | lowercase; rejected otherwise with the fix in the error |
| category | enum | yes | the controlled vocabulary in THE_TAB.md; a miss suggests the closest match |
| problem_solved | string | yes | the builder's words |
| price | object | `paid_started`, `renewed`, `price_changed` | `{amount ≥ 0, currency, period: month\|year\|week\|once}` |
| previous_price | object | `price_changed` | same shape — a change with one price is a number |
| trial_ends | ISO date | `trial_started` | the warning date is the point |
| replaced_with | string | `replaced` | the successor; logged against the OUTGOING tool |
| signup_friction | enum | no | `agent_native`, `email_only`, `phone_required`, `kyc_required`, `human_only` |
| retroactive | bool | no | marks a backfilled entry |
| occurred_at | ISO date | only with `retroactive` | the caller's claim about the past, displayed as a claim |
| payment_method | string | no | the builder's own label; never parsed, never contributed |
| source_url | string | no | |
| notes | string | no | |

## Field caps (red team, 2026-08-08)

`tool_name` 80 · `replaced_with` 80 · `payment_method` 200 ·
`problem_solved` 500 · `source_url` 500 · `notes` 2000. An unbounded
free-text field is how a metric becomes a bill — and bounded lines
are what make append atomicity real on POSIX, which is what makes
"the server owns the file" an honest sentence. `tool_name` is
lowercase with no surrounding whitespace, enforced: a near-duplicate
key splits one history into two lies.

## Two timestamps, two jobs

`server_timestamp` is the file's truth about when the write happened.
`occurred_at` is the caller's claim about when the thing happened,
allowed only with `retroactive: true`. Derived views date an event by
`occurred_at` when it is a marked claim, `server_timestamp`
otherwise — so a backfill session records real history without the
file ever lying about what it knew when.

## Derived at read, never stored

Active set, monthly burn (month as-is, year ÷ 12, week × 52⁄12,
`once` is not burn), trial warning dates, idle-day counts, category
overlap sets, price drift, the friction summary, and consent (the
last `consent_changed` wins). Derived-not-typed is law here for the
same reason it is law on the storefront: a stored tally is a lie
with a timer on it.

## Versioning

Additive-only within v0: a reader MUST accept entries with older
`schema_version` values forever, unknown fields are preserved on
export and never dropped, and enums only grow. Anything that would
break an existing reader is a v1 with a migration note in this file.
Same discipline as scvd-attestation/v1.

## Failure posture

A line that will not parse is skipped and counted, never repaired
and never fatal — one corrupt row must not blind the instrument, and
`stack_audit` reports `bad_lines` so corruption is a fact on the
readout rather than a silence.
