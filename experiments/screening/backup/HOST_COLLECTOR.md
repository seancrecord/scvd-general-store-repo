# Screening backup host — implementation and activation

September 13: the collector, B2 transport, private source gateway/client and
single-run/freshness CLI are implemented and locally tested. Nothing is scheduled
or deployed by this increment. The earlier real B2 synthetic restore remains a
separate receipt; the new upload transport uses mocked HTTP in its tests.

## One job, one frozen generation

`collector.ts` owns a private root, exclusive process lock, one pending job and
immutable per-generation receipts. It observes the current source manifest before
creating a generation; an unrecognized predecessor refuses. A pending capture
reuses its original identity and predecessor. It cannot replace the source's
staging snapshot merely because a prior attempt failed.

Records arrive in bounded pages, are checked for sequence/hash/completeness, and
are written only into owner-only plaintext staging. The existing age sealer
verifies the full record relationships while encrypting. The collector also
checks the age executable's independently qualified SHA-256 before starting.
Only the public recipient is needed. No age identity is read by this process.

An upload intent is durably written before sending ciphertext. Its successful
response records an exact file version. A lost response leaves intent without an
object receipt and stops automatic resubmission: an upload may have happened.
The source and ciphertext stay frozen for inspection. A known successful upload
can be downloaded again without uploading again, with a bounded attempt counter.
Every successful job requires the downloaded ciphertext to match the sealed
SHA-256 and byte count. It does not decrypt during normal backup; the receipt
therefore explicitly says `restorePerformed: false`.

A success receipt is synced before the latest-success pointer moves. A crash
between those writes resumes publication of that original receipt without
changing its capture or verification time. A stale lock, unknown upload outcome,
completed ciphertext without a seal receipt, or exhausted download attempts
requires inspection. The code never automatically removes a stale process lock,
deletes remote files, releases reservations or changes retention settings.
Do not erase the pending journal to make an error disappear. Check the process,
source identity, remote version and independently retained hashes first.

Normal failures clean the current plaintext staging, and leave resumable journal
state. A killed process may leave private plaintext scratch behind. Receipt and
ciphertext retention also consumes local disk. Neither cleanup nor fsync is a
secure-erasure claim; encrypted host storage is still required. The trusted host
and its receipt directory are a security boundary, not an adversarial database.

## Destination and credential contract

