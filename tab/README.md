# The Tab (`scvd-tab`)

Your agent remembers every tool you sign up for and warns you before
a trial converts — so you never pay for software you forgot about.

An MCP server from [scvd.store](https://scvd.store). Local JSONL,
append-only, zero dependencies. The full specification is
[THE_TAB.md](../THE_TAB.md) at the repo root; the schema contract is
[SCHEMA.md](./SCHEMA.md).

## Install

One config line, any MCP client:

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

## Running the clock

An MCP server speaks when spoken to; it cannot wake anybody. So the
pager runs from outside:

```
# every morning at 9 — prints nothing when nothing is due
0 9 * * *  cd /path/to/repo && npm run --silent tab:pager
```

Without a cron the clock still runs, on any tool call: the next time
the agent touches the tab for any reason, the open pages ride back
with the answer. With a cron the warning is **timely**; without one it
is at least **inevitable**. With neither a cron nor an agent that has
rounds, nothing arrives — that case is not fixed and is not pretended
away.

A page handed to an agent is not a page the builder heard. Only
`acknowledge_pages` records that somebody said it out loud, and pages
that age out unacknowledged are counted rather than deleted.

## The mail sweep

The tab holds no mail code and never will. The sweep is an agent
routine over a connector the agent already holds, writing through the
same validated tools as any other caller. Its contract — including
the counting obligation that keeps the coverage number honest — is
[SWEEP.md](./SWEEP.md).

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
