# Verification follow-through — September 8, 2026

This is an implementation and observation record from
`codex/verification-evidence`. Release was subsequently authorized with
“alright lets roll”; the complete staged-release validation is recorded in
the linked plan. The maintainer note remains unsent.
VQ1 shipped in PR #585. The follow-through is ROADMAP VQ2 and its linked design.

## September 9 follow-through

The known receipt's exact bytes and detached proof now verify through the
standard OpenTimestamps library against the same Bitcoin header returned
by Blockstream and mempool.space. The header hash and proof of work also
check. This establishes a match to an independently obtained header;
height and active-chain membership still depend on those HTTPS sources.
No local Bitcoin consensus node was used. Its missing `saw` file remains
missing; a timestamp does not fill that evidence gap.

The larger, separately bounded capture read every entry in the public
corpus index: six signatures, six digest links, and six completed proofs
retrieved from their calendars and checked against matching headers from
the same two outside sources. The published corpus still said **pending
for all six** at capture time. Local upgrades do not change production.
Inspection across `src/` found submission at the weekly freeze but no
corpus upgrade caller. The new bounded hourly pass finishes that delivery;
signed snapshots, digests and signatures stay unchanged. It also retries
failed submissions, counts unreadable / invalid records and deferred work,
and refuses another pending calendar answer as a completed proof.

The feed previously called any timestamp record Bitcoin-anchored, even
pending or failed ones. It now states the actual stored status and says
completed proofs need independent verification. The final documentation
sweep applies the same distinction to the trust page, agent instructions,
weekly brief, askable index, FAQ and client READMEs. The attestation
specification now uses the shared installation description and states the
PQ experiment's remaining production requirements. The dated correction is
`src/store/corrections-ledger/2026-09-09-corpus-timestamp-delivery.ts`.

Reproduce from the saved public inputs, without network reads:

```sh
python3 -m venv /tmp/scvd-ots-review
/tmp/scvd-ots-review/bin/pip install opentimestamps==0.4.5 python-bitcoinlib==0.12.2
/tmp/scvd-ots-review/bin/python scripts/verify_ots_header_test.py
node scripts/verification-followthrough-report.mjs /tmp/scvd-ots-review/bin/python
```

The report uses the production canonicalizer, checks capture hashes,
verifies signatures against the separately captured issuer HTTPS key,
then checks the actual proof operations and selected headers through the
independent Python libraries. Inputs, source URLs, capture times and the
derived `verified-report.json` are in `research/verification-2026-09-09/`.
These packages are isolated review tools, not production or npm-verifier
dependencies. No private key is involved.

Coverage is **all sequences listed in that captured index**, not a census
of every certificate or evidence report the store has issued, and not proof
that no record was withheld. The index was 11,492,925 bytes and snapshot 6
was 11,483,825 bytes: both exceed the evidence CLI's unchanged 8 MiB cap.
The reporting capture deliberately allowed 32 MiB per read. Making the
index compact and providing a usable large-snapshot verification path is
still work; this measurement does not cure their reader-limit violation.

The September 8 description of certificate sweep counters needs a narrower
reading: the function **returns** those counters; its current hourly
caller discards them. They are not a published production coverage ledger.
Certificate / linked-report population reconciliation remains open.

The refreshed directory record still says `unmeasured-network`, while its
Coinbase mapping still enables the sampled transaction origin and the
service still advertises the matching payout address. The note below
remains unsent and asks about attribution, not organic traction. Verifier
1.2.0 is now published through the provenance workflow. The registry
artifact exactly matches the reviewed tarball; npm verified its signature
and attestation, and an independent registry installation checked the real
receipt while reporting the missing `saw` evidence. Publication receipts
are in DISTRIBUTION.md and the September 9 research folder. The publishing
workflow now runs the package's own tests; its README has a stable link.

The September 8 observations below remain the dated record of what was
checked then; the Bitcoin and corpus limitations are superseded only to
the extent stated above.

The keeper confirmed that the original comparison concerns Rubric.
The Rubric source read in `docs/SPEC_READS.md` applies directly. Its
documented batching, pending anchor states and MCP support qualify the
original comparison; confirmation of identity is not verification of
every claimed capability or paid workflow.

## What is built