`b2.ts` uses the documented [Native API authorization](https://www.backblaze.com/apidocs/b2-authorize-account),
[upload-location](https://www.backblaze.com/apidocs/b2-get-upload-url),
[upload](https://www.backblaze.com/apidocs/b2-upload-file) and
[download](https://www.backblaze.com/apidocs/b2-download-file-by-id) operations.
Each credential must have exactly one configured bucket and filename prefix.
The writer must grant **only `writeFiles`**. It cannot delete versions, administer
keys or change retention. The reader must grant `readFiles`; the documented
read-only metadata capabilities and scoped `shareFiles` are allowed, but no
sharing-token operation runs. Do not substitute the web console's Write Only
label for the actual capability check. The existing one-day sample credential
has a different filename prefix and is not a collector credential.

This pilot requires expiring credentials, with at most 31 days left when used.
Qualification checks the actual authorization response; permissions, expiry or
scope changes refuse before a file transfer. This also makes credential renewal
an explicit operating task. No key is created by the adapter.

Only HTTPS B2 service hosts and the documented Backblaze upload hosts receive
authorization headers. Redirects are refused. Requests and streamed responses
have deadlines and byte bounds. Uploads carry SHA-1 for B2's wire check and request
SSE-B2; the response must confirm it. Readback checks the exact file ID, name,
length, SSE-B2 header, SHA-1 and locally retained SHA-256. Provider response prose
and tokens never enter errors or receipts. Upload responses and authorization
JSON are bounded separately from ciphertext. The pilot buffers each bounded
ciphertext in host memory; it is not a maximum-volume streaming uploader.

## Private source connection

`gateway.ts` provides a disabled-by-default handler for a dedicated backup host.
Compose it with the existing `ScreeningBackup` service binding using
[WorkerEntrypoint service RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/).
It exposes only manifest, capture and page, at `BACKUP_GATEWAY_PATH`.
The requester cannot select a Worker, budget, provider, operator or recovery
operation. The configured binding is resolved only after authentication and
request validation. No mount, route, binding or secret has been added to the
production store, its operator gateway, or the disabled screening Worker.

Machine authorization uses a new 256-bit random token, distinct from admin,
provider, B2, signing and recovery credentials. Supply it as a Worker secret and
an owner-only host file. HTTP, query parameters, browser request context and
unknown command fields refuse. Comparison hashes both fixed-size token values
and compares every byte. Responses carry no-store and restrictive headers; no
CORS permissions or browser UI are provided. Error text is fixed.

The source client uses that same machine protocol, verified HTTPS and no
redirects. Requests and response bodies are bounded with deadlines. An RPC
capture already issued can complete after a timeout: the collector retains the
same pending identity precisely for this case. A timeout is not evidence that
capture did not commit. The gateway tests currently exercise Web APIs in Node,
not a deployed authenticated host or real remote binding. Deployment must add
and qualify those boundaries before use with operational state.

## Pilot limits and freshness

`PILOT_BACKUP_POLICY` is the source of defaults. The disabled example configuration
is generated from it. The pilot currently permits a 16 MiB archive, reserves room
against a cumulative 256 MiB retained-ciphertext allowance, accepts captures up to
36 hours old, and permits at most three readback attempts per generation.
A full archive allowance is reserved before capture, so approaching the cap
stops conservatively. No deletion makes room. This ledger covers this collector's
known generations, not unrelated objects, independent writers or all B2 billing.
Provider spending caps remain the separate account-level limit.

The proposed cadence is one backup a day. The current retention behavior is
keep every version and stop at the cap; no lifecycle expiration or immutable
retention period is chosen. A compliance lock can prevent deletion and extend
storage charges, so select and test its exact duration separately. This is an
operating proposal, not an enabled schedule or a promise of free unlimited use.

`backupFreshness` measures age from the **source capture time**, never from the
upload's completion time. Missing, malformed and future-dated receipts do not
become fresh. The CLI's `check` mode needs no source/B2 credentials. Run the
observer independently of the collector; a check on the same sleeping or lost
Mac cannot report that it stopped. No notification delivery is wired here.

## Configure and run after provisioning

Build the host modules with `node experiments/screening/backup/build.mjs`.
Copy `host.example.json` into a private directory and replace its placeholders.
Keep `enabled` false until the live source and credential checks are qualified.
Set the private configuration, public-recipient file and credential files to
owner read/write only. The two B2 credential files contain the key ID on line
one and application key on line two; the source-token file contains only its
hex token. Keep those files outside this repository. Protect the parent directory
and qualified binaries, and verify the configured age checksum independently.

The `run` command executes one generation; it does not install a daemon:

```sh
node experiments/screening/backup/.build-check/collector-cli.mjs run /absolute/private/host.json
node experiments/screening/backup/.build-check/collector-cli.mjs check /absolute/private/host.json
```

Exit zero means that run verified its remote readback, or that check found a
fresh receipt. Disabled, missing, stale and unavailable states exit nonzero.
Command-line arguments contain only the command and configuration path.
The host output is a small status, never raw records, credentials or provider
error bodies. No verify/sign/CLI/Tab npm package needs a release for these
internal host tools.

The provisional host choice is this Mac, pending the keeper's answer. It adds
no separate hosting subscription, but sleeping/offline periods delay collection.
No launch agent, system cron, Codex automation or remote schedule was installed.

## Activation gates and trusted receipts

Before scheduling, provision the actual screening source/policy and a dedicated
gateway bound only to `ScreeningBackup`; qualify machine authentication and
source consistency there. Provision separate prefix-restricted writer/reader
credentials with the exact capabilities above. Run the actual collector end to
end against a disposable deployed source with real B2 upload credentials, then
perform an independent recovery drill and measure its timing and volume.

Retain the manifest/seal/object receipts through a separately trusted path that
survives loss of this host. The local immutable job files protect against normal
crash/retry mistakes, not an attacker replacing the entire local register.
Receipt backup, independent offline key-copy verification, maximum-volume
qualification, lifecycle/retention policy, scheduling and independent freshness
notification remain open. No production reactivation path is introduced.

Evidence and commands are in
`../../../research/qualification-2026-09-13/host-collector/validation.json`.
The negative controls remove one readback/authentication guard in a test bundle;
the original tests must fail. No production source files are changed by those
controls.
