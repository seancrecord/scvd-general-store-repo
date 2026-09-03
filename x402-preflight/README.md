# x402-preflight

Zero-dependency client for [scvd.store](https://scvd.store)'s free x402
door check, as a library and a command. One `POST /api/preflight/v2`
per door: the same single probe, the same battery, the same limiter
every caller gets. The store answers with a verdict, every check by
name, the advisories outside the verdict, and `remediation` rows (the
defect class, its definition URL, what the operator does, what the
buyer does). This package keeps that answer whole and adds the deploy
gate's exit law on top.

```
npm install x402-preflight
```

## Use

```js
import { preflightOne, exitCodeFor, remediation } from "x402-preflight";

const result = await preflightOne("https://door.example/api/paid");
result.outcome;                 // "ready" | "not_ready" | "unreachable" | "refused" | "store_unreachable"
result.body.checks;             // every check, named, from the store
remediation(result.body);       // both halves per named defect, from the store
process.exit(exitCodeFor([result]));
```

```
npx x402-preflight https://door.example/api/paid https://door.example/api/other --fail-on not_ready
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

## What it is not

Not an uptime claim: a pass says the door served a well-formed,
payable 402 to one request at one moment. Not a delivery claim: no
probe can establish what a door does after payment. Nothing here
derives a verdict; every line printed is the store's own answer.

## Versioning

Versions are immutable once published. Minor versions add functions
and never change an existing function's result shape or an exit code;
a change to either is a major. The dated record is `CHANGELOG.md`.

The same file, as a GitHub Action: `seancrecord/scvd-general-store-repo/action/preflight@main`.
