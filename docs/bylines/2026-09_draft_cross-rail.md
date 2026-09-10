# Byline draft — "A Solana signature can claim an Ethereum buyer's receipt"

Draft for the keeper's name. HackerNoon (tags: x402, solana, security,
payments, ai-agents). His voice, his edits; this is the shape. Every
number re-read from `research/buyer-cross-rail-2026-09-06.md` and
`BUYER_AUDIT_LOG.md` the day it posts.

---

**Title:** A valid Solana signature claimed another buyer's Ethereum
receipt. The signature was never the problem.

**Standfirst:** On September 6, 2026 a cross-rail audit of my own
multi-chain x402 checkout found that a cryptographically valid Solana
payer could retrieve an EVM buyer's paid artifact without settling
anything. The Solana signature verified correctly. My code read the
field next to it.

---

My store takes USDC over x402 on five networks. Adding rails is the
easy, celebrated part of multi-chain: quote the network, verify with the
facilitator, record which one settled. I did that, and I was pleased
with myself.

Then I ran an audit specifically against the seams between rails, and
found two defects that I think generalize to every multi-chain payment
endpoint being built right now. I run scvd.store, so both of these are
mine.

## Defect one: the metadata beside the signature

Here is the attack, in full.

A legitimate buyer pays on Base with the publicly suggested idempotency
key and receives their artifact. Normal, correct, cached.

Now a different party constructs a **real, valid Solana payment** —
genuinely signed, correct mint, correct destination, correct amount. And
alongside the Solana payload they attach an EVM-shaped
`payload.authorization.from` naming the first buyer's wallet, plus an
EVM-shaped nonce. Same item, same arguments, same suggested key.

Both my HTTP door and my MCP door returned **the EVM buyer's original
certificate**. The Solana payment was never settled. The attacker got
someone else's paid good for free, and the real buyer's receipt was
handed to a stranger.

The Solana facilitator SDK behaved perfectly throughout. Handed the same
fixture in Node, it verifies the transaction and returns the actual
Solana payer, correctly. My replay guard never asked it. My cache lookup
reached for `payload.authorization.from` without first checking which
rail had been authenticated, because on the EVM path that field is
always the payer and I had written that code when there was only an EVM
path.

**A signature authenticates the transaction it covers. It does not
authenticate the fields sitting next to it in the same envelope.**

That sentence is obvious in isolation. It stops being obvious the moment
one code path handles two envelope formats, because the envelope is
where you keep the things that are the same across rails, and payer
identity *feels* like one of those things.

There was a quieter version of the same bug in the same finding:
ordinary, honest Solana payments that happened to carry an extra
authorization object were writing EVM nonce records. One rail consuming
another rail's replay-protection state.

Four victim cases — HTTP and MCP, against Base and Polygon buyers — all
reproduced before the fix. The repair reads authenticated payer fields
only from exact-EVM v2 envelopes, and ignores EVM nonce metadata on
Solana envelopes entirely. The Solana buyer now gets their own purchase
and consumes nobody else's nonce.

## Defect two: a valid signature over a meaningless fact

The second one is shorter and, I think, worse.

Settle a real signed Solana transfer, then have the facilitator's
success response carry `transaction: "0OIl!"` as the settlement
identifier.

My store minted a certificate containing that value. My public
`/api/verify` endpoint reported that certificate **valid**.

And it was valid. The Ed25519 signature over the certificate was
correct. Every field matched the signed payload. Anyone verifying it
offline against my published key would get a clean pass.

The string `0OIl!` is not base58. It does not decode to a 64-byte Solana
signature. It cannot identify any transfer on any chain. The good
existed and the buyer had it. The payment reference was noise, signed
and blessed.

**Certificate validity is not transaction validity.** A signature proves
that the issuer said this. It does not prove that what the issuer said
corresponds to anything.

Those four characters were chosen on purpose, by the way — `0`, `O`,
`I`, `l` are exactly the characters base58 excludes. If you validate by
alphabet alone without decoding and checking the length, a subtler
string gets through.

The repair validates settlement identifiers against the rail that was
actually selected, decoded, at the expected 64 bytes, before anything is
signed. When the receipt is malformed, both doors now report
`invalid_settlement_receipt` with `charged: null` and
`payment_state: "unknown"` rather than signing a fact nobody can check
or, worse, cheerfully offering the buyer a second payment. Ten malformed
cases failed before the patch and pass after, including recovery of the
same signed payment once a corrected receipt arrives.

## The two laws, stated plainly

If you are building an endpoint that accepts more than one chain, these
are the two I would put on the wall:

1. **Derive identity from the rail that was actually verified.** Every
   cross-rail cache, replay guard, nonce store and idempotency key is a
   place to get this wrong, and the failure mode is silent, because the
   honest path never exercises it.
2. **Validate a settlement identifier against its rail before you sign
   it.** Decode it. Check its length. An identifier you cannot decode is
   an identifier you cannot later use to prove the payment happened,
   which is the entire reason you recorded it.

The first one costs you nothing today and saves you a receipt-theft bug.
The second is the difference between a receipt and a nice-looking
string.

## How it was tested

116 observations across 32 catalog items, both doors, and Base, Polygon
and Solana.

The EVM authorizations were signed locally with a disposable key against
the offered USDC domain and chain ID with real EIP-3009 typed fields, so
wrong-chain cases exercise actual cryptographic domain separation rather
than a fixture with a failure label stapled to it. The Solana fixtures
carry real locally generated ed25519 signatures, separate buyer and
fee-payer keys, associated token-account derivation, compute-budget
instructions and a `TransferChecked` instruction. Recent blockhash,
account funding and chain state are simulated. Nothing was broadcast.

Every recorded Solana transaction was then run through the installed
`@x402/svm` facilitator scheme in Node with network-capable operations
prohibited: 44 fixtures, 36 valid shapes and eight deliberately invalid
ones, with no disagreement between my verifier and the SDK.

One diagnostic detail I kept in the report rather than smoothing away:
the facilitator SDK **rejected valid fixtures when embedded in my local
Worker test runtime**, while its Node runtime accepted them and correctly
rejected the negative control. I do not fully understand that yet. It is
recorded as an unexplained runtime disagreement rather than allowed to
sit in the results looking like protection I have not proven I have.

## What this doesn't prove

Disposable identities, simulated chain state, no mainnet broadcast, no
live balances or finality. The malformed-identifier case deliberately
violates the facilitator's own response contract; it is not a claim that
any live facilitator currently emits such a value, only that my store
believed one when it did.

The payer-boundary defect was reproduced with keys I generated, not
against any real buyer's account, and I have no evidence it was ever
exploited. Both repairs are committed with regressions observed failing
before and passing after. That is a weaker claim than "fixed," and it is
the strongest one I can make honestly.

Related findings in the same family remain open, including Solana
duplicate-request handling. They are listed by ID in the public log.

---

*Canonical link:* the defect page for cross-rail identity.
*Prior bylines to cross-link:* the AURa piece (HackerNoon, 2026-08) and
the signed-offer census (dev.to, 2026-09-03).
