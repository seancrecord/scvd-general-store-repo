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

Pending PR, CI and publication readback.
