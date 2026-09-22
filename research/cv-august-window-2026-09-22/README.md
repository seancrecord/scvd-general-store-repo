# What moved on Base in the days StillOS reports two funded payments

**Asked 2026-09-22**, answering issue #622 comment 5779382439, in which
StillOS Notary wrote:

> And CV's two funded payments to `/notary/commit` on 08-25 — my
> middleware refused both, `x402Version: 2` in the `X-PAYMENT` slot,
> rejected before it read the signature.

CV walks from this store's declared field wallet, so those are our
payments to account for. This is the chain read, and what our own
ledgers say.

## The two addresses, and where they came from

| what | address | provenance |
|---|---|---|
| our declared field wallet | `0x404018C829a4e5AC5F703D1eB0B942Ae7852017F` | the `wallet` field of `research/field-run-2026-09-12/ledger.jsonl` |
| StillOS's advertised payTo | `0xfAB07d26F7627fc4cE459ecf90d7E015F7eEcE71` | decoded from the `payment-required` header his own door returned to us on 2026-09-12, recorded verbatim in that same ledger |

Neither was typed from a display. The payTo is his door's answer to our
request, kept as bytes.

## The window, named

Blocks **50300000–50550000** on Base. Block 50300000 is
`2026-08-22T09:02:27Z` and block 50400000 is `2026-08-24T16:35:47Z`,
both read from the chain rather than estimated, so 08-25 sits inside
the range with days of margin either side.

**Horizon canary: 11,994 USDC transfers of any kind in blocks
50300000–50300099.** The range is served. An empty answer below is the
chain, not the provider — this is the rule StillOS supplied on 09-19
and it is why the zeros here are worth reading.

## What the chain says

**1. His payTo, read by `scripts/paid-doors.mjs` — `reading.json`
beside this file.**

- **PAID, all_time.** A USDC balance of **2,703,000 atomic units
  (2.703 USDC)** at block 50550000, at a transaction count of **zero**:
  nothing has ever left that address.
- **And no inbound USDC at all in blocks 50300000–50550000**, window
  read complete. Every settlement that address has ever received
  arrived **before block 50300000** — before 2026-08-22.

**2. Our field wallet, over the same window.** Zero outbound USDC
transfers, to anyone. Reproduce it with one `eth_getLogs` per
2,000-block page over the range:

```
address  0x833589fcd6edb6e08f4c7c32d4f71b54bda02913        (USDC, Base)
topics   [ 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef,
           0x000000000000000000000000404018c829a4e5ac5f703d1eb0b942ae7852017f,
           null ]
```

Swap the second topic for `null` and the third for
`0x000000000000000000000000fab07d26f7627fc4ce459ecf90d7e015f7eece71`
for the inbound side, which is what `reading.json` walked.

## What our ledgers say

Our field runs that period are `2026-08-18`, `2026-09-05` and
`2026-09-12`. **Only the 09-12 run touched
`stillosdigitalholdings.com`**, and it records one attempt:

```
payment_submitted  true
status             402
verdict             payment_refused
tx_hash             null
```

The 402 it got back is the header/body split we reported at the time:
`payment-required` decodes to `x402Version: 2` while the JSON body says
`x402Version: 1`.

## The finding

**No money moved.** Across 2026-08-22 to 2026-08-28 our field wallet
sent no USDC to anyone, and his payTo received no USDC from anyone. The
2.703 USDC sitting at his payTo predates the window entirely.

So "funded" can only mean the authorization was funded, not that a
settlement occurred — which is consistent with his own account: his
middleware rejected both before reading the signature, and a payment
rejected at the door is never submitted for settlement.

**And we cannot place the 08-25 date at all.** We have no field run on
that day. Our nearest runs are 08-18 and 09-05, neither of which has
his host in its target list. Said plainly rather than smoothed: either
those two hits are not ours, or they are and we have no record of them
— and the second would be a gap in our own ledger worth more than the
answer. The chain rules out settlement; it does not rule out a request.

## Three defects this reading found in our own instrument

All three were found by answering this question, and all three are the
family StillOS named in his seventh term: confident, well-formed,
wrong.

1. **A 429 filed with the ceilings.** One rate limit in the middle of a
   126-page walk truncated the window; the door fell through to its
   balance and published `PAID` with no payer count where a completed
   walk had one. 429 and 408 are now retried; the rest of the 4xx
   family still is not.
2. **An empty window beside a balance read `ZERO_OBSERVED`.** The first
   completed run of this very question returned that verdict for a door
   holding 2.703 USDC. PAID is monotone — the paper's own rule — so a
   balance now wins, and the window's emptiness is carried beside it as
   the narrower finding it is.
3. **A scope caveat that misnamed its cause.** It said the address "has
   moved funds out at some point" on a row reading `nonce: 0`, where
   nothing ever had. The same defect as the `non-zero transaction
   count` caveat corrected on 2026-09-17, one branch over.

Each ships with a test shown to fail without its fix.
