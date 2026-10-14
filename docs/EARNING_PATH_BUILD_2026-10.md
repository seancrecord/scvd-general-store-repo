# Earning and agent-job discovery — first implementation

October 13, 2026. Implemented locally on `codex/earning-path` in an isolated
worktree. Not committed, published or deployed. This is the first additive
increment of [the earning proposal](EARNING_INTENT_2026-10.md) and
[the completion/discovery brief](AGENT_INTENT_AND_COMPLETION_2026-10.md).

## What is built

- One shared set of answers connects earning, upfront costs, useful feedback,
  receipt verification, endpoint inspection and Tab expense tracking to
  existing products. The bounty and field-study rooms and their JSON copies
  expose the three earning answers. `/what` and the detailed agent guide
  expose all six. The short guide points to `/what` within its reading budget.
- Successful HTTP bounty claims and study debriefs return optional unsigned
  `completion` context: actual task and reward, existing evidence boundaries,
  a short explanation an agent may include in its report, and two free next
  steps. Nothing sends this to the human or conditions payment on sharing.
- Completion distinguishes payout authorization from observed redemption.
  It does not create a receipt, modify signed evidence, or claim that a
  signature proves every statement in a report. Decoration fails open.
- The board labels rewards before costs and drops a misleading zero-cost
  structured-data assertion. Current purchase requirements and payout terms
  remain explicit. General feedback uses the existing letter route; sending
  a letter does not earn a reward without posted terms.
- OpenAPI documents the added response fields. Existing payout objects and
  bounty follow-up fields remain intact.

Tab copy describes its local software-expense records, coverage gaps,
statement CSV comparison and trial tracking. Reminders require agent activity
or an external schedule; there is no bank-sync or autonomous-wakeup claim.

## Validation

- The new regression spec ran against the original implementation: six tests
  failed and two passed. All eight pass with the implementation.
- The wider affected run covered 17 files and 299 tests. 298 passed; the
  short-guide size check caught the full answers exceeding its reading budget.
  The full answers were moved to the detailed guide, with a short index link.
- Final rerun of the regression, guide and machine-surface suites: 28/28
  passed across three files, including the unchanged size limit. The earlier
  guide baseline was independently reproduced by restoring the original
  guide source (14/14) before updating its intentional content fingerprints.
- `npm run typecheck`, `npm run build:check`, `npm run claims` (56/56 bound),
  and `git diff --check` passed. The build was a dry run, not a deployment.
- The full CI suite remains required before merge. No organic discovery,
  ranking lift or adoption is established by these local tests.

## Next increment at the first checkpoint (implemented below)

Define and implement posted paid-contribution terms for useful experience,
accuracy and discovery work: AURA runs, census corrections, reproducible
package or documentation defects, and substantiated improvement suggestions.
The useful next capability is an explicit route for contributors who cannot
fund a purchase first. This increment does not advertise that route as live.
Payment criteria should reward reviewable work, avoid paying for praise or
duplicate reports, and state available budget and costs before work begins.

Use the added earning/job panels in [the AEO protocol](AEO_HAND_CHECK.md) to
test whether agents can discover the existing paths and explain their terms.
Treat the keeper's letters and observations as qualitative demand evidence;
do not turn them into an unsupported claim about market size.

## Second increment — reserved contribution work

The broader path is now implemented locally. [Full contract](../CONTRIBUTION_WORK.md).
The existing bounty board and study room link posted contribution briefs;
templates cover AURA, census, package, documentation and discovery tasks. A
keeper sets immutable terms, reward, slots and deadlines. Workers reserve
capacity before beginning, submit private evidence and read a private status.
The admin desk records an evidence-based decision and a repair, decision or
finding reference. Accepted work is an obligation; a separately recorded
payment is labelled keeper-reported, never independently verified.

No automatic payout or new live budget was introduced. The code never sends
money or emails, and no tasks were posted. A new per-task Durable Object
binding/migration is prepared but not applied.

Validation so far: the initial seven workflow tests failed against the
original routes. The implemented workflow and additional expiry, privacy and
storage checks passed. The combined discovery/contribution run passed 240
tests across 13 files, including OpenAPI's normal size and growth headroom.
The API contract reuses unchanged repeated schema fields to fit the existing
limit; no limit was raised. Both deployment bundles passed their dry runs.
Final retention and existing-reward regression results are recorded below.

