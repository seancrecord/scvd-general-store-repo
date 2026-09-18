# Buyer retention and signed-scope example — September 18

The [full-inventory cohort](../research/full-inventory-buyer-2026-09-18/REPORT.md)
finished with zero complete journeys out of four. One buyer discarded a complete
original even though it fit the retention budget; another recipient authenticated
unsigned historical rows by association with a signed snapshot. A recipient also
spent its call budget discovering how to load keys and verify evidence.

## Changed surfaces

The installable and served `scvd-x402-verification` skill now gives standalone
commands to create an evidence directory, save the whole cited snapshot, and
separately save the issuer-key response. It names incomplete capture explicitly
and requires source URLs and acquisition times to travel with the files. It
clarifies that signature validity alone does not identify an issuer or establish
that an observation happened. Additional responses get distinct filenames.

The full-inventory recipient prompt now includes a runnable local example of
`createEvidenceBundle` and `verifyEvidenceBundle`. Its byte allowance comes from
the frozen plan, and it imports only the two already-supplied public modules.
It requires a valid signature and complete linked evidence, recognizes corpus
snapshots, and selects the exact endpoint from returned signed claims. It prints
signed observation time separately from publication, declared expiry fields,
and the existing verifier's scope and limitations. Unsupported shapes, missing
subjects, wrong keys and incomplete evidence produce no authenticated rows.

This example helps locate authenticated claims; the recipient still checks the
observation's gaps, key provenance and the task's age policy. Unsigned current
readings and other weeks remain separate. The key record is an acquisition
observation, not an independent identity or historical authorization proof.

## Validation and limits

The new tests execute the literal recipient example using the same supplied
modules and genuine signed fixtures. They cover unsigned extra history and
unsigned expiry decoration, wrong keys, wrong exact subjects, changed signed
content, changed-and-rehashed content, unsupported artifacts and missing linked
evidence. The actual capture commands preserve a multi-megabyte response and a
separately fetched key record byte for byte against a local fixture server.

All eight new cases failed against unchanged guidance, then passed with the
repair. Removing only the complete-evidence guard makes the missing-linked-
evidence regression fail again. The buyer suite passes 223 checks; typecheck
and Worker bundles pass. The full local run passed 768 files and failed 14,
with 27 failed tests and two additional workers timing out before starting.
All 16 affected or unstarted files then passed with two workers: 2,571 tests,
no failures or runner errors, unchanged assertions and timeouts. This is
consistent with resource contention; the original full run remains recorded
as failed. All 784 files are covered across the two runs.
[Validation record](../research/buyer-retention-scope-2026-09-18/validation.json)
retains both outcomes and log hashes; all required PR CI checks still gate merge.
The [literal example on preserved real bytes](../research/buyer-retention-scope-2026-09-18/real-example.json)
returns one September 7 observation and a separate September 18 publication.
That read neither changes the historical capture nor counts as a native run.

No verifier API, npm version, checkout, scoring threshold or budget changes.
The schema-6 controller's offline qualification, full unclassified inventory
and one-attempt gates remain in place. Historical source copies, prompts,
acquisitions and scores remain unchanged. This repair is not a native buyer
result. Merge and read back the served skill, then freeze a new instrument and
plan and qualify it before another cohort. Never use publication time to extend
the underlying observation's age window.

## Related CLI work

[PR #817](https://github.com/seancrecord/scvd-general-store-repo/pull/817)
merged exact-subject excerpts to `verify-source`. That is a complementary CLI
surface with its own publication status. This repair uses the existing bundle
API and two already-supplied modules in the offline recipient workspace; it
does not require that CLI release or add another installed recipient tool.
The public skill continues to check installed capabilities rather than promise
that repository source features have already reached the registry.
