# The registry drawer

Submission artifacts for the store's registry presence. House rule 30
applies to everything in here: **publishing is a queue — the keeper
reviews, the keeper submits.** Agents draft; nothing in this folder
goes out on its own.

## ClawHub (`clawhub/`)

The skill bundle, per the ClawHub skill format (SKILL.md with YAML
frontmatter; metadata extracted at publish; security analysis checks
declarations against behavior). Ours declares no required env vars, no
binaries, no install specs — the skill is instructions for calling
public HTTPS endpoints, nothing clever, which is both the honest shape
and the shape that scans clean.

To publish (after reading the bundle end to end):

```bash
npx clawhub@latest login      # GitHub account, once per machine
npm run skill:publish -- <version> "<what changed>"
```

**Do not run `clawhub skill publish` by hand.** The raw command lived
here until 2026-08-10, spelling out a `--name` and a `--version` that
had both been wrong for months — the display name is now "SCVD General
Store" per the naming law, and the versions are in the 2.x series. Every
argument that block asked you to type is one the script derives:
`scripts/publish-skill.mjs` stamps `--source-commit` from HEAD, reads
the version from `SKILL_VERSION` in `src/store/spec.ts`, and refuses on
a dirty tree, an unpushed HEAD, a bundle byte-identical to the last
release, or a failing freshness suite. A hand-typed publish gets none of
that, and a copied command block is exactly the stale-value defect the
script exists to prevent.

The version argument is not a free choice: it must equal `SKILL_VERSION`,
so bump that constant first and deploy, or the publish is refused. Add
`--dry-run` to preview. `registry/clawhub/published.json` records what
went out and must be committed after — a stale record disarms the guard
that reads its hash.

From a phone: **Actions → Publish ClawHub skill → Run workflow**. Same
refusals, on a clean runner, `workflow_dispatch` only.

Drift note: the bundle is a static file; prices are deliberately NOT
enumerated in it — it points agents at /menu.json as the source of
truth, so the skill stays honest as shelves change. If the store's
endpoints or promises change, republish a new version.

## awesome-x402 (`awesome-x402-submission.md`)

The one-line entry, the PR title, and the filled template, with a
claims audit — each credential was verified true on 2026-07-22, and
"on x402scan" is deliberately not claimed until the keeper sees it — as of 2026-07-27 he reports he has, and the README now carries an "On other people's records" section naming x402scan, the Bazaar (via agentic.market, confirmed by screenshot) and x402scout. The deep link landed 2026-07-27: https://www.x402scan.com/server/9b04e1cc-ff46-4377-a533-fe7981aa1597 — linking the index was true, linking our page there is the actual evidence anchor. The rule that produced this caution stands
there personally.

## On hold

Agentic.market listing request waits until MCP and Bazaar channels are
observed in the ledger (per the Phase 2 plan).
