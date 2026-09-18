# Package and skill release — agent-session reads, September 17, 2026

Supplementary raw outcomes from the remote agent session that merged #769
and pressed both release workflows. The release index and the keeper-side
installation evidence (24 npm files, 11 ClawHub files, clean scan) are in
`research/package-skill-integration-2026-09-17/release.json` and beside it;
the closeout is `docs/PACKAGE_SKILL_HANDOFF_2026-09-17.md`. Nothing here
replaces those or the earlier integration, PS3 or PS4 evidence directories.
What this folder adds: the provenance transparency-log entry and attestation
document, a second independent fresh-directory npm install, the workflow
step records, and two CI-side reads of the public ClawHub page in the first
40 minutes after submission, when it still showed no labelled version.

- `npm-publish-workflow.json` — the `publish-npm.yml` run for `x402-verify`
  1.4.0 on the #769 merge commit: steps, tarball digest, transparency-log
  entry, registry state before and after.
- `npm-attestations-1.4.0.json` — the registry's attestation document for
  1.4.0 as fetched (publish attestation and SLSA v1 provenance naming this
  repository, workflow and commit). Fetched, not signature-verified, from
  this session; see the record for why.
- `npm-registry-installation.json` / `.txt` — fresh-directory registry install
  outside the repository: resolved URL and integrity, the packaged example's
  four outcomes, unknown-scenario refusal, strict TypeScript consumer
  compile and run, installed-file hashes against the merged source, and the
  failed `npm audit signatures` attempt with its cause.
- `skill-publish-workflow.json` — the `publish-skill.yml` run for 3.17.0:
  freshness suite counts, the CLI's submitted line, the record written,
  the record PR, the deployed `/skill.md` version read, and the egress
  limit that kept ClawHub's public page and a remote install unobserved here.
- `listings-reading.txt` — when present, the CI-side read of the public
  registries (ClawHub row against the 3.17.0 record, npm dist-tags against
  the manifests) from the listings workflow dispatched on the record branch.

The consumer directory named in the installation record was a session
scratch directory and is not retained; every value read from it is in the
JSON and text files here.
