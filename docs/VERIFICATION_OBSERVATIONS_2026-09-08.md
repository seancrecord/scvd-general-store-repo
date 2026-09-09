# Verification follow-through — September 8, 2026

This is an implementation and observation record from
`codex/verification-evidence`. Release was subsequently authorized with
“alright lets roll”; the complete staged-release validation is recorded in
the linked plan. The maintainer note remains unsent.
The build order is ROADMAP VQ1 and its linked design.

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
developer page. Npm publication remains pending.

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

### Unsent note for directory maintainer

Our service is currently marked `unmeasured-network`. Could you check its
Base service/network attribution? In the captured September 8 data, the
Coinbase mapping already enables origin
`0xa32ccda98ba7529705a059bd2d213da8de10d101` on `eip155:8453`, and our service
offers advertise the receiving address
`0xdd350976b8cffc65938c0464d39a2c78be079bd0`.

Transaction
`0x3d88c1dac9d339020cd24bf70d92a8482bd43c6304d9d18a465e2dec6cac0b9b`
has that origin and a successful canonical Base USDC transfer of 5,000
atomic units to that recipient. Our signed receipt is
https://scvd.store/api/verify/cert_et6zuesrrn. This was our keeper's checkout
test, not organic traction; we are asking whether the attribution join and
measured-network status work, not asking you to count it as independent
demand. Is a harvest-window limit, payout mapping or assessment refresh
responsible? Raw read timestamps and the transaction receipt are available.

No recipient was selected and this note has not been sent.

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
