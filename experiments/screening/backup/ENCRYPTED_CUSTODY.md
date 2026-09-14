# Encrypted archives and independent custody

September 11 local qualification. Encryption, ciphertext copy checks and offline
recovery are implemented. The tested archive and keys are disposable synthetic
fixtures. No real recovery key, independent account, scheduled collector or live
transfer exists as a result of that qualification. The September 12 setup below
records subsequent account and custody choices; retention remains undecided.

## Tool and format decision

Use the separate age executable on the backup/recovery host. There is no added
npm dependency and no encryption or key material on the Worker request path.
`encrypted.ts` declares the qualified version and stream format. Its version
check is a compatibility check, not executable authentication. Qualify the exact
binary through a trusted distribution and protect its path from replacement.
The retained qualification receipt records the Homebrew bottle checksum,
executable checksum, platform and source of metadata used for this local test.
It does not claim upstream Sigsum verification or qualify another platform.

This implementation accepts one native age hybrid public recipient. age documents
that recipient as X25519 + ML-KEM-768 and provides its authenticated streaming
format. This is encryption of private backups, separate from the store's
Ed25519 signatures and the proposed ML-DSA checkpoint work. There is no classic
recipient fallback or reuse of a signing/SSH key. The tool's own implementation
validates the recipient encoding. See the [official age manual](https://github.com/FiloSottile/age/blob/v1.3.2/doc/age.1)
and [release](https://github.com/FiloSottile/age/releases/tag/v1.3.2).

The plaintext inside age is newline-delimited JSON: the first line contains
`format` and the existing backup `manifest`; each following line is one existing
backup record. All lines, including the last, end in a newline. Bounds and record
verification use the existing backup format. The manifest hash must still come
from an independently trusted source. Encryption does not establish who collected
the snapshot, provider authorship or the truth of retained evidence.

## Local commands

Build from the repository root:

```sh
node experiments/screening/backup/build.mjs
```

Seal a collected snapshot using a file containing only the public recipient:

```sh
node experiments/screening/backup/.build-check/encrypted-cli.mjs seal /trusted/bin/age /private/collected EXPECTED_MANIFEST_SHA256 /private/recipient.txt /private/new-archive.age
```

The seal reads and verifies exactly the records it passes to age. Its fixed-field
receipt includes the manifest hash, ciphertext hash and byte count, recipient
fingerprint and qualified version. `remoteDeliveryVerified` remains false.
The key is not required to encrypt. Encryption success does not prove the keeper
has a working recovery copy of the corresponding identity; an actual open drill
does that.

After uploading and independently downloading the object with the chosen
provider's authenticated client, check the downloaded ciphertext against the
seal receipt retained through the separate trusted path:

```sh
node experiments/screening/backup/.build-check/encrypted-cli.mjs check-copy /private/downloaded.age EXPECTED_CIPHERTEXT_SHA256 EXPECTED_CIPHERTEXT_BYTES
```

This checks bytes. It cannot prove a local file was downloaded from an independent
provider: `remoteOriginVerified` remains false. Record the real destination,
object/version identifier, authenticated upload/readback result and time as part
of the eventual live drill. No transfer adapter or provider credentials are
implemented by this command.

On the keeper's recovery host, open the downloaded archive into a new path:

```sh
node experiments/screening/backup/.build-check/encrypted-cli.mjs open /trusted/bin/age /private/downloaded.age EXPECTED_MANIFEST_SHA256 /private/backup-identity.txt /private/new-restored.sqlite
```

The identity path is passed directly to age; the wrapper does not read or print
its bytes. The qualified ceremony uses a native hybrid identity. Interactive
password/hardware/plugin workflows are unqualified; the child receives no host
environment secrets or plugin search path. Tool diagnostics are suppressed in
favor of fixed refusal text. No shell is used to invoke age.

A successful open requires age to finish successfully, followed by full existing
manifest/record/evidence verification. Authenticated chunks arriving before a
late decryption failure cannot publish a verified restore. The output remains
quarantined, with no live budget tables or method to admit requests or release
reservations. Production reconciliation is still a separate acceptance gate.

## Private working files and failures

The collected manifest and record files, verification scratch database, and
restored SQLite file contain plaintext operational authority. Use a trusted
private directory on an encrypted disk with adequate space. Temporary staging
is owner-only under the output parent so final publication stays on the same
filesystem. Final files are owner-only, synced, and linked into place without
overwriting an existing file or symlink. The parent directory is synced too.

Normal failures remove staging and publish no new output. A directory-sync
failure after publication can leave a completed output despite a refused command;
inspect and verify it before deciding how to retry. Power loss or forced process
termination can leave private staging directories. Inspect them during recovery;
this tool promises neither secure erasure nor crash cleanup. It does not remove
source plaintext. Space/volume limits and encrypted scratch storage belong in the
host setup, and maximum-volume timing is not qualified by the small fixtures.

## Keeper choices before real data

These are proposed custody requirements, not a record of provisioned accounts:

1. Choose storage independent of the store's Cloudflare account and the backup
   host. Decide retention duration, versioning/immutability, administrator access,
   billing ownership and recovery access. A second bucket in the same account
   does not meet the account-loss drill.
2. Give the collector only the permissions required for capture and upload.
   Keep deletion/retention administration separately controlled. Confirm what
   the chosen provider actually enforces before documenting that claim.
3. Create the dedicated backup identity in the keeper's trusted recovery
   environment, using the qualified tool. Keep recoverable copies in separately
   controlled locations and prove each can open a synthetic archive. Place only
   the public recipient on the collector. Never send the identity through chat,
   logs, a Worker binding, or the repository. The existing production signing-key
   ceremony in `../../../THE_PAPER_KEY.md` is unrelated and must not be reused.
4. Keep the expected manifest hash, seal receipt and destination object/version
   receipt in a separately trusted register. A replaceable checksum beside an
   archive is insufficient. Preserve the exact qualified tool and instructions
   needed for recovery without depending on the lost production account.
5. Perform an actual upload, readback and offline open using those independent
   credentials and recovery copies. Record measured elapsed time, bytes,
   original snapshot identity, exact row preservation and disabled admissions.
   A copy on the same laptop is not this drill.

For rotation, prove the new recovery identity on a synthetic archive first and
record its public fingerprint. Existing ciphertext still requires the old identity
unless explicitly opened and re-encrypted. Retain old recovery material until
all retained generations have been checked; no key or archive deletion is
performed automatically. Losing every recovery copy makes the archive unreadable.
Changing keys does not revoke access to old ciphertext already obtained.

## Qualification

```sh
SCVD_AGE_BIN=/trusted/bin/age node --test experiments/screening/backup/encrypted.test.mjs
SCVD_AGE_BIN=/trusted/bin/age SCVD_BACKUP_ENCRYPTION_MUTATION=exit node --test --test-name-pattern='complete decrypted plaintext followed' experiments/screening/backup/encrypted.test.mjs
```

The test executable requires the sibling `age-keygen`. Keys are generated only
for disposable synthetic fixtures and removed with their private test directories.
The second command disables the successful-process-exit guard in a test-only
bundle and must fail the original assertion. The receipt under
`../../../research/qualification-2026-09-11/encrypted-backup/validation.json`
records what ran, including the checks that remain unperformed.

## September 12 — live destination prepared

The keeper created a Backblaze B2 account and selected Bitwarden Free. A dedicated
empty private bucket was created through the authenticated console, with SSE-B2
encryption and Object Lock enabled. Exact bucket identity, endpoint and observed
account caps are in `../../../research/qualification-2026-09-12/backblaze-setup.json`.
The existing zero-dollar storage/download caps were left unchanged. They are
observations of the account UI, not a guarantee that all possible use is free.

No retention period was set, and the default lifecycle still keeps all versions.
The creation UI describes per-file compliance retention. Do not treat the enabled
Object Lock switch as evidence that any uploaded file is protected, or assume
governance/default-retention support from this UI. Inspect actual enforcement
before setting an operational retention policy.

The chosen recovery-key storage is a Bitwarden Secure Note containing the exact
identity text; this avoids paid file attachments. Recovering it means recreating
the identity file locally with its original text and verifying a restore. The
identity, note contents and independent offline recovery copy have not yet been
created or tested. The key must go directly into the keeper's vault, never chat.

Application-key options were inspected but no key was created. Before granting
a collector access, qualify explicit bucket/prefix restrictions and required
capabilities; a UI label of Write Only is not proof that deletion/retention
administration are excluded. No uploader, live archive or schedule is connected.

## September 12 — dedicated recovery identity created

After the keeper reported creating the empty Bitwarden Note, the qualified age
and age-keygen binaries were rechecked against the retained executable hashes
and copied into a new private local custody directory. The qualified keygen
created a dedicated native hybrid identity directly into an owner-only file.
The orchestration process did not read or print identity bytes; only age read
the identity to derive its public recipient and perform a synthetic encrypt/
decrypt check. That check passed. The production signing key was not used.

The non-secret receipt is
`../../../research/qualification-2026-09-12/recovery-key-created.json`. Local
files are in an owner-only private custody directory outside this repository:
the keeper-facing recovery identity, public recipient, qualified executables
and the non-secret custody receipt. The exact local directory and identity
filename are omitted from this published copy (September 14 privacy redaction).
Do not dump, preview through agent tools, stage, or copy the identity into this
repository. The keeper copies its text directly into the Bitwarden Note.

Vault storage and recovery from the vault have not been verified. The local
round-trip used the original identity, so it cannot prove the vault copy or an
independent offline copy is correct. No real operational archive, upload,
Backblaze application key, collector or automatic backup was created.

## September 12 — keeper-retrieved vault copy tested

The keeper identified the second copy on Desktop. It was an RTF document with
a `.txt` extension and contained bare public and private values. age correctly
refused that original file. An explicitly RTF-decoded private temporary copy
was reduced to its single valid native private-key line; the public line was
omitted from the identity input. No key contents were displayed. The resulting
public fingerprint matched the original creation receipt, and the derived
identity decrypted a synthetic probe plus complete held/recovered screening
backup fixtures. Exact rows and disabled admissions were checked.

A clean owner-only copy is now saved as `Bitwarden Recovery Check.txt` in the
private local custody directory, beside `bitwarden-check-receipt.json`. The
original and Desktop files were unchanged. Tool-generated temporary identity
copies were removed after retaining the verified local copy and non-secret
receipt. This is ordinary cleanup, not a secure-erasure claim.

Evidence: `../../../research/qualification-2026-09-12/bitwarden-copy-check.json`.
The vault origin is keeper-reported: this process did not inspect Bitwarden
itself. The receipt demonstrates recoverability of the supplied key material
after the stated normalization, not acceptance of the original RTF file by age.
For future identity files, use plain text with the private-key line alone or
retain comment markers on any public/date lines. An independent offline copy,
Backblaze upload/readback and automatic backup operation remain unverified.

## September 13 — synthetic upload confirmed; remote recovery pending

A five-row recovered-case fixture was sealed with the real public recipient and
uploaded through the authenticated console to the private B2 bucket. The
6,606-byte ciphertext appears in the file list; its console SHA-1 matches the
local ciphertext. File identity, SHA-256, manifest hash and observed settings
are retained in `../../../research/qualification-2026-09-13/backblaze-synthetic-upload.json`.
This is synthetic data only. No plaintext or recovery identity was uploaded.

The file has SSE-B2 enabled. Although the bucket supports Object Lock, the file
has no retention lock or legal hold. The web download dialog refused this file:
“For security purposes, encrypted files are not downloaded via the web user
interface.” No independent downloaded copy exists, so remote byte verification
and recovery remain pending; the upload listing/hash alone is not a restore test.

A standard application-key form is prepared but not submitted: Read Only,
restricted to this bucket and the complete sample filename as its prefix,
86,400-second duration, with listing all bucket names disabled. The keeper must
retain the one-time key ID and application key directly in private local
storage. Verify the actual granted capabilities and scope from API authorization
before downloading the exact retained file ID. Never use the master key or
include credentials in chat, logs, source control or receipts. This download
credential is separate from the age recovery identity; it does not decrypt age.
See [Backblaze application-key documentation](https://www.backblaze.com/docs/en/cloud-storage-application-keys).

Existing spending caps were unchanged. No collector, schedule, production data
transfer, retention policy or production restore was enabled.

## September 13 — authenticated download and recovery completed

The keeper saved the scoped credential locally. B2 Native API v4 authorization
confirmed the single bucket, exact sample filename prefix and expiration at
2026-09-14 17:33:54.662 UTC. The console's Read Only preset includes metadata
reads and `shareFiles` (scoped download-token issuance), as documented in
[Backblaze capabilities](https://www.backblaze.com/docs/cloud-storage-application-key-capabilities).
The manual drill allowed that documented preset; no download-sharing token was
created and no write, delete, key-administration or retention-change capability
was granted. Future unattended access still needs its own capability policy.

The exact retained file ID was downloaded over verified TLS with redirects
refused. Response file identity, filename, SSE-B2 header, byte count and SHA-1
were checked; SHA-256 matched the independently retained source receipt. The
standalone copy checker also passed. Its `remoteOriginVerified: false` means
that utility checks only bytes: the separate authenticated download receipt
supplies remote provenance.

The verified age executable decrypted the actual downloaded file using the
clean keeper-retrieved recovery identity. Authentication and manifest checks
passed. All five records equal the source fixture, including their raw bodies.
The owner-only SQLite restore contains only restore metadata and archived rows;
it is quarantined, with admissions disabled and no live tables. Receipt:
`../../../research/qualification-2026-09-13/backblaze-roundtrip.json`.

This completes one manual synthetic upload/download/restore drill, not a backup
service. Vault origin remains keeper-reported and an independent offline key
copy remains unverified. The sample has no applied retention lock. Operational
collection, trusted manifest retention, full-volume qualification, scheduling,
freshness monitoring and production reactivation remain open. No spending caps,
production state or signing keys changed. The Desktop API credential file was
read without displaying it and was left in place; it expires at the time above.
The recovery identity does not expire with that API credential.

## September 13 — host collector qualification added

`collector.ts`, `b2.ts`, `gateway.ts` and `collector-cli.ts` now compose capture,
verified encryption, version-specific upload/readback and dated freshness checks.
The host configuration is disabled by default. The new transport's HTTP tests
are synthetic; they do not extend the earlier manual live drill into an operating
backup claim. Exact state-machine, credential, retention and deployment limits
are in [host collector operations](HOST_COLLECTOR.md). No new key or live upload
was performed by this increment.
