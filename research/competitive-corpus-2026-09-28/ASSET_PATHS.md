# Paths from the existing assets to useful work

September 28, 2026, America/New_York. Some captures cross midnight UTC;
[asset-sources.json](asset-sources.json) retains their exact times, hashes and
observed links. This pass checks public paths, not answer-engine rankings.

## Existing paths confirmed

| Asset | What already works | Focused improvement |
| --- | --- | --- |
| [AURa article](https://hackernoon.com/ai-agents-are-customers-now-aura-is-how-i-take-notes-on-how-they-shop) | Links to the store, public repository, x402-verify and x402-sign; these are real distribution assets | The repository now points directly to job-specific examples. No article rewrite needed to establish a path |
| [Cold-email audit article](https://hackernoon.com/an-autonomous-agent-cold-emailed-me-a-free-audit-at-1245-am) | Links back to the store; readers have a route to SCVD | Optional contextual link to the existing corpus for the historical-observation side of the story; proposed wording below |
| [39-findings article](https://hackernoon.com/i-told-an-ai-agent-to-rob-my-store-it-found-39-ways-to-do-it) | Links to the original buyer audit log and individual findings | Preserve those precise citations; don't replace them with a generic homepage CTA |
| [Hugging Face dataset](https://huggingface.co/datasets/keeper-scvd/x402-endpoint-readiness) | Public source, key and DOI URLs; configured observations/rounds tables | Prepared card adds the reproduction notebook, listing adapter and an explicit date-semantics correction |
| Existing npm packages and language guides | Prior portfolio audit confirms package/repository links and existing JavaScript/Python/Go guides | Root and examples READMEs connect each job to its existing guide, artifact and scope |
| Directories and protocol listings | Existing entries/relationships tracked in KEEPER_LIST | Prepare the same listing record for an actual partner decision; no additional submissions or adoption claim |

Only relevant anchor links were extracted from article HTML. Absence of a
particular anchor is not a claim that the article lacks all mention of a topic.
Self-authored articles remain first-party explanations, even when hosted by a
third party; do not count them as independent endorsements.

## Changes prepared in this branch

- Root README links to the existing examples directory by job.
- Examples README joins the three preflight language guides, verifier, corpus
  client, notebook, existing weekly brief and new local listing example.
- Notebook now executes against the full public chain. It delegates canonical
  verification to the existing library rather than reconstructing signed JSON
  with a different language's number formatting.
- The HF publisher appends the reproduction links and correction when it next
  refreshes the viewer. [Exact card preview](HUGGINGFACE_CARD_PREVIEW.md) is
  generated from the captured current card, preserving unrelated prose.
- The comparison and measured findings supply the existing brief/partner
  workflow. There is no new landing-page tree or publication schedule.

Published package content is pinned by `registry/npm-content.json`. Editing a
package README at the same version would break that release contract. These
changes improve central paths; they do not silently mutate an existing npm
release. Package-specific additions should ride the next actual release, with
its source/version checks.

## One optional article edit, ready for the keeper's pen

For the cold-email audit story, beside the paragraph comparing the instruments:

> The dated endpoint observations are in the [public corpus](https://scvd.store/corpus),
> with the signed originals and a notebook for reproducing the counts.

This points into an existing maintained surface. It does not rewrite the story
or imply a new partnership. Not applied in HackerNoon.

## Release and evidence boundary

The local work and preview are complete. The code/docs still need the normal
PR/CI/merge path. After release, run the existing corpus publication workflow
with `hf_only` and `refresh_viewer`, then read back the public card and both
viewer configurations. Check a known older host date against its original;
successful loading alone cannot validate its meaning. Confirm the original
numbered documents remain byte-identical.

The existing hand-check plan and October 15 checkpoint remain the way to
observe answer-engine discovery. This work does not run another engine cohort,
claim citation gains, create an automation or establish partner use.
