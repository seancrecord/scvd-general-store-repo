# scvd-defects

[scvd.store](https://scvd.store)'s x402 defect vocabulary as data:
every class with what it asserts, what a buyer loses when it is
present, whether an unpaid probe can see it, what would falsify a
finding of it, and both halves of the remediation (what the operator
does, what the buyer does). Plus recorded 402 doors as fixtures, each
naming the checks it is bad in, for testing a client offline.

```
npm install scvd-defects
```

## Use

```js
import { defectClass, defectsBySignal, remediationFor, byDetectability, isStale } from "scvd-defects";

defectClass("no-402");                 // the class, whole
defectsBySignal("accepts");            // every class that check name explains (two)
remediationFor("wrong-network");       // { operator, buyer, definition_url }
byDetectability().paid;                // the classes only a settled payment reveals
await isStale();                       // { stale, snapshot: "10", live: "…" }
```

`defects.json` is a snapshot of `https://scvd.store/defects.json` cut
from the store's own source. The live document is the authority;
definitions are never edited in place, so a snapshot is never wrong
about its own version, only possibly behind, and `isStale()` says
which. The package's minor version is the vocabulary version it
carries: 0.10.x is vocabulary v10.

## The fixtures

`fixtures/doors/*.json` are recorded 402 responses — status, headers,
body — each with `expect_failed`: the battery checks that door fails,
and no others. They are the store's own release gate for a battery
version; here they are a test corpus for your client: a parser that
handles every one of them handles the shapes the August field run
proved real.

## What it is not

Not a ranking and not a list of anybody: every class describes an
observable property of one endpoint at one moment, and a hostname
never appears here. The names are CC BY 4.0; the code is MIT.

## Versioning

The minor version tracks the vocabulary version (0.10.x = v10);
patches fix the package, never a definition. Versions are immutable
once published. The dated record is `CHANGELOG.md`; the vocabulary's
own changelog rides inside `defects.json`.
