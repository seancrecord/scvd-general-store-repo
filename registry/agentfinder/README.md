# GitHub Agent Finder (keeper reviews, keeper submits)

Prepared 2026-09-10. Rule 30 applies: these are drafts, and the PR is
the keeper's press.

## What it is

Agent finder is the discovery service inside GitHub Copilot that
searches a catalog at runtime for the MCP server, skill or plugin a
task needs, instead of loading every tool up front. It implements the
open Agentic Resource Discovery (ARD) specification, the same one the
store already speaks at `/.well-known/ard.json`, and its public search
endpoint is `https://agentfinder.github.com/api/v1/search`. The
community catalog behind it is the repository
`github/agentfinder-catalog`: one JSON file per augment under
`catalog/<github-account>/`, merged by pull request, regenerated into
a root `ai-catalog.json` that the service ingests.

## The press was already pressed (found 2026-09-11)

CV opened [github/agentfinder-catalog#34](https://github.com/github/agentfinder-catalog/pull/34)
on 2026-09-06 ("Add scvd-general-store", one commit, one skill entry:
the store skill). It was open with no review on 2026-09-11. Two
things about it worth the keeper's eye:

- Its description quotes the practice counter at "from $0.004"; the
  SKILL.md it points at, and the store, say from $0.001. One PR
  description in one place, so a reviewer who reads both sees a
  store disagreeing with itself. A one-line edit to the PR body.
- It carries one entry. The other two drafted here — the
  `x402-before-you-pay` skill and the MCP server — are not in it.
  Either push them onto the same branch before it merges (one review
  instead of two) or open a second PR after; the files in
  `catalog/seancrecord/` are the ones to copy either way.

The replacement — the corrected file, the two missing entries, the
validation commands, a new title and a body a reviewer can approve
from — is `PR_BODY.md` beside this file, written for CV to paste.

## Hugging Face (2026-09-11)

CV reports a submission there; the link the keeper has is the Hub's
token settings page, which means a push is planned rather than done.
What the index actually takes, read off hf-discover's own README:

- **Skills**: the curated `huggingface/skills` GitHub repository,
  Hugging Face's own set (train, evaluate, datasets). A store skill
  does not belong in it and a PR there would be declined on scope.
- **MCP servers**: a Space tagged `mcp-server`. hf-discover reads the
  Space's metadata and writes an MCP-registry-style descriptor whose
  `remotes[]` is the Space's OWN Gradio streamable-HTTP endpoint. It
  does not take a remote URL, so a Space cannot simply point at
  `https://scvd.store/mcp`.

So the honest shape is a Space that runs a small Gradio app with
`mcp_server=True` exposing the store's FREE doors as read-only tools
(preflight, before-you-pay, conformance, verify, the corpus per host),
each one an HTTPS call to scvd.store — the "SCVD x402 Verifier" the
keeper's 2026-09-03 memo already describes for the ChatGPT listing.
No `buy_*` tools, so no payment ever transits Hugging Face and no
secret lives in the Space: the free doors need no key. The token for
the push: fine-grained, write on that one Space only, with an expiry;
never the account-wide token, and nothing from this repo's secrets.
Tag the Space `mcp-server`, name it `scvd-x402-verifier`, and give
its README the sixty words and the same money paragraph as the
catalog PR. When it is up, an hf-discover search for `scvd` is the
read to file beside the 2026-09-06 zero.

## Where the store stands (read 2026-09-10)

- **Not listed.** The 2026-09-06 search for `scvd.store`
  (`docs/ard-discovery/2026-09-06/ard-github-scvd-store.json`)
  returned Scavio, scVelo and two unrelated skills; nothing of ours.
  The endpoint refuses this build's egress, so the 09-06 read is the
  last one on file.
- **The catalog has three kinds of entry and we qualify for two by
  the file already on disk.** Of 2,074 entries in the generated
  catalog: 1,678 skills (`application/ai-skill`, each a `SKILL.md` on
  GitHub), 177 Copilot plugins (`application/vnd.github.copilot-plugin`,
  each a `.claude-plugin/plugin.json`), and 219 MCP servers
  (`application/mcp-server+json`). Every one of the 219 MCP rows came
  from GitHub's own MCP feed (`api.mcp.github.com`), not from a
  contributor file, and that feed does carry DNS-namespaced servers
  (`ai.bittlebits/bittlebits` is there) but not `store.scvd/*`. Why
  the feed skips us cannot be read from this sandbox; its API is also
  refused here. The PR route below does not depend on the answer.
- **The manifests it reads are the ones we keep.** The store's
  `server.json` is on the official registry at 0.2.3 with the
  observatory sentence, marked latest. The tab is on the registry at
  0.5.0 against 0.11.1 on disk and on npm, which is why the tab has no
  entry here yet: the entry would name a version the registry does not
  hold. It joins the day the tab's republish button is pressed.

## The entries (`catalog/seancrecord/`)

| file | media type | points at |
|---|---|---|
| `scvd-general-store.json` | `application/ai-skill` | `skills/scvd-general-store/SKILL.md` on `main` |
| `x402-before-you-pay.json` | `application/ai-skill` | `examples/claude-code/SKILL.md` on `main` |
| `scvd-general-store-mcp.json` | `application/mcp-server+json` | the registry's version URL for `store.scvd/general-store` at `server.json`'s version |

`npm run listings:test` runs `scripts/agentfinder-check.test.mjs`,
which ports the catalog's own validator (their
`scripts/generate_ai_catalog.py`, as read 2026-09-10) and refuses
drift: the MCP entry must repeat `server.json`'s version, title and
description; each skill entry must point at a `SKILL.md` that exists
here, under the name its frontmatter declares. The three drafts also
pass the upstream validator itself, run offline on 2026-09-10.

