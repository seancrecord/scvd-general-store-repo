# The Tab — storage schema, v0.6

The contract for `~/.scvd/tab.jsonl`: one JSON object per line,
append-only, written by the server alone. This document is the
build-order step that "follows mechanically from the tools" — every
field exists because a tool in THE_TAB.md asks a question that needs
it, and no field exists for any other reason.

Three files, and the separation is deliberate:

| file | holds | why apart |
|---|---|---|
| `tab.jsonl` | the builder's commerce | the record |
| `tab.jsonl.coverage.jsonl` | what the sweep saw and missed | describes the INSTRUMENT, not the commerce — mixing them would let a broken sweep look like a cancelled tool |
| `tab.jsonl.pages.jsonl` | what the pager raised and whether anybody said it | same reason, and it measures us rather than the builder |

Sidecar names are rebuilt from the tab's own resolved directory and a
sanitized basename (`sidecarPath`), never spliced onto the raw path
string — the path arrives from `TAB_PATH` or `--path`, i.e. from
outside the program.

## The envelope (every entry)

| field | type | written by | notes |
|---|---|---|---|
| entry_id | string | server | `tab_` + 16 hex |
| server_timestamp | ISO datetime | server | when the write happened; **cannot** be supplied by the caller |
| schema_version | string | server | the vocabulary the entry was written under |
| event | enum | caller | `trial_started`, `paid_started`, `adopted`, `canceled`, `replaced`, `renewed`, `price_changed`, `consent_changed` |
| source | enum | caller (defaults `manual`) | `manual`, `capture`, `mail_sweep`, `historical_pass` |
| confirmed | bool | server unless supplied | see *Who spoke* below |

The envelope is applied **after** the caller's input spreads, so a
caller-supplied `server_timestamp`, `entry_id` or `schema_version` is
overwritten rather than honored. The first cut had the spread order
backwards, and the test named "agents can lie about time; the file
can't" caught its own principle being violated — which is what it was
for.

`consent_changed` entries carry only `{contribute: bool}` beyond the
envelope. Every other event carries the tool fields below.

## Tool-event fields

| field | type | required | validation |
|---|---|---|---|
| tool_name | string | yes | lowercase, no surrounding whitespace; rejected otherwise with the fix in the error |
| category | enum | yes | the controlled vocabulary in THE_TAB.md; a miss suggests the closest match |
| problem_solved | string | yes | the builder's words — and on a swept entry it must be exactly `(not said yet)` |
| price | object | `paid_started`, `renewed`, `price_changed` | `{amount ≥ 0, currency, period: month\|year\|week\|once}` |
| previous_price | object | `price_changed` | same shape — a change with one price is a number |
| trial_ends | ISO date | `trial_started` | the warning date is the point |
| replaced_with | string | `replaced` | the successor; logged against the OUTGOING tool |
| signup_friction | enum | no | `agent_native`, `email_only`, `phone_required`, `kyc_required`, `human_only` |
| confidence | enum | no | `stated` (said outright) or `inferred` (read out of ambiguous text) |
| private | bool | no | sticky once set; excluded from the shareable badge's COUNT, not merely its names |
| dedupe_key | string | no | see below |
| captured_text | string | no | the raw fragment, verbatim — **refused on swept entries** |
| retroactive | bool | no | marks a backfilled entry |
| occurred_at | ISO date | only with `retroactive` | the caller's claim about the past, displayed as a claim |
| incomplete | string[] | server (capture lane) | fields capture could not fill; nothing was invented |
| payment_method | string | no | the builder's own label; never parsed, never contributed |
| source_url | string | no | |
| notes | string | no | **refused on swept entries** |

### `price` on a trial

Allowed, and load-bearing. A `trial_started` carrying a price records
what the trial says it will cost when it converts — derived as
`converts_to`, kept apart from `price` because it is a claim about the
future, is not being charged yet, and **must never reach the burn.**
Without it the pager's one line has no number in it, which is most of
why anybody would run this.

## Who spoke, and what that defaults

`confirmed` defaults by `source`:

| source | confirmed | because |
|---|---|---|
| `manual` | true | the builder said it; they were there |
| `capture` | true | same, in fewer words |
| `mail_sweep` | **false** | a receipt is a letter anyone can send |
| `historical_pass` | **false** | same, six months late |

Unconfirmed money still counts toward the builder's own burn — it is
probably their money, and a wrong number they can see beats a missing
one they cannot. What it never does is become a published statistic:
the contribution gate reads `confirmed`, so the pooled corpus is fed
only by entries a human has actually looked at.

Both `confirmed: false` and `private: true` are **sticky on the
derived tool**, not on the entry. A later cancellation carries no flag
of its own, so a gate reading only the incoming event happily leaked a
private tool — the gate consults derived state.

## The quarantine (v0.4, closed in v0.6)

