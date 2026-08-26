# DISTRIBUTION.md — the agent-native channels, and exactly how to enter each

Written 2026-08-21, the night the strategy was ruled: agents don't
browse, they inherit. An agent reaches this store through four doors —
its config (MCP connectors, skills), its model's memory (AEO, shipped),
a live index it queries mid-task, or a link inside an artifact already
in circulation (the evidence loop, owned by the other session's
Passport work). This file is the submission checklist for the first
and third doors. Rule 30 applies throughout: every actual send,
submission, or account action is the keeper's hand; this file makes
each one a five-minute job.

## 1. The official MCP Registry — ALREADY LISTED, republish waiting on the keeper

The store has been on registry.modelcontextprotocol.io since
2026-07-30 — under the pre-reversal description ("a general store for
AI agents. Pay in USDC via x402"), which every aggregator that reads
the registry (PulseMCP among them) carries forward today. The
republish manifest has been ready at the repo root since 2026-08-11
(server.json, version 0.2.0, trust-layer description inside the
registry's 100-char cap, domain namespace store.scvd).

Keeper's steps (DNS auth on the store.scvd namespace):

    mcp-publisher login dns    # per the manifest's namespace; quickstart at modelcontextprotocol.io/registry
    mcp-publisher publish

This single action updates what PulseMCP and every registry reader
says about the store. Highest yield-per-minute item in this file.

(Recorded for honesty: this session briefly overwrote server.json
with a fresh GitHub-namespace manifest on 2026-08-21 before finding
the existing one; reverted same minute. The 2026-08-11 manifest is
authoritative — newer schema, tested by test/agent-plugins.spec.ts,
and already namespaced to the domain.)

## 2. Claude Connectors Directory (claude.com/docs/connectors/building/submission)

Status of the review gates, checked 2026-08-21:
- Tool annotations (read-only/destructive hints on every tool): ALREADY
  MET — every generated buy tool carries purchaseAnnotations, every
  free tool is hand-annotated, and the idempotency reasoning is
  documented in the code.
- Public privacy policy: MET as of tonight — /privacy is a real room
  (was a redirect to trust.json, which reviewers read as absence).
- Remote server over streamable HTTP: MET (/mcp, stateless).

Keeper's steps: claude.ai → your organization's settings → connector
submission portal → submit https://scvd.store/mcp with the /privacy
URL. Track in the submissions dashboard; escalations go to
mcp-review@anthropic.com. Community-reported review time: two weeks
to several months — submit early, it queues.

## 3. The Agent Skills ecosystem

- `npx skills add seancrecord/scvd-general-store-repo` WORKS as of
  tonight (the frontmatter quoting fix — the CLI silently skipped us
  before). Nothing to submit; the repo is the listing.
- skills.sh indexes GitHub repos with skills; check
  https://skills.sh/seancrecord/scvd-general-store-repo renders after
  the fix deploys. Aggregators (explainx.ai, Tessl) scrape the same
  spec — no action, they follow usage.
- ClawHub: published (3.4.0 live; 3.5.0 pending the next
  `npm run skill:publish -- 3.5.0 "<changelog>"` after this merges).

## 4. x402 ecosystem indexes

- x402.org ecosystem page: check whether listings go via PR to the
  coinbase/x402 repo's ecosystem data (the site is in that repo) —
  draft PR adds scvd.store under services/tooling. Keeper approves the
  PR text; I can prepare the branch on request.
- x402scan / x402 Atlas / agent402.tools: each has its own
  intake (agent402 already carries our volume claims via the census's
  source). Submit the store's discovery document
  (https://scvd.store/.well-known/x402.json) where a form exists.
- Solana Agent Registry (solana.com/agent-registry): investigate
  listing criteria — it bills itself "the trust layer for autonomous
  agents," which is our positioning at platform scale; being listed
  IN it beats arguing with it.

## 4b. npm — the official CLI, BUILT AND WAITING ON THE KEEPER'S TOKEN

Added 2026-08-26. A readiness audit scored the store partial on "CLI
tool available": it found `scvd-tab` at /developers and correctly read
it as a useful package that happens to be ours rather than as a
command line for THIS store. `cli/` is now that command line — one
zero-dependency file, MIT, tested (`npm run cli:test`, 13 cases
against a local stub server so nothing in CI touches production).

It wraps only free instruments, holds no key, and cannot sign a
payment. That is a design constraint rather than a first version: the
store never asks anyone for credentials, and a CLI is the easiest
place in the world to break that quietly.

Keeper's steps (rule 30 — the publish is his hand, not mine):

    cd cli && npm publish --access public

Everything that names the package already points at `npm i -g scvd`:
/developers (HTML, JSON and markdown), /llms.txt, and the RFC 9727
catalog at /.well-known/api-catalog. Those are honest as
INSTRUCTIONS the day the publish runs and are a forward reference
until then — the same posture as the MCP Registry republish above,
and worth closing quickly for the same reason.

## 5. Other client directories (lower priority, same shape)

- Cursor: directory driven by docs.cursor.com MCP listings; community
  cursor.directory accepts submissions.
- Perplexity connectors, ChatGPT apps: developer-program submissions;
  both want the privacy policy and a remote MCP endpoint — the same
  two gates as Claude's, both now met.

## What was verified tonight

- /mcp speaks streamable HTTP (spec 2025-06-18), stateless.
- All tools annotated; no secrets in any example.
- /privacy live as a room; /privacy-policy aliases it.
- The skills CLI finds and installs the skill from this repo.
