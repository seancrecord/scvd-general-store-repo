# scvd-corpus-client

Zero-dependency reader for [scvd.store](https://scvd.store)'s signed
x402 corpus: the weekly census, the fresh set, one host's readiness
history, the month, the feeds, the diff and the defect vocabulary, each
as the store serves it. The `scvd` CLI's library half.

This package is not yet published (registry checked September 10, 2026).
Use the local module from a checkout:

```js
import { corpusIndex, hostHistory } from "./corpus-client/corpus-client.js";
```

## Use

```js
import { corpus, hostHistory, month, feeds } from "./corpus-client/corpus-client.js";

const census = await corpus();                 // the weekly signed census, whole
const history = await hostHistory("door.example");
const august = await month("2026-08");         // the state of x402 for one month
const atom = await feeds();                    // the four Atom feeds, by address
```

Each reader makes at most one GET to a stable address and returns the store's
JSON whole. Nothing is summarised, scored or re-derived here: the
corpus is signed, with each digest submitted for Bitcoin anchoring.
Pending submissions still need completed proofs and independent verification. A client that rewrote it
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

### Compact discovery

`corpusIndex({ limit?, cursor?, base?, fetch?, timeoutMs? })` returns one
page from `/corpus/index.json`. Omit `limit` to use the server's default;
the server enforces its maximum. It makes one GET and never follows `next`
or fetches snapshot bodies. For example, from a checkout:

```js
import { corpusIndex } from "./corpus-client/corpus-client.js";

const page = await corpusIndex({ limit: 1 });
console.log(page); // includes unreadable rows, counts and verification limits
// When you decide to fetch another page:
if (page.has_more === true && typeof page.next === "string") {
  const cursor = new URL(page.next).searchParams.get("cursor");
  if (!cursor) throw new Error("Incomplete pagination: next has no cursor");
  const nextPage = await corpusIndex({ limit: 1, cursor });
  console.log(nextPage);
}
```

A page with `has_more: true` and no `next` is incomplete. Keep unreadable
rows in the denominator, and preserve the server's `verification` and
`completeness` fields. This is metadata discovery; the helper does not
verify signatures, chain links or Bitcoin proofs. Pagination does not
establish a point-in-time inventory. `corpus()` keeps its original whole
`/corpus.json` response.

Invalid option shapes throw `TypeError` without a request. HTTP refusals
throw `CorpusHttpError` with the status and server body; timeouts and
network failures reject. An unreadable successful page rejects instead
of becoming an empty inventory. The existing `timeoutMs` option defaults
to 30 seconds. Every read is free and needs no account, key or wallet.

For bounded snapshot export and offline verification, use the published
[x402-verify evidence CLI](https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier#portable-evidence),
with explicit byte-limit settings for larger snapshots.