On any entry whose `source` is `mail_sweep` or `historical_pass`:

- `captured_text` — **refused**
- `notes` — **refused**
- `problem_solved` — must be exactly `(not said yet)`

The agent renders stored fields back in chat, so a field holding a
vendor's prose is a vendor addressing the agent. Scrubbing the text is
the losing half of that fight; the winning half is leaving nowhere for
it to land. A receipt's wording is the vendor's words, not the
builder's, so nothing real is lost.

The rescue lane is not a way around it: a swept fragment too broken to
validate stays swept and keeps nothing but the shape of its own
failure. The stricter the front door, the more traffic through the
back one.

Manual and `/log` text stays **verbatim**, because it is the builder's.

## `dedupe_key`

Supplied by the caller when there is a natural one — **the message id,
for anything found in mail.** That is what stops a re-found receipt
becoming a second charge in the burn.

Absent that, the server derives `tool|event|YYYY-MM-DD`, so the same
event logged twice in a day is one entry. The capture lane's last
resort uses a random key instead: the fallback's whole contract is
that nothing is ever lost, and a shared key made the second
unparseable fragment of a day vanish as a duplicate.

## Field caps

`tool_name` 80 · `replaced_with` 80 · `payment_method` 200 ·
`dedupe_key` 200 · `problem_solved` 500 · `source_url` 500 ·
`captured_text` 2000 · `notes` 2000.

An unbounded free-text field is how a metric becomes a bill — and
bounded lines are what make append atomicity real on POSIX, which is
what makes "the server owns the file" an honest sentence.

## Two timestamps, two jobs

`server_timestamp` is the file's truth about when the write happened.
`occurred_at` is the caller's claim about when the thing happened,
allowed only with `retroactive: true`. Derived views date an event by
`occurred_at` when it is a marked claim, `server_timestamp`
otherwise — so a backfill session records real history without the
file ever lying about what it knew when.

## Derived at read, never stored

Active set and status (`active_trial`, `active_paid`, `active_free`,
`inactive`), monthly burn (month as-is, year ÷ 12, week × 52⁄12,
`once` is not burn), `converts_to`, trial warning dates and trials
past their end, idle-day counts, category overlap sets, price drift,
the friction summary, near-duplicate name candidates, quiet tools,
`confirmed`/`private` stickiness, and consent (the last
`consent_changed` wins).

Derived-not-typed is law here for the same reason it is law on the
storefront: a stored tally is a lie with a timer on it. It is also
what makes "what did I know on March 3rd" answerable at all.

A signup after an inactive spell opens a **new** commitment: the epoch
resets, so a re-trial a year after a cancel is measured on its own
life rather than the old one's.

## The sidecars

**`.coverage.jsonl`** — one appended record per sweep, never
overwritten, because coverage is a time series or it is decoration.
Holds `addresses_swept`, `window_from`/`window_to`, `matched`,
`attributed_amount`, `unmatched_transactional[]`, and the counting
pair `scanned` / `not_transactional`. `unclassified` is derived:
`scanned − matched − unmatched − not_transactional`, published rather
than absorbed, because that residue is where a pre-filter hides. A
record with no `scanned` reads as **unaudited**. Contract:
`tab/SWEEP.md`.

**`.pages.jsonl`** — the pager's append-only log, replayed the same
way the tab is. States: `queued`, `handed_over`, `acknowledged`,
`superseded`. `page_id` is `kind:tool:YYYY-MM-DD`, so one worry raises
one page a day. A handover is not a delivery; only `acknowledged`
spends a page, superseded-and-unacknowledged pages become
`unspoken_pct`, and a superseded page cannot be acknowledged after the
fact — otherwise the party being measured could edit its own failure
out of the record.

## Versioning

`schema_version` names the **vocabulary an entry was written under**,
so a reader can tell which fields could be present without probing for
them. It moves on additive growth too, not only on breaks.

Additive-only within v0: a reader MUST accept entries with older
`schema_version` values forever, unknown fields are preserved on
export and never dropped, and enums only grow. Anything that would
break an existing reader is a v1 with a migration note in this file.
Same discipline as scvd-attestation/v1.

## Failure posture

A line that will not parse is skipped and counted, never repaired and
never fatal — one corrupt row must not blind the instrument, and
`stack_audit` reports `bad_lines` so corruption is a fact on the
readout rather than a silence.

## Known holes

- **No `quarter` period.** Quarterly billing is real, and today it has
  to be converted to monthly by hand — silently, which is exactly the
  inferred-arithmetic class `confidence` exists to flag. Adding a
  period grows the vocabulary and so is a keeper decision, recorded
  here rather than patched.
- **Single-writer-ish.** Atomicity rests on bounded lines under the
  POSIX atomic append size. Two agents hammering one tab is untested;
  `bad_lines` above zero is the symptom to watch for.
