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
