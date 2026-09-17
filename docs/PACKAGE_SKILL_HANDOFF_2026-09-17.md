# Package and skill milestone handoff — September 17, 2026

## Scope and authorization

The user authorized completion of steps 1–4: save PS1–PS3, finish PS4, integrate
with current main and merge all THIS effort, publish the verifier and skill,
and verify actual registry installations. User also requests consolidation
because credits are low. Do not expand into PS5–PS10 or unrelated dirty work.
Existing OpenAI/Anthropic payload approvals and completed trials are retained.
No new Claude sign-in is needed. No payments or new third-party endpoint probes.

## Current integration workspace

- Repository: https://github.com/seancrecord/scvd-general-store-repo
- Clean integration: `/private/tmp/scvd-package-skill-milestone`
- Branch: `codex/package-skill-milestone`; base `30e9e00b`.
- Original PS4 checkpoint: `288948ed`; draft https://github.com/seancrecord/scvd-general-store-repo/pull/768
- Original PS1–PS3 source: `/private/tmp/scvd-verifier-developer-activation`,
  branch `codex/verifier-developer-activation`, base `6d29feb5`.
- Recovery backup: `/private/tmp/scvd-package-handoff-backup/` contains the
  verifier tracked patch, untracked archive and base manifest. A durable local
  copy is at `/Users/seanrecord/scvd-general-store-repo/research/package-skill-recovery-2026-09-17/`,
  including an integrated-tree recovery patch/archive. These backup archives
  are local recovery files, not additional changes to merge.
- The main shared checkout `/Users/seanrecord/scvd-general-store-repo` has
  unrelated dirty work. Do not reset, clean, stash or bulk-stage it.

The old PS4 branch also contains an unrelated field-run ancestor. A merge into
it was aborted. The clean branch applies only `288948ed` to current main and
carries PS1–PS3 separately; it excludes that unrelated ancestor. Do not merge
#768 independently after the consolidated PR. Preserve the old checkpoints.

## Completed work

PS1 adds valid/invalid/unsupported/inconclusive result semantics without changing
legacy boolean decisions. PS2 supplies independently generated and checked
cryptographic vectors, with unsupported formats kept explicit. PS3 supplies the
packaged developer example, fixture/key provenance, type declarations and
activation evidence. Verifier prepared release: `x402-verify` 1.4.0; observed npm
latest was 1.3.0 before release. No new algorithm is implemented.

PS4 keeps one skill identity with a 78-line entry and ten references; generated
ClawHub tree, installed-graph guards and whole-tree publish fingerprint. Prepared
skill version: 3.17.0. Main's later privacy/recovery/replay/archive/tab-pin/quote
updates are retained. MPP presence-versus-validity and exact observation-date
reporting are explicit. Final tree hash is in the integration evidence.

## Qualification already completed

- Original PS3 revised Codex cohort: 7/8 strict; Claude 8/8; separate corrected
  path checks 2/2. Original failures retained, not replaced.
- Original PS4: old/new/no-skill task results 5/7, 6/7, 4/7; metadata 10/10 each.
- Integrated skill corrective run: 6/7, with MPP fixed and date omitted.
- Separate final date/MPP check: 2/2. No replacement clean seven-case claim.
- Typecheck, independent vectors, package activation, evidence tests, bundle
  builds, local skill installations/archives and adapted content guards pass.
- Earlier old-base full suite: 10,270 pass, three reproduced baseline failures,
  one existing skip. Those failures are NOT the integrated suite verdict.
- Integrated full suite PASSED: 14,649 passed, one existing skip, zero failures
  across 753 files in 1,742.99 seconds. Command: `npm test -- --maxWorkers=4`.
  Full log and qualification record are in the integration evidence directory.

## Finish/release sequence

1. Read AGENTS.md, HOUSE_RULES.md, KEEPER_LIST.md, ROADMAP.md. Inspect git status
   and the current handoff/release record; do not repeat completed cohorts.
2. Current main AGENTS.md (keeper-approved September 16) requires typecheck
   and focused tests before commits, and all full CI shards before merge; it
   no longer requires another local full run for every commit. This task also
   started a local integrated full run under the earlier supplied instructions.
   The integrated full-suite check has passed. Inherited tab/archive guards were
   adapted during its run; their separate final 28-check pass is retained.
   Resolve any genuine remaining regression, with meaningful red/green proof.
3. Commit/push the clean consolidated branch with the repository footer, open a
   consolidated PR, verify CI, merge it, and close #768 as superseded. Do not
   merge unrelated branches or overwrite newer main updates.
4. Publish using existing workflow_dispatch jobs, from the merged commit:
   `publish-npm.yml`: package=x402-verify, version=1.4.0, dry_run=false;
   `publish-skill.yml`: version=3.17.0, explicit changelog, dry_run=false.
   First reconcile current registry versions. Use workflow secrets; never print
   tokens. User authorized these releases; do not repeat an approval request.
5. Wait for actual workflow results. A ClawHub submission is not yet public.
   Inspect with `clawhub inspect scvd-general-store` (top-level inspect, NOT
   `clawhub skill inspect`, which 0.23.3 rejects). Actual skill publishing is
   `clawhub skill publish`; existing guarded script/workflow owns this step.
6. Install the published npm version in a fresh external directory, execute the
   packaged example for all four outcomes, and compile a strict TS consumer.
   Install exact ClawHub version into a temporary directory and compare all 11
   files/tree hash. Retain raw outcomes and hashes.
7. Merge the skill publication-record PR generated by the workflow; otherwise
   the next publication compares against stale bookkeeping. Record npm
   provenance, workflow URLs, merge commits and installed hashes. Ensure the
   deployed skill version agrees with the release; main merge normally deploys.
8. Update roadmap/handoff/release record. Stop before PS5 unless newly requested.

## Evidence and design entry points

- `docs/PACKAGE_SKILL_ADOPTION_2026-09.md`: accepted scope and remaining phases.
- `docs/VERIFIER_RESULT_SEMANTICS_2026-09.md`
- `docs/VERIFIER_INDEPENDENT_VECTORS_2026-09.md`
- `docs/VERIFIER_DEVELOPER_ACTIVATION_2026-09.md`
- `docs/SKILL_PROGRESSIVE_DISCLOSURE_2026-09.md`
- `research/package-skill-integration-2026-09-17/`: integrated checks and retained
  six-of-seven correction attempt. `frozen-inputs/` archives the original and
  revised verifier tarballs/READMEs, matched against original recorded hashes;
  old trial scripts reference temporary paths, so use these archived bytes.
- `research/skill-date-mpp-recheck-2026-09-17/`: final two-case correction.
- `research/skill-ps4-2026-09-17/`: original six-session cohort and old-base tests.
- `research/verifier-ps*`: all earlier baselines, failures and successful checks.

Historical documents describe the state at their own date/step. This handoff
and the final release record take precedence for current status, without
rewriting historical evidence. Controlled usability is not outside adoption;
offline repeat use remains unknown.
