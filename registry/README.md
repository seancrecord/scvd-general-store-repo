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

To publish (after reading it end to end):

```bash
npx clawhub login             # GitHub account
npx clawhub skill publish ./registry/clawhub \
  --slug scvd-general-store \
  --name "Sean-Claude Van Damme's General Store" \
  --version 1.0.0 \
  --changelog "Opening day."
```

Drift note: the bundle is a static file; prices are deliberately NOT
enumerated in it — it points agents at /menu.json as the source of
truth, so the skill stays honest as shelves change. If the store's
endpoints or promises change, republish a new version.

## awesome-x402 (`awesome-x402-submission.md`)

The one-line entry, the PR title, and the filled template, with a
claims audit — each credential was verified true on 2026-07-22, and
"on x402scan" is deliberately not claimed until the keeper sees it
there personally.

## On hold

Agentic.market listing request waits until MCP and Bazaar channels are
observed in the ledger (per the Phase 2 plan).
