# Package and skill milestone handoff — September 17, 2026

## Current outcome

PS1–PS4 implementation and original evidence are merged in
[PR #769](https://github.com/seancrecord/scvd-general-store-repo/pull/769),
commit `3194d4d75bd6d7ec07671a1c260b67e106125521`.
`x402-verify@1.4.0` and the `scvd-general-store` skill `3.17.0` are public;
fresh registry installations were verified. The live `/skill.md` declares
3.17.0. [PR #772](https://github.com/seancrecord/scvd-general-store-repo/pull/772)
contains the publication record, final installation evidence and this closeout.
Inspect that PR's current state before calling every closeout change merged.
Original PS4 PR #768 is closed as superseded. Do not merge it separately.

## Scope and authorization

The user authorized steps 1–4: save PS1–PS3, finish PS4, integrate and merge this
effort, publish both releases and verify real registry installations. These
are the authorized closeout actions; no renewed approval is needed to finish
#772 if it is still open. Do not expand into PS5–PS10 or unrelated dirty work.
No new Claude sign-in, reader cohort, payment or third-party endpoint probe is
needed. Original OpenAI/Anthropic trial approvals and raw evidence are retained.

## Verified releases and links

- [npm 1.4.0](https://www.npmjs.com/package/x402-verify/v/1.4.0): all 24 packed
  files match the release source; a fresh public install returns valid,
  invalid, unsupported and inconclusive in both JavaScript and strict TypeScript.
  Registry metadata includes the npm provenance attestation URL.
- [npm release workflow](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35248303297).
- [Skill release workflow](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35248307937).
  Submission initially awaited scans. The later normal ClawHub 0.23.3 public
  installation succeeded without a force/scan bypass; all 11 payload files and
  reference graph match. Client-added metadata is recorded separately.
- Skill tree SHA-256:
  `50c63823dacda48bc82b93bb9537df5c1bd589ad84f24d9e836f522b9efdb606`.
- [Integration CI](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35245884302)
  and [merged-main CI](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35248262089)
  passed every required group. Local full suite previously passed 14,649 tests,
  one existing skip, zero failures across 753 files.
- `research/package-skill-integration-2026-09-17/release.json` is the release
  index; `registry-installation.json` and `skill-registry-installation.json`
  hold the actual install results. Reproduction scripts are beside them.

## What shipped and what the evidence means

PS1 supplies additive verifier result states/reasons and explicit scope while
preserving legacy boolean decisions. PS2 supplies independently generated and
checked vectors. PS3 supplies the packaged quickstart, independent fixture/key
provenance, strict TypeScript compatibility and activation evidence. No new
cryptographic algorithm is implemented.

PS4 supplies one canonical skill identity: a 78-line entry and ten references,
generated ClawHub payload, installed-graph guards and a complete-tree publish
fingerprint. Main's later privacy/recovery/replay/archive/tab-pin/quote guidance
is retained. The full served guide remains derived separately.

Keep these results separate; do not rewrite historical failures:

- PS3 revised Codex cohort: 7/8 strict; Claude: 8/8; separate path correction: 2/2.
- Original PS4 task cohorts: old 5/7, new 6/7, no skill 4/7; metadata 10/10 each.
- Integrated correction: 6/7, fixing MPP overstatement but omitting a timestamp.
- Separate final date/MPP correction: 2/2. This is not a replacement clean
  seven-case cohort or a general reliability claim.
- Controlled usability and public installation do not establish outside adoption;
  offline retention remains unmeasured.

## Workspace and recovery

- Repository: `/Users/seanrecord/scvd-general-store-repo`. This shared checkout
  has unrelated dirty work. Do not reset, clean, stash or bulk-stage it.
- Clean release workspace: `/private/tmp/scvd-package-skill-milestone`.
  Implementation branch: `codex/package-skill-milestone`.
  Release-record branch: `skill-record-3.17.0` (the workflow-created PR #772).
- Initial consolidated checkpoint: `a86c6976`; conflict resolution: `5a5c8df2`.
  The latter retained both additions to `docs/SPEC_READS.md`; verifier and skill
  bytes did not change. Original PS4 checkpoint: `288948ed`.
- Old PS1–PS3 trees under `/private/tmp/scvd-verifier-*` and the original
  `/private/tmp/scvd-skill-progressive-disclosure` are preserved snapshots,
  not extra work awaiting another merge. The old PS4 branch has an unrelated
  field-run ancestor deliberately excluded from #769.
- Durable local backups: `research/package-skill-recovery-2026-09-17/` in the
  shared checkout; also `/private/tmp/scvd-package-handoff-backup/`. These
  archives are recovery files, not additional changes to merge.
- Original and revised PS3 frozen README/tarball bytes are committed under
  `research/package-skill-integration-2026-09-17/frozen-inputs/`, matched to
  the historical hashes. Old trial scripts refer to temporary paths; use the
  archived inputs if reproducing instead of reconstructing them.

## Instructions for the next agent

1. Read `AGENTS.md`, `HOUSE_RULES.md`, `KEEPER_LIST.md`, `ROADMAP.md`, this handoff
   and `docs/PACKAGE_SKILL_ADOPTION_2026-09.md`. Inspect remote/current status.
2. If #772 is open, let all its required CI groups pass, resolve actual conflicts
   without overwriting newer main, and merge it. Do not republish immutable
   versions or repeat the completed cohorts. Check the release evidence first.
3. Confirm task-owned closeout changes are merged. Leave unrelated PRs and
   dirty shared-checkout work with their owners.
4. Resume goal discussion before new builds. PS5 is one selected verifier
   interoperability increment; PS6 is agent inspection across existing entry
   points; PS7 reconciles remaining MPP distribution gaps against newer V3 work.
   PS8 signer work, PS9 UCP and PS10 extraction remain conditional decisions.
   Completing this milestone does not authorize all those builds.

Current main's keeper-approved test policy is typecheck plus affected checks
before a commit and all full CI shards before merge. Do not re-run a half-hour
local full suite solely for a documentation follow-up after CI is green.
Historical implementation documents describe their own dated checkpoints;
this handoff and the release evidence give the current publication state.

## Design and evidence entry points

- `docs/PACKAGE_SKILL_ADOPTION_2026-09.md`: accepted plan and later phase gates.
- `docs/VERIFIER_RESULT_SEMANTICS_2026-09.md`
- `docs/VERIFIER_INDEPENDENT_VECTORS_2026-09.md`
- `docs/VERIFIER_DEVELOPER_ACTIVATION_2026-09.md`
- `docs/SKILL_PROGRESSIVE_DISCLOSURE_2026-09.md`
- `research/package-skill-integration-2026-09-17/`
- `research/skill-date-mpp-recheck-2026-09-17/`
- `research/skill-ps4-2026-09-17/` and `research/verifier-ps*`: retained originals.
