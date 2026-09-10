# Retained evidence follow-through — September 9, 2026

The keeper asked to keep going after the reader release. This pass reads
original evidence for the 44 signed `attests` bindings left unmatched by
the earlier census. It does not issue replacement observations.

## What the reads established

The formerly omitted certificate now serves a completed Bitcoin proof.
At 23:18 UTC its signed payload, signature and public key were unchanged,
and the independent Python check matched its proof to the same header from
Blockstream and mempool.space, including the header hash and proof of work.
Together with the earlier 261 checks, that completes **262 of 262 proofs in
the frozen certificate census**. This is not a new population count or
local Bitcoin consensus validation. The new anchor establishes present-day
existence, not the old certificate's historical issue time.

The first retained-evidence capture, 23:24:17–23:24:53 UTC, found:

- Three independently signed reports matching their original certificate
  digests: two trust profiles and one spot check.
- Two bundles whose individual member signatures and evidence hashes verify,
  and whose ordered member hashes match their certificate bindings.
- Six passport observations whose bytes match their certificate digests.
  These retained projections have no report signature and are counted
  separately from independently signed reports.
- Three patron-anchor records matching the original certificates' opaque
  buyer-supplied digests and certificate IDs. A separate check at 23:40 UTC
  verified all three Bitcoin proofs against matching outside headers.
  The buyers' underlying files were not supplied or checked.
- Two historical empty-string bundle digests with no member list recovered.
  They remain the previously classified empty-sheaf cases, not verified
  nonempty evidence and not a new finding about settlement or delivery.
- Twenty-eight remaining unresolved bindings: seven settlement attestations,
  eleven spot checks, eight bundles, one trust profile and one passport refresh.

The first capture read all eleven listed projection records. Of 41 targeted
transaction journals, three returned retained goods and 38 returned no
matching completed record through the existing readers. The three positive
results establish that the remote reader can retrieve real production goods.
A missing completed journal does not prove that the goods were never delivered
or that another historical source cannot hold them.

The final collector was re-run from 23:28:01–23:37:42 UTC. It recovered the
same signed reports, bundles and opaque anchors. One of the six passport
projection captures was unreadable, so that run correctly reports five
projection matches and 29 unresolved bindings. A separate 23:40:27 UTC retry
read the remaining projection; its bytes match the first capture and the
original signed certificate digest. The failed capture remains unchanged.
The six matches above rest on retained, checked bytes, not a silent replacement
of the second run's result.

Reviewed aggregate records and public headers are in
`research/verification-2026-09-09/retention-followthrough/`. Raw purchase
records, journal contents, certificate IDs and opaque buyer digests remain
outside the repository. The earlier census is preserved as captured.

## Reproduce the capture and check

With normal operator Wrangler access and independently established public keys:

```sh
node scripts/capture-retained-evidence.mjs ORIGINAL_PRIVATE_CENSUS TRUSTED_KEYS_JSON NEW_PRIVATE_DIRECTORY
node scripts/retained-evidence-coverage.mjs ORIGINAL_PRIVATE_CENSUS NEW_PRIVATE_DIRECTORY TRUSTED_KEYS_JSON
```

The collector verifies the original census's checksums and all enumerated
certificate signatures before selecting targets. Its manifest binds the
supplement to that exact source manifest. A missing or unreadable source
certificate refuses the targeted run rather than shrinking its denominator.
The output directory must be new, outside every Git checkout, with an existing
parent directory. Files are private; only reviewed aggregates belong in Git.

The extra KV bindings and prefixes derive from the production key registry.
Their lists, individual reads, checksums, caps and dates are retained. A list
or value can change during the capture; KV does not provide a historical
snapshot. The key and byte caps are defined in
`scripts/lib/retained-evidence-contract.mjs`. Missing, unavailable, unreadable,
unsupported and oversized evidence is not counted as verified.

The transaction-journal reader uses a temporary authenticated Wrangler remote
preview bound to the existing production Durable Object class. It exposes no
store route and deploys no store version. A random session token authorizes the
preview; its SHA-256 comparison value is the only token material in the
short-lived configuration. The collector first checks that an unauthenticated
request receives 401, and closes the preview and removes its configuration in
`finally`. No store signing key, wallet key or admin password is used.

