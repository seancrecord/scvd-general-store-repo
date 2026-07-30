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

### 1. The ClawHub skill — PUBLISHED 2026-07-27 (keeper's hands)

**Done.** The refund correction, the usefulness-first description, the
twelve situations and the practice counter are live in the registry.

ONE THING TO SANITY-CHECK, because `clawhub publish` reads the local
directory rather than the remote: if the publish ran from a checkout
made **before** the SKILL.md fix landed, it shipped the old text under
a new version number — which is worse than not publishing, because the
changelog then says the false claim was corrected. Open the published
skill and look for "refund is automatic." If it is there, pull and
re-publish as 2.3.1.

Original note follows.

### 1a. The ClawHub skill — what was stale

`registry/clawhub/SKILL.md` was published at 2.2.0 on 2026-07-26.
Since then the source gained: the practice counter, `why_use` on every
listing, the situation index, the corrected refund promise, and the
per-item endpoint paths.

An agent that installed the skill is reading last week's store.

### THE COMMAND, as of 2026-07-30

```bash
git pull && npm run skill:publish -- 2.5.0 "what changed since the last one"
```

Add `--dry-run` on the end to see it without shipping.

That is the whole thing. `scripts/publish-skill.mjs` carries every
gotcha below as a refusal rather than as a paragraph somebody has to
remember at the moment of publishing:

- **It stamps `--source-commit` from HEAD.** The old block had the
  hash typed into this document, which meant a publish could claim a
  commit that did not contain the file being published.
- **It refuses on a dirty tree or an unpushed HEAD.** `clawhub skill
  publish` reads the LOCAL directory. A publish from a checkout that
  does not match the stamped commit ships the wrong bytes under a
  fresh version number — worse than not publishing, because the
  changelog then claims a fix that did not go out.
- **It runs `skill-bundle-freshness` first.** The bundle is
  hand-maintained; a red suite stops the publish.
- **Version and changelog are required and have no defaults**, here
  and in the Actions form. A default version publishes over the wrong
  number; a default changelog describes somebody else's release.
- **On a "version already exists" error it says the previous attempt
  may have worked** — see the gotcha section below, which cost an
  afternoon and three version numbers.

Rule 30 is intact: it publishes only when a human runs it. It is the
same hand, holding a shorter command.

<details><summary>The old form, kept for reference</summary>

```bash
git pull && npx clawhub@latest skill publish registry/clawhub \
  --slug scvd-general-store \
  --name "SCVD General Store" \
  --version 2.4.0 \
  --changelog "..." \
  --source-repo seancrecord/scvd-general-store-repo \
  --source-commit <the commit being published> \
  --source-path registry/clawhub
```

</details>

### From a phone — the Actions button

The keeper is usually not at a desk and the publish is a terminal
command. So it is also a workflow: **Actions → Publish ClawHub skill →
Run workflow**, which takes a version and a changelog, and which a
phone browser can reach.

It runs on `workflow_dispatch` ONLY — never on push, never on a merge,
never on a schedule. Rule 30 is the reason: nothing leaves the store
under our name unless a hand pressed the button. Do not add a trigger
to that file.

It also ends the stale-hash problem, because `--source-commit` is
stamped from the commit being published rather than copied out of this
document. Tick `dry_run` first if you want to see it without shipping.

ONE-TIME SETUP, browser, phone is fine: Settings → Secrets and
variables → Actions → New repository secret, named `CLAWHUB_TOKEN`.
Never paste that token into a chat, including to me.

### Version history, and the gotcha that cost an hour

| Version | Published (UTC) | What changed |
|---|---|---|
| 2.4.0 | 2026-07-28 20:49 | settlement_attestation, graffiti_on_a_train, practice counter |
| 2.4.1 | 2026-07-29 15:41 | (a retry that landed while its own output read as a failure) |
| 2.4.2 | 2026-07-29 ~16:51 | hardcoded item count removed |
| 2.5.0 | ⚑ not yet published | /attestation, /corrections, the reading room; see the changelog line below |

