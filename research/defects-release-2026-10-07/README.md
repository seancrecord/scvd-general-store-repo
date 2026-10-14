# Defects package 0.22.0 — published and verified October 7

`scvd-defects@0.22.0` is public and tagged latest. This closes the npm
publication step from [the distribution reading](../distribution-2026-10-07/README.md).
It ships vocabulary v22 and lets consumers resolve both v3 readiness failures
to their existing defect classes and operator/buyer repair guidance.

## Release and independent readback

- The [dry run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/37669598111)
  and [publication](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/37669852883)
  succeeded on main `384978f8da37c63cb041f3152ead8cf6c528eeee`.
  Package source was unchanged from the reviewed #976 implementation.
  [Run receipts](workflow-runs.json) retain the distinct inputs and outcomes.
- Public latest and exact-version metadata agree. Registry SHA-512 integrity
  matches the downloaded tarball; all 31 packed files match the reviewed local
  package and the source commit named by its provenance payload.
  [Readback](package-readback.json), [metadata](scvd-defects-metadata.json),
  [attestation](scvd-defects-attestations.json).
- A new consumer project installed the exact public version with lifecycle
  scripts disabled. Both v3 signal lookups return their legacy defect classes,
  including repair guidance. [Executable check](consumer.mjs),
  [result](consumer-result.json), [lockfile](consumer-package-lock.json).
- The [strict TypeScript consumer](consumer.ts) passes with NodeNext resolution;
  it accepts both the optional `verdict_signal` and an older definition without it.
- `npm audit signatures` independently verifies one registry signature and one
  provenance attestation. [Verifier output](npm-signatures.txt). The separate
  Python readback inspects payload bindings; it does not itself verify signatures.

## Processing delay retained

Two early exact-version reads returned 404 after workflow success, and an
initial install returned ETARGET. A later install using that first cache
still failed after public metadata had appeared. A new cache with
`--prefer-online` succeeded. [Initial readings](initial-readbacks.json).
No version bump or repeat publication was used to resolve this delay.

## Reproduction and remaining work

The [readback script](readback.py) accepts a source checkout and a new output
directory. It compares registry bytes and provenance source, without modifying
the registry. For consumer checks, install `scvd-defects@0.22.0` in a temporary
project, copy the two consumer files there, run `node consumer.mjs`, and check
`consumer.ts` with `tsc --noEmit --strict --target ES2022 --module NodeNext
--moduleResolution NodeNext --lib ES2022,DOM`.

This release does not deploy the pending signature-scope wording correction
or refresh MPPScan. Those remain the next release and readback steps. No buyer
qualification, authenticated admin check, wallet operation or paid request ran.
The earlier distribution capture stays unchanged as its own dated observation.
