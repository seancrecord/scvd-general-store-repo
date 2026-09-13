# Defect candidate: refuses payment in the version it advertises

Drafted 2026-09-13 from the field, not from a spec read. NOT SHIPPED:
the vocabulary publishes no class its own instruments cannot report,
and today none of them reports this one. The detection is specified
below; the class text is finished and waiting on it.

## The observable

A door serves a payment challenge that advertises protocol version N.
A buyer reads that challenge, signs correctly against its terms, and
presents the payment in version N's own envelope. The door answers with
the same challenge it served before — not a refusal naming anything
about the payment, but the original challenge, as though nothing had
been presented.

From outside, that response is indistinguishable from the one an unpaid
caller gets. The buyer did everything the door asked. No money moves.

## Where it was seen

`POST https://stillosdigitalholdings.com/notary/commit`, walked
2026-09-12 from this store's declared field wallet under the keeper's
press. The `PAYMENT-REQUIRED` header carried a v2 challenge
(`eip155:8453`, `amount`); the runner signed an EIP-3009 authorization
for its exact terms and presented it as `PAYMENT-SIGNATURE`; the door
answered 402 with the same challenge and `X-PAYMENT header is
required`, the v1 header's name. Zero transfers over the run's block
range. Raw bytes: `research/field-run-2026-09-12/ledger.jsonl`.

The operator confirmed it the same day, fixed it, and — because the
first fix had been too narrow — found three further instances on his
own surfaces, including one that dropped payments silently and one that
took payment correctly while recording no attempt. The full account,
his words and ours: `research/treaty-exchange-2026-09-11/README.md`.

## Why no existing class covers it

- `unparseable-challenge` is unpaid and about a challenge a client
  cannot read. This challenge parsed perfectly; that is the problem.
- `settlement-error` is a correct payment answered with a server error.
  This answers 402, which is a legal status and a legible document.
- `re-challenges-spent-authorization` is about re-presenting an
  ALREADY-SETTLED payment. Here nothing ever settled, and the first
  presentation is the one refused.
- `wrong-network` is a door offering a network the buyer is not on.
  Here the buyer is on exactly the network the door named.

It is its own class: the door's advertised version and its paid path
disagree, and only a presented payment reveals it.

## The class, as drafted

```ts
{
  id: "advertised-version-unpayable",
  title: "Refuses payment in the protocol version it advertises",
  asserts:
    "A correctly signed payment, presented in the protocol version the door's own challenge advertises, reaches that door's verifier: it is accepted, or refused on something about the payment, never answered with the same challenge as though nothing had been presented.",
  costs:
    "The buyer that followed the instructions is the one that cannot pay. It read the advertised version, signed against those terms, presented them in that version's envelope, and got back the challenge it started with — from outside, identical to never having paid at all. No money moves, so there is nothing to refund and nothing to chase; what is lost is the sale, silently. The same version-keyed read that refuses the payment often keys the door's own logs, so the attempt may not be counted either: a door in this state can be turning buyers away and reporting that nobody came.",
  detectable: "paid",
  our_signal: "<the detection below; null is not an option>",
  falsified_by:
    "The door answering a correctly signed payment, presented in the version its challenge advertises, with anything other than that same challenge — the goods, or a refusal naming something about the payment — at the stated moment. A door that advertises one version and refuses a DIFFERENT one is not this defect: the class is about the version the door itself names.",
  repair_hint:
    "Find every place your code names a payment header and count them; the defect is a version-keyed read, and it is rarely in one place. Route every paid front-end through one translation that accepts each version you advertise and hands the inner payload to one verifier unchanged — for exact/eip3009 the signed EIP-712 domain carries chainId rather than a network label, so translating the envelope cannot disturb the signature. Then check what your request log and payment ledger key on: a surface that accepts the newer version while its ledger keys on the older one records real buyers as never having tried.",
  buyer_hint:
    "If a door answers your signed payment with the challenge you already read, do not sign again — nothing settled, and a second signature buys nothing a first one did not. Read its refusal for a header name different from the one you sent; if it names another version's header, the door is unpayable as advertised rather than refusing you. Keep your raw request and response: the door's own records may have no row for the attempt.",
}
```

## The detection it waits on

The evidence is already in every walk we run; nothing needs to be
bought again. On a paid attempt the runner holds both the unpaid
challenge and the paid response. The check is: the paid status is 402,
and the challenge in that response is equal to the unpaid one (compare
`accepts[]` and `x402Version`, ignoring `error`, since a door that
re-serves its challenge may honestly vary the prose).

Where it goes:

1. `scripts/lib/walkabout.mjs` — a pure function beside `classifyPaid`,
   tested in `scripts/walkabout.test.mjs` against the recorded 09-12
   challenge and its paid response, which are already in the tree.
2. `src/services/launch-check.ts` — the productized instrument, so
   `our_signal` can name a real stage the way every other class does.
3. The vocabulary: the class above, version 15, a changelog entry whose
   `at_the_instigation_of` credits the walk and StillOS Notary's
   confirmation and generalization, `defects/package.json` at 0.15.0,
   and `npm run defects:cut`.

Sequence matters: the detection first, then the class. A published
class nobody's instrument reports is the same shape of claim this
register exists to refuse.
