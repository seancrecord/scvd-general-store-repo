# Personal-agent shopping release — October 12, 2026

Authorized by the keeper's “okay lets do it” following review of the draft and
distribution plan. Work runs on `codex/personal-agent-shopper`, based on current
main in an isolated worktree; unrelated workspace changes are excluded.

## Public package

- Storefront: `https://scvd.store/#buy-with-agent` — selectable paste prompt,
  free reading/quotes, per-purchase decision, compatible-wallet requirement.
- Canonical artifact: `https://scvd.store/.well-known/agent-skills/scvd-personal-shopper/SKILL.md`.
- Canonical reference: sibling `references/wallet.md`; same bytes as installation.
- GitHub/Skills CLI: `npx skills add seancrecord/scvd-general-store-repo --skill scvd-personal-shopper`.
- Portable plugin wrappers: 0.2.7, existing directory discovery.
- ClawHub: separate `scvd-personal-shopper` 1.0.0; no overwrite of the existing general-store skill.

The [primary-source read](../../docs/SPEC_READS.md#2026-10-12--personal-agent-shopping-distribution)
records scope and limits. Coinbase is a documented wallet option, not a newly
qualified host integration. The mandate remains optional public evidence of a
claim; wallet/client controls enforce spending limits.

## Validation

The new two-test public-handoff spec failed before implementation: the shopper
was missing from discovery and the storefront prompt did not exist. After the
change, public artifact/reference byte parity, digest, unknown-reference refusal
and storefront/guide links pass. Focused regression group: 29 tests across five
files. Typecheck and production bundle checks pass. Skill format and reference
graph checks pass; Skills CLI finds the named skill. Five portable manifest
checks pass. ClawHub dry-run accepts the two-file package at version 1.0.0.
Full-suite CI, deployment and public readback are release gates, tracked below.

## Purchase qualification

No wallet was installed, funded or used. No payment was signed. A future live
purchase needs a specific item, network, wallet and amount decision. Test an
already funded wallet first, then new-wallet onboarding separately. Record
approval, selected terms, actual settlement, delivered artifact and verification.
Do not count controlled purchases as organic demand or advertise native host
support before observing it.

## Release outcomes

[PR #1008](https://github.com/seancrecord/scvd-general-store-repo/pull/1008) contains the release. The Skills CLI also installed the complete two-file skill in a disposable directory with telemetry disabled. The rendered handoff was inspected in the browser; its label, selectable prompt and install disclosure are present. A top-of-page link points to the handoff.

Automatic approval review rejected enabling auto-merge because it would merge and deploy production changes and interpreted the keeper's approval as branch/PR authorization only. No retry or bypass was attempted. Explicit keeper approval for merge/deploy is required before that action. ClawHub publication waits for the canonical public URLs to exist. CI status and publication readback remain pending.

## Agent-entry extension

The keeper approved the follow-through on October 12: Hermes website discovery,
task-based front-page actions, host recipes, categorized distribution and a
no-spend rehearsal. Details and limits: [agent entry](../../docs/AGENT_ENTRY_2026-10.md).

Validation: the new discovery spec failed 3/4 before implementation (missing
index, cross-origin reference and entry links); all four pass afterward. The
navigation regression failed against the prior page and passes with the new
links. The prior full-guide baseline passed before discovery-link snapshots
were updated. Final affected suite: 79 tests across nine files; eight discovery
and manifest Node tests; TypeScript check; both Worker bundles and MPP build
check. The browser rendered the new first-screen actions and connection link.

A real Skills CLI website install from a disposable HTTP fixture containing
six artifacts fetched from the local HTTPS Worker installed the shopper and
both references. Installed bytes matched the source for every shopper file;
telemetry was disabled. This proves installer resolution against Worker-served
artifacts, not a live production install or a Hermes payment.

ClawHub 0.23.3 dry-run: would-publish, scvd-personal-shopper 1.0.0, three files,
fingerprint f856c1a1ec0ac3852d03f5f37983fd08d132740bc7102272dec33d1c25c0ef09.
Categories finance/integrations; topics x402/shopping/usdc/receipts/spend-limits.
No wallet funding, signing or purchase was performed. The prior PR head passed
all four CI shards and check; this extension requires a fresh CI run. Production
readback and public registry inspection remain release steps.


## Approved production release and consumer readback

The keeper explicitly approved merge, production deployment and ClawHub
publication. This supersedes the earlier approval blocker above. PR #1008
merged at 2026-10-12T20:35:36Z after all four test shards and required check
passed. Merge: `2e7a52fa2e244c35c2c91cd8ff0eef5a6526f324`. Both production
Worker builds succeeded. Public index and all three shopper files passed
source-byte readback at 20:36:39Z. GitHub Skills CLI installation also included
all three matching files, with telemetry disabled.

The live website consumer exposed a packaging defect missed by the earlier
single-index fixture: Skills CLI prefers the RFC index, and its `skill-md`
entry installs no references. The follow-up changes that one entry to an
archive containing the same three files. Two regression assertions failed
against the prior implementation; afterward 43 tests across four discovery
specs, typecheck and production build checks passed. `skills@1.5.26` installed
all three matching files from the fixed local HTTPS Worker with both discovery
indexes present. Production installation is the final follow-up release check.

ClawHub accepted the approved three-file 1.0.0 upload with fingerprint
`f856c1a1ec0ac3852d03f5f37983fd08d132740bc7102272dec33d1c25c0ef09`, version ID
`k97fz04hf0z5jemb5qtg6fbm8h8g4efr`. The initial readback was pending. It then became public with a clean scan;
a clean temporary install included all three source-identical files.
[Publication receipt](../../registry/scvd-personal-shopper/published.json).
No duplicate upload or scan bypass was attempted. The skill content is unchanged by the archive fix.

Controlled verification installs do not establish directory ranking. skills.sh
has no manual submission flow; its directory uses genuine installation activity.
No new wallet, funding, signing, purchase or recurring monitoring was performed.
