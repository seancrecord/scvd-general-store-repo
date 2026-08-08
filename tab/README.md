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

## The tools

| tool | what it answers |
|---|---|
| `log_tool_event` | the write: trial started, paid, canceled, replaced, renewed, price changed |
| `trials_converting_soon` | the headline: which trials charge you inside the horizon — call it daily, surface it unprompted |
| `check_before_signup` | should the builder sign up? their own history, current coverage, and whether this door needed a human last time |
| `stack_audit` | the burn report: monthly total, unused list (honestly labeled), overlaps, price drift, and the stack's signup-friction picture |
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