Two choices worth knowing about before pressing:

- The MCP entry's identifier is
  `urn:ai:registry.modelcontextprotocol.io:store.scvd:general-store`,
  the shape GitHub's feed produces, rather than the
  `urn:ai:github.com:...` shape the contributing guide shows for
  skills. The generator dedupes by identifier and keeps the
  contributor file, so if the feed ever picks the store up, the
  catalog lists it once. A reviewer may ask for the other shape;
  either passes validation.
- A contributor-managed MCP entry has no precedent in the catalog
  (all 219 are feed rows). If review declines it on that ground, the
  two skill entries stand on their own and are the documented path.

## The press

```bash
gh repo fork github/agentfinder-catalog --clone
cd agentfinder-catalog
mkdir -p catalog/seancrecord
cp <this repo>/registry/agentfinder/catalog/seancrecord/*.json catalog/seancrecord/
python3 -m json.tool catalog/seancrecord/scvd-general-store.json
python3 scripts/generate_ai_catalog.py          # needs network: it reads GitHub's MCP feed
python3 scripts/generate_ai_catalog.py --check
git checkout -b add-scvd-general-store
git add catalog/ ai-catalog.json
git commit -m "Add scvd-general-store, x402-before-you-pay and the SCVD MCP server to catalog"
git push origin add-scvd-general-store
gh pr create --title "Add SCVD General Store" --body "Adds the SCVD General Store skill, the x402-before-you-pay skill and the store's MCP server to the agentfinder catalog."
```

Their guide says the fork workflow validates but cannot push the
regenerated `ai-catalog.json`; a follow-up PR from their side
regenerates it after merge, so a stale `ai-catalog.json` in the PR is
theirs to fix, not a refusal.

After merge: search `https://agentfinder.github.com/api/v1/search`
for `scvd.store` (the 09-06 request body is the recorded one) and file
the result beside the 09-06 read.

## Not prepared, on purpose

A Copilot plugin entry would need a `.claude-plugin/plugin.json` in
this repository, which does not exist; the root `plugin.json` is the
agent-plugins.org manifest, a different schema. Whether the store
wants a third listing of the same door is the keeper's call
(`KEEPER_LIST.md`).
