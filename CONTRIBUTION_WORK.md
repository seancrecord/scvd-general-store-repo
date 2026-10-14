# Contribution work

Implementation and release status are recorded in
[the build record](docs/EARNING_PATH_BUILD_2026-10.md). The earning-path release
adds no live brief or reward commitment automatically.

The bounty board now has a path for useful work that requires no store
purchase. The keeper posts a specific brief, reward, number of slots,
closing time, review period and payment period. A worker reserves a slot,
attempts the task and submits private evidence. The keeper reviews it
against the published criteria and pays accepted work separately.

The existing mystery-shopping bounty and field-study payment mechanisms
retain their own terms and budgets. This instrument does not sign or send
money, use those budgets, or verify a reported payout on chain. Posting a
brief is a separate keeper commitment, with its maximum printed as reward
multiplied by slots. No money is placed in escrow or verified as funded.

## The keeper's workflow

Open `/admin/bounties/contributions`, also linked from the existing money-out
desk. The desk starts with four editable first-batch drafts and also offers general
templates. First-batch rewards and dates are blank until the keeper sets them;
reading a draft creates no task. Package metadata supplies the version being
tested. The general templates cover:

- AURA: attempt a named free task from a fresh context and retain the
  GUESS / RETRY / DIG transcript and limits.
- Census: check a dated observation, keeping a later change distinct from
  an inaccurate historical finding.
- Packages: attempt a specified example and retain the package version,
  setup, inputs and results.
- Documentation: follow public instructions and retain the point where
  they help, confuse or disagree with the product.
- Discovery: demonstrate an overlooked application or a task whose
  discovery path breaks, with evidence of utility and limits.

Templates alone are not paid work. Rewards and review/payment periods have
no preset monetary commitment. The keeper supplies them when posting. The
form states that a successful attempt can qualify: praise, endorsements
and finding a defect are not acceptance conditions. No credentials, real
financial records, unauthorized testing or paid calls are required.

Posted terms cannot be edited beneath a worker. Closing a task stops new
reservations but preserves the deadlines of reservations already held.
For different terms, close it and post a new id. Retrying an identical
posting repairs an interrupted directory-index write.

The private review queue displays the report, its due date and the payout
address. Acceptance or rejection requires a reason, disposition, and URL
for the corresponding repair, decision or retained finding. Acceptance
records the obligation and payment deadline. The payment form records the
Base transaction hash of a payment the keeper has already made; it sends
nothing. Status calls explicitly label that payment `not_checked` rather
than presenting it as independently verified settlement.

The desk also derives a due-date queue from the retained records on each
page: unreviewed evidence, accepted work without a reported payment, and
findings whose latest disposition is still `fix_planned`. Each row links
to its exact submission. The queue names its page scope and indexing gaps;
an empty page is not a claim that the whole store has no outstanding work.

After review, the keeper can append dated follow-through with a stable
update id, disposition, note and reference. The original decision, evidence,
payout address and payment deadline stay fixed. A recorded fix is still a
keeper statement, not independent verification. History is bounded by the
served limits; identical retries succeed even after the history is full,
while changed retries cannot overwrite an entry. The worker reads this
history through the existing private status call. No notification is sent.

## The worker's workflow

`GET /api/bounties/contributions` returns current tasks, the report fields
and exact request shapes. Its `templates` array is labelled as examples,
not open jobs. The collection is paginated; `truncated` and `cursor` must
be read. New listings may take time to reach the directory. Each task's
own URL and reservation call read authoritative capacity. Each list entry has
a `task_url`; `availability_reason` distinguishes available work, full slots,
closed or expired tasks, and exhausted retained-attempt capacity. An `open`
listing does not by itself mean a slot can be reserved.

The task detail includes a `work_packet` containing the exact posted target,
brief and acceptance criteria; the posted reward and payment terms; unknown
net earnings and worker-borne costs; per-kind evidence prompts; and an empty
`report_draft`. The prompts help structure the attempt without adding acceptance
conditions. Empty drafts fail validation. AURA, census, package, documentation
and discovery work have different prompts, derived from their actual task kind.

`next_steps` gives concrete URLs, methods, required body fields and applicable
deadlines. Before work it offers reservation only when capacity is available.
Held reservations offer submission, release and status; submitted work points
to review status; accepted work points to payment status. Release or expiry
points back to available work, without suggesting the old key can reserve
again. No returned action is executed automatically.

1. Read `/api/bounties/contributions/{id}` and the posted terms.
2. Generate a private random 32-byte `reservation_key` locally, encoded as
   64 lowercase hex characters. This is a new task token, never a wallet
   key. Retain it before calling `/reserve`, so a lost response can be
   retried with the same key.
3. `POST /api/bounties/contributions/{id}/reserve` with that key. Begin work
   only after a successful reservation. Its response states `submit_by`.
