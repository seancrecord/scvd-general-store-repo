# Binding classes on the settlement attestation

*Decided 2026-09-11, shipped the same day. The first of three decisions
taken together: bind the observation, then accept a facilitator's
settlement response as input, then emit an IETF-shaped projection. This
note records the first and names the other two so the order is on the
record.*

## The gap, in our own words

A settlement attestation is one RPC read of public chain state, signed.
It answers "did this transaction settle" and, by hash, "was this settled
twice." It never answered "is this the settlement of THAT authorization"
in so many words. The desk had read EIP-3009 nonces out of
AuthorizationUsed events since it opened, but folded the answer into
SETTLED versus INSUFFICIENT_MATCH: two SETTLED artifacts, one asked with
a nonce and one without, looked the same unless a reader dug through the
echoed query.

The launch check already knew this. Its payment_attempt field has said
since D6 that a seller-named receipt does not establish use of that
exact nonce (`src/services/launch-check.ts`). The attestation desk named
the same gap nowhere. One store, two desks, one of them silent.

Outside, the x402 spec thread reached the same seam from the other side:
for the default scheme, transaction-ID dedupe answers "settled twice,"
not "bound to this request," and a payload signed against one challenge
can be presented against a fresh one with the same terms. That is a
protocol gap. This store cannot close it. It can type it.

## What changed

Every observation now carries two more signed fields.

**battery** — `settlement-attestation-v2`, the desk's revision, the way
the launch check has cited `launch-check-v2` since D6. The first
revision never wrote one down, so absence is how a reader knows an
artifact predates this line.

**binding** — `{ class, asked, reading }`:

| class | means |
|---|---|
| `none` | Nothing on the artifact ties the transaction to one authorization or request. The usual value, and what every artifact before this battery meant. |
| `authorization_nonce` | The nonce asked about appears in an AuthorizationUsed event of this transaction, read from the chain. The transfer is the settlement of that one EIP-3009 authorization. |
| `input_commitment` | Reserved. A commitment to the request itself, carried in the settlement. No rail this desk reads carries one. Declared now so the word exists before it is needed. |

`asked` records what the caller asked to have checked, so "unbound" and
"unasked" stay apart. The difference between them is itself evidence.

Solana rows say `none` and say why: that rail carries no EIP-3009 nonce
and the desk reads no request commitment on it. An honest none is a
named gap, which is this store's whole act.

## The seam, stated on the artifact

`authorization_nonce` ties the transaction to ONE AUTHORIZATION, not to
one request. Whether the door tied that nonce to a single 402 challenge
is the door's work and is not observed here. The binding's reading says
this in those words, the scope points the reader at the field, and the
declaration page's does_not_prove repeats it. This field types the gap.
It does not close it, and never claims to.

## Absence means one thing per version

An artifact with no battery predates binding classes. It is silent
about binding: not "unbound," not "unasked." Its echoed query says
whether a nonce was asked, and its status already folded the answer in.

An artifact citing the battery without a well-formed binding is
defective, not old. Under `settlement-attestation-v2` the field is
mandatory.

`readBinding()` in `src/services/attestation.ts` applies both rules, so
no reader has to reconstruct them, and a test holds each branch.

Old artifacts are not re-signed. This store does not re-sign.

## Vocabulary

`BINDING_CLASS_ALIASES` keeps other people's words for the same classes
beside ours, so the mapping is a table rather than a private dialect.
The spec thread had not settled its nouns when this shipped (the §5.3.5
text was still on a branch; a separate issue titles the gap "request
commitment"). When the words land, the alias lands in the table and the
class name stays.

## What this is not

Not a change to any verdict. SETTLED, INSUFFICIENT_MATCH and the rest
classify exactly as before; the binding says out loud what the verdict
was already built on.

Not request binding. See the seam above.

Not the other two decisions. Accepting a facilitator's
SettlementResponse as input (chain-derived fields signed, the
facilitator's claims in a separate received-not-observed block with a
digest in the signed payload, per-field agreement beside it) and the
IETF-shaped projection (a pointer back to the native artifact, same key,
same expiry, never cited as primary) come after this, in that order,
because the binding field changes what both of them carry.
