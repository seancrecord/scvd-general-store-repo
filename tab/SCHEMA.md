# The Tab — storage schema, v0.9

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
| `tab.jsonl.card.jsonl` | reconciliations against the bank's own statement | ground truth about the record, not the record — and a reconciliation must never quietly become an entry |
| `tab.jsonl.sweep.jsonl` | the sweep tally's running ledger of verdicts | the counting obligation as machinery — the coverage record is derived from this, never restated from memory |

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
| event | enum | caller | `trial_started`, `paid_started`, `adopted`, `canceled`, `replaced`, `renewed`, `price_changed`, `confirmed`, `consent_changed` |
| source | enum | caller (defaults `manual`) | `manual`, `capture`, `mail_sweep`, `historical_pass` |
| confirmed | bool | server unless supplied | see *Who spoke* below |
| confirmed_explicit | bool | server | stamped only when the caller actually said `confirmed: true`; the defaulted stamp never flips a tool's unconfirmed state |

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
| price | object | `paid_started`, `renewed`, `price_changed` | `{amount ≥ 0, currency, period: month\|quarter\|year\|week\|once, basis?: fixed\|metered\|free_with_paid_path}` |
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

### `basis` — what kind of number `price` is holding (v0.8)

The keeper's ruling, 2026-08-10: **the burn total may contain an
estimate** — leaving the metered bills out made it incomplete; marking
them makes it honest. `basis` is the marker.

| basis | means | reaches the burn? |
|---|---|---|
| absent / `fixed` | the amount is the bill | yes — every pre-0.8 entry keeps its meaning |
| `metered` | the builder's ESTIMATE of a usage-based bill | yes, and the burn reports `estimated_amount` beside `amount` |
| `free_with_paid_path` | the tool is free; the amount is what the paid path would cost | **never** — derived as `paid_path` on the tool, `converts_to`'s law |

The fence holds both ways: `free_with_paid_path` is legal on `adopted`
only (money moving is not free), and a price on `adopted` without that
basis is still refused (a priced free signup would tell the pooled
index money changed hands). `previous_price` may never carry it — a
price that was charged was never the free tier's hypothetical.

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

**Sticky means sticky (v0.9).** The server-defaulted `confirmed: true`
on an ordinary manual event marks the ENTRY as trusted; it never
clears a tool's unconfirmed state. Only an entry whose caller actually
said `confirmed: true` — stamped `confirmed_explicit: true` by the
server — flips the derived flag. The `confirmed` EVENT (v0.9) is how
that normally happens: an annotation appended by `confirm_entry`,
carrying no lifecycle change at all, because confirmation used to be
recorded as `adopted` and rewrote the very tool it was vouching for.
Both gates — corpus suggestion and the contribute door itself — refuse
private and unconfirmed tools from derived state.

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
allowed only with `retroactive: true`, and must be ISO-shaped
(`YYYY-MM-DD…`) — a parseable-but-freeform date would validate and
then corrupt every consumer that slices it. Derived views date an
event by `occurred_at` when it is a marked claim, `server_timestamp`
otherwise — so a backfill session records real history without the
file ever lying about what it knew when.

Replay follows the **timeline, not the file**: events are ordered by
their own dates before derivation, so a backward backfill (a
historical sweep walked newest-first) appends in any order it likes
and the derived state still reads chronologically. Same-moment events
keep their append order. The file itself stays append-only and
unordered — order is derived, like everything else.

## Derived at read, never stored