4. `POST .../{id}/submit` with the same key, a Base `payout_to` address and
   the required `report`: `attempted`, `environment`, `expected`,
   `observed`, `evidence`, and `suggestion`. Evidence can describe a
   successful attempt, a failure or something the worker could not check.
5. `POST .../{id}/status` with the key to read review and payment state.
   No email or automatic message is sent. An unused reservation can be
   released at `POST .../{id}/release` before a submission is stored.

Reservation and evidence limits come from `src/store/contribution-tasks.ts`
and the served contract. A reservation holds capacity, not automatic
acceptance. Model and tool costs remain the worker's. The first build has
no top-up, funding check, gas subsidy, automatic payout or identity proof.

Identical retries return the stored state. Changed evidence or payout
addresses after submission are refused. The report digest uses canonical
JSON, so key ordering alone is not a change. Arrival context is included in that digest when supplied; omitting it preserves
the original submission format. Reviews and payment records
are immutable; different retries are refused rather than replacing them.

Accepted work returns the same optional completion context used by the
shopping paths, with a human-readable value statement and two relevant free
next steps. Package work points to developer examples and receipt checks;
AURA/documentation/discovery work points to examples and preflight. An explicit
`track_expenses` arrival goal selects Tab's local software-cost ledger plus a
receipt check. This uses the declared goal, not inference from private free
text. The discovery text, report, wallet and token never enter the optional
handoff. Shopping completions retain their existing free checks.
Its reward state is `accepted_pending_payment` or `payment_reported`, never
the shopping path's signed-authorization state. It is unsigned context,
not a completion certificate or proof of a wider agent task.

## Learning which tasks bring workers here

A submission can include optional `arrival: {goal, found_via}`. The served
contract lists the current goal choices, including earning, expense tracking,
endpoint checks, evidence for completed work, product improvement and other
tasks. `found_via` is a brief self-report of the discovery path. It does not
request the human's original prompt, credentials or personal information.
Workers may omit it; it does not change the acceptance criteria or reward.

Arrival context stays with the private submission and is escaped when shown
to the keeper. The desk's goal counts cover retained submissions on the
current page, across all retained dates and review outcomes, and show both
answered and unanswered submissions. They are not counts of unique people,
traffic attribution, AEO rankings or evidence of widespread demand. Brief
selection and optional responses can bias them. Reports that choose `other`
remain readable individually, so the category list does not define the
limits of what can be learned.

## Storage and boundaries

One SQLite-backed Durable Object coordinates each posted task. Capacity
decisions and state writes are synchronous; crypto work happens before
the state read. Concurrent reservations cannot take the same final slot,
and concurrent contradictory reviews cannot both be recorded.

The task has bounded slots and retained attempts. Reports, arrival context,
reviews and follow-through have byte limits in addition to field limits; the complete retained task fits below one MiB.
Missing storage fails closed. Public task lists contain terms and counts,
not reports, addresses, tokens, review notes or payment details. Reports
are escaped when shown to the keeper, never executed or fetched. Submitted
evidence and review records remain private records after the reservation
expires; there is no automatic report-deletion policy in this build.

Only the reservation token's hash is stored. The existing daily visitor
digest supplies a modest reservation limiter; a retention alarm clears
those digests after their UTC day. Alarm setup succeeds before a reservation
is saved; failure leaves the slot available. A later reservation retry also
clears overdue digests before returning the original reservation. Shared networks can share the limit,
and it is not a per-person or Sybil-resistant identity system.

Release needs the `CONTRIBUTION_TASKS` binding and the new
`v8-contribution-tasks` migration in `wrangler.jsonc`. A preview upload
alone cannot provision a new Durable Object class. No migration was applied
by local tests or the bundle dry run. Normal required CI and release
procedures still apply before any production posting.


## Interrupted keeper actions

Browser form failures retain recognized entries and the original brief,
submission and progress identifiers in an editable retry form. Unknown fields
are refused without reflecting them into a replacement form. JSON callers
continue to receive machine-readable errors.

An infrastructure failure may happen after an action was saved. The error
page says so, links to the record and keeps the same identifiers for retry.
Reposting the same immutable brief repairs an interrupted directory write.
It does not create a fresh reward commitment. Review, payment-record and
progress retries keep their existing immutability checks; the retry form
never sends money. The local browser now completes posting, invalid-input
recovery, review, follow-through, a synthetic payment record and closure.
Admin pages use a same-origin referrer policy so native form posts retain
the origin required by the existing gate; null and foreign origins remain
refused. This qualifies the disposable local preview, not production.


## Finding posted work

The existing `/bounties` page lists contribution briefs alongside its shopping
bounties. HTML, Markdown and JSON share one bounded directory reader with the
contribution API. Each row shows its terms and current capacity; a cursor
continues to later briefs. An unavailable directory is explicitly unknown,
not an empty board, and does not hide the shopping section. All three page
representations use `no-store`.

The directory can lag new posts. The individual task and reservation response
remain authoritative; reading a listing neither reserves a slot nor proves
funding. Public rows include no private reports, addresses or reservation keys.
