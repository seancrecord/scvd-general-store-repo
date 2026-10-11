# Seller declarations — declared against observed

**Status: IMPLEMENTED October 9 on `codex/seller-declarations`; validation and release pending. Keeper approved CV1 next and contextual funnel placement, including the recommended free/queue defaults.** Written 2026-09-10 as the
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

A current declaration per host, with prior dated records retained for historical comparisons. Host proof takes precedence over wallet-only statements. The prepared input is:

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

Storage and public comparisons keep address digests only. The prepare response
returns the caller's own normalized addresses in the exact text to sign; that
text is not retained. The original proposal to retain verbatim addresses was
not needed for comparison and was dropped in the October 9 implementation. The `wallet_signature` lane can only prove control of ONE of
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
  the declaration itself is an ask in the bounded queue. Queue caps and
  eviction mean no probe date or eventual probe is guaranteed.

## Approved defaults (October 9, KEEPER_LIST)

1. **Is a declaration free, and stays free?** The whole point is
   that it spreads; a fee kills it. Recommended: free to attach and
   free to read, forever, on the same footing as the preflight and
   the conformance desk. The paid instrument, if any, is the WATCH
   on a declaration (alert the seller when the line moves), which is
   an endpoint watch with a finding rule and already priced.
2. **A declaration is an ask within the existing caps.** Record one ask in
   the existing queue; do not manufacture extra demand counts to raise priority.
   The normal most-asked ordering, weekly sweep cap and eviction remain in force.
   Neither acceptance nor payment guarantees a census probe date.

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


## October 9 implementation refinements

- `/seller-declarations` is the human page and JSON/markdown guide;
  `/api/seller-declaration` prepares exact proof text, attaches, and reads a
  host comparison. Preparation stores nothing. Submit within ten minutes of
  `valid_from`; later statements need a later timestamp. Replay never redates.
- Host proof reuses the standing-note well-known path, with a bounded read and
  no redirects. Wallet proof requires a signature from every declared EVM address
  and those addresses in the latest observed challenge for the named host.
  Wallet control is explicitly not host control. Domain statements take precedence;
  new hosts, rotations and Solana use domain proof. This closes the original
  draft's unbound-wallet-to-host ambiguity without inventing ownership evidence.
- Only digests are retained, stricter than the original private-verbatim proposal.
  Prepared text returns the caller's own input for signing; public reads never
  expose literal addresses. Networks are context, not a claimed address/network
  pairing comparison: the historical observation carries sets, not those pairs.
- Independent declaration keys retain prior dated statements for as-of weekly
  comparisons. At most 100 per host; the weekly view refuses an incomplete read
  beyond its 2,000-record cap. KV visibility is eventually consistent. There is
  no cryptographic proof of completeness or permanent retention guarantee.
- A comparison needs a probe after both attachment and valid_from. A later seal
  cannot turn an earlier probe into a post-declaration observation. A latest
  probe without an address is not_captured, never a fallback to an older match.
- Contextual links appear on operators, corpus, host histories, look responses
  and the Attestation pilot. Prices derive from the existing shelf and pilot
  terms. The free record remains first. Existing conformance watches and the
  pilot do not provide declaration-change alerts; that extension is not sold.
- Host proof performs an HTTPS read, never a payment; public-target guard and
  body/time caps apply. Domain DNS rebinding protection is limited to the shared
  platform egress boundary. API bodies are capped; attachment attempts have a
  courtesy per-host KV throttle, not an atomic global admission guarantee.

## Validation, October 9

The public room test first failed with 404 before implementation. The altered-terms
signature regression also failed when recovery enforcement was temporarily removed,
then passed after the enforcement was restored. Focused tests
cover both proof lanes, altered signing terms, new-host refusal in the wallet
lane, replay without redating, domain precedence, all five comparison states,
actual probe timestamps, as-of weekly comparisons, address redaction, HTTP
submission, throttling, readable results and contextual paid/free links.
Feature, guide, schema, reader-budget, porch and collector-boundary checks pass;
typecheck and production dry-run bundles pass. The browser preview verifies the
free lookup form and readable no-declaration result. No production declaration,
paid purchase or customer activation was made. Required full CI shards and
production readback remain release gates; implementation is ready locally.

## October 10 release-gate repair

PR #1001 was blocked by real integration failures: the operator stages repeated
`conformance_watch` and displaced the free discovery step; the no-store
declaration API advertised conditional revalidation; the expanded OpenAPI
growth case exceeded its reader budget; and the checkout worker exceeded its
bundle limit. These checks were reproduced before the repair.

The merge from main preserves both the seller guidance and the newer offer and
recovery guidance, including main's lighter checkout shelf import. Declarations
follow the free discovery step without duplicating the paid watch. The no-store
API no longer advertises ETag revalidation. Repeated purpose and retry wording
is shorter while retaining the fields, signed-text/receipt distinction, private
key length rule and warning that a fresh unkeyed payment can charge again.
Neither size limit was raised.

The guide's prior main hashes were reproduced by restoring main's guide file
(14 checks), then pinned to the reviewed combined guide. The repaired operator,
cache, size, guide and declaration checks pass (157 checks); the final wording
also passes the buyer-purpose, declared-input and size checks (170 checks).
Typecheck and production bundles pass. Full local and required CI checks remain
release gates; this record does not claim a production release or customer use.

The full CI run exposed two further integration issues: the observatory guard
read the substring `ratio` in the route name `declarations` as a metric, and
the short guide index exceeded its 27,000-character alarm by 52 characters.
The guard now distinguishes route-dictionary keys from metric fields and still
checks nested values; adversarial fixtures prove actual rate/share/score/rank
fields remain visible. Restoring the old scan failed both the real artifact and
fixture checks. The index's navigation explanation is shorter; no guide section,
link or full-guide sentence was removed. All 35 observatory, guide and catalogue
checks pass, and typecheck passes. Required CI is repeated on this final repair.
