# Received, not observed: the facilitator's response as input, and the projection

*Decided 2026-09-11, shipped the same day as the binding class
(`BINDING_CLASSES_2026-09.md`). The second and third of three decisions
taken together, built in that order because the binding field changes
what both of these carry.*

## Decision 2: accept a settlement response, never counter-sign it

A buyer who paid an x402 door holds the facilitator's settlement
response: the base64 JSON in the PAYMENT-RESPONSE header, naming a
transaction, a network, a payer and a success flag. Every field is the
facilitator's word. The day this shipped, the spec thread named the
trap in it: on rails where the facilitator pays the fee, the response's
`payer` can name the facilitator rather than the buyer, so an
attestation that copied the field would name the wrong party while
staying well-formed.

The settlement attestation now takes `payment_response` as an optional
input. The rule for it is structural, not tonal.

**Facilitator bytes never enter the signed payload.** What the
signature covers is `input_claims`: the sha256 of the exact string
received, and a per-field table.

| row | values |
|---|---|
| transaction, network, payer, success | `agrees`, `disagrees`, `not_claimed`, `not_observed` |

Each row sets one claimed field beside what the chain showed at
observed_at. `not_claimed` means the response did not name the field.
`not_observed` means the chain gave nothing to compare against: no
receipt, or a transaction that matched nothing asked. `disagrees` is a
finding about the response, not a verdict on anyone.

**The bytes are echoed outside the signature**, under
`received_not_observed`, exactly as received, with their digest and
the decoded fields. A reader hashes the echo, compares with the signed
digest, and reads the table against the decoded values. The signed
reading names fields, never claimed values; a test holds that the
facilitator's payer does not appear in the signed bytes even when it
is the whole story.

The one-line product: the response's payer is not the payer the chain
shows. The desk reports the chain's word and does not resolve the
difference.

**What we cannot run yet.** The desk reads Base, Polygon and Solana. A
Hedera transaction id is neither a 0x hash nor a base58 signature, so
the door refuses it as an identifier it cannot read. The fee-payer
trap is real there and this store cannot yet observe it; a response
naming a Hedera network beside an EVM receipt reads `disagrees` on the
network row, and that is as far as the read goes.

## Decision 3: one projection, in the draft's vocabulary, never the record

Beside every native settlement attestation now rides `projection`: the
same observation in the shape an IETF Internet-Draft is converging on,
so tooling that speaks that dialect can read it and this store can be
named where adopters are listed.

Rules, each held by a test:

- **No field the native artifact did not derive.** Every value is
  copied or renamed from the signed native object. What the store does
  not hold, it does not reference: `settled_payment_ref` is null with
  the reason beside it.
- **It points back.** `projection_of` names the native artifact by
  evidence hash and battery; `primary` is false; the cite line says to
  cite the native artifact and never the projection.
- **Same key.** A detached JWS, EdDSA with the did:web kid, over the
  RFC 8785 bytes of its own fields. The conformance desk's verifier
  checks it.
- **Same expiry.** `expires` is the native `stale_after`.
- **Pinned.** `format` names the draft revision it targets.
- **Only the statuses the draft names.** SETTLED and PENDING_FINALITY
  map; REVERTED is a failed transaction, not a REVERSED payment, and is
  not mapped onto it. `native_status` rides beside the mapped value
  every time.

**What we did not see, said on every copy.** The draft text was not
reachable from the environment that built this. The field names used
are the ones public indexes quote from it. The projection's
`conformance` field says so in full and calls itself not a conformance
claim. If the draft's shape differs, the draft wins and the projection
changes or is withdrawn without ceremony. The native artifact does not
change.

**Not adopted:** the composite trust query as a query surface. That is
aggregation, and aggregation drifts toward a rating, which this store
has said in public it is not.

## Where the two blocks sit

Both ride below the native artifact's signature fields, on purpose:
one is somebody else's bytes, the other carries its own signature. The
native `signature_covers` says so. The contract is unchanged: every
field above `signature`, in the order served. Old artifacts are not
re-signed.
