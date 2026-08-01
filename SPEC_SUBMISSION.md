# Draft: submission to the x402 offer-receipt signer-authorization table

⚑ KEEPER'S PEN BEFORE POSTING. This goes out under his GitHub account,
against x402-foundation/x402, as a PR editing the "Signer Authorization
Approaches" table in
`specs/extensions/extension-offer-and-receipt.md` (or an issue, if a
PR against a normative doc feels presumptuous for a first
interaction). The spec invites exactly this: "To be listed, describe
how the approach handles key rotation and whether it provides
temporally immutable proof of authorization."

CV's stress test shaped the framing and it is the right one: the
mechanism is NOT novel — it is the PGP key-transition-statement /
DNSSEC double-signature KSK-rollover pattern, applied to this spec's
named gap. The prior art is cited by us, first, because a reviewer in
this space will know it exists, and a submission that omits it reads
as unaware or overclaiming. Either burns the one interaction where
credibility is the entire point.

---

## The table row

| Approach | Description |
| --- | --- |
| Self-hosted key history with outgoing-key-signed transitions | Extend `did:web` with a permanently-published key registry: every key the service has ever used, with in-service dates, and — the load-bearing part — each rotation announced in an artifact **signed by the outgoing key** before the new key signs anything (the PGP key-transition-statement / DNSSEC double-signature rollover pattern, applied to x402 signer authorization). Supports key rotation history: retired keys stay published forever with stable, per-key `kid` fragments, so artifacts signed under them remain verifiable and attributable after rotation. Does **not** provide temporal immutability: the registry is self-hosted and mutable. What survives that limitation is the transition chain itself — a successor cannot be retroactively invented without the retired key's signature, and where the registry lives in a public git history, edits are third-party-timestamped and tamper-evident (though not tamper-proof). Free and self-service; no on-chain writes required. |

## The PR body

Adding a row to the signer-authorization table, per the table's own
invitation.

**What it is.** A `did:web` service publishes, beside its DID
document, a permanent key registry: every signing key it has ever
used, each with in-service dates and a stable per-key `kid` (never a
"current key" slot, which silently repoints on rotation and breaks
existing artifacts). Each rotation is announced in a signed artifact
issued **by the outgoing key, before the incoming key signs
anything**, naming the incoming key. The DID document's
`verificationMethod` lists only the currently-authorized key, per its
semantics; the registry carries the history.

**Prior art, named up front.** This is not a new mechanism. It is the
OpenPGP key transition statement ("this message is signed by both
keys to certify the transition") and DNSSEC's double-signature KSK
rollover, applied to the gap this spec's table records for `did:web`
and DNS TXT: "once a key is removed during rotation, there is no
record it was previously authorized." The contribution is the
application — machine-readable, derived from a live registry rather
than a hand-signed one-off statement, resolvable without out-of-band
tooling.

**Rotation history: yes.** Retired keys stay published permanently
with their service windows. A verifier checking an artifact signed
under a retired key finds the key, its dates, and the signed
transition that retired it.

**Temporal immutability: no, and we say so.** The registry is
self-hosted and mutable. Two things survive that honestly stated
limitation: (1) the transition chain is cryptographic — a service
cannot retroactively fabricate a predecessor it never held, because
the announcement requires the retired key's signature; and (2) a
registry kept in a public git history gets hosted, third-party
timestamps on every change — tamper-evident, not tamper-proof. For
temporally immutable proof, the on-chain approaches already in this
table remain the stronger option; this row is the free, self-service
middle ground between "mutable, no history" and "on-chain."

**Working implementation.** Live at `scvd.store`: DID document at
`/.well-known/did.json` (current key only in `verificationMethod`;
history referenced), key registry at
`/.well-known/scvd-signing-key` (`key_history`), and a real executed
rotation — announcement signed by the outgoing key, verifiable at
`https://scvd.store/api/verify/handover_1`. The failure case is
documented too: if the outgoing key cannot sign (theft, loss of use),
no legitimate transition is available under this scheme, and the
service must say so rather than perform one — this approach does not
cover that case, and a scheme whose bad case is unwritten will
improvise it.

---

## The second gap in the same table, one sentence

Worth naming in the PR body, per CV's find: the extensions overview
shows every other extension with TypeScript, Go and Python SDK
support — Signed Offers & Receipts is TypeScript-only. We are not
volunteering Go or Python (not our lane), but a working TypeScript
implementation on a non-Express stack (Hono on Workers) exists at
scvd.store, and we can contribute CONFORMANCE VECTORS — known-good
signed offers and receipts with the verifying key — that an SDK
author in any language can test against. Offering vectors costs us
an afternoon and is the kind of help a spec repo actually wants from
a small implementer.

## Draft comment for issue #2664 (post-quantum), keeper's pen

> The proposal's open-questions list covers scheme naming, key
> encoding and nonce architecture — but not backward compatibility,
> and that may be the hardest part of a PQ migration for any service
> already issuing signed artifacts: how do pre-migration signatures
> stay attributable to the service after the algorithm changes?
>
> One transition pattern that needs no new cryptography, offered in
> case it is useful (it is the PGP key-transition-statement / DNSSEC
> double-signature rollover shape, not something we invented): treat
> the PQ migration as a key handover. The service announces the
> ML-DSA key in an artifact signed by the outgoing classical key,
> before the PQ key signs anything; the classical key stays published
> permanently with its in-service dates, so artifacts signed under it
> remain attributable; verifiers distinguish "authorized during its
> era" from "authorized now." We run this live for classical-to-
> classical rotation (working example: a real handover at
> https://scvd.store/api/verify/handover_1) and the mechanics are
> algorithm-agnostic — the incoming key's type is irrelevant to the
> transition chain.
>
> One honest limitation worth stating in any PQ-migration design: the
> outgoing classical signature on the transition statement is itself
> only as strong as the classical algorithm, so the transition chain
> should be established BEFORE a cryptographically relevant quantum
> computer exists, not after. Early migration is not just prudent for
> new signatures — it is what keeps the transition itself credible.

## Draft answer for issue #2650 (linking settlements to execution receipts), keeper's pen

> Not a spec answer, but a live data point that may help: we run a
> small x402 store where every settlement mints a signed certificate
> that binds most of what you list — the payer wallet (chain-
> verifiable), the item/task, the settlement transaction hash (so the
> receipt and a Base explorer are one fact checked twice), and a
> maker's mark for who/what performed fulfilment. The verify endpoint
> serves the exact signed bytes plus an artifact_hash, so a copy is
> independently recomputable without re-trusting the transport:
> https://scvd.store/attestation describes what each signature does
> and does not prove. We also implement the Signed Offers & Receipts
> extension, which covers the "which x402 payment covered it" half at
> the protocol layer.
>
> The piece your question needs that neither of these provides: an
> execution receipt is still the SERVICE attesting it did the thing.
> For "did the action actually happen," the missing layer is an
> observer that is not a party to the transaction — which is a
> different trust model, not a bigger signature.

## Notes for the keeper, not for the PR

- The store's house rules hold: no "first ever," prior art named by
  us before anyone else names it, limitations in the submission
  rather than discovered after.
- If a maintainer pushes back that self-hosted history is too weak
  for the table, the honest fallback is offering it as a paragraph in
  the did:web row instead of a new row. The goal is the citation and
  the usefulness, not the real estate.
- Link the AT_SCALE / attestation pages only if asked; the PR should
  stand on the mechanism, not on the shop.
