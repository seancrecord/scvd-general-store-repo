---
license: cc-by-4.0
language:
- en
tags:
- x402
- agentic-commerce
- http-402
- payments
- verification
- endpoint-readiness
pretty_name: scvd.store x402 endpoint readiness corpus
configs:
- config_name: observations
  default: true
  data_files:
  - split: train
    path: viewer/observations.jsonl
- config_name: rounds
  data_files:
  - split: train
    path: viewer/rounds.jsonl
---
scvd.store x402 endpoint readiness corpus
scvd.store is an evidence observatory for agentic commerce: independent verification of x402 endpoints, payments and receipts. Before an agent pays an x402 endpoint, we check that it can be paid. After it pays, we check the signed receipt. Over time we watch endpoints and publish a dated, signed corpus. Sellers use it to prove a door works; buyers use it before spending. Every artifact is signed, expires, and names what we did not see. Not escrow, not a rating, not a guarantee.

This dataset is that corpus: one snapshot per weekly round of the public x402 discovery list, recording which hosts were listed, which answered, and what a single conformance probe saw at that moment. Hash-chained, ed25519-signed, each digest submitted to OpenTimestamps for Bitcoin anchoring. Dated observations of moments, never scores on operators.

Files
File	What it is
corpus.json	The index: schema.org Dataset metadata, every entry, the chain check, and the verification steps.
1.json … N.json	One signed round each: snapshot, digest, signature, public_key, ots (the OpenTimestamps proof).
tiers.json	The per-host tier fractions, alphabetical, with the rule, the denominator and the rows beside each.
A new numbered file is added each signed round. The live copy is always at https://scvd.store/corpus.json, and every artifact verifies free at https://scvd.store/api/verify/{id}.

Denominators
Every fraction in this corpus is published with its rule, its denominator and its rows. Coverage caveats ride inside each round verbatim: which hosts were listed, which were walked, and the percentage between them. Nothing here is a ranking of one host against another.

Update cadence
One round per week, taken on the Sunday walk, appended as a new numbered file and a new version on Zenodo. A week the walk did not run is a missing number, said so, never backfilled.

Limitations
A snapshot can carry earlier host readings forward. Use each host observation date; an unreachable reading describes that attempt, not an entire week.
The population is the public x402 discovery list plus hosts the store has met; a door not listed anywhere is not here.
The probe reads the 402 challenge and the signed offer; it does not pay, so it says whether a door can be paid, not whether it delivers.
Tiers and fractions are derived and published with their rule, denominator and rows; they are not scores of operators and must not be read as rankings.
Verification
Recompute any snapshot's sha256, check the signature against the key at https://scvd.store/.well-known/scvd-signing-key, walk the previous_digest chain back to the first entry, and run ots verify on the Bitcoin-anchored proof. The exact steps, field order included, are printed on corpus.json itself.

Citation
Concept DOI (all versions): https://doi.org/10.5281/zenodo.22284887

Record Creative Co. LLC (2026). scvd.store x402 endpoint readiness corpus. Zenodo. https://doi.org/10.5281/zenodo.22284887
Licence
CC BY 4.0. Reuse names the original source: https://scvd.store/corpus

## Loading the table views

The default `observations` configuration contains one host observation per row.
The `rounds` configuration contains one summary per signed snapshot. These are
unsigned projections for browsing and analysis; the numbered JSON snapshots
remain the signed evidence. Other observation families and detailed probe
fields remain in those originals.

```python
from datasets import load_dataset

observations = load_dataset("keeper-scvd/x402-endpoint-readiness", name="observations", split="train")
rounds = load_dataset("keeper-scvd/x402-endpoint-readiness", name="rounds", split="train")
```

Each observation links its source snapshot and digest; `row_pointer` addresses
the row within that document's `snapshot` object. Capture and observation dates
are separate. A readiness observation is an unpaid protocol check, not proof
that a payment will succeed or that a seller will deliver. These table views
do not independently verify Bitcoin timestamp proofs.


## Observation dates and reproducible analysis

Correction prepared September 28, 2026: the initial table projection used the
round date as each host's observation date. The corrected observations table
uses the signed host row's `observed_at`, empty when unrecorded, and preserves
the round date separately as `round_observed_at`. `captured_at` dates the
snapshot. Older readings can be carried forward into a later round; a new
snapshot is not a fresh probe of every endpoint. Recorded `probe_method` and
`battery` accompany the row; absent values stay unknown. Signed originals
were not changed by this correction.

[Recompute the findings](https://github.com/seancrecord/scvd-general-store-repo/blob/main/examples/corpus-recompute.ipynb)
from a repository checkout with Python 3 and Node 22. The notebook fetches the
originals, verifies their digests, signatures and chain linkage with the existing
verifier, and separates fresh comparable readings from carried-forward rows.
[Reuse one listing observation](https://github.com/seancrecord/scvd-general-store-repo/blob/main/examples/README.md#reuse-corpus-evidence)
with the local adapter. Its output is an unsigned projection linked to a signed
source, not current readiness or evidence that a payment completed.
