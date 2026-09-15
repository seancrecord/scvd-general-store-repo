# Ed25519 and ML-DSA-65: signature size and local signing measurements

Prepared September 14, 2026 from measurements recorded September 11.
Repository publication prepared September 15; no scvd.store page is added.
This is an unsigned research record, free to read and reproduce.
No purchase, wallet connection or production key
is needed. Production checkpoint issuance is parked. Use this record to budget artifact
sizes and choose a backend/runtime for further measurement.

## What we measured

An Ed25519 signature occupied **64 bytes**. An ML-DSA-65 signature occupied
**3,309 bytes**, or **51.703125 times** as many. Together the two signatures
occupied 3,373 bytes, before encoding or an envelope.

Across three fresh local processes per mode, the per-process warm signing
medians were **0.0152–0.0165 ms for Ed25519** and **6.7880–7.4588 ms for
Ed25519 plus ML-DSA-65**. Verification medians were **0.0344–0.0379 ms** and
**1.6597–1.6691 ms**, respectively. Each process measured 50 warm operations.
These ranges compare three per-process medians; they are not pooled medians
or p95s. For an even sample count, the harness reports the upper middle
sorted sample as its median, rather than averaging the two middle samples.

The dual mode performs both signatures in sequence. Its name in the raw
file is `--child-pq`; treating its timing as isolated ML-DSA performance
would misdescribe the instrument. Ed25519 uses Node's native crypto backend;
ML-DSA uses JavaScript. This is a comparison of these implementations and
operations, not an algorithm-independent speed ranking.

First dual signing calls took 7.4744–13.1451 ms after key generation and
backend import. Import took 7.7168–10.3712 ms. Peak whole-process RSS was
61,456–61,680 KiB for dual signing. Process wall time includes the complete
warm run; neither it nor the first signing call measures total startup.

## Evidence and method

The [runtime record](../research/qualification-2026-09-11/pq-runtime.json)
contains all timing samples, environment, dependency integrities, installed
source hashes, CPU and memory readings, entropy controls and limitations.
The [derived summary](../research/pq-measurement-2026-09-14/summary.json)
links source hashes to the figures above. September 14 is the write-up date,
not a rerun of the benchmark.

The host was macOS arm64, Node v22.13.1, with Node reporting OpenSSL
3.0.15+quic. The ML-DSA dependency was the lockfile-pinned
`@noble/post-quantum` 0.7.1. The message was 53 bytes and the context was
`scvd.store:corpus-checkpoint:v1`. Processes alternated serially, with
concurrency one. No precise CPU model, controlled host-load baseline or
cross-machine sample is established by this record.

The [September 11 interoperability record](../research/qualification-2026-09-11/pq-interop.json)
used a separate OpenSSL 3.5.1 executable. Three contexts were tested in both
directions, including the proposed checkpoint context. All 24 negative
checks rejected changed messages, signatures, contexts or keys. Only the
ML-DSA leg crossed implementations; this is not an independent envelope
parser qualification.

The [NIST-vector record](../research/qualification-2026-09-11/pq-acvp.json)
matched 70 selected ML-DSA-65 cases: 25 key-generation cases, 30 external
Pure signature-generation cases and 15 verification verdicts. Another 135
ML-DSA-65 cases for other interfaces/modes were excluded, as were other
parameter sets. The input manifest pins the public NIST files by revision,
length and hash. Passing these cases is not ACVP certification or FIPS
module validation. [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final)
specifies ML-DSA; standardizing the algorithm does not validate this backend.

The entropy control exercises the randomness source and requires an
exception on injected failure. The retained qualification notes also record
a mutation that incorrectly falls back to deterministic signing and fails
that check. Hedged and deterministic signatures both verify: the verifier
cannot establish which variant the issuer used.

## Signature bytes are not payment-header bytes

Base64url without padding would encode one 64-byte signature in 86
characters and one 3,309-byte signature in 4,412 characters. Those are
encoding calculations, not captured requests. The experimental envelope
uses hexadecimal signatures; its actual size also includes protected
metadata and payload. Public keys and JSON add further costs where present.

The x402 payment payload and a store-issued corpus checkpoint serve different
purposes. The former can travel in `PAYMENT-SIGNATURE`; the latter was
proposed as a separate downloadable artifact. The [x402 client/server
reference](https://docs.x402.org/core-concepts/client-server) describes that
payment flow. These measurements establish neither HTTP header fit nor
end-to-end x402 or MPP performance. A future transport study must measure
its exact encoded request through the actual client, proxy and server.

## What existing anchoring establishes

[Key-history anchoring](../src/services/anchor-log.ts) commits key state,
prior digest and an issued-artifact count. It does not commit every
artifact's bytes. [Corpus anchoring](../src/services/corpus.ts) separately
commits canonical snapshot bytes. A successfully verified Bitcoin proof
establishes existence by the anchor and integrity of the bytes committed,
under the hash and chain assumptions. A link, transaction reference or
artifact count does not confer that coverage on arbitrary related content.

Timestamping alone does not establish who authored the bytes. Conversely,
one should not assume all earlier attribution vanishes: what survives
also depends on retained evidence binding the issuer to the record before
signature compromise. We have not measured the residual coverage gap
well enough to call post-quantum issuance either necessary or redundant.

## Limits and decision

This is local backend evidence: no Worker benchmark, checkout p95,
concurrency qualification, production cost or buyer-demand measurement.
There is no constant-time or reliable JavaScript key-erasure guarantee,
independent backend audit, custody qualification or production approval.
The experiment used disposable keys. No production signing, public trust
statement, payment method or released verifier changes with this report.

Production checkpoints are parked. Custody, rotation, trust distribution,
production purpose enforcement and anchor-before-issuance remain conditional
requirements if that decision is reopened; they are not a current build
queue. The existing public stance needs no amendment merely to report an
experiment. A future issuance decision must reconcile that stance first.

Reopen on a named reader's durable-verification need or a relevant standards
and runtime change, followed by explicit scope review. Choosing another
payment protocol alone does not select the artifact signature algorithm.

## Reproduce or inspect

For inspection, download the three linked JSON records and the derived
summary; run `node research/pq-measurement-2026-09-14/verify-summary.mjs` from
the repository root to check their hashes and recompute the summary. This
checks the retained record, not a rerun or an independent attestation of
the host that produced it. For a new local run, from the repository
root, with a supported Node runtime and a fresh output filename:

```sh
cd experiments/pqc
npm ci --ignore-scripts
node runtime-qualification.mjs run /tmp/scvd-pq-runtime-new.json
```

This installs experimental dependencies locally and generates disposable
keys in memory. It must not receive production secrets. A different run
will have different timings. Dependency/install errors are setup failures;
failed assertions mean the claimed check did not pass. Keep that failure
visible rather than substituting a successful old result. Independent
interop and vector reproduction instructions are in the
[experiment README](../experiments/pqc/README.md).

The root `evidence:test` includes `envelope.test.mjs`. That test uses Node
Ed25519 keys as synthetic backend dispatch and does not import the PQ
library. The full experimental suite has its own dependency and lockfile;
parking production does not require deleting the root policy tests.

The root evidence gate also checks the retained source hashes, recomputes the
summary from raw samples and checks the headline figures in this report. Its
negative controls alter a summary, raw record, source script and report text;
those must fail. This consistency check uses only Node built-ins and does not
rerun signing or independently authenticate the recorded host.

The publication preparation also reran the three-context OpenSSL harness;
[that separate recheck](../research/pq-measurement-2026-09-14/publication-interop-recheck.json)
records its date and verdicts. It neither replaces the September 11 fixtures
nor supplies new timing samples.
