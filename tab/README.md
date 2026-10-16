# The Tab (`scvd-tab`)


mcp-name: store.scvd/tab
Track recorded software expenses, check for an existing subscription before
another signup, and surface trial deadlines for your agent to bring to you.

An MCP server from [scvd.store](https://scvd.store). Local JSONL,
append-only, zero dependencies. The full specification is
[THE_TAB.md](https://github.com/seancrecord/scvd-general-store-repo/blob/main/THE_TAB.md)
at the repo root; the schema contract is [SCHEMA.md](./SCHEMA.md).

## Ask your agent

> Use Tab to summarize my recorded software expenses and upcoming charges.
> Run stack_audit to identify possible subscription overlaps and price drift.
> Show missing prices and history. Compare any statement CSV I supply locally.
> Do not cancel anything, upload my records or request bank credentials.

A category overlap is a review lead, not proof that one tool replaces another.
[Task prompts and next steps](https://scvd.store/what#job-overlapping-tools)
include expense tracking, trial reminders and checks before a new signup.

## Why this exists

Every builder carries a quiet ledger: the trial that converts
Thursday, the annual plan that renews in March, the API that bills by
usage, the thing signed up for in April and never opened since.
Nobody keeps that ledger, so the bank statement keeps it for you —
one surprise at a time. And now agents sign you up for tools too,
which makes the ledger longer and the forgetting faster.

The Tab is that ledger, kept where you already work: inside the
agent. Log a trial and the pager can queue its approaching conversion. Ask
`whats_due` at the start of a session and the dearest thing is the
first line. Ask `burn_rollup` and get the monthly number with what
it is made of — and what it cannot see.

## What makes it different

**It never asks for a credential.** If you choose to import mail,
your agent reads it through a connector it
*already* holds ([SWEEP_ROUTINE.md](./SWEEP_ROUTINE.md)), you export
the card CSV yourself (`reconcile_card_statement`), and the tab holds
a credential to exactly nothing. There is no account to breach
because there is no account.

**Local first, exit always.** The whole product is one
human-readable JSONL file on your machine, written by a server with
zero dependencies you can read top to bottom in a sitting.
`export_tab` hands everything back, any time, no charge — a product
that holds your history hostage is the disease; this is the cure's
own hygiene.

**Warnings that ride the agent, not an app you must remember to
open.** An MCP server cannot wake anybody, so the clock runs outside
(a one-line cron) and open pages ride back on *any* tool call — a
trial converting tomorrow reaches you on whatever your agent was
doing anyway. And a page handed to an agent is not a page you heard:
only `acknowledge_pages` spends one, and pages that age out unspoken
are counted against the product as `unspoken_pct`, not assumed away.

**Every number says what it cannot see.** The burn figure never
ships bare: it arrives with the coverage block — what fed it, which
part is an estimate (usage-based bills are marked, never smuggled),
what the last mail sweep could not place, and how far the bank's own
statement diverged. A dashboard that hides its blind spots is a
prettier way of being wrong.

**It remembers which doors need a human.** Every signup can record
what the path demanded — `agent_native`, `email_only`,
`phone_required`, `kyc_required`, `human_only` — so
`check_before_signup` warns *before* an agent-driven signup
dead-ends on a wall somebody already hit.

**Facts and counts, never advice.** The tab says what you trialed,
what you pay, and when it converts. "Cancel it" is your agent's
sentence to say, not the tab's — by design, enforced by what the
tools are able to return.

## Install

One config block, any MCP client:

```json
{
  "mcpServers": {
    "scvd-tab": {
      "command": "npx",
      "args": ["-y", "scvd-tab@0.11.4"]
    }
  }
}
```

Or from a clone of the repo, no npm involved:

```json
{
  "mcpServers": {
    "scvd-tab": {
      "command": "node",
      "args": ["/path/to/tab/server.mjs"]
    }
  }
}
```

The tab lives at `~/.scvd/tab.jsonl` (override with `TAB_PATH` or
`--path <file>`). It is a plain JSONL file, it is yours, and
`export_tab` hands it back in full any time — a product that holds
your history hostage is the disease; this is the cure's own hygiene.

## Three jobs to give your agent

| Your task | Tab's tools | What the answer covers |
|---|---|---|
| Track my software expenses | `log_tool_event`, `burn_rollup`, `reconcile_card_statement` | Recorded or imported software costs, with unknowns and coverage gaps. It is not a bank feed or a complete household expense tracker. |
| Remind me before a free trial charges | `trials_converting_soon`, `whats_due`, `acknowledge_pages` | The recorded deadline and expected price. An active agent or a scheduled check with delivery is still needed; Tab does not cancel the trial. |
| Check before I sign up for another tool | `check_before_signup`, `whats_current` | Previous signups and active tools in the same category. Missing history is not proof of no subscription; an overlap is not proof that one tool replaces another. |

### Try it with synthetic subscriptions

From a repository checkout:

```sh
node tab/examples/software-cost-check.mjs
```

Or in a disposable directory after installing `scvd-tab`, run the same
packaged example:

```sh
node node_modules/scvd-tab/examples/software-cost-check.mjs
```

The example creates a fresh temporary ledger and prints its path. It records
a $20/month analytics subscription, $120/year hosting subscription and a
$15/month trial ending two days from the run. It calls the same handlers the
MCP tools use; the example itself is not an MCP host test. No network request,
real subscription, inbox, wallet or existing ledger is used, and no reminder
is acknowledged or schedule installed.

Read these results:

- `burn.monthly` is **30 USD**, from the two paid subscriptions; the trial's
  expected conversion price is separate. Read `burn`'s coverage alongside it.
- `existing_signup.seen_before` is true. `possible_overlap` has no history
  for the proposed new name but lists the recorded analytics tools.
- `trials.converting` includes the approaching trial; `reminders.say_now`
  contains its pending page. `reminders.coverage.pages_acknowledged` remains
  **0** because generating a reminder is not delivery.

For your own records, supply only the data you choose to log or import.
Record the provider's actual deadline; keep unknown dates and prices visible.
After your agent delivers a real reminder, it can acknowledge that page.

## Running the clock

An MCP server speaks when spoken to; it cannot wake anybody. So the
pager runs from outside:

```
# every morning at 9 — prints nothing when nothing is due
0 9 * * *  npx -y -p scvd-tab@0.11.4 scvd-tab-pager
```

Or from a clone: `cd /path/to/repo && npm run --silent tab:pager`.

Without a scheduler, pending reminders return on the next agent call.
The agent must still deliver them; a tool result alone does not establish
that you were reminded. A scheduler can run the due check on time, but its
output still needs a working delivery path. If neither an agent nor a
scheduler runs the check, no reminder is surfaced.

A page handed to an agent is not a page the builder heard. Only
`acknowledge_pages` records that somebody said it out loud, and pages
that age out unacknowledged are counted rather than deleted.

## The mail sweep

The tab holds no mail code and never will. The sweep is an agent
routine over a connector the agent already holds, writing through the
same validated tools as any other caller. Its contract — including
the counting obligation that keeps the coverage number honest — is
[SWEEP.md](./SWEEP.md); the step-by-step routine an agent executes is
[SWEEP_ROUTINE.md](./SWEEP_ROUTINE.md). The counting itself is
machinery, not diligence: `sweep_tally` counts verdicts as they
arrive and writes the matched entries, and `sweep_finish` derives the
coverage record from what was actually reported, so the books balance
by construction.

## The tools

| tool | what it answers |
|---|---|
| `whats_due` | **the pager**: what should be said to the builder right now, worth most first — run it every round |
| `acknowledge_pages` | you actually said them; only this spends a page |
| `log_tool_event` | the write: trial started, paid, canceled, replaced, renewed, price changed |
| `capture_tool_event` | quick capture (`/log`): a fragment lands, always, with gaps named rather than invented |
| `trials_converting_soon` | which trials charge inside the horizon, and which ended with no resolution logged |
| `check_before_signup` | should the builder sign up? their own history, current coverage, and whether this door needed a human last time |
| `stack_audit` | the burn report: monthly total, unused list (honestly labeled), overlaps, price drift, signup-friction picture |
| `burn_rollup` | the confrontation: category subtotals, annualized, idle share, trajectory, shareable badge, and the coverage block |
| `needs_attention` | the drip: what is outstanding, dearest first and capped |
| `confirm_entry` | a human looked at a swept entry and says it is real — or marks it private |
| `record_coverage` | the sweep reports what it read and what it could not place ([SWEEP.md](./SWEEP.md)) |
| `sweep_tally` | the sweep's running count: verdicts in batches, matched entries written, refusals out loud ([SWEEP_ROUTINE.md](./SWEEP_ROUTINE.md)) |
| `sweep_finish` | close a sweep; its coverage record is derived from the tally, never restated from memory |
| `reconcile_card_statement` | ground truth, monthly: the bank's CSV against the tab, both directions — writes nothing, every finding is a question |
| `whats_current` | the builder's history in a category |
| `contribute_anonymized_delta` | deliberately send one anonymized delta to the scvd pool (consent required, layer 3) |
| `set_consent` | contribution on/off — recorded as an event in the tab itself |
| `export_tab` | everything, jsonl or csv, no charge, no lock-in |

## What it will not do

Facts and counts only, never advice — the tab says what you trialed,
what you pay, and when the trial converts; "cancel it" is your
agent's sentence to say, not the tab's. Nothing leaves the file
except a delta you consented to and your agent deliberately sent.
Prices, payment labels, problem text and notes never ride a delta.

## Signup friction

Every event may record what the signup path demanded:
`agent_native`, `email_only`, `phone_required`, `kyc_required`,
`human_only`. The tab remembers which doors need a human, warns
before an agent-driven signup dead-ends, and — with consent — feeds
the agent-readiness index: which tools agents can actually reach,
measured, over time.

## Tests

```
npm run tab:test
```

Runs on Node's own test runner; no framework, same as no
dependencies.