Only `readArtifact`, `artifactStage(digest, 'response')` without a proposed
write, and the legacy `readCompleted` RPC are called. They retrieve retained
responses under the certificate's network, transaction, payer and product
path. The reader exports only observation/attestation fields, excluding
recovery tokens and the rest of the purchase response. It does not call a
purchase handler, retain a new observation, sign, settle, schedule recovery or
invoke a storage mutation. Application bounds apply to exported bytes; they
do not constrain the provider's internal listing or RPC memory allocation.

The offline checker verifies exact signed bytes and the certificate hash join.
For bundles it verifies each member before hashing the evidence hashes in
original delivery order. Empty bundles remain distinct. A latest projection
for the same host is insufficient unless its exact bytes match the old digest.
A buyer-digest anchor also needs the correct certificate ID. Stored timestamp
status is never promoted into independent Bitcoin verification by this command.

For a buyer-supplied SHA-256 digest, the separate Python proof tool now supports:

```sh
python scripts/verify_ots_header.py --digest INDEPENDENTLY_ESTABLISHED_SHA256 --proof DETACHED_OTS --header HEADER_HEX_FILE --block-hash OUTSIDE_BLOCK_HASH --height OUTSIDE_HEIGHT
```

It refuses a mismatched digest, non-SHA-256 proof envelope, altered proof,
wrong header, invalid proof of work or wrong height. Its result explicitly
says that preimage bytes were not checked. Existing `--payload` verification
retains its byte-checking behavior. The caller must establish the digest's
binding, block height and chain membership independently; this tool does not
run Bitcoin consensus.

## Remaining evidence boundaries

The 28 unresolved bindings still need an original saved delivery or another
historical source. Prepared-observation journals keyed by authorization
identity and hosted grants keyed by purchase identity are not enumerated by
this transaction-response collector. Current retention code is not proof that
older purchases have those records. Neither a fresh chain query nor today's
host projection can replace the original signed bytes.

Historical `saw` preimages remain outside this pass. The two empty-sheaf cases
remain linked to the existing September 4 correction. The standalone screening
product and production PQ signing remain separate decisions. OpenAPI reader
headroom remains ROADMAP VQ5; the directory maintainer note has already been
sent by the keeper and is not duplicated. A direct live read at 00:30 UTC
September 10, after the separate buyer-guidance release, measured OpenAPI at
718,252 UTF-8 bytes with 161 paths: above the existing 700,000-byte warning
budget and below its 1,000,000-byte cap. `openapi-live.json` preserves the
measurement; the web reader's cached response was not used for it.

## Directory follow-up

A later public directory read at 00:50 UTC September 10 reports `measured`
(162 settlements and $999.082 over 30 days). One buyer represents 99.79%
of reported volume; these are directory counts, not an independent demand
audit. The earlier unmeasured readings below remain history. The visible
status gap is closed; the maintainer's methodology reply is still pending.
Data: [x402-list.com](https://x402-list.com/services/sean-claude-van-damme-s-general-store)
(CC BY 4.0); captured in
`research/verification-2026-09-09/retention-followthrough/directory-measured.json`.

## Validation

The four initial verifier regression cases and all four initial journal-reader
cases were observed failing before implementation, then passing. The offline
command regression also failed with the adapter disabled and passed after its
restoration. Tests cover tampering, member deletion/reordering, missing captures,
source-manifest substitution, unauthorized requests, bounded streaming and
refusing capture paths inside Git. The read-method spy rejects any accidental
write argument. The digest-only Bitcoin check was observed failing before its
implementation; proof, header and digest tampering are exercised separately.

The first evidence-suite attempt was stopped by sandbox denial of the local
server used by two existing CLI tests (`listen EPERM`). Typecheck had passed.
The unchanged retry passed all 48 Node evidence tests with local-server
access. All eight Python proof tests, typecheck, both Worker dry-run builds,
the claims register and documentation check passed. The documentation check
reports its existing dated backlog.

Two local full Worker-suite attempts were interrupted after repeated runtime
internal errors; the second used one worker. Neither is a clean full-suite
result. No timeout, assertion or production Worker source was changed to
obtain a pass. The baseline application code had passed CI, but that does not
replace this branch's full check: merge remains gated on successful application
CI. `validation.json` records the local results; the pull request and its
checks record the release outcome.
