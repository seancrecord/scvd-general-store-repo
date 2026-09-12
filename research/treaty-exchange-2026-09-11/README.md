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