The source release of `x402-verify` now includes a portable bundle and
`scvd-evidence` CLI. Export preserves exact signed payload bytes, separately
captured issuer context, supplied files whose hashes appear in the signed
payload, and available OTS proof bytes. Verification requires a key the
caller establishes independently, operates offline, and distinguishes an
invalid signature from missing linked evidence. Unknown formats and
algorithms refuse. The current hash-link vocabulary is `attests`, `saw`,
and `body_sha256`; it is not a general archive crawler or a corpus-chain
verifier. Bundle and input limits are defined in `evidence-bundle.js`.

Payment challenges now expose the existing item's `sample_url` and a
structured **unsigned specimen** description wherever the menu supplies
one. An unsampled item receives no invented demo. This makes existing
specimens discoverable at the refusal point; it does not provide a live
free trial for every paid product. The test covers both cases and the
existing door-parity and shopping-field tests cover the common paths.

Draft source-tool descriptions were added to the receipt JSON and
developer page. Npm publication was pending at the September 8 close;
the September 9 release above supersedes that status.

## The directory mismatch, narrowed

Saved inputs and reproducible derived output are under
`research/verification-2026-09-08/`. Run
`node scripts/verification-observation-report.mjs` to reproduce the joins
without network access. Every live read retains its URL and capture time;
`corpus-first.json` is the raw exception, fetched from
https://scvd.store/corpus/1.json on this date before the 20:48:33 UTC pilot.

The receipt `cert_et6zuesrrn` verifies locally using the separately fetched
HTTPS key document. Its settlement transaction is
`0x3d88c1dac9d339020cd24bf70d92a8482bd43c6304d9d18a465e2dec6cac0b9b`.
The Base RPC reports success and a 5,000-atomic-unit canonical USDC transfer
from the receipt's payer to the address advertised in the directory.

Transaction origin `0xa32ccda98ba7529705a059bd2d213da8de10d101` is already
an enabled Coinbase settler in the directory's own Base mapping. It is
different from the token transfer's payer; confusing those two fields
would break the join. The service assessment nevertheless reports
`unmeasured-network`, no measured networks and null volume.

Inference: investigate service/network attribution, harvest coverage or
assessment freshness. This example does not support the proposed fix of
registering a missing store-operated facilitator. It also does not prove
which part of the directory's backend is responsible. One RPC provider is
the chain-data trust boundary; this is not local chain validation.

The keeper identifies this payment as his browser purchase. It is a useful
measurement canary and **not independent customer demand**. No traction
score or ranking gain is forecast. Directory data: x402-list.com, CC BY 4.0;
source URLs and provenance remain in the saved inputs.

### Unsent note for directory maintainer — refreshed September 9