Final validation: the existing-reward/admin regression run passed all 211
checks outside the new contribution spec, across 16 files. The contribution
spec's initial retention check mixed a fixed business clock with a real
runtime alarm; it now tests the alarm's shared expiry function with both
sides on the same injected clock. All 22 completion and contribution checks
then passed, including an actual admin form POST, with typechecking and both
Worker bundles plus the MPP SDK dry run green. The claims register resolves
56/56 lines with no unbound claims; `git diff --check` is clean.

The full CI suite, production migration, deployment, live readback and first
posted briefs remain release steps. The code and documentation are uncommitted
in the isolated worktree. No paid discovery or acquisition lift is inferred.


## Third increment — follow-through and learning, October 13

Built on the existing contribution path in the same isolated branch. Still
local: no task posted, money committed, external message sent or deployment.

- Keeper progress entries append after review. The original decision,
  payment deadline and transaction record are unchanged. The worker reads
  history with its existing private status token. Stable update ids make
  interrupted and concurrent retries safe; notes are bounded and escaped.
- The keeper desk reads compact task summaries and lists due reviews,
  unreported payments and outstanding planned fixes, linking to the exact
  submission. Scope is the current directory page, not a store-wide total.
- Optional arrival context makes the original demand hypothesis observable:
  earning, expenses, endpoint checks, evidence, product improvement or other
  jobs, plus a short self-reported discovery path. It is private, optional,
  immutable with the report, and independent of the reward criteria.
- The desk counts retained submissions with and without an arrival answer.
  These are self-reports from a selected contributor population, not unique
  agents, organic acquisition, search rankings or verified demand.

Validation started with five failing new-behavior checks and one passing
existing invalid-input check before source changes. The first focused run
then passed all workflow and OpenAPI-size checks. Final validation is recorded
below after the boundary and form checks.

Final validation for the third increment:

- Focused regression run: **181 passed across 9 files**, including the new
  follow-through suite, contribution workflow, completion path, OpenAPI
  shapes/inputs/size, keeper navigation/reach and guide parity.
- New follow-through suite: **10 passed**, covering private history,
  concurrent/idempotent writes, immutable decisions/payment deadlines,
  optional arrival storage and escaping, page-scoped queue/denominators,
  an actual keeper form, byte limits and a full retained task with large
  reports and progress histories below one MiB.
- The total-reward precision test was separately observed red before its
  guard: a per-slot amount could be safe while its multiplied commitment
  was not. The corrected terms validator refuses that combination.
- `npm run typecheck`, `npm run build:check`, and `git diff --check` passed.
  Build checks were dry runs. The full CI suite remains required before merge.

Limits unchanged: no live demand measured, no external AEO panel run, no
chain verification of manually reported contribution payments, no automatic
payment or outward notification. A normal reviewed release and keeper-posted
brief are needed before this can collect real submissions.


## Fourth increment — the worker's path, October 14

Built locally on the same branch. No public brief, reward commitment,
publication, external message or deployment.

- Task listings include concrete detail URLs and a capacity reason. A task
  can be open yet have full slots or exhausted retained-attempt capacity;
  neither advertises a new reservation action.
- Each task detail has a work packet: its posted target, brief, criteria,
  reward/payment terms, worker-borne cost limitations, per-kind evidence
  prompts and an empty report worksheet. Guidance does not create new
  acceptance conditions. No net-profit estimate is fabricated.
- Private responses carry next actions appropriate to the actual state,
  with exact URLs, methods, required fields and deadlines. Closure still
  preserves existing reservations. Expired/released work does not invite
  reuse of its spent reservation key. Nothing executes or schedules itself.
- Optional completion uses the performed work's kind. An explicitly reported
  expense-tracking goal can select Tab. Private discovery prose, reports,
  wallets and keys are never inserted into that handoff. Existing shopping
  completion checks and signed payout objects retain their behavior.
- The shared earning answer now names no-purchase contribution work first
  and distinguishes keeper-paid contributions from signed shopping rewards.
  This updates the existing HTML, JSON, FAQ and full agent guide together.

Validation: the first new worker suite was **11/11 red** before implementation.
The complete affected run is **255 passing tests across 12 files**, including
**13 worker tests**. Its scripted API walk discovers the task action, reserves,
rejects an empty worksheet, submits evidence, follows review status and reads
reported payment. This is deterministic integration evidence, not a cold agent
usability study or organic acquisition evidence.

