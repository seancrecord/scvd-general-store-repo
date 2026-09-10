# Federation — a second observer's row in the corpus

**Status: PROPOSED. Nothing here is built. One ruling is on
KEEPER_LIST before a line of code.** Written 2026-09-10 as the
fourth of four moves toward a corpus a buyer must check, and the
slowest: it turns `docs/OBSERVATORY.md` §8 ("publish the format,
verify anyone's signature, certify no one") into a shape that can be
built and tested. Read §8, §3 and §14 of that document first; this
one does not restate them.

## The line it crosses

A crawler's output is ours. A standard's output is anyone's. The
observatory outline's own test: can a second party emit a conformant
row we would accept? Today the answer is no, for one reason only —
no row shape exists that carries a stranger's observation with a
stranger's signature and lands in the chain labelled as theirs. The
nearest thing is the crowd-walked row (`src/services/crowd-walks.ts`,
2026-09-04), which is a stranger's settlement, verified by us when we
paid, with the stranger's free text kept off the chain. That row is
the precedent for everything below: bounded, typed fields ride the
chain; prose does not; their tier is never blended with ours.

## Sequencing (why this is fourth)

Federation over a chain that has met 0.7% of the known population
is a standard nobody needs. The asked-for queue (move 1) is what
lifts the hit rate; the pay-to run and change (move 2) is the fact
worth federating; seller declarations (move 3) put the other side of
the market on the record. Only then does a second observer's row
change what a buyer can conclude. Build this when one of two
triggers fires: a named party asks to submit rows, or a bounty walker
asks for their walk to carry their own signature.

## What already stands (do not rebuild)

- **The conformance desk** (`POST /api/conformance/v1`) takes any
  issuer's compact JWS and returns a structured verdict: parse,
  schema, signature, liveness. A federated row is another artifact
  class through the same desk.
- **The crowd-walked tier**: a stranger's row at its own tier, never
  blended, with the comparable half typed and the prose digested.
- **The sealed row** (`WardHostResult`, sealed by `sealRoundForChain`):
  the shape our own observer already emits, with `battery`,
  `observer_status`, `offer.pay_to_digest`, `evidence`.
- **The fixtures desk** (`/fixtures.json`): complete signed artifacts
  for building a reader, with sha256 — the precedent for consumer
  conformance vectors (§14).

## The federated row

An observer emits a compact JWS whose payload is:

```json
{
  "artifact": "scvd-observation",
  "version": 1,
  "observer": { "id": "did:web:observer.example", "software": "…", "version": "…" },
  "subject": { "host": "door.example", "url": "https://door.example/api/x" },
  "observed_at": "2026-09-10T10:00:00Z",
  "procedure": { "name": "x402-preflight", "version": "v2", "timeout_ms": 8000, "client_profile": "default" },
  "environment": { "egress": "…", "region": "…" },
  "verdict": "ready | not_ready | unreachable",
  "failed": ["…named defect classes…"],
  "advisories": ["…"],
  "offer": { "networks": ["…"], "schemes": ["…"], "pay_to_digest": ["…"] },
  "limitations": ["single_region", "single_client", "single_request"],
  "not_observed": ["L4", "L5", "L6", "L7"]
}
```

Every field is one our own row already carries or the outline §3
already names. Defect classes come from the published vocabulary
(`/defects.json`); a class we do not publish is kept as sent and
flagged `unknown_class`, never dropped and never mapped. `pay_to`
verbatim is refused at the door (the G2 law applies to strangers'
rows too: they digest with the published salt before submitting).

## What the store does with it

1. **Verify the signature** against the observer's published key
   (`did:web` resolution, or a key registered once with proof of
   control of the observer's host by the standing-note `well_known`
   lane). A row that does not verify is refused with the desk's
   normal verdict. Nothing else about the observer is checked.
2. **Check the shape** against the published schema, additive-only
   within a major version (§14).
3. **Hold it at its own tier**: `observer: "federated"`, the
   observer's id on the row, in the week it was received. It rides
   the signed snapshot exactly as the crowd-walked rows do —
   `federated_rows[]` beside `hosts[]`, never inside — so our own
   rows and theirs cannot be confused by a reader that did not ask.
4. **Never corroborate by counting.** The host history gains a
   `federated` block listing each observer's latest row with its
   verdict and rows; the reader weighs the signers. No field says
   "N observers agree". That is the ranking §8 refuses, one step
   removed.

## Rules this obeys

- **Rule 43.** A row is a dated observation on a door. No score
  accumulates on an observer: we do not count how often an observer
  agreed with us, and we publish no observer table ordered by
  anything.
- **Rule 52 and the crowd-walk law.** A federated row is evidence
  that this observer sent these values, signed; it is not evidence
  the values are true, and every rendering says so beside it.
- **The collector cannot pay.** The intake is on the collector's
  side of the line; `test/collector-cannot-pay.spec.ts` walks the
  import graph and must stay green.
- **G2.** Digests only, at the door.

## The ruling (KEEPER_LIST)

**Does a federated row enter the signed chain, or sit beside it?**
Inside the snapshot (as `federated_rows[]`) means our signature
covers the fact that we received it in that week, which is the
claim we can make, and the chain becomes the place evidence
accumulates. Beside it (a separate `/corpus/federated/{week}.json`)
keeps the chain ours alone and costs the thesis its "accumulates".
Recommended: inside, at its own tier, on the crowd-walk precedent —
the store already signs rows it did not observe when it labels them.

## Acceptance

- A row signed by a test observer's key verifies, lands in the
  week's snapshot under `federated_rows`, and the chain still
  verifies end to end with the row's bytes unchanged.
- A row with a bad signature, an unknown major version, or a
  verbatim `pay_to` is refused with a named reason and nothing is
  stored.
- The host history shows the observer's row beside ours, labelled,
  with no count of agreement anywhere on the surface.
- The import-graph test stays green.
- The fixtures desk carries one valid and three refused federated
  rows with their correct verdicts (the consumer vectors §14 asks
  for).

## What not to build

- An observer registry with standing, tiers, or reputation.
- Cross-observer co-signing or quorum. Corroboration is the reader's.
- A second census. Federated rows are additional observations of
  doors, not a replacement for walking them.
