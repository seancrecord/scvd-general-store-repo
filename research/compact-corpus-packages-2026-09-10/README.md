# Compact package preparation — September 10, 2026

`registry.json` is a dated public registry identity read, not a publication
receipt. `local-archives.json` lists the prepared archive contents and npm
integrities. Archives were installed locally with scripts disabled; CLI and
client preserved a fixture page and its gaps, made one request apiece and
left the full-corpus request unchanged. The packaged declarations passed
strict TypeScript checks. Sign code and types match the previously verified
1.0.2 registry archive byte for byte.

The local CLI archive also read one live metadata page at 14:56:32 UTC:
format scvd-corpus-index/v1, listed 1, unreadable 0, has_more true,
r2_bodies_read false. No snapshot was fetched or verified in this check.
No latency benchmark or registry provenance claim follows from these reads.
The full implementation/release record is in
`docs/COMPACT_CORPUS_PACKAGES_2026-09.md`.

The 36 CLI/client tests and the installed-archive fixture check also passed
under the declared minimum Node 18.17.0, using its official Darwin arm64
archive verified against the published SHA-256 sum. No project dependency
or system runtime was changed. The normal local run used Node 22.

`pq-interop.json` retains the September 10 two-implementation ML-DSA
probe's public keys, messages, signatures, exact runtime versions and
refusal results. Both signing directions passed with empty and nonempty
contexts; all sixteen negative cases were rejected. These are generated
fixtures, not full NIST vector conformance, an audit, a production key
exercise or a Worker latency measurement. Reproduce with
`experiments/pqc/interop.mjs`; see that experiment's README.

`pq-acvp.json` and `pq-acvp-sources.json` record selected NIST expected-result
checks and exact source identities: 70 checked ML-DSA-65 cases matched;
135 prehash/internal ML-DSA-65 cases and other parameter sets were excluded.
No raw private keys are retained here; the underlying public NIST files
contain known test keys. This is sample evidence, not module certification.

The `*-published.json`, `*-audit-signatures.txt` and `*-provenance.json`
files are actual CLI, Sign and corpus-client release receipts. Their
registry installations match reviewed archive integrity and every shipped
file. Registry signatures and attestations verified; provenance subjects,
source commits, repository, workflow and invocation match the expected
runs. The reader exercises are described per receipt and do not imply
cryptographic verification of the fetched corpus. `directory-reread.json`
records a refused HTTP 403 read; it establishes no new listing verdict.