The new API contract initially exceeded the existing growth-headroom guard
by 1,799 bytes. Reusing the unchanged agent-name schema in request contracts
restored the limit without removing fields or raising budgets; query parameters
remain inline. All affected OpenAPI guards pass. The temporary size diagnostic
was removed. Restoring only the two changed earning answers reproduced the
preceding guide fingerprints (14/14); new fingerprints describe those edits.

Final checks also passed: TypeScript typecheck, all build dry runs, the claims
register (56/56 resolved, no unbound claims), and whitespace/diff validation.
No deployment or commit occurred. The full CI suite remains required before
merge; live task qualification and external AEO measurements remain unrun.


## Fifth increment — interrupted actions, October 14

Two recovery defects were reproduced before changing source:

- A reservation was saved before its retention alarm was scheduled. Injecting
  an alarm failure left a reservation behind; an identical retry could return
  it without repairing cleanup. Setup now precedes the authoritative capacity
  read and save. A setup failure retains no reservation; retries also clear
  overdue visitor digests without changing the reservation's identity.
- Invalid keeper forms and interrupted directory writes returned raw JSON,
  leaving the keeper without a preserved retry form. Known form fields now
  survive in an escaped editable response with stable task/submission/update
  identifiers. Infrastructure errors acknowledge that a save may have happened;
  retries keep immutable terms and repair the directory. Unknown fields are
  refused without reflection. JSON errors retain their existing shape.

All four initial regression tests failed before the repair. The expanded
recovery suite has seven passing tests, including failed review/progress forms,
identical progress retries, JSON compatibility and unknown-task storage bounds.
The affected run passed **262 tests across 13 files**. Typecheck, all three build
dry runs and whitespace validation passed. Full CI is still required before merge.

A disposable Wrangler local preview used separate temporary KV/SQLite storage
and a test-only admin password. An actual local HTTP form walk passed invalid
input recovery, posting, reservation, evidence submission, review, follow-through,
a synthetic payment record and private status. No payment was sent. The browser
verified the desk, forms, navigation, saved report, review, progress history,
reported-payment scope and optional-arrival count. Its submit buttons did not
complete navigation in this in-app browser session, even for the empty close
form; this limitation remains unqualified, not counted as a passing browser walk.
No production configuration was changed for the preview, and no brief or reward
commitment was posted publicly. This increment remains local and uncommitted.


## Sixth increment — browser completion and posted-work discovery, October 14

The fifth increment's browser limitation is resolved. Native form POSTs under
`no-referrer` arrived with an opaque origin and correctly failed the admin gate.
Admin contribution pages now use `same-origin`; the public API retains
`no-referrer`. The origin gate was not relaxed. The header regression failed
before the change, and coverage retains rejection of null, foreign, same-site
and cross-site requests.

The disposable Wrangler preview also needed its configured store origin to
match the HTTPS upstream origin used inside the runner. This was a temporary
preview configuration correction, not a production configuration change. In
the actual in-app browser, the keeper closed a synthetic brief, posted another,
recovered an invalid target without losing its identifier, accepted submitted
evidence, appended a fixed follow-through entry and recorded a fake transaction
hash. Reservation and evidence submission were supplied by the local HTTP
client. No payment was sent and no public reward commitment was created.

Posted contribution briefs now appear directly on the existing `/bounties`
page, with rewards, acceptance criteria, targets, review/payment periods and
availability. HTML, Markdown and JSON use the same bounded reader as the API;
opaque cursors expose later pages. Read failure is distinguished from an empty
list while shopping content remains available. The representations are
`no-store`, and OpenAPI declares the cursor and extended page response without
changing the shopping API response. Private worker records never enter the
listing. The browser confirmed available, full and closed synthetic rows.

The initial four discovery regressions failed before implementation. A fifth
checks Markdown/JSON parity. Browser inspection found a duplicated contribution
section; its single-anchor regression was also shown red before repair. The
page now keeps its live listing and shared earning answers without repeating
the generic contribution introduction used on the field-study page.

Validation: **520 tests passed across 19 affected files**, including the
OpenAPI shape, size, declared-input and shared-schema guards. The page's golden
schema now extends the preserved shopping schema with contribution listings.
TypeScript typecheck, all three bundle dry runs and whitespace validation
passed. Full CI remains required before merge. These checks establish local
behavior, not cold-agent usability, search visibility or acquisition impact.
All changes remain uncommitted and undeployed.
