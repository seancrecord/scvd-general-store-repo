# Adoption and latency reading — September 10, 2026

`preview-inventory.json` is derived from the qualified menu;
`live-previews.json` records successful production reads for every unique
preview URL. `release-acceptance.json` identifies the completed integrated
CI and the actual merged-revision production builds. `latency.json` retains all
requests from the explicit three-URL baseline; `latency-after.json` repeats
that reading after deployment with every attempt retained. `control-integration.json`
retains the optional control reader's six-request live integration check.
`anchor-lifecycle.json` contains service-reported times from two selected
public records; it does not independently verify proofs.

The three `*-pack.json` records identify the reviewed archives;
`packed-checks.jsonl` records installed-file identity and minimum-Node
fixture checks. `*-registry.json` and `*-attestations.json` retain actual
publication verification: archive identity, all shipped files, installed
fixtures, registry signatures, source commit and workflow invocation.
Scope, methods and acceptance: `../../docs/ADOPTION_AND_LATENCY_2026-09.md`.

`branch-preview.json` is the earlier checkout preview read, not a production
claim. `registry-live.json` exercises the actual registry-installed commands
and live read-only catalogs. These post-deployment records are retained on
the release branch and linked from PR #621; they were recorded after the
completed CI run and are not retroactively claimed as CI inputs.
