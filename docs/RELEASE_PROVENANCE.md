# Release archive verification

Published releases build an archive from their tag, sign it using GitHub
OIDC and Cosign, and attach SLSA provenance. The signature is verified
against the exact tagged workflow identity before upload. These attest
the source archive, not the separately deployed Cloudflare Worker or
other release attachments such as production smoke results.

Cosign v3 releases use a `.tar.gz.sigstore.json` bundle containing the
signature, certificate and transparency-log verification material.
Download that bundle and the matching `.tar.gz` archive from the release,
then set `TAG` to its tag and run:

```sh
cosign verify-blob "scvd-store-${TAG}.tar.gz" \
  --bundle "scvd-store-${TAG}.tar.gz.sigstore.json" \
  --certificate-identity "https://github.com/seancrecord/scvd-general-store-repo/.github/workflows/release-provenance.yml@refs/tags/${TAG}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The SLSA generator separately attaches its `.intoto.jsonl` provenance.
Earlier releases may carry separate `.sig` and `.pem` files; they are
historical formats, not interchangeable with the new bundle.

The original `2026-09-16-catalog-verifier` release published production
smoke evidence but its archive signer failed: the installed Cosign v3
ignored the deprecated separate-output flags. That tag is preserved.
A patch release with the corrected workflow provides new archive evidence;
it must not be represented as a successful rerun of the original tag.