**READY TO PUBLISH AS 2.5.0.** The bundle gained what a machine reader
was missing after 07-30: `/attestation` (what a signature does and does
not prove, per artifact class, including where the trust model is the
weakest available), `/corrections`, and the reading room — the Almanac
and Gazette penny pages, which is the shelf the store's first organic
sale actually came from and which the bundle never mentioned.

Suggested changelog, edit freely:

> Adds /attestation — what each signature covers, who holds the key,
> and what a valid signature does not prove, per artifact class — plus
> /corrections and the reading room (Almanac and Gazette, a penny a
> page, pay more if it was worth more).

**TWO THINGS TO KNOW BEFORE THE NEXT PUBLISH, both learned the slow way
on 2026-07-29.**

1. **"Version X already exists" can mean the previous attempt WORKED.**
   The CLI errors on the version collision, so a run that succeeded and
   was then re-run reads, on screen, as two failures in a row. Check
   `inspect` before assuming nothing landed, and pick the next unused
   number rather than retrying the same one.
2. **`latest` lags the publish.** A fresh version goes through a
   moderation scan before the `latest` tag moves, so `inspect` can show
   the previous version for several minutes after a successful publish.
   The `✔ OK. Published ...` line is the authoritative signal; the tag
   is the trailing one.

The practical rule: **publish once, read the ✔ line, walk away, and
inspect later.** Re-running because the tag has not moved yet is how
three version numbers got burned in one afternoon.

**CORRECTED 2026-07-30, and the correction is the useful part.**

What sat here on 2026-07-29 — that the published listing showed neither
the resource-evidence table nor `settlement_attestation` and
`graffiti_on_a_train` — WAS WRONG. It was wrong because a report was
filed into this document without being checked against the registry.
`clawhub inspect` says v2.4.0 was published 2026-07-28 20:49 UTC,
TWELVE MINUTES after the PR carrying both new items merged. The bundle
contains both, and it has a Resource evidence section.

THE REAL DRIFT, verified rather than reported:

  * The bundle claimed "Twenty-one items". The shelf holds
    twenty-three. A count written into a static document is a lie with
    a timer on it, so the count is now DELETED rather than corrected,
    and a test keeps it deleted.
  * The bundle opens with a passage ("a partner, a friend, a listening
    ear... Hence the prices") that the live `/skill.md` no longer
    carries. That is a VOICE question, and voice is rule 7 — the
    keeper's, not a test's. Flagged, not touched.
  * The bundle names fewer items than the shelf holds. That reads as
    deliberate curation: it is a pitch pointing at menu.json for the
    catalogue, not a catalogue itself.

WHAT THIS MEANS FOR THE NEXT PUBLISH: the published copy was never a
week behind. It was two days behind, on one number. Republishing an
unchanged bundle at a higher version would have shipped the same drift
under a fresher label, which is worse than not publishing at all.

TWO DOCUMENTS MAINTAINED SEPARATELY is the root cause. The live
`/skill.md` generates from `MENU_ITEMS` and cannot drift; this bundle
is written by hand and was checked by nothing. Tests now walk BOTH.

TWO THINGS WERE WRONG with the command that sat here until
2026-07-28, and both would have failed on paste:

1. The line continuations were literal `\\` (two backslashes). In a
   shell that is an escaped backslash, not a continuation, so the
   command ended at the first line. This came from writing a shell
   command inside an indented markdown block and escaping it twice.
   The fenced block above is not indented and not escaped, so what
   you read is what the shell gets.
2. `clawhub publish` is a LEGACY ALIAS as of CLI v0.23.1. The current
   form is `clawhub skill publish <path>`. The alias still works
   today; aliases stop working eventually.

Verified against `npx clawhub@latest skill publish --help` on
2026-07-28, CLI v0.23.1, rather than remembered.

The three `--source-*` flags are new here and optional. They tie the
published skill to the exact commit it was built from, which is the
same argument the store makes about everything else it ships: a
claim somebody else can check beats a claim they have to take.

Add `--dry-run` to see what would be published without publishing.

SKILL.md was brought current 2026-07-28 with both new items in the
situation index and their query parameters in the parameter line. The
2.3.0 publish never went out, so this bump carries everything since
2.2.0 rather than only the new shelf.

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