Active set and status (`active_trial`, `active_paid`, `active_free`,
`inactive`), monthly burn (month as-is, quarter ÷ 3, year ÷ 12, week × 52⁄12,
`once` is not burn) with its `estimated_amount` (the metered share,
reported beside the total wherever the total goes), `paid_path` (what
a free tool's paid tier would cost, never in any total),
`converts_to`, trial warning dates and trials
past their end, idle-day counts, category overlap sets, price drift,
the friction summary, near-duplicate name candidates, quiet tools,
`confirmed`/`private` stickiness, and consent (the last
`consent_changed` wins).

Derived-not-typed is law here for the same reason it is law on the
storefront: a stored tally is a lie with a timer on it. It is also
what makes "what did I know on March 3rd" answerable at all.

A signup after an inactive spell opens a **new** commitment: the epoch
resets — all of it. `renewals_seen`, `last_billing_at`, `price`,
`converts_to`, `trial_ends` and `ever_paid` are cleared along with the
clock (v0.9; they used to survive the cancel, so quiet detection read
a fresh trial against the dead life's heartbeat and a re-adopted free
tool's cancel was published as a paid conversion's). A re-trial a year
after a cancel is measured on its own life rather than the old one's.

The burn is labeled by what it holds: a tab whose active prices span
more than one currency reports `currency: "mixed"` with a
`by_currency` split beside the raw sum, because no exchange rates live
here and a EUR+USD total labeled USD is a number in no currency at
all. Trial boundaries are inclusive of their own day: a date-only
`trial_ends` means THROUGH that day, so "charges you today" is
reachable on the day it is true, and past-end begins the day after.

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

**`.sweep.jsonl`** — the tally's own ledger (`sweep_tally` /
`sweep_finish`): one `batch` record per accepted batch of verdicts,
one `close` record when the sweep finishes. Per-sweep state is
derived by replay like everything else. Matched verdicts are written
to the tab through the capture lane as they arrive (dedupe key = the
message id); the finish derives every number `record_coverage` asks
for from this file, so `scanned` is the count of verdicts accepted
and `matched` is the count of entries the tab took — the books
balance by construction. What no ledger can count: mail read and
never reported here. That limit is the sweep's to keep, and the
finish names it every time. Routine: `tab/SWEEP_ROUTINE.md`.

**`.card.jsonl`** — one appended record per card reconciliation
(`reconcile_card_statement`), the ground-truth counterpart to the
sweep: the sweep measures what mail SAID, a bank statement measures
what was TAKEN. Holds the window, `statement_total`, `matched_tools`,
`unmatched_count`/`unmatched_total`, and `card_variability_pct`
(unmatched money over statement money — `variability_pct` asked of
ground truth). The reconciliation writes nothing to the tab itself:
an unmatched charge, a charge on a canceled tool, or an expected
charge that never landed are all questions for the builder, never
entries. No bank code lives here and none will — the builder exports
the CSV by hand, same law as the mail sweep.

**`.pages.jsonl`** — the pager's append-only log, replayed the same
way the tab is. States: `queued`, `handed_over`, `acknowledged`,
`superseded`, `retired`. `page_id` is `kind:tool:YYYY-MM-DD`, so one
worry raises one page a day. A handover is not a delivery; only
`acknowledged` spends a page, superseded-and-unacknowledged pages
become `unspoken_pct`, and a superseded page cannot be acknowledged
after the fact — otherwise the party being measured could edit its own
failure out of the record. `retired` is the opposite of superseded: the
worry stopped holding (trial canceled, gap filled, worry crossed into
another kind), so the page is closed as **moot, not missed** — retired
pages are counted (`pages_retired`) but never feed `unspoken_pct`.

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

### The price vocabulary assumes a fixed amount on a fixed clock

Found by hand, logging a real stack of two dozen tools (2026-08-08).
Three shapes did not fit. One is now fixed and two are open, and the
split between them is the useful part.

**Fixed: `quarter`.** Quarterly billing was refused outright. It is
the same shape as every other member — a fixed amount on a fixed
clock — so the refusal bought nothing and cost an agent silent
arithmetic. Added to `PERIODS`, converts at ÷ 3.

**Closed in v0.8, both of them.** The decision this hole was waiting
on — whether the burn total is allowed to contain an estimate at all —
was the keeper's, and he ruled it on 2026-08-10: yes, marked. The
`basis` marker (`fixed`, `metered`, `free_with_paid_path`) shipped
exactly as this entry sketched it; see *`basis` — what kind of number
`price` is holding* above. Usage-based bills enter the burn as marked
estimates with the estimated share reported beside the total, and a
free tier's paid path lands beside the tool as `paid_path`, never in
the burn — the same law `converts_to` already enforced for trials.

### Other

- **Single-writer-ish.** Atomicity rests on bounded lines under the
  POSIX atomic append size. Two agents hammering one tab is untested;
  `bad_lines` above zero is the symptom to watch for.
