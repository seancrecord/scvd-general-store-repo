# Competitive choice, corpus findings and reuse

Prepared September 28, 2026 (America/New_York). Local branch work; no new
partner message, public article edit, package release or HF refresh performed.

1. [Competitive comparison](COMPETITION.md): eight concrete jobs, official
   substitutes, SCVD's supported contribution and when to choose each.
2. [Computed corpus findings](FINDINGS.md): authenticated originals,
   denominators, exclusions and row-level sources. These are unsigned analyses.
3. [Partner packet](PARTNER_PACKET.md): a filled historical listing record,
   executable local adapter and a held follow-on for the existing relationship.
4. [Asset paths](ASSET_PATHS.md): existing links confirmed, local improvements,
   exact HF card preview and a single optional article edit.

## Corrections found by doing the work

The initial HF table repair solved loading but copied the round date into
each host observation. The corrected projection uses the signed host's own
date and exposes round/capture time separately. The original signatures and
bytes are unchanged. The correction is local until the publication workflow
is rerun after release; the prepared card says what changed.

The old notebook also failed the sixth snapshot's canonical digest because
Python's JSON reconstruction differed from the signing implementation.
The replacement uses the existing JavaScript verifier and was run top to
bottom against all public snapshots. It performs no seller probes/payments.

## Validation

The observation-date regression and the missing card-path assertion were each
observed failing before their fixes. Focused checks cover authentication,
tampering, wrong keys, exact URL/method selection, duplicates, missing dates,
carried-forward rows, comparable cohorts, denominators, card idempotence,
publisher behavior and CI wiring. Typecheck and deployment bundle checks pass.
September 29 pre-commit validation against updated main: 850 full-suite files
and 15,760 tests passed, with one skipped. The 20 focused checks, typecheck and
all dry-run bundles also passed. Full merge CI remains the PR gate.
[Validation record](validation.json).

The notebook authenticated ten originals with digest/signature/chain checks.
Bitcoin timestamps and public-key identity were not independently qualified.
The listing adapter's positive result is retained in
[partner-listing-evidence.json](partner-listing-evidence.json); its narrower
single-artifact verification scope accompanies the record.

## Reproduce the retained report

Save the numbered originals listed in [corpus-inputs.json](corpus-inputs.json)
and the trusted public verification key JSON, then run:

```sh
node scripts/corpus-findings.mjs SNAPSHOT_DIR PUBLIC_KEY_JSON OUTPUT_DIR
node --test scripts/corpus-publish.test.mjs scripts/corpus-viewer.test.mjs scripts/corpus-findings.test.mjs scripts/corpus-listing-evidence.test.mjs scripts/ci-workflow.test.mjs
```

The manifest retains raw-file hashes and signed digests. The notebook fetches
the currently available chain; a later execution can legitimately contain
additional snapshots. Use the retained manifest for this dated comparison.
