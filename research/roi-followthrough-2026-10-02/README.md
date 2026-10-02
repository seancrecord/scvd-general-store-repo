# October 2 registry and corpus readbacks

- `package-readback.json`: current exact/latest npm versions, tarball integrity,
  file/source comparisons and provenance payload bindings. Attestation signatures
  were not independently verified.
- `cli-activation.json`: registry-installed CLI 0.5.0 in a temporary project;
  no native host or buyer qualification.
- `clawhub-readback.json`: eleven source-file hash matches, raw MPP reference
  comparison, registry-generated extra file and distinct scanner results.
- `hf-readback.json`: immutable signed fields, regenerated viewer hashes and
  preview readback. Outer envelope differences are retained explicitly;
  timestamp proofs were not independently checked.

[Decisions, scope and remaining work](../../docs/ROI_FOLLOWTHROUGH_2026-10-02.md).
