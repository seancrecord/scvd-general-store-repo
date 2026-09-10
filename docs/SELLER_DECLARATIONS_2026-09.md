# Seller declarations — declared against observed

**Status: PROPOSED. Nothing here is built. Two rulings are on
KEEPER_LIST before a line of code.** Written 2026-09-10 as the
third of four moves toward a corpus a buyer must check (the first
two shipped the same day: the asked-for queue at `/corpus/asked.json`
and `changed_pay_to` on the weekly changes feed with `pay_to` on
every host history).

## Why

Every surface the corpus has is one-sided: we observe, we sign, a
buyer reads. A seller has no reason to show up except to dispute.
The move that makes a record something both sides come to on their
own is a fact each side needs the other for:

- A seller wants their customers to know that a door paying to a
  different address than the one they published is not theirs.
- A buyer wants to know, before paying, that the address in the 402
  it just received is the one the seller says is theirs.

Neither can produce that fact alone. The seller's word is a claim;
our observation is one vantage. Put side by side, week after week,
they are a match line — and a mismatch is the one finding a buyer
acts on without reading prose.

## What already stands (do not rebuild)

- **Proof of control**, two lanes, self-serve, keeper-ruled 2026-08-27
  (G2 §5, `src/services/standing-note.ts`): an EIP-191 signature by
  the wallet over a statement-bound challenge, or sha256 of the
  statement served at `/.well-known/scvd-note.txt` on the host.
- **Standing notes** ride beside an observation and never alter it.
- **Pay-to digests** (`src/lib/pay-to-digest.ts`): salted, publicly
  recomputable; the G2 ruling forbids verbatim addresses on any
  derived view.
- **Observation of where a door asks to be paid**, per row since
  2026-08-20, sealed as digests since 2026-08-27, and since
  2026-09-10 published as a run (`pay_to` on the host history) and
  as a weekly change (`changed_pay_to`).

A declaration is therefore a standing note with a typed body and a
comparison rule. It is not a new trust lane.

## The declaration

One per host, newest wins, attached by either existing proof:

```json
{
  "artifact": "seller_declaration",
  "version": 1,
  "host": "door.example",
  "declares": {
    "pay_to": ["0x…", "…base58…"],
    "networks": ["eip155:8453"],
    "valid_from": "2026-09-10T00:00:00Z"
  },
  "evidence": "wallet_signature | well_known",
  "attached_at": "…",
  "what_this_is": "A statement by the party who proved control of this host or wallet. It stands beside this store's observation and never alters it."
}
```

Storage keeps the verbatim addresses the seller declared (they are
the seller's own published words, the same as a 402 body); every
derived view carries digests only, the same law the observation
obeys. The `wallet_signature` lane can only prove control of ONE of
the declared addresses at a time; a declaration listing more than
one address needs a signature per address or the `well_known` lane.

## The match line

Computed at read, per host, on the host history and the look:

| `declared_vs_observed` | Meaning |
|---|---|
| `match` | The last captured round's digest set is a subset of the declared set. |
| `mismatch` | The last captured round carries a digest not in the declared set. |
| `not_captured` | The last probed round captured no address (rule 52: absence of the fact). |
| `not_probed` | The chain has not probed the host since the declaration. |
| `no_declaration` | Nobody has proved control and declared. The default, and most rows. |

Every line prints with its rows: the declaration's `attached_at`,
the round compared, and the digests on each side. A `mismatch` is a
fact about two artifacts on two dates. It is not a finding of fraud:
the seller may have rotated a wallet and not restated; the door may
serve a facilitator's address; the seller's declaration may be the
stale one. The line names what it compared and stops.

On the weekly changes feed, a new field `declaration_mismatches`
lists hosts whose line moved to `mismatch` that week, with the
denominator `declarations_compared`.

## Rules this obeys

- **Rule 43.** A verdict on a THING at a date, never a score on an
  actor. `mismatch` is on one row against one declaration. No count
  of mismatches accumulates on a host or an operator.
- **Rule 52.** A round that captured nothing is `not_captured`, never
  `mismatch`.
- **G2.** No verbatim address on any derived view. A buyer holding
  the 402 recomputes the digest and matches.
- **Standing-note law.** The declaration rides beside the
  observation and never alters it; a declaration for a host the
  chain never observed is accepted and held (unlike a note), because
  the asked-for queue now guarantees the host will be swept — the
  declaration is itself an ask.

## The two rulings (KEEPER_LIST)

1. **Is a declaration free, and stays free?** The whole point is
   that it spreads; a fee kills it. Recommended: free to attach and
   free to read, forever, on the same footing as the preflight and
   the conformance desk. The paid instrument, if any, is the WATCH
   on a declaration (alert the seller when the line moves), which is
   an endpoint watch with a finding rule and already priced.
2. **Does a declaration create an obligation to probe?** A seller
   declaring a host the feeds do not name would otherwise wait on
   the sweep. Recommended: a declaration enters the asked-for queue
   at the top of its week (asks = the sweep cap) so it is swept next
   round; it does not jump the roster cap.

## Acceptance

- Attach a declaration by each lane; the host history and the look
  carry the line with the rows; the JSON carries digests only.
- A seeded chain where the observed set moves off the declared set
  flips the line to `mismatch` and lists the host on that week's
  changes feed with the denominator.
- A probed round with no capture prints `not_captured`, never
  `mismatch`.
- The verbatim declared addresses appear on no public surface (the
  G2 test the standing note already runs).

## What not to build

- A "verified seller" badge. The line is a match on a date, not a
  status.
- A directory of declared hosts ordered by anything. Alphabetical
  under `/corpus/declared.json` is the most that exists.
- A dispute flow. A seller who disagrees with an observation has the
  standing note and the notice desk already.
