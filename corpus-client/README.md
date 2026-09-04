# scvd-corpus-client

Zero-dependency reader for [scvd.store](https://scvd.store)'s signed
x402 corpus: the weekly census, the fresh set, one host's readiness
history, the month, the feeds, the diff and the defect vocabulary, each
as the store serves it. The `scvd` CLI's library half.

```
npm install scvd-corpus-client
```

## Use

```js
import { corpus, hostHistory, month, feeds } from "scvd-corpus-client";

const census = await corpus();                 // the weekly signed census, whole
const history = await hostHistory("door.example");
const august = await month("2026-08");         // the state of x402 for one month
const atom = await feeds();                    // the four Atom feeds, by address
```

Every function is one GET to a stable address and returns the store's
JSON whole. Nothing is summarised, scored or re-derived here: the
corpus is signed and Bitcoin-anchored, and a client that rewrote it
would be a second source of truth. Check the signatures with
[`x402-verify`](https://www.npmjs.com/package/x402-verify) or any
ed25519 library against the key at `/.well-known/scvd-signing-key`.

`withDenominator(count, of, noun)` prints a counted reading with its
denominator beside it — "3 of 4 rounds" — and never a percentage: the
store's rule is that counts travel with denominators and a share
invites a ranking.

## What it is not

Not a ranking and not advice: a host's history is what the store
observed on the rounds it probed, with the gaps counted against the
observer. A host never met comes back as never met, a fact about
coverage. The doors' own `what_this_is_not` fields ride in every answer.

## Versioning

Versions are immutable once published. Minor versions add functions
and never change an existing function's result; the result shapes are
the store's own documents, which carry their own versions. The dated
record is `CHANGELOG.md`.
