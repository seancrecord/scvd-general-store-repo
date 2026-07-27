# REPUBLISH.md — what carries our words somewhere else

Most of the store updates itself: change a line in `src/store/`, merge,
and every surface that reads it is current within a deploy. This file
is about the surfaces that **do not** — copies of our description
sitting in other people's systems, frozen at whatever we said the day
we submitted.

They go stale silently. Nothing errors, nothing 404s; the store just
starts being described to strangers by a version of itself that no
longer exists.

Filed 2026-07-27, after a week in which the store's positioning,
refund policy, item schemas and endpoint list all changed.
⚑ marks keeper hands.

## Updates itself — nothing to do, listed so nobody re-does it

Everything below derives from `src/store/` at request time. One merge
and it is live everywhere.

- `/llms.txt`, `/menu.json`, `/menu/{item_id}`, `/what`, `/try`
- `/openapi.json`, `/.well-known/x402`, `/.well-known/x402.json`
- `/skill.md` (the served copy — see ClawHub below for the published one)
- Every 402 challenge body, and the MCP tool specs at `/mcp`
- The storefront meta tags and JSON-LD

The x402 indexers re-crawl these on their own schedules (x402scout
every 6h, nohumans every 15min, agent-tools every 6h), so a copy change
propagates without anyone filing anything.

## ⚑ Carries a frozen copy — needs a human to push it

### 1. The ClawHub skill — STALE, and the one that matters

`registry/clawhub/SKILL.md` was published at 2.2.0 on 2026-07-26.
Since then the source gained: the practice counter, `why_use` on every
listing, the situation index, the corrected refund promise, and the
per-item endpoint paths.

An agent that installed the skill is reading last week's store.

    cd registry/clawhub && npx clawhub@latest publish . \\
      --slug scvd-general-store \\
      --name "SCVD General Store" \\
      --version 2.3.0 \\
      --changelog "Practice counter; why_use and the situation index; \\
    per-item endpoints; refund wording corrected to what the code does"

**Before publishing**, reconcile `registry/clawhub/SKILL.md` against
the live `/skill.md` — the served version is generated and current;
the published one is a file, and files rot.

### 2. The awesome-x402 entry — check the description

Submitted as xpaysh #1024. If it has not merged, the description in
that PR can still be edited, and it should be: it was written before
the usefulness-first pass. If it has merged, leave it; a follow-up PR
to reword our own line is not worth a maintainer's time.

### 3. Directory listings — each holds a description we typed once

- **x402scout** — listed, trust check pending. Description field
  written 2026-07-27, already usefulness-first, no action.
- **agentic.market** — reads the Bazaar; it will re-read on its own.
  ⚑ One thing to check on a visit: whether the store description it
  shows is still an item's (it used to show a lucky, and the fix for
  that shipped 2026-07-27 — this is the surface that confirms it took).
- **x402-list, agent-tools.cloud** — auto-import; if either shows a
  claimed-listing edit form, the description there is ours to keep
  current.
- **nohumans.directory** — the claim token from submission is the only
  edit key and it is shown once. If it was saved, the listing is
  editable; if not, it is frozen forever, which is worth knowing
  before writing anything anywhere that only shows a token once.

### 4. The Bazaar declaration — no action, but know how it works

Bazaar catalogs what settles, so its copy of our metadata refreshes on
purchases, not on deploys. With no organic sales, what is registered
is what the house run declared on 07-24. New copy reaches it when
money next moves, and not before.

## The standing rule

**Any surface that holds a copy of our words gets listed here the day
it is created.** The cost of forgetting is not an error message, it is
a stranger reading a description of a store that no longer exists —
and by the time anyone notices, it has been wrong for a month.

## Copy that changed this week, for whoever writes the next changelog

- **Refund promise** — "refund is automatic" is gone from every
  surface; the code creates a pending refund the keeper pays by hand,
  and the copy now says exactly that (house rule 10).
- **Positioning** — the meta description, og description, JSON-LD
  organization description and the page title now lead with what an
  agent gets, not with who we are. Novelty is still everywhere; it
  stopped going first where nobody has met us yet.
- **`why_use`** — ten items carry a one-line capability statement in
  the listing spec; eleven state none, on purpose.
- **The situation index** — twelve situations, each with item ids and
  a runnable example, on llms.txt, menu.json, `.well-known` and
  `/what`.
- **Endpoints** — the spec lists one path per item instead of a
  template, and every free shelf declares `security: []`.
- **The store's own description** — `STORE_METADATA.description`, so
  an importer stops describing us as whichever item it reached first.
