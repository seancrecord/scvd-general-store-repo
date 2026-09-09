# Verification capture — September 9, 2026

Public, read-only captures made during the keeper-authorized follow-through.
`capture-manifest.json` gives each URL, date, raw byte size and SHA-256;
`.gz` files preserve those exact response bytes. Calendar GETs collected
existing proofs locally and did not update the production store.
`bitcoin-headers.json` records the two outside height/hash/header selections
for each corpus proof. Receipt header captures are in the manifest.

Reproduce all signatures, digest links and proof/header checks:

```sh
python3 -m venv /tmp/scvd-ots-review
/tmp/scvd-ots-review/bin/pip install opentimestamps==0.4.5 python-bitcoinlib==0.12.2
/tmp/scvd-ots-review/bin/python scripts/verify_ots_header_test.py
node scripts/verification-followthrough-report.mjs /tmp/scvd-ots-review/bin/python
```

Run from the repository root with its development dependencies installed.
The production canonicalizer is bundled for the report; no field list is
maintained separately. The Python checker is independent of the store's
proof parser and checks actual operations against selected Bitcoin headers.
It is deliberately outside the dependency-free npm package. `verified-report.json`
is generated, not an additional source of truth.

Trust boundaries: signatures use the separately captured issuer HTTPS key
from September 8. Header-chain membership and height rely on Blockstream
and mempool.space, not a local consensus node. These checks do not prove
issuer identity, factual truth, precise issue time, or undisclosed corpus
completeness. The corpus denominator is the captured index; it does not
cover every issued certificate or linked evidence report.

Directory data: x402-list.com, CC BY 4.0, with URLs retained in the manifest.
The refreshed mappings are joined to the historical Base transaction capture
from September 8. The keeper purchase remains a test, not organic demand.
The maintainer note is prepared but unsent.

`package-smoke.json` records installation and offline verification from the
locally packed verifier; it is not a registry publication receipt.

`npm-release.json` is the public registry record. `registry-smoke.json`
records a fresh registry installation checking the receipt. Its integrity
matches `package-manifest.json`; npm verified the registry signature and
provenance attestation (`npm-provenance-check.txt`). Publication workflow:
https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34353123366.

`post-release/` preserves the production release checks, initial pending
reads and the successful 14:32 UTC re-read. All six delivered detached
proofs are byte-identical to the earlier calendar upgrades; rerunning the
offline report above therefore verifies these exact proofs too. Compare
`post-release/corpus-N.ots` with `corpus-N.payload.json.ots` for each listed
sequence; `post-release/proof-comparison.json` records the hashes. Live
records also retained the original canonical payload digest and signature.
The initial scheduled-time read is kept because it had not yet observed
completion. No whole-certificate-population claim follows from this pass.
