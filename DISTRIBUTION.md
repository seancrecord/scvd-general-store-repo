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

## 1. The official MCP Registry — PUBLISHED THREE TIMES, ONE POSITIONING BEHIND

**Corrected 2026-08-29.** The paragraph that stood here said the
republish was still waiting on the keeper and that the live entry
carried the pre-reversal description. Both were true on 2026-08-21 and
neither is true now; a read of the registry's own API on 2026-08-29
found three publishes under `store.scvd/general-store`:

| version | published | description |
|---|---|---|
| 0.1.0 | 2026-07-30 | "A general store for AI agents. Pay in USDC via x402…" |
| 0.2.0 | 2026-08-11 | "The trust layer of the x402 economy…" |
| 0.2.1 | 2026-08-21 | "The trust layer of the x402 economy…" *(isLatest)* |

So the keeper did press it, twice. The pre-reversal listing is not
what the ecosystem reads — it is three versions down the list, and
nothing points at it.

**The real gap is smaller and easier to miss.** `server.json` was
edited after the 0.2.1 publish to the current sentence — "Evidence
observatory for agentic commerce: free x402 conformance checks,
corpus, agent store" — without a version bump. A PUBLISHED VERSION IS
IMMUTABLE, exactly as npm's are (§4b learned the same thing about
READMEs the expensive way), so that edit changed nothing anywhere. The
registry, PulseMCP, and every aggregator downstream still say "trust
layer of the x402 economy": one positioning behind, and invisible from
inside the repo because the file on disk looks right.

`server.json` is bumped to **0.2.2** and carries the observatory
sentence, 93 characters against the registry's 100-char cap and held
there by `test/first-pass-positioning.spec.ts`.

Keeper's steps — a button now, not a terminal, and one secret first:

    1. The ed25519 private key whose public half is in the store.scvd
       TXT record → Repo → Settings → Secrets and variables → Actions →
       New repository secret, named MCP_REGISTRY_KEY.
    2. Actions tab → "Publish MCP registry listing" → Run workflow.
       version: the number in server.json · dry_run: checked (it
       validates the manifest against the registry's own schema and
       proves the version is not already taken), then again unchecked.

`.github/workflows/publish-mcp-registry.yml` is workflow_dispatch only
(rule 30), refuses a version that disagrees with server.json, refuses a
version the registry already holds — because that publish would be a
silent no-op — and reads the listing back afterwards to prove the live
entry now repeats what we publish. The install one-liner and the
`login dns --domain scvd.store --private-key <key>` form were read off
`mcp-publisher --help` itself rather than off documentation, because a
button that fails when somebody presses it is worse than no button.

From a laptop it is still two commands, and they still work:

    mcp-publisher login dns --domain scvd.store --private-key <key>
    mcp-publisher publish

**And it is now watched.** `npm run doors:check` compares the
registry's `isLatest` entry against `server.json` every week and goes
red on a mismatch, so the next time the file and the listing part
company nobody has to notice by hand. The first cut of that check read
the OLDEST search hit and reported the 0.1.0 listing as current, which
is how this section came to be wrong in the first place — the reader
now selects the row the registry itself marks `isLatest`, with a test.

(Recorded for honesty, from the older note: this session briefly
overwrote server.json with a fresh GitHub-namespace manifest on
2026-08-21 before finding the existing one; reverted same minute. The
domain-namespaced manifest is authoritative.)

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

Keeper's steps (rule 30 — the publish is his hand, not mine). One-time
setup, then a button:

    1. npmjs.com → Access Tokens → Generate New Token → Granular Access
       Token, read+write on this account's packages.
    2. Repo → Settings → Secrets and variables → Actions → New
       repository secret, named NPM_TOKEN.
    3. Actions tab → "Publish npm package" → Run workflow.
       package: scvd-cli · version: the number in cli/package.json ·
       dry_run: checked (look at the tarball listing in the log), then
       run it again unchecked.

DONE 2026-08-28: `scvd-cli@0.1.0` is on the registry, published from CI
with provenance. Two things were learned at the counter and are worth
keeping:

  * npm refuses the bare name `scvd` permanently — its typosquat guard
    calls it too close to scss/save/send. The package is `scvd-cli`;
    the installed command is still `scvd`, because npm polices package
    names and not bin names.
  * A first publish cannot ship an accurate README. npm renders each
    version's README from inside that version's own tarball, and
    versions are immutable — so 0.1.0's page says "not on npm yet"
    forever, because that was true in the tree that produced it. 0.1.1
    is the correction, and cli/README.md no longer asserts a
    publication state at all. Publish-state lives in
    src/store/cli.ts, which every served surface reads.

The workflow is `.github/workflows/publish-npm.yml`: workflow_dispatch
only, refuses if the typed version disagrees with package.json or is
already on the registry, and publishes with `--provenance` so the
tarball carries a signed attestation binding it to this repo and
commit. It covers all four packages here — scvd-cli, scvd-tab, x402-verify,
x402-sign — so the next publish of any of them is the same button.
`cd cli && npm publish --access public` from a laptop still works and
produces no provenance; prefer the button.

Everything that names the package already points at `npm i -g scvd-cli`
(npm refused the bare name `scvd` — typosquat guard, 2026-08-28 — so
the package is `scvd-cli` and the command stays `scvd`):
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

## 6. What to say about the cards and the browser door (2026-08-28)

Two capabilities shipped 2026-08-27 that every future submission
will be tempted to overclaim. The honest lines, once, so a listing
never has to invent them:

**Evidence cards (MCP Apps).** SAY: the two free instruments carry
`_meta.ui.resourceUri`; a host supporting the MCP Apps extension
renders the reading as a card, and a host without it gets the same
JSON it always did. DO NOT SAY: "renders in Claude/ChatGPT/etc." as
a flat claim. Whether a card renders is the HOST's behaviour, we do
not control it, and the current observation is mixed — local stdio
renders, the remote-connector path does not, in the hosts tested.
`https://scvd.store/mcp.md` carries that as a dated table; link it
instead of asserting. A directory that wants a yes/no gets: the
server implements the extension, correctly, and the wire is
verifiable in one `resources/list` call.

**WebMCP.** SAY: the storefront registers the free read-only
instruments on `document.modelContext`, so a browser-resident agent
finds them by arriving. Chrome origin-trial token is registered
through 2026-11-17. DO NOT SAY: any adoption or usage figure — the
channel is instrumented (`?src=webmcp` in the ledger) and has no
history worth quoting yet. "The surface exists" is the whole claim
until the numbers do.

**Neither is a payment surface, and that is the point worth
submitting.** No `buy_*` tool carries ui metadata; nothing that
writes or spends reaches the browser surface; both facts are held by
tests rather than by intention. For directories that ask about agent
safety, this is the strongest true sentence we have.

## What was verified tonight

- /mcp speaks streamable HTTP (spec 2025-06-18), stateless.
- All tools annotated; no secrets in any example.
- /privacy live as a room; /privacy-policy aliases it.
- The skills CLI finds and installs the skill from this repo.
- (2026-08-28) /mcp.md serves the door-chooser with the rendering
  gap dated; README, /developers, /what's FAQ and the agentic-market
  submission draft all carry the two new doors. The submission
  draft's "settles before it mints" line — stale since 2026-08-10 —
  was corrected the same day it was found.
