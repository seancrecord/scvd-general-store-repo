# The Tab — MCP Tool Specification v0.2

(Formerly "The Tool Ledger" — renamed by the keeper 2026-08-08.
"Ledger" is load-bearing in-store; a tab is the thing itself: the
running account of what you're signed up for and what it costs.)

Status: product spec, keeper-approved 2026-08-08. The tools below
are the product — what can be asked of the tab determines what the
tab must hold. Schema follows from this. No code exists yet,
deliberately: spec first, then the build.

Server name: `scvd-tab`
Transport: stdio (local-first); optional HTTP for a hosted version
Storage: local JSONL, one line per event, append-only. Path
configurable; default `~/.scvd/tab.jsonl`. The server owns
the file — no other process writes to it.

⚑ KEEPER, still open on this document:
  - Layer 3's trust-model line (see "The pooled layer's debt") —
    lands on /attestation the week layer 3 ships.

RESOLVED 2026-08-08: the name is The Tab (the keeper's pick from the
flagged recommendation; alternates The Toolshed and The Manifest
declined). File renamed from TOOL_LEDGER.md the same day.

## Changelog from v0.1 (the keeper's pass, 2026-08-07, all eight)

1. `verdict` → `summary`, facts only. The keeper's ruling on the
   pooled layer governs the local one too: popularity and history,
   never judgment. The store does not say "overlap risk: high"; it
   says what you trialed, when you canceled, and what you currently
   pay for. The builder draws the conclusion.
2. `trials_converting_soon` is its own tool — the headline tool, not
   a field inside the audit. The save-money moment is push, not pull,
   and an agent should be able to check a deadline daily without
   running the full burn report. It also still rides `stack_audit`.
3. `log_commitment` → `log_tool_event`. Canceling is not committing,
   and MCP tool names are what agents pattern-match on: an agent
   recording a cancellation may never reach for a tool named for
   signup.
4. `backfilled` is not an event type. A backfilled signup is still a
   `trial_started`; what's retrospective is when you LEARNED it. The
   write takes `retroactive: true` + `occurred_at`; the server still
   stamps its own write time. The file can't lie about time, and the
   backfill session can still record real dates.
5. Consent is an event in the log, not a flag beside it. Everything
   else is append-only for good reasons; consent is the one state
   where the audit trail matters most — who turned it on, when,
   when revoked. `set_consent` appends a `consent_changed` event.
   One writer, one file.
6. `days_held` → `weeks_held`. The delta claimed "no dates more
   precise than the week" and then shipped an integer day count —
   signup week plus exact days reconstructs the outcome date. Rounded
   to weeks; the pooled stats do not get meaningfully worse.
7. The one-liner sells only what v0.1 does. "Tells you when something
   better exists" is the pooled layer, which is not shipping — copy
   ahead of code is the auto-refund incident's shape, on the surface
   strangers quote.
8. `price_changed` carries `previous_price`, required, and the
   validation list enforces it. A price change with one price is not
   a change, it is a number.

Also folded, from the outline review: `payment_method` stays optional
free text and is documented as the builder's own label ("the business
card"), never parsed, never contributed — it is the one field that
would be financial PII, and no read needs it.

## Addendum — the keeper's day-one tracking call (2026-08-08)

Outcome-only deltas cannot see adoption: the pool would hear about a
tool only when commitments END, so a hot tool everyone is mid-trial
on stays invisible for weeks. The keeper's ruling: we track from day
one. Two additions, both consent-gated like everything else:

9. THE OPENED DELTA. `contribute_anonymized_delta` takes a `kind`:
   `"opened"` (tool_name, category, week — three fields, nothing
   else) fired at `trial_started`/`paid_started`, or `"outcome"`
   (the existing shape) fired at resolution. Opened and outcome
   deltas are DELIBERATELY UNLINKED — no contributor id ties one to
   the other, because linkage is where anonymity starts unwinding.
   Aggregate rates still compute across the population, and the
   corpus is non-backfillable either way: every week the endpoint
   runs before a competitor's is a week nobody else can ever have.
10. THE CONTRIBUTION SUGGESTION. When `log_tool_event` records a
    contributable event and consent is on, the write response
    carries `contribution_suggestion` — the exact delta that WOULD
    be sent, for the agent to file in the same breath. The tab
    stays passive (no sweep ever scans the file for unsent deltas);
    the agent stays the only actor; the natural moment does the
    remembering.

11. SIGNUP FRICTION — the agent-readiness index (the keeper's
    meta-pain, 2026-08-08: "why do I have to create the Twitter
    account?"). Every tool event MAY carry `signup_friction`, a
    controlled vocabulary of what the signup path DEMANDED:
    `agent_native` (API key, no human), `email_only`,
    `phone_required`, `kyc_required`, `human_only`. Observation-
    shaped by construction — it records the door's demands, never
    whether the tool deserves them. Locally: `stack_audit` counts
    the builder's stack by friction and lists the tools where a
    human is the door; `check_before_signup` warns BEFORE an
    agent-driven signup dead-ends on a wall a human already hit.
    Pooled: `signup_friction` rides OPENED deltas only (a
    signup-time fact about the tool, carrying nothing about the
    builder) — which makes the pool a third non-backfillable
    corpus: the agent-readiness index of the builder-tool economy.
    Which doors open to agents, which demand a human, and which
    direction each is moving. Nobody else is collecting it, and
    every week it runs first is a week nobody else can ever have.

What the pool can then see: conversion rates, post-pay churn and the
weeks-held distribution, adoption volume by week (opened deltas),
the agent-readiness index (friction by tool, over time), and the
REPLACEMENT GRAPH — `replaced_with` as directional edges, quietly
the strongest signal in the design: when five tools' deltas all
point at the same successor, that is the market talking and nobody
editorialized. What it still cannot see, said plainly on every
published figure: unresolved commitments (survivorship),
non-contributing builders (population bias), and any single report's
truth (gaming — sample sizes ride every number).

## v0.3 — the coverage pass (built 2026-08-08)

The keeper's ruling: *"'some will be missed' is not an acceptable
answer. the question is 'what is missed and why' then how do we
account for it."* Correct, and the same discipline the store applies
to `unexplained: 0` on books that balanced while a buyer got nothing.
So the failure modes are enumerated, each with its mitigation, and
the residue is MEASURED rather than disclaimed.

### The chain, and its eight break points

| # | Break | Why | Accounted for by |
|---|---|---|---|
| 1 | Vendor never emits | OAuth-only signup, API-key tools, free tiers, a colleague's team seat | OAuth grant list; password-manager inventory; card reconciliation for anything paid |
| 2 | Emits to a channel we don't read | Second address, `+tag` aliases, in-app only, SMS | `addresses_swept` is published; the ones not covered are nameable |
| 3 | Destroyed before sweep | Hard-deleted, spam-purged, retention rules | Recurring receipts re-announce anything that bills, next cycle |
| 4 | Sweep doesn't run | Agent down, token expired, cron missed | `last_sweep_age_days` + `sweep_stale` on every audit |
| 5 | Sweep runs, query misses | Unusual sender, foreign language, odd subject | `unmatched_transactional_count` — the self-measuring blind spot |
| 6 | Extraction lies | Price in an image, "ends soon", **annual read as monthly** | `confidence: inferred`; the annual/monthly slip is a 12x error in the only number that matters |
| 7 | Write is wrong | Dedupe failure; "openai" vs "openai-llc" | `dedupe_key` on write; `possible_aliases` surfaced, never auto-merged |
| 8 | No signal exists | Stopped using but still paying; terms changed at same price | Nothing can see it. Stated, not mitigated |

### The variability window

`unattributed / (attributed + unattributed)`, **both measured inside
the sweep's own window**, published on every rollup and kept as a
history so it can be watched moving. Computable from the sweep ALONE
— you do not need to know what was missed, only how much money moved
that could not be placed. Null until a sweep has ever reported,
because a made-up zero would be the worst answer available. The
keeper's target is **< 2%**.

CORRECTED 2026-08-08 (red team, second pass): the first cut divided
monthly BURN — a rate — by a sum of absolute charges over an
arbitrary span, so a six-month sweep finding $600 against $300/mo
read "67%" and measured nothing. The test shipped alongside it
enshrined the error with numbers chosen to look plausible. Both sides
now come from one window in one unit, and the sweep reports the
window it covered.

### Structurally unaccountable, stated in their own words

A tool that never emailed, never billed, and was never mentioned · a
seat somebody else pays for · paying for something you stopped using.

### What v0.3 shipped

`adopted` (free tools — v0.2 forced a fake trial with a phantom
conversion) · the always-succeeds capture lane with gaps named, never
invented · `dedupe_key` so a re-found receipt is not a second charge ·
the coverage block's countable facts · the silence detector (only
where a heartbeat was seen first — elsewhere silence says nothing) ·
`possible_aliases` · and the rollup: category subtotals, annualized,
idle share, trajectory replayed from the event log, and an anonymized
shareable badge that names counts and never vendors.

### Still open, and whose

- **The mail sweep itself** — an agent routine over a connector the
  agent already holds; the tab needs no mail code, which is the point.
  Owner: CV.
- **Card reconciliation** — the `unexplained_charge` analogue of
  `undelivered_sale`, and the only true ground truth for burn.
  Owner: keeper's call on the source.
- **The historical six-month pass** — the tab supports it today
  (retroactive entries, dedupe); the sweep that drives it does not
  exist yet. Owner: CV.
- Until a sweep reports, `variability_pct` is `null` and the burn
  figure is honest about resting on hand-logged entries alone.

## Design principles (read first)

1. Append-only event log, not a database. Every state change appends
   an event; current state is derived by replay. History for free,
   and "what did I know on March 3rd" stays answerable.
2. The server validates everything. Writes that don't match the
   schema are rejected with a useful error. No tab drift — the
   exact disease this product treats.
3. Local-first, private by default. Nothing leaves the file except
   through `contribute_anonymized_delta`, deliberately, with consent
   recorded in the log itself.
4. Agents are the only writers. A human CAN read the file (it's
   JSONL, it's theirs); all writes go through tools so they're
   validated.
5. Two timestamps, two jobs. `server_timestamp` is stamped by the
   server on every write and cannot be supplied. `occurred_at` is
   the caller's claim about when the thing happened, allowed only
   with `retroactive: true`, and always displayed as a claim.
6. Popularity, never judgment (the keeper's ruling, 2026-08-07).
   Every read returns facts and counts. No verdicts, no scores, no
   "you should." Rankings are retention arithmetic; advice is the
   product this store is constitutionally barred from stocking.

## THE TOOLS

### 1. `log_tool_event` — the write

The agent calls this when the builder signs up for, pays for,
cancels, renews, replaces, or learns of a price change on a tool.

| field | type | required | notes |
|---|---|---|---|
| tool_name | string | yes | canonical lowercase: "ahrefs", "canva", "kimi-k3" |
| event | enum | yes | `trial_started`, `paid_started`, `canceled`, `replaced`, `renewed`, `price_changed` |
| problem_solved | string | yes | free text: what the builder was trying to do |
| category | string | yes | controlled vocabulary (below) |
| price | object | see validation | `{amount, currency, period}` |
| previous_price | object | see validation | required for `price_changed` |
| trial_ends | ISO date | see validation | required for `trial_started` |
| replaced_with | string | see validation | required for `replaced`; the successor tool. Logged against the OUTGOING tool — same vocabulary as the delta's `replaced_with`, one name for one edge |
| retroactive | bool | no | default false; true marks a backfilled entry |
| occurred_at | ISO date | no | allowed only when `retroactive`; the claim about when it really happened |
| payment_method | string | no | the builder's own label, free text; never parsed, never contributed |
| signup_friction | enum | no | what the signup path demanded: `agent_native`, `email_only`, `phone_required`, `kyc_required`, `human_only` (addendum #11) |
| source_url | string | no | where the signup happened |
| notes | string | no | anything else worth remembering |

Category vocabulary (v0.2, extensible): `llm`, `agent-framework`,
`image-gen`, `video-gen`, `seo`, `aso`, `analytics`, `hosting`,
`database`, `email`, `social-scheduling`, `design`, `dev-tool`,
`mcp-server`, `api-service`, `streaming`, `music`, `news`, `vpn`,
`storage`, `domain`, `other`.

Returns: `{logged: true, entry_id, trial_warning_date}` — warning
date is `trial_ends` minus 3 days. When the event is contributable
and consent is on, the response also carries
`contribution_suggestion`: the exact delta that would be sent
(addendum #10), so the agent can file it in the same breath.

Validation that rejects the write:
- `trial_started` without `trial_ends`
- `paid_started` or `renewed` without `price`
- `replaced` without `replaced_with`
- `price_changed` without BOTH `price` and `previous_price`
- `occurred_at` without `retroactive: true`
- category not in vocabulary (error suggests closest match)

### 2. `trials_converting_soon` — the headline tool

The tool that earns the shelf. Cheap, single-purpose, safe to call
daily; the agent surfaces the answer unprompted.

| field | type | required | notes |
|---|---|---|---|
| days | int | no | horizon, default 7 |

Returns:

```json
{
  "converting": [
    {
      "tool_name": "midjourney",
      "trial_ends": "2026-08-10",
      "days_left": 3,
      "price_after": {"amount": 30, "currency": "USD", "period": "month"},
      "problem_solved": "app store screenshots"
    }
  ]
}
```

No advice attached. "Cancel it" is the agent's sentence to say, from
its own session knowledge; the tab supplies the deadline and the
price.

### 3. `check_before_signup` — the pre-flight read

Called BEFORE the builder signs up for something.

| field | type | required | notes |
|---|---|---|---|
| tool_name | string | yes | |
| category | string | no | if given, also checks coverage overlap |

Returns:

```json
{
  "seen_before": true,
  "history": [
    {"event": "trial_started", "date": "2026-03-14", "problem_solved": "keyword research"},
    {"event": "canceled", "date": "2026-03-23", "notes": "didn't use it after the audit"}
  ],
  "current_coverage": [
    {"tool_name": "semrush", "category": "seo", "price": {"amount": 0, "note": "free tier"}, "since": "2026-05-01"}
  ],
  "summary": "You trialed this in March and canceled on day 9. You currently cover seo with semrush (free tier).",
  "pooled_signal": null
}
```

`summary` is derived from the fields above it and states facts only —
no risk ratings, no recommendations (changelog #1). `pooled_signal`
stays null until the pooled layer exists AND the builder has
contributed (see layer 3).

### 4. `stack_audit` — the burn report

Called when the builder asks "what am I actually paying for?", or
weekly on the agent's own cadence.

| field | type | required | notes |
|---|---|---|---|
| unused_days | int | no | threshold for the unused list, default 45 |

Returns: `monthly_burn`, `active_paid`, `trials_converting_soon`
(same shape as tool 2), `unused` (last event older than threshold —
see honest limit 2), `category_overlaps` (counts, no "note" opinion
strings), `drift` (recorded `price_changed` events with previous and
new price).

### 5. `whats_current` — the category read

| field | type | required | notes |
|---|---|---|---|
| category | string | yes | controlled vocabulary |

Returns local history for the category; `pooled` is
`{available: false}` until layer 3 ships and the builder has
contributed. Pooled data, when it exists, is retention counts only —
kept rates and sample sizes, no prices, no identities, no advice.

### 6. `contribute_anonymized_delta` — the opt-in feed (layer 3)

Called deliberately, only with consent on record (a
`consent_changed{contribute: true}` event in the log, not revoked
since). Two kinds (addendum #9), deliberately unlinked:

| field | type | required | notes |
|---|---|---|---|
| kind | enum | yes | `"opened"` or `"outcome"` |
| tool_name | string | yes | |
| category | string | yes | |
| week | ISO week | kind=opened | the signup week |
| signup_friction | enum | no, kind=opened only | the door's demands — a signup-time fact about the TOOL, carrying nothing about the builder (addendum #11) |
| outcome | enum | kind=outcome | `kept_past_conversion`, `canceled_pre_conversion`, `canceled_post_conversion`, `replaced` |
| weeks_held | int | kind=outcome | rounded to weeks (changelog #6) |
| replaced_with | string | no | for `replaced` |

Explicitly NOT included: price, payment method, problem text, notes,
any date more precise than the week — and now nothing in the delta
contradicts that sentence.

Returns `{accepted: true, receipt}` — the receipt is an scvd-signed
observation: "an anonymized delta matching this digest was accepted
at this time." Signed custody of the contribution, never a claim
about the tool.

Enforcement, stated precisely: contribute-to-access is enforced by
the AGGREGATION ENDPOINT, which knows who has contributed. The local
server honors the consent event, but a local file is editable by
whoever owns it — the tollbooth that matters lives server-side, and
this spec does not pretend otherwise.

### 7. `set_consent` — the consent switch

`{contribute: bool}` — appends a `consent_changed` event to the log
(changelog #5). Off also disables pooled reads; contribute-to-access
is symmetric. First contribution attempt with no consent event on
record returns an error describing exactly what would be shared.

### 8. `export_tab` — the escape hatch

`{format: "jsonl" | "csv"}` — full export, any time, no charge, no
lock-in. A product that holds your history hostage is the disease;
this is the cure's own hygiene.

## What the tab must hold (schema preview, derived from the tools)

Per entry: `entry_id`, `server_timestamp`, `schema_version`, `event`,
`tool_name`, `category`, `problem_solved`, `price`, `previous_price`,
`trial_ends`, `replaced_with`, `retroactive`, `occurred_at`,
`payment_method`, `source_url`, `notes` — plus `consent_changed`
events carrying `{contribute}`.

Derived at read, never stored: active set, monthly burn, warning
dates, idle-day counts, overlap sets, drift list. (Derived-not-typed
is law here for the same reason it is law on the storefront.)

Schema versioning: additive-only within v0 — a server MUST read
entries with older `schema_version` values forever, and unknown
fields on newer entries are preserved on export, never dropped. Same
discipline as scvd-attestation/v1, and the published schema is the
namespace play: layer 1 IS a spec page in the scvd-attestation
family's style, versioned in its URL.

## What's deliberately NOT in v0.2

1. No usage telemetry. Commitments, not usage. "You used it twice"
   comes from the agent's own session knowledge at audit time.
   `log_usage(tool_name)` is a one-line addition — it stays out until
   the commitment log proves itself.
2. No price monitoring. `price_changed` records what the agent
   learns; nothing crawls pricing pages.
3. No recommendations, local or pooled. Counts and dates. The agent
   editorializes if it likes; the tab never does.

## The pooled layer's debt (written now, while the reasoning is fresh)

The keeper's ruling: layer 3 tracks popularity, not judgment — a
retention count is a fact about what buyers did, not a verdict on a
tool, and vendors answer the bell or they don't. Accepted. Two
things are owed BEFORE it ships, both cheap now and expensive later:

1. A trust-model line on /attestation. Every artifact class declares
   whose word you're taking. The pooled aggregate's honest line is
   new to the taxonomy: "self-reported by contributing agents,
   unverified individually, aggregated and signed by us — the
   signature covers the arithmetic, never the truth of any single
   report." Write it the week layer 3 ships, not after.
2. Gaming, named on the artifact. Contributions are self-reported
   and anonymous, so a vendor can feed its own pool. Sample sizes
   ride every figure, and the aggregate's copy says what would make
   the number lie. Sunlight, not a promise of resistance.

## Kill criteria (written before the build, so stopping is already decided)

- The dogfood test: ONE real swap or cancellation triggered by a
  tab query within 60 days of the backfill session, or park it.
  No re-market, no "give it more time."
- The schema test: if the schema can't cleanly hold the keeper's own
  chaos of trials and tools, it's not ready for anyone's.
- Double down only if `check_before_signup` and
  `trials_converting_soon` get called by the agent UNPROMPTED as
  habit. A builder asking their agent to run an audit once is
  curiosity, not the signal.

## The dogfood protocol

CV runs it against the keeper's actual sprawl:
1. Backfill session — the keeper brain-dumps every tool he can
   remember; CV logs each via `log_tool_event` with
   `retroactive: true` and `occurred_at` as remembered.
2. From then on, every new signup goes through the tab; every
   "should I try X" goes through `check_before_signup` first.
3. CV calls `trials_converting_soon` daily and surfaces hits
   unprompted; `stack_audit` weekly.
4. 30–60 days. The test above decides.

## Honest limits

1. The tab is complete exactly in proportion to how much of the
   builder's commerce runs through the agent. Today that's a sliver;
   that is the option structure, not a flaw. The product completes
   as agent-mediated signup becomes normal.
2. "Unused" means "no logged event in N days," which is commitment
   silence, not usage truth — stated on the audit output itself so
   an idle-looking tool the builder uses by hand daily is never
   reported as fact.
3. The rankings require pooling, pooling requires layer 3, and
   layer 3 is not in this spec's build. Local-only is the whole of
   v0.2's promise.

## The build order

1. This document, keeper-approved.
2. The schema doc (follows mechanically from the tools).
3. The server (mcp-builder session, small build).
4. Dogfood, 30–60 days, kill criteria live from day one.

## The one-liner for the shelf (v0.2 scope only — changelog #7)

Your agent remembers every tool you sign up for and warns you before
a trial converts — so you never pay for software you forgot about.
