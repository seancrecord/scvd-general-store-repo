# The restore drill

Written 2026-08-26. Roadmap 0.11's second half.

The weekly cold export has run since 2026-08-24. Its own header says
the part it could not fix from inside itself:

> Writing the copy is the easy half and the half that gets built; the
> half that matters is having walked a restore before you need one.

Until somebody walks one, the roadmap row stays `[~]` and the honest
description of the state is **a belief, not a backup**. This is how
you walk one.

## What is being protected, and from what

Every signature, digest and OpenTimestamps proof this store serves
answers one question: *has the record been altered?* None of them
answers the other one: *is the record still there?* Bitcoin will
happily confirm that a corpus entry existed on a given day, to a
reader who no longer has the entry.

The exposure is `cert:`. This store publishes that every certificate
verifies free forever, and repeats it on every retirement tombstone —
"retirement changes the shelf, not the record." That promise rests on
one KV namespace. The export copies it into R2 weekly, and R2 and KV
are separate services with separate failure modes.

## The drill, in two calls

Both live in `src/services/cold-restore.ts`.

```ts
// 1. READ-ONLY. Safe against production on any ordinary Tuesday.
const drill = await planRestore(env, "2026-08-23"); // the export's ISO day

// 2. Writes. Only ever after step 1 comes back restorable.
const result = await restoreBundle(env, "2026-08-23", bundleKey);
```

`planRestore` opens every bundle the manifest names, re-hashes the
bytes still in the bucket against the digest recorded when they were
written, and diffs the contents against what the live namespace holds
right now. **It writes nothing.** That is deliberate: a drill you have
to schedule an outage for is a drill nobody runs.

### Reading the plan

| Field | What it means |
| --- | --- |
| `digest_matches` | The bytes in the bucket still hash to the manifest's record. `false` is a refusal. `null` means the bundle could not be read at all. |
| `truncated` | The prefix held more keys than one export pass could carry. A truncated bundle is a **partial** record and is refused. |
| `missing_in_kv` | In the bundle, gone from the live namespace. On a healthy day this is `0`. |
| `differing` | In both, with different bytes. Investigate before restoring — a certificate should never change after issue. |
| `extra_in_kv` | Live, absent from the bundle. **Normally just the records written since the export.** Reported, never acted on. |
| `restorable` | Every bundle readable, intact, and un-truncated. |

### Why a restore never deletes

`restoreBundle` writes keys that are missing or differ and touches
nothing else. A restore that also removed live keys absent from the
bundle would be a *rollback* — and run against a stale bundle it
would destroy every certificate issued since the export. `extra_in_kv`
is a number to read, not a list to act on. That instinct is wrong at
the best of times and catastrophic at the worst.

### The refusals are load-bearing

A bundle is refused, not warned about, when:

- its bytes do not hash to the manifest's digest — whatever it is, it
  is not the record the manifest describes, and writing it into a live
  namespace replaces evidence with something unverified;
- it is marked `truncated` — restoring it whole would publish a subset
  as if it were the set;
- it names a binding this deployment does not have;
- it is not named by a manifest at all. A loose object in the bucket
  has nothing vouching for it.

## CI walks this on every build

`test/cold-restore-drill.spec.ts` seeds certificates, exports them,
destroys the live copies, plans, restores, and compares bytes. Each
refusal above is proven to bite by mutation: remove the digest check
and only the digest test fails; remove the truncation check and only
the truncation test fails; make the restore delete extras and only the
never-deletes test fails.

## What a passing drill does not prove

Said plainly, because the export file already had to say the same
thing about itself:

- **Not that the account survives.** R2 and KV fail separately, which
  is the gap the export closes — but both sit in one account, and an
  account-level loss takes both. The CI drill runs inside the same
  account it audits.
- **Not that the production bucket is intact today.** CI proves the
  mechanism against test bindings. Only `planRestore` against
  production proves anything about production, and it is safe to run
  there precisely so that it can be.
- **Not that anyone can find the manifest under pressure.** The path
  is deterministic — `backup/{YYYY-MM-DD}/manifest.json` — and that is
  a fact about code, not about whoever is awake at the time.
- **Not that the copy is offsite.** Pulling the manifest and bundles
  out of the account is a keeper action no function here can perform.

## The keeper's standing item

Run `planRestore` against production once a month and read
`restorable`. It writes nothing, it costs a handful of reads, and it
is the only thing that keeps this document from becoming another
description of a backup nobody has opened.
