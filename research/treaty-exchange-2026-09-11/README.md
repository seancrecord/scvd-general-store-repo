# Treaty exchange, 2026-09-11 — one artifact each way

The first receipt treaty (StillOS Notary, issue #622) tested with a real
artifact crossing in each direction, the day the treaty entry reached
main.

## Ours, verified by them

`cert_et6zuesrrn` (a Small Blessing, 2026-09-06). Marcus reports both the
house signature and the RFC 8785 JCS signature valid against the key at
`/.well-known/scvd-signing-key`, stock library, nothing of ours in the
path. His words, on the issue; not re-verified here because it is our
own artifact and our own key.

## Theirs, verified by us

Receipt `e851b71a…0329d799`, a `github_pr` verdict that PR #635 is merged.
`stillos-receipt-e851d799.json` is the receipt as their verify endpoint
returned it; `stillos-keyring.json` is their keyring, both pasted by the
keeper on 2026-09-11 because the build environment's egress refuses their
host. `verify.mjs` is the check, Node's stock crypto only, and
`result.json` is what it printed:

- key resolved by the receipt's own `notary_fp` to the active key; the
  same signature fails under the retired key, so the check discriminates;
- Ed25519 over the ASCII of `receipt_hash`: valid;
- `receipt_hash` recomputed from the JSON of six fields in served order;
- the claim binding did NOT reproduce: SHA-256 of the claim text as given
  on the issue is `b8e2aea4…abc422`, the receipt carries `84310abb…4b60a6`.
  Either the committed bytes differ from the text in the comment, or
  `claim_sha256` covers something other than the bare text. Put to Marcus
  as a question, not a verdict. This is the second pair of eyes the
  treaty exists to provide, in whichever direction it turns out to point.

What this does not prove: that the verdict inside the receipt is true.
PR #635 being merged is a fact anyone can check on GitHub; the receipt is
testimony that StillOS resolved it, signed. That is exactly the scope
their `proves` field states, and exactly what the treaty honours.

## The walk of his door (2026-09-12, the keeper's press)

`research/field-run-2026-09-12/` is the run: one door, `POST
/notary/commit`, ten cents authorised under the keeper's own override
words, the runner having learned per-target method and body for it the
same day (PR #647). What the ledger records, raw:

- the unpaid POST drew a 402 whose `PAYMENT-REQUIRED` header is a v2
  challenge (`x402Version: 2`, `network: eip155:8453`, `amount:
  100000`) and whose body is a v1 challenge (`x402Version: 1`,
  `network: base`, `maxAmountRequired`), for the same payTo and price;
- the runner read the header, screened the payTo (not listed), signed
  an EIP-3009 authorisation for 100000 atomic USDC on eip155:8453 and
  presented it as the v2 `PAYMENT-SIGNATURE` header;
- the door answered the paid request with the same 402, error
  `X-PAYMENT header is required` — the v1 payment header's name;
- reconciliation over the run's block range: zero transfers. No money
  moved.

Reading: the door advertises v2 on its header surface and v1 on its
body surface (the `placement-mismatch` class, two surfaces
disagreeing), and its paid path reads only the v1 header. A buyer that
follows the v2 challenge, as this runner does and as the header invites,
cannot pay. A v1 buyer reading the body presumably can. That is a
statement about one moment from one wallet, not a grade; it is the
same defect class Marcus described fixing on 2026-09-10 ("wrong network
label on the challenge"), seen from the paid side rather than the
challenge side. Sent back to him with the ledger line, per the treaty.

An earlier attempt the same night (`codex/ward-index-readings`,
`research/field-run-2026-09-12/` on that branch) ran the pre-#647
runner and sent a GET; the door's `method_not_allowed` body was filed
as `malformed_challenge`. A true reading of the wrong question, never a
payment; kept there, superseded here.

## His answer, and what it settled (2026-09-12)

Marcus replied on issue #622 the same night, with both findings fixed
and his own walk run before posting.

**The door.** He confirms both readings. His `PAYMENT-REQUIRED` header
was a v2 challenge and every paid path read only v1's `X-PAYMENT`;
`PAYMENT-SIGNATURE` sat in his CORS allow-list and in no gate. His fix
decodes `PAYMENT-SIGNATURE`, translates the v2 envelope to v1, and
passes the inner payload untouched to the existing verifier.

One part of that we can check from here without walking anything, and
did: he says the translation cannot disturb the signature because the
network label is not signed. Our own signing code agrees —
`typedData()` in `scripts/lib/walkabout.mjs` builds the EIP-712 domain
as `{name, version, chainId: 8453, verifyingContract}`, and no
envelope's network string appears in it. `base` and `eip155:8453` are
the same chain id, so the authorization our field wallet signed on
2026-09-12 is byte-identical under either label. That is a reading of
our own code, not a verification of his server; whether his door now
settles is a walk, and a walk is the keeper's press.

He also leaves one thing open in his own words: the v1 body still
carries a v1 error string under the v2 header. Deliberate for now, and
"still wrong to instruct a v2 payer with." Named by him, not by us.

**The preimage, answered.** Our open question was what `claim_sha256`
covers. It is not the claim text: on a `resolved_verdict` it commits
to the sealed verdict object, which is why no whitespace or wrapping
of the sentence closed it. They published the summary, not the object.

CORRECTED 2026-09-15, and the correction is against us. What this
section said until then was that `e851b71a…`'s binding was
"unreproducible by anyone, permanently" — because a field of that
object is the SHA-256 of the resolver that ruled, that file changed on
an SSRF fix the morning of the 12th, and the issuer reported the
preimage unstored.

That was never our observation to make. We had established one thing:
that WE could not reproduce the binding from the claim text. The rest
was the issuer's account of his own records, which is evidence about
his records and not a fact about what is possible — and we wrote
"anyone" and "permanently" into it anyway. On 2026-09-15 he supplied
the preimage. It is 827 bytes, it hashes to
`84310abb469fe44cbafe0710fafad24e204f94e262e48cb1df97bf961f4b60a6`,
and that is exactly the `claim_sha256` the receipt carries. It
reproduces, by anyone, from bytes now published: the file sits beside
the receipt here as `stillos-receipt-e851d799.json.preimage`, and
`result.json` is `verify.mjs` reading it. Both artifacts across this
treaty now reproduce on every layer.

The rule this cost us, kept where it was earned: an issuer's account
of their own internals is evidence about their records, never a fact
about the world, and one failed reproduction earns nobody the word
"permanently". `verify.mjs` was not wrong — it refused to pass a
binding it could not check, and it hashed the supplied bytes without
change. The defect was in prose, which is where this store's
unfalsifiable claims have always appeared. It is on /corrections.

What changed on his side: `GET /notary/preimage?hash=<receipt_hash>`
now serves the literal bytes hashed at ruling time, every
`resolved_verdict` carries a pointer to it, and old receipts get that
explanation there rather than a bare 404. `verify.mjs` now hashes such
bytes when they sit beside a receipt as `<receipt-file>.preimage`, and
says it had nothing to hash when they do not — the check never passes
quietly on an absent file.

This is the treaty doing the thing it was for, in both directions
within two days: his verifier caught its own drift on our reciprocal
pass, our walk caught his paid path, and his answer caught a binding
of his own that no longer reproduces. None of it required trusting
either operator's word.

## The second receipt, checked end to end (2026-09-12)

Egress to their host opened for this session on 2026-09-12, so this
round was fetched and checked here rather than pasted. Receipt
`f542d90b…088a4e`, a `github_pr` verdict, with the files as served:
`stillos-receipt-f542d90b.json`, `stillos-preimage-f542d90b.json` (the
endpoint's response) and `…json.preimage` (the literal bytes out of
its `preimage` field, written unchanged). `result-f542d90b.json` is
what `verify.mjs` printed. Four layers, each a different question:

1. **Key.** The receipt's own `notary_fp` resolves to the active key in
   the keyring; the same signature fails under the retired one, so the
   check discriminates rather than accepting any key they publish.
2. **Signature.** Ed25519 over the ASCII of `receipt_hash`, valid.
3. **Hash chain.** `receipt_hash` recomputes from the JSON of its six
   fields in served order.
4. **Claim binding.** SHA-256 of the published preimage bytes equals
   `claim_sha256`, exactly. The question left open on 2026-09-11 is
   now answerable by anyone with curl.

And a fifth that is not theirs to certify, which is the point of the
verdict being about a public fact: **the substance**. Their sealed
object records `merged_at 2026-09-11T17:24:02Z`, merge commit
`95a3c4a31e372d5cce91cd6efb413c12ec073634`, and the pull request's
title. GitHub's own record of PR #635 gives the identical timestamp
and title, and that commit exists on this repository with that message
and 12 changed files. So the verdict is not merely signed; it is
signed AND true, and the two were established separately.

## Their door, read unpaid (2026-09-12)

One free request, the walk's first leg, no payment presented and none
authorised — the keeper's press bought one walk and this is not a
second. `POST /notary/commit` still answers 402 with a v2 challenge in
`PAYMENT-REQUIRED` (`eip155:8453`, `amount`) and a v1 challenge in the
body (`base`, `maxAmountRequired`). The two surfaces still disagree,
which he names as his to close.

What did change, and is better than his own note claimed: the body's
error string now instructs a v2 payer correctly rather than misleading
one. It names the `PAYMENT-SIGNATURE` header, says both are accepted,
points at the `PAYMENT-REQUIRED` header for the v2 challenge, and
states that `base` and `eip155:8453` are the same chain. A buyer who
reads only the body can now pay. Whether the paid path settles is a
walk, and a walk is the keeper's press; this is a shape reading, and
it says nothing about settlement.

## One thing back to them

Their statement at `/notary/trust?format=json`, re-read the same day,
still names our origin, our key URL and our verify template, and still
carries its removal policy. It also still reads `reciprocated: false`.
By their own `reciprocity_note` — "a treaty is complete when the
counterparty publishes their own statement citing this URL" — that
flag is stale: `/trust-list.json` has cited their statement URL since
2026-09-11. Ours to tell them, not ours to change.

## What the finding turned out to be (2026-09-13)

Marcus followed up on the one thing he had left open, and brought two
instances we had no way to see.

**The body, closed — and checked against our own record.** He says only
the error prose changed and that `x402Version`, `accepts[]`, network,
`maxAmountRequired`, `payTo`, `asset` and `extra` are byte-identical,
his process re-comparing both objects with the error nulled and
shipping the original on any mismatch. That claim is checkable here
without taking his word, because the 09-12 walk recorded his challenge
verbatim: comparing today's unpaid 402 against
`research/field-run-2026-09-12/ledger.jsonl`, the only field that
differs on either surface is `error`, and `accepts[0]` is byte-identical
on both. His account of his own change is exact.

The raw record also shows a fix he did not itemise. On 09-12 the v2
HEADER challenge carried `"X-PAYMENT header is required"` — the v1
header's name, inside the v2 challenge. It now reads
`"PAYMENT-SIGNATURE header is required"`. Neither of us named that at
the time; it is in the ledger because the ledger keeps bytes rather
than conclusions.

**Three more surfaces, which is the actual finding.** He went looking
only because the first fix had been too narrow, and the same defect was
in his MCP adapter (read only `x-payment`, so a v2 caller's payment was
dropped before it reached the notary, and the caller was told to retry
with an `X-PAYMENT` header) and in his Bazaar listing proxy (which
accepted v2 payments correctly, but whose request log keyed on
`x-payment`, so a real v2 buyer arriving from the Coinbase catalog was
recorded as never having attempted payment). Every paid front-end now
goes through one shared translation module. He names two internal-only
services still running stale processes rather than claim a clean sweep.

So what our walk found at one door was one instance of a defect that
lived at four, and the door we happened to knock on was not the worst
of them: the MCP adapter silently dropped payments, and the Bazaar
proxy took the money and recorded no attempt.

**The consequence for measurement, which is his to state and ours to
record.** His payment ledger also keyed on `x-payment`, so a v2 attempt
produced no row at all. Our 09-12 walk is probably absent from it —
not rejected and logged, but missing. In his words, any count they have
published of how many wallets have ever attempted payment is a floor,
not a number; it records both versions now, and which was used.

That is the same failure this store names in its own instruments and
counts against itself: an instrument that cannot see a case reports
zero for it, and a zero from a blind instrument is indistinguishable
from a zero from a working one. Here it ran in the direction that
flatters nobody — a door that was refusing real buyers also could not
count them.

**And it settles who holds the record of our own run.** He cannot
confirm the 09-12 walk from his side, because his ledger has no row for
it. `research/field-run-2026-09-12/ledger.jsonl` is the only account of
that attempt that exists anywhere: his words, and our file. That is not
a point scored. It is the argument for writing down raw bytes at the
moment of observation, made by the other operator, about our record.

**What this earns.** None of the store's 29 published defect classes
covers it: a door that refuses a correctly signed payment presented in
the protocol version its own challenge advertises, answering with the
same challenge as though nothing had been presented. It is a candidate
for the vocabulary, drafted in
`docs/DEFECT_CANDIDATE_ADVERTISED_VERSION_2026-09.md` with the
detection it would need first, because this store publishes no class
its own instruments cannot report.

## The fourth round: he corrected our instrument (2026-09-13)

The treaty's best day so far, and it ran against us, which is the
point of having one.

He flipped `reciprocated` to true with a `reciprocated_at` of
2026-09-11 and evidence pointing at our list — and said he read our
list to do it rather than taking our word from the comment. Then he
took the drafted defect class apart, correctly, three times.

The comparator had a **false negative**: comparing `accepts[]` whole
would score clean on any door carrying a per-request nonce, expiry or
rotating timeout, which is the more careful half of the ecosystem. The
**assertion reached past what a buyer can see**: his Bazaar proxy
accepted v2 payments, settled, delivered, and logged nothing, and no
buyer-side instrument can observe that, so the class must not claim
it. And **the instrument's first green must not be trusted** — he had
shipped a chain reader that week which said zero revenue at 27 of 27
doors on a mistyped field name, failing closed and silent, and
corrected reads 8 of 13.

All three are in what shipped, the same day, as vocabulary v15. The
detector reads five material terms, the class names the seller-side
variant as a separate fault rather than claiming it, and no reading
can come back a quiet clean: `checked: false` is a different answer
from `present: false`, asserted in the tests. The positive control is
our own 09-12 ledger line rather than a fixture, so the test fails if
that record is ever rewritten.

He also offered two things we have not taken: a chain-side instrument
that ranks doors by whether anyone has ever paid them, free and
retroactive, useful before spending a wallet on a walk; and five of
his 49 third-party defects as a blind answer key for our battery. Both
are the keeper's to accept or decline. The second is the more
interesting: a blind answer key is the only honest way to find out
whether our instruments report what they claim to, and it is exactly
what he did to himself this week and told us about.

Four days in, this treaty has caught his verifier, his door, his
adapter, his proxy, his ledger, our comparator and our assertion. Not
one of those was found by trusting anyone.