Recipient: **info@x402-list.com**, listed on
[the directory contact page](https://www.x402-list.com/contact), read
September 9. Subject: **Base attribution for scvd.store**.

Our service remains `unmeasured-network` in the September 9 capture. Could
you check its Base payout/network mapping and settlement attribution?
Your Coinbase mapping enables transaction origin
`0xa32ccda98ba7529705a059bd2d213da8de10d101` on `eip155:8453`, and our service
advertises recipient `0xdd350976b8cffc65938c0464d39a2c78be079bd0`.

Our previously captured transaction
`0x3d88c1dac9d339020cd24bf70d92a8482bd43c6304d9d18a465e2dec6cac0b9b`
has that origin and a successful canonical Base USDC transfer of 5,000
atomic units to that recipient. The token transfer's sender is the buyer,
which differs from the transaction origin. Does “sender” in your
per-service attribution documentation mean transaction origin or token
`Transfer.from`? Could payout/network normalization or the harvest window
explain the null network and volume fields?

The signed receipt is https://scvd.store/api/verify/cert_et6zuesrrn. This
was our keeper's checkout test, not organic traction; we are asking about
the attribution and measured-network status, not asking you to treat it
as independent demand. Dated captures and the reproducible join are in
`research/verification-2026-09-08/` and `research/verification-2026-09-09/`
in https://github.com/seancrecord/scvd-general-store-repo.

This note has not been sent. It needs the keeper's send decision; the
recipient is now identified and the evidence is prepared.

## Anchor sample and unresolved coverage

The denominator is **one known receipt**, chosen because the keeper had
reported delivery. Its signature verifies. Its `saw` evidence is absent
from this capture and is reported missing. Submission is recorded 42m
4.999s after issue; the claimed block timestamp is 1h 7m 31.980s after
issue; upgrade is recorded 2h 41m 47.761s after issue. These are differences
between stored event times, not continuous observations of availability.

The exported `.ots` file was independently parsed by
`opentimestamps-client 0.7.2` / `opentimestamps 0.4.5` using `ots --no-cache
info`. It reproduced the payload digest and the proof's Bitcoin height
965852. **Parsing is not chain verification.** No trusted Bitcoin headers
were supplied; independently verified Bitcoin proofs remain **0/1**.
`ots-format-check.txt` retains the computed proof operations and Merkle root.

The corpus index and latest snapshot exceeded this read's 8 MiB cap.
Their failure records remain. Snapshot 1 was readable and was used for the
PQ file-checkpoint experiment only. This does not establish fleet coverage.

Existing certificate sweeps already report `behind_head`,
`behind_backfill`, `still_pending`, `pending_truncated`, submissions and
upgrades. Their current production values were not read. No duplicate
counter or new ledger was added. A future coverage census should reconcile
those counters with eligible certificates and their linked report hashes;
missing or unreadable rows must remain in its denominator.

## Screening design, conditional on demand

The existing `oracleScreen` returns `listed: true | false | null` from an
`eth_call` at `latest`. It does not retain an exact block identity. That is
insufficient for a replayable standalone paid observation without work.

A proposed address observation should validate the supported address
shape first; resolve a block number and hash; call the configured source
contract at that exact block using a provider-supported block identifier;
and check the block remains canonical before sealing. Unsupported block
selection or unavailable historical state yields an explicit unavailable
reading, not a fallback to `latest`. Record the chain, block number/hash,
source contract and method, normalized input, capture time, raw answer,
interpreted result and any provider limitation in the signed payload.

The outcomes are **listed**, **not listed by this source at this block**,
**unsupported input/source**, and **unavailable**. “Not listed” is not a
counterparty safety score, identity verification, or legal clearance. Never
sell the stronger claim by naming the endpoint `safe-counterparty`.

Acceptance would include fixed-block replay, reorg handling, provider
failure, malformed ABI answers, unsupported addresses and tampered reports.
No SKU, price, paid unavailable-result policy or demand tag is selected.
Those unresolved terms keep this at design stage under house rule 19.
Existing payment screening behavior is untouched.

## Key-loss and compromise rehearsal

`verifier/key-exercise.test.mjs` uses synthetic keys and fixed dates. Old
artifacts continue to verify with retained old public keys after rotation;
substitution of the new key fails. A retired key signing an after-retirement
date can be flagged by the existing service-window check. A stolen old key
can also sign a date inside its former window: both the signature and date
check pass, while independent time evidence remains absent.

Operational loss: stop relying on the unavailable private key for new
issuance; retain its public key and all historical artifacts; establish
and announce a successor through the actual available authority. Never
fabricate a predecessor signature when that private key is unavailable.

Suspected compromise: preserve incident evidence and known earlier proofs,
stop affected issuance, identify the earliest defensible cutoff, publish
the affected key/window and verification guidance through independently
controlled channels. Re-signing old bytes after compromise does not prove
they existed before it. An independently verified earlier anchor may
preserve an existed-by claim under its hash/ledger assumptions; it does
not establish factual truth. Anchors submitted after the uncertainty
window cannot recover the missing history.

The rehearsal does not test the keeper's real backup, custody, recovery
access or incident communications. No production key was handled.

## PQ result and decision

The protected experimental envelope and actual dual-signature checkpoint
passed local verification, including a separate verifier process after the
signer exited. Payload, purpose, signature tampering and signer removal
were rejected. The saved ML-DSA-65 signature is 3,309 bytes versus Ed25519's
64; the experiment's JSON representation is larger still. Exact timings
and runtime are in `pqc-pilot.result.json`, not a production latency claim.

The candidate library explicitly reports no independent audit. Production
adoption is not approved by this experiment. The next crypto decision is
implementation review and independent interoperability plus a recovery
plan, not replacing the live signer. See `experiments/pqc/README.md`.
