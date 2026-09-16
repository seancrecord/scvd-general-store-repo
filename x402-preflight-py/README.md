# scvd-preflight (Python)

Zero-dependency client for [scvd.store](https://scvd.store)'s free x402
door check, as a library and a command. One `POST /api/preflight/v2`
per door: the same single probe, the same battery, the same limiter
every caller gets. The store answers with a verdict, every check by
name, the advisories outside the verdict, and `remediation` rows (the
defect class, its definition URL, what the operator does, what the
buyer does). This package keeps that answer whole and adds the deploy
gate's exit law on top.

Standard library only — `urllib`, `json`, `dataclasses`. Nothing to
install beyond the package itself. It holds no key and cannot spend
money.

```
pip install scvd-preflight
```

## Use

```python
from scvd_preflight import preflight_one, exit_code_for, remediation

result = preflight_one("https://door.example/api/paid")
result.outcome                  # "ready" | "not_ready" | "unreachable" | "refused" | "store_unreachable"
result.body["checks"]           # every check, named, from the store
remediation(result.body)        # both halves per named defect, from the store
raise SystemExit(exit_code_for([result]))
```

```
scvd-preflight https://door.example/api/paid https://door.example/api/other --fail-on not_ready
```

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
reimplementation of the idea. The JavaScript is the reference; the
Python and [Go](../x402-preflight-go) clients answer the same questions
with the same words and the same exit codes, and all three are tested
against the same recorded reports in
[`../x402-preflight/fixtures`](../x402-preflight/fixtures) — read from
there, never copied, so the day a battery is re-recorded there is one
place to re-record it.

The differences that remain are the ones a port should keep: names are
`snake_case`, `preflight_one` returns a dataclass, and the HTTP client
is swapped through an `opener` argument rather than a `fetch` one. A
port that reads like transliterated JavaScript is a library nobody
wants to import.

Verified byte-for-byte: all three commands print identical output and
return identical exit codes for the same door.

## What it is not

Not an uptime claim: a pass says the door served a well-formed,
payable 402 to one request at one moment. Not a delivery claim: no
probe can establish what a door does after payment. Nothing here
derives a verdict; every line printed is the store's own answer.

## Versioning

Versions are immutable once published. Minor versions add functions
and never change an existing function's result shape or an exit code;
a change to either is a major. The dated record is `CHANGELOG.md`.
