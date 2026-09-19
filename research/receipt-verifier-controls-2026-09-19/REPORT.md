# Retained receipt controls — September 19, 2026

Seven offline controls pass with the published `x402-verify@1.7.0` CLI. This checks
the separate receipt scenario in the takeoff plan against real retained public
artifacts. It is a controller check, **not a fresh buyer or recipient acceptance
run**. No new purchase, model session or network request was made.

[Plan and byte pins](plan.json), [executable check](check.mjs), and
[results](results.json) retain the inputs, expectations and observed outputs.
The script checks package and source hashes before running, independently verifies
signatures with Node crypto, disables fetch in CLI subprocesses, applies bounded
process/output limits, and asserts that the CLI neither edits inputs nor creates
extra files. Its temporary files are deleted after checking; repository evidence
is never modified. This is not a comprehensive OS network-sandbox proof.

## What was reused

- The original public verification body for `cert_4dww28dx5j`, retained in the
  [September 14 receipt acceptance evidence](../buyer-receipt-acceptance-2026-09-14/evidence.json).
  Its signed date is July 22, its item is `hello`, and it names no payment or
  settlement transaction. The separately captured public key registry lists its
  signing key as retired July 31. Matching that registry is source consistency,
  not an independent identity root or proof the key was authorized at signing.
- The paid Small Blessing certificate `cert_et6zuesrrn`, captured September 8 in
  [the original verification response](../verification-2026-09-08/receipt.json).
  Its signed claims name 0.005 USDC on Base, a September 6 date and a settlement
  transaction. This run checks those retained signed bytes; it performs no fresh
  chain or delivery observation.
- Registry-installed verifier files from the [1.7 publication](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35442741062).
  The package metadata and all three executable modules used here must match the
  hashes frozen in the plan. Full installation/provenance evidence is in
  [release PR #845](https://github.com/seancrecord/scvd-general-store-repo/pull/845).

The research collectors wrapped responses in larger JSON files. The checker
extracts their already-retained response objects and reserializes only the outer
JSON for the CLI; original `signed_payload` strings remain byte-identical except
in the named tamper control. These temporary files are not claimed as original
HTTP response encodings. Their exact SHA-256 values are recorded in the results.

## Results

| Control | CLI exit | Meaning |
| --- | --- | --- |
| Historical original with matching retired key | 0 | Signature and available evidence bindings verify. Retirement alone does not invalidate the signature. |
| Historical original with the newer key | 1 | Rejected: embedded key differs from the caller's supplied key. |
| Historical original without a caller-supplied key | 1 | Rejected; the artifact cannot establish its own trusted key. |
| Signed item changed and claimed digests recomputed | 1 | Invalid signature; recomputing wrapper hashes cannot repair it. |
| Unsigned display item, price and key-status labels changed | 0 | Signed bytes still verify; `context_authenticated` remains false. The altered display is not authenticated. |
| Paid receipt with its bound `saw` evidence absent | 3 | Valid signature, incomplete evidence; the missing binding is named. |
| Paid receipt with the retired key | 1 | Wrong-key rejection remains separate from missing evidence. |

The historical artifact also carries an OpenTimestamps proof. The first checker
attempt changed the signed item and `artifact_hash` but left the timestamp's
claimed digest unchanged; the CLI refused that inconsistent package at exit 2,
before reaching the expected signature verdict. The checker was corrected to
change both claimed digests, preserving the old signature and proof, and then
observed `invalid_signature`. This is a correction to the control construction,
not a verifier change or a clean initial attempt. No native cohort was retried.

The original timestamp is reported **unverified** by this command. Its retained
server commentary says the bound was after retirement. Even an independently
validated backfill timestamp would not prove that signing happened during the
old key's service window. The signed date being inside the published window is
only a comparison between two claims. This run does not verify the OTS proof,
issuer identity, historical authorization, current delivery or chain consensus.

## Reproduce

Install the exact public package in a scratch directory using your normal npm
workflow, then pass its installed package directory as an absolute path:

```sh
node research/receipt-verifier-controls-2026-09-19/check.mjs /absolute/scratch/node_modules/x402-verify
```

The checker refuses another package version or changed executable bytes. It
prints a new JSON result to stdout; keep that separate from the dated committed
result. No need to overwrite old evidence or run a buyer session.

## Acceptance boundary and next use

These real-artifact controls complement the verifier's synthetic negative tests
and the earlier [receipt acceptance run](../buyer-receipt-acceptance-2026-09-14/REPORT.md).
They do not fill that run's missing native historical-key explanation criterion
or change any cold-buyer score. The valid historical artifact is not evidence of
a payment; the paid artifact has an unresolved evidence binding.

A future separately frozen recipient scenario can use the originals and the
separate key record, without revealing this answer table. It must explain the
exact signed subject/date, unsigned display and registry context, missing bound
evidence, and unproven signing time. Preserve altered cases as negative controls
and record actual recipient understanding. Do not substitute this controller's
success for that agent result or reopen a consumed recipient attempt.

Validation for this record: the executable controls, script syntax, recorded
checker/plan hashes, typecheck, documentation checks and whitespace checks pass.
Application code is unchanged; required hosted CI remains the merge gate.
