# scvd-preflight

Zero-dependency client for [scvd.store](https://scvd.store)'s free x402
door check, as a library and a command. One `POST /api/preflight/v2`
per door: the same single probe, the same battery, the same limiter
every caller gets. The store answers with a verdict, every check by
name, the advisories outside the verdict, and `remediation` rows (the
defect class, its definition URL, what the operator does, what the
buyer does). This package keeps that answer whole and adds the deploy
gate's exit law on top.

```
npm install scvd-preflight
```

## Use

```js
import { preflightOne, exitCodeFor, remediation } from "scvd-preflight";

const result = await preflightOne("https://door.example/api/paid");
result.outcome;                 // "ready" | "not_ready" | "unreachable" | "refused" | "store_unreachable"
result.body.checks;             // every check, named, from the store
remediation(result.body);       // both halves per named defect, from the store
process.exit(exitCodeFor([result]));
```

```
npx scvd-preflight https://door.example/api/paid https://door.example/api/other --fail-on not_ready
```

## Inspect an endpoint (0.3.0)

```js
import { inspectOne, renderInspectionLines } from "scvd-preflight";

const result = await inspectOne("https://door.example/api/paid");
console.log(renderInspectionLines(result).join("\n"));
process.exit(result.inspectionExitCode);
```

This uses the same hosted preflight once and preserves its full response.
`result.inspection` separates reachability, the set of observed protocols,
advertised term summaries, structural findings, observation time and gaps.
Terms are unverified advertisements, not complete payment instructions.
Omitted terms have explicit counts; no artifact signature is verified and
no payment is signed or submitted. Settlement and delivery remain unchecked.

Inspection exits `0` when a response was inspected, including MPP-only,
unknown-protocol and partial readings with gaps. It exits `2` for a refused
request, and `3` for an unavailable observation: unreachable endpoint,
unresolved method, exhausted probe budget, store failure, or a missing,
malformed or unsupported inspection block. Zero does not mean payment-ready.
An empty protocol set describes only that response, never endpoint-wide absence.
Older stored reports keep `inspection: null`; their verdict is not converted
into evidence the old instrument did not record.

`preflightOne`, `exitCodeFor` and the `scvd-preflight` command retain their
existing x402 deploy-gate behavior. For a dedicated inspection command,
use `scvd inspect <url>` from `scvd-cli` 0.4.0.

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
