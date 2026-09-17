# The bitrefill window at a second provider — refused, and what a third reader says

**2026-09-17.** The joint write-up's §8 owed a second read of the
`api.bitrefill.com` window (Base blocks 50918945–51316142) at a
different RPC provider, so that our 533 unique senders did not rest on
`mainnet.base.org` alone.

## The second provider is not a second reader

`https://base-rpc.publicnode.com` — our registry's first fallback —
answers `eth_blockNumber` and `eth_call` at `latest`, and refuses every
call at a historical height:

```
{"code":-32602,"message":"Archive requests require a personal token."}
```

That covers `balanceOf` at the pinned block, the transaction count at
the pinned block, and `eth_getLogs` over any past range. A provider
that answers *now* and refuses *then* looks reachable and cannot
reproduce a pinned reading. The run said so rather than publishing:

```
api.bitrefill.com   UNKNOWN
✗ 1 of 1 rail reads failed. That is a reading about our own request
  budget, not about these doors — not publishing it.
```

That gate was added to `paid-doors` this morning, carried over from the
floor check, and this is the first time it fired. The row it refused
would otherwise have read `UNKNOWN` with a tidy sentence beside it.

`bitrefill-only.json` is the frozen input. Anyone with an archive-capable
Base endpoint reproduces the reading with
`BASE_RPC_URL=<endpoint> npm run paid-doors -- --doors <this file>
--from-block 50918945 --at-block 51316142`. Until someone does, the 533
rests on one provider and this file says so.

## A third reader on the disputed row

The directory both keys drew on carries a measured traction row for
this door, read 2026-09-17:

```
measured_networks    eip155:137, eip155:8453, solana:5eykt4Us…
tx_count_all_time    1455
tx_count_30d          556
unique_buyers_30d      92
settled_via          coinbase
first_settlement_at  2026-05-22
```

Its Base `pay_to` is the address we pinned. So three readers on one
door, each counting something declared differently:

| reader | what it counts | figure |
|---|---|---|
| the directory | settlements via facilitators it measures, three rails, a declared floor | 1,455 all-time; 92 buyers in 30 days |
| scvd.store | unique sending addresses of inbound USDC `Transfer` to the payTo, Base, 9-day window, from the node | **533** |
| StillOS | unique senders of inbound in-scope transfers, Base, full index history | **185**, 497 transfers |

Two things follow, and neither closes the row.

**Our 533 is almost certainly true and almost certainly not a count of
x402 payers.** 533 distinct senders in nine days beside the directory's
92 distinct buyers in thirty is not a contradiction of the directory —
its count is a floor over facilitator paths — but it is a loud instance
of the balance residual every row of ours carries: *an address may be a
general-purpose wallet, may serve several doors, and may have received
funds for reasons that have nothing to do with the endpoint advertising
it.* Bitrefill is a merchant with many inflows to one deposit address.
The chain counts all of them; rule 2 counts all of them; the x402 door
is a fraction. That was always the residual. This is the door that
makes it concrete.

**His 185 is still not explained by that.** Under rule 2 his count and
ours are the same definition on the same address and the same rail,
and a nine-day window cannot exceed all of history. Whether his index
covers the address's full history is still the question, and it is
still his to answer.

## What this changes in the paper

§2's bitrefill paragraph now carries the third reader and the sharpened
residual. §8 keeps the item open with the specific blocker: an
archive-capable second endpoint, which the free public ones do not
provide without a token, and we do not put tokens in a research
runtime.
