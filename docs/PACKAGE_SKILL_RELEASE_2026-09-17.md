# Package and skill milestone release record — September 17, 2026

This record takes precedence over the earlier handoff and the historical
PS1–PS4 documents for current status. It does not rewrite their evidence.
Raw outcomes for everything below are under
`research/package-skill-release-2026-09-17/`.

## Merge

- PR [#769](https://github.com/seancrecord/scvd-general-store-repo/pull/769)
  merged into `main` as `3194d4d75bd6d7ec07671a1c260b67e106125521` at
  16:42 UTC, by merge commit so the checkpoint hashes cited in the evidence
  (`a86c697`, `288948ed`) stay reachable. Head at merge: `5a5c8df2`, which is
  `a86c697` plus a merge of main `8038f21` (#762).
- PR CI on `5a5c8df2`: [run 35245884302](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35245884302),
  all four test shards, quality, check, CodeQL and both Workers builds green.
  The earlier run on `a86c697` (35242960702) also passed.
- Main moved twice between the PR's base and the merge (#770 and #771). A
  local trial merge against `7d4562e` produced no conflicts and no PR change.
- Main CI on the merge commit: [run 35248262089](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35248262089).
  Queued behind the earlier #770 push run (whose own queued successor for
  #771 was cancelled by the concurrency group), started 16:59 UTC and
  completed 17:21 UTC: all four test shards, quality, check and green-main
  succeeded, so main is green on the milestone commit.
- Draft #768 was already closed as superseded before this session; nothing
  from its unrelated field-run ancestor was merged.

## x402-verify 1.4.0 — published

- Registry before: latest `1.3.0` (versions 1.0.0, 1.0.1, 1.0.2, 1.2.0, 1.3.0).
  Registry after: latest `1.4.0`.
- Workflow: `publish-npm.yml` with package `x402-verify`, version `1.4.0`,
  dry_run false, on `main` at `3194d4d7`:
  [run 35248303297](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35248303297).
  Name/version/registry refusal, package tests, independent vector
  reproduction, installed-quickstart gate, tarball listing and publish all
  passed. 24 files, 53.8 kB packed, 285.8 kB unpacked, shasum
  `f752f473eda07a3925b30224d0737f8c147300a6`.
- Provenance: SLSA v1 statement signed from GitHub Actions, transparency log
  https://search.sigstore.dev/?logIndex=2879124178, attestation document at
  https://registry.npmjs.org/-/npm/v1/attestations/x402-verify@1.4.0 (saved as
  `npm-attestations-1.4.0.json`). Its build definition names this repository,
  `.github/workflows/publish-npm.yml` on `refs/heads/main` and git commit
  `3194d4d75bd6d7ec07671a1c260b67e106125521`.
- Fresh external install (`npm-registry-installation.json` and `.txt`): a new
  directory outside the repository, Node v22.22.2, npm 10.9.7, resolved
  `https://registry.npmjs.org/x402-verify/-/x402-verify-1.4.0.tgz`, integrity
  `sha512-OCPhvLadl+B8pZHYow0c7tA/QfkUnPHfSPiuNzHhFmPuMS0yBF273XwnUE6cFcwv+Laakyvk/gqRhAq/gzkOqw==`
  equal to the registry's `dist.integrity`; no runtime dependencies.
  The packaged example is byte-equal to the README quickstart. All four
  outcomes returned as documented: `valid` (exact README output), `invalid`
  with `signature_invalid`, `unsupported` with `unsupported_algorithm`,
  `inconclusive` with `key_unavailable`; an unknown scenario throws. A strict
  NodeNext TypeScript 5.9.3 consumer compiled against the installed package
  and ran the same four outcomes. Nine installed files (both entry modules,
  both declaration files, the evidence CLI, the example, README, CHANGELOG
  and package.json) hash equal to the merged source.
- Not established here: `npm audit signatures` in the consumer directory failed before verifying anything ("Failed to download" from the TUF fetcher), because the session's egress refuses the Sigstore trust-root host. The registry attestation document was fetched and its build source read; its signature was not verified from this session.
- Published `CHANGELOG.md` still carries the "(unreleased)" marker written
  before release; the source is corrected in this record's commit and the
  published 1.4.0 bytes are immutable. npm reported that it normalised the
  `bin` entry during publish; the installed `bin` is identical to source.

## Skill 3.17.0 — submitted to ClawHub

- Workflow: `publish-skill.yml` with version `3.17.0`, explicit changelog,
  dry_run false, ClawHub CLI pinned 0.23.3, on `main` at `3194d4d7`:
  [run 35248307937](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35248307937).
  The guarded script's freshness suite passed (5 files, 32 tests) and the
  CLI reported: "Update submitted for scvd-general-store@3.17.0; pending
  security scans before it becomes public."
- Record: bundle sha256
  `ea482956517acf6e8a23a62fae84ce6933500b57da5c6fcd5bdafb61348b6cd8`, tree
  sha256 `50c63823dacda48bc82b93bb9537df5c1bd589ad84f24d9e836f522b9efdb606`
  (the same eleven-file hash the integration evidence recorded), commit
  `3194d4d7`. The workflow opened the record PR
  [#772](https://github.com/seancrecord/scvd-general-store-repo/pull/772).
  Its merge waits on main CI for the milestone commit; result to be appended
  below.
- Deployed `/skill.md` served `version: 3.17.0` at 16:47 UTC, so the store
  route and the release agree.
- Public visibility and remote installed bytes: not confirmed. The listings
  workflow, dispatched from CI on the record branch six minutes after
  submission ([run 35248851550](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35248851550),
  excerpt in `listings-reading.txt`), reached the public ClawHub page but
  found no labelled version near the skill name, and read npm `x402-verify`
  as 1.4.0 agreeing with the manifest.
  This session's egress refuses `clawhub.ai` (proxy CONNECT 403), so
  `clawhub inspect scvd-general-store` and an exact-version remote install
  with the eleven-file tree comparison could not run from here. They remain
  the keeper's or a reachable machine's check; the listings workflow's
  ClawHub row is the CI-side read.

## Not done, and not claimed

- No PS5–PS10 work. No new algorithm, payment capability, third-party
  endpoint probe or spending.
- No new reader cohort; the 7/8, 8/8, 5/7, 6/7, 4/7, 6/7 and 2/2 results
  stand as recorded. Offline repeat use remains unknown.
- ClawHub moderation outcome and remote installed bytes are recorded only as
  far as stated above.
