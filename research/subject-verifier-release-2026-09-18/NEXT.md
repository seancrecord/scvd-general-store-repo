# Release and acceptance gates for the exact-subject reader

The keeper approved continuing on September 18 after PR #817 and its external
comments. This branch prepares x402-verify 1.6.0. It does not establish npm
publication or another native buyer completion.

## Release

1. Merge #817 and this release change only after their required CI passes.
2. Run the existing Publish npm package workflow on the reviewed release
   commit, selecting x402-verify and the version in verifier/package.json.
   First run with dry_run=true, then publish with dry_run=false. Retain the
   workflow URL and its exact source SHA. No package credentials belong in
   a local transcript.
3. Install the exact public version in a fresh directory with a fresh cache.
   Compare every packed file with the reviewed source; retain registry
   integrity, provenance and signature verification. Run the installed
   verify-source --subject command on the unchanged retained original and
   separately captured public key from the September 18 repair. Confirm
   one exact matching signed row and preserve its observation date, gaps,
   unsigned-context exclusion and source hash. This is package qualification.

## The next native experiment

The current schema-6 recipient machinery supplies evidence-bundle.js and
x402-verify.js, but not evidence-cli.mjs. Merely publishing the option cannot
exercise it in that offline recipient. Before freezing a new experiment:

- Extend the existing handoff and instrument inventory to include the released
  CLI and its package metadata. Hash-bind the actual supplied files and verify
  they match the registry installation; do not call checkout bytes published
  merely because their version field matches.
- Give the recipient a neutral invocation example using its own retained
  original and independently evaluated key. Do not preselect the correct file,
  supply an expected verdict, label evidence roles, or insert authenticated
  rows into the handoff. Preserve every retained buyer file unchanged.
- Keep the public package README as the buyer-facing change under test. Do not
  secretly coach buyers with the expected signed row or repair the evidence
  inventory after acquisition.
- Add red-first regressions for the new machinery/inventory and command
  example. Preserve historical schema-5 records and earlier frozen plans.
- Freeze a new schema-6 plan, instrument hashes, installed package provenance,
  prompts and host versions before native qualification and acquisition.
  Keep the prior four cells, time/call/byte limits, zero-spend restriction,
  original 14-day observation-age policy and one offline recipient attempt per
  eligible completed buyer. Qualify both buyer hosts and the offline recipient
  under the new frozen instrument; prior results are not this run's results.
- Judge retention, verified exact-subject scope and completed recipient
  interpretation together. Missing originals, scope overclaims and interrupted
  runs cannot become passes because the direct CLI test passed.

The existing September 7 observation ages out on September 21 at
02:30:20.531 UTC. Snapshot packaging time must not reset that clock. If it
ages out before acquisition, record the stale-evidence result or deliberately
freeze a different prospective experiment; never change the old policy after
seeing a result.

The two external updates are already posted:
- https://github.com/tempoxyz/mpp/pull/991#issuecomment-5734203544
- https://github.com/Merit-Systems/x402scan/issues/1209#issuecomment-5734203762
