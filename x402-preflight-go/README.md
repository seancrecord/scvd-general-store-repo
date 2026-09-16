# scvd-preflight (Go)

Zero-dependency client for [scvd.store](https://scvd.store)'s free x402
door check, as a library and a command. One `POST /api/preflight/v2`
per door: the same single probe, the same battery, the same limiter
every caller gets. The store answers with a verdict, every check by
name, the advisories outside the verdict, and remediation rows (the
defect class, its definition URL, what the operator does, what the
buyer does). This package keeps that answer whole and adds the deploy
gate's exit law on top.

Standard library only — the `go.mod` requires nothing. It holds no key
and cannot spend money.

```
go get github.com/seancrecord/scvd-general-store-repo/x402-preflight-go
```

## Use

```go
import (
	"context"
	preflight "github.com/seancrecord/scvd-general-store-repo/x402-preflight-go"
)

result := preflight.One(context.Background(), "https://door.example/api/paid", preflight.Options{})
result.Outcome                        // "ready" | "not_ready" | "unreachable" | "refused" | "store_unreachable"
result.Body.Checks                    // every check, named, from the store
preflight.Remediation(result.Body)    // both halves per named defect, from the store
os.Exit(preflight.ExitCodeFor([]preflight.Result{result}, nil))
```

```
go run github.com/seancrecord/scvd-general-store-repo/x402-preflight-go/cmd/scvd-preflight@latest \
  https://door.example/api/paid --fail-on not_ready
```

`One` never returns an error. A store that did not answer is
`store_unreachable`, a refusal before probing is `refused`, and
everything else is the store's own verdict with its body beside it. An
error return would invite a caller to treat a door it never saw as a
door that passed.

`Report.Raw` carries the whole decoded body beside the named fields.
The store adds fields faster than any client tracks them, and a reading
that silently drops what it did not expect is the failure this
observatory exists to name.

## The exit law

| code | meaning |
| --- | --- |
| 0 | every door answered ready, or was unreachable and unreachable is not in `--fail-on` |
| 1 | a door's verdict is in `--fail-on` (`not_ready` by default) |
| 2 | the store refused a URL before probing (not https, a custom port, a private address, the store's own host): nothing was probed, so a gate must not pass |
| 3 | the store, or the network between you and it, did not answer, including its probe-budget refusal |

`unreachable` does not fail by default. It is a fact about the network
path from the store's vantage at one moment and says nothing about the
door; a gate that failed on it would be drawing a conclusion the
evidence refuses. Choosing `--fail-on not_ready,unreachable` is yours,
in writing.

## One law, three languages

This is a port of the npm package `scvd-preflight`, not a
reimplementation of the idea. The JavaScript is the reference; the Go
and [Python](../x402-preflight-py) clients answer the same questions
with the same words and the same exit codes, and all three are tested
against the same recorded reports in
[`../x402-preflight/fixtures`](../x402-preflight/fixtures) — read from
there, never copied, so the day a battery is re-recorded there is one
place to re-record it.

The differences that remain are the ones a port should keep: exported
names are Go names, `One` takes a `context.Context`, and the HTTP
client is swapped through `Options.Client` rather than a `fetch`
argument.

Verified byte-for-byte: all three commands print identical output and
return identical exit codes for the same door.

## What it is not

Not an uptime claim: a pass says the door served a well-formed,
payable 402 to one request at one moment. Not a delivery claim: no
probe can establish what a door does after payment. Nothing here
derives a verdict; every line printed is the store's own answer.

## Releasing

A Go module has no registry to push to: it publishes by git tag, and
the proxy fetches it from GitHub on first request.

Actions tab → **Publish Go module** → pick the module, type the version
without its `v`, leave **dry_run** checked for the rehearsal, then run
it again unchecked to publish. Same shape as the npm and PyPI
publishers next door, and the same rule 30: `workflow_dispatch` only,
so nothing is ever published by a merge.

What it refuses, before the irreversible step: a version that carries
a `v` or is not `MAJOR.MINOR.PATCH`; a `go.mod` whose module path is
not the one this repo and directory actually publish; a version the
`CHANGELOG` does not already name; a tag that exists; and a commit that
is not on `main`. The last two matter most. The tag IS the version, so
a version pointing at history that never landed is a version nobody
else can fetch — and proxy.golang.org caches by version permanently,
with no unpublish and no window. Deleting a tag does not recall it.

The tag it builds carries this directory as a prefix, because a module
in a subdirectory is not findable without one:

```
x402-preflight-go/v0.1.0
```

A bare `v0.1.0` would advertise a module at the repository root, which
does not exist. The workflow derives the prefix from the directory name
rather than taking it typed, so the two cannot drift.

## Versioning

Versions are immutable once published. Minor versions add functions
and never change an existing function's result shape or an exit code;
a change to either is a major. The dated record is `CHANGELOG.md`.
