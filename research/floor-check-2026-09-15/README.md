# A published floor, set against the chain

**2026-09-15. Base mainnet, USDC, at block 51316142.** One dated
observation. Not a ranking, not an audit of anybody, and not a claim
that any door was paid.

## The question

`x402-list.com` measures settlements and publishes, per service, a
`traction` block: `tx_count_all_time`, `unique_buyers_30d`,
`first_settlement_at`. Beside those numbers it prints its own caveat,
quoted here verbatim because the whole reading turns on it:

> Conservative undercount: only USDC settlements via facilitators we
> measure are counted. A measured floor, not an estimate.

127 of its Base services carry a measured count of **zero**. We have a
chain reader now. So: what does the chain say at those doors' own
advertised payTo addresses?

## What we found

132 advertised EVM addresses across those 127 doors.

| | addresses |
|---|---|
| **BEYOND_FLOOR** — hold USDC at the named height | **64** (63 doors) |
| **AGREES** — nothing has ever arrived | **56** (53 doors) |
| **NOT_ESTABLISHED** — zero balance, non-zero nonce | 12 |
| **EXCEEDS_CLAIM** — a disagreement with what was claimed | **0** |
| read failures | 0 |

All 56 agreements are *all-time* zeroes, not windowed ones. They rest
on the nonce argument: USDC leaves an address only by a transaction
from it, which moves the nonce, so a zero balance at nonce zero is a
zero at every block in that address's history. Where the directory
says nothing ever arrived at those 56, the chain says so too, without
an index and without a window. That argument is StillOS Notary's.

## Why none of this makes the directory wrong

**EXCEEDS_CLAIM is zero and that is not a formality.** The directory
declares its counts floors. Against a floor, finding settlement it did
not count is the claim working exactly as stated. The identical
readings against a count that made no such declaration would all be
disagreements — the verdict turns on what was claimed, not on what was
found, and `scripts/lib/floor-check.mjs` decides it in code rather
than in prose so nobody has to take our word for the distinction.

Scoring a publisher against a claim they explicitly did not make is
the move we filed a correction against ourselves for on 2026-09-15, in
a different coat. We are not making it again ten hours later.

What the number *is* useful for: the distance between a stated floor
and what a second reader can see. 64 of 132. That is a fact about
facilitator coverage, it belongs to both sides, and a buyer reading
"never paid" in any directory should read it as a statement about that
directory's measured paths.

## What a balance is not

A USDC balance at an advertised payTo proves USDC **arrived at that
address**. It does not prove anyone paid that door. The address may be
a general-purpose wallet, may serve several doors, and may have
received funds for reasons unrelated to the endpoint advertising it.
The balances here make that caution concrete rather than decorative:
the median is 1.717 USDC, the largest is 193.74, and **22 of the 64
hold less than one dollar**. Those are not revenue figures and nothing
here should be quoted as one.

The 12 NOT_ESTABLISHED rows are the honest shape of the same limit: a
zero balance with a non-zero nonce means funds may have arrived and
left, and this reading does not look at the window that would say.

## The method, and why it was affordable

Two requests per address — `balanceOf` and the transaction count, both
at the named height. Indexing a transfer window instead would cost
~199 requests per address at the public RPC's 2,000-block ceiling, so
the whole population is readable here for roughly the price of a
five-door sample. The nonce argument is what makes the cheap path
settle a zero as well as a positive.

Every page of the directory was walked: 30 pages, 25 rows each,
`meta.total` 738, and the run refuses to proceed if the walk does not
add up. Taking page one and dividing would give a denominator that is
a page rather than a population — the failure that started this whole
line of work, sitting in the list itself.

## What went wrong first, and what it cost

**The first run of this instrument reported 107 of 132 addresses as
NOT_ESTABLISHED.** Every one of them answers correctly on a second
ask. The public RPC was rate limiting, the retry threw on any 4xx
without distinguishing a 429 from a refusal, and the caller turned the
throw into `null` — which `readDoorRail` correctly read as "no balance
was read", and which then rendered as a tidy per-door verdict.

That is failing closed, and silent. It is the same disease StillOS
described from a chain instrument of his own that read zero revenue at
27 of 27 doors on a mistyped field name. An instrument that cannot
tell *this address holds nothing* from *we were not allowed to ask*
gets believed either way.

Fixed in three places rather than one, because the shape matters more
than the instance: a 429 is now retried with its `Retry-After` while
other 4xx still are not, a row resting on a failed request carries
`read_failed` and the error text in the row itself, and the run
**refuses to write a report at all** if more than one address in
twenty failed to read. The published run has zero.

## Run twice

The published run and a second run at the same pinned height produced
**132 identical rows** — same verdict and same balance at every
address, zero differences. That is what a reading at a named block
should do, and after the rate-limit failure above it is worth showing
rather than asserting.

## Reproducing it

```
npm run floor-check -- --at-block 51316142 --out <dir>
```

Read-only. Signs nothing, spends nothing, needs no key. The rules are
in `scripts/lib/floor-check.mjs` with `npm run floor-check:test`; the
chain reading is `scripts/lib/paid-doors.mjs`, built from StillOS's
definition on 2026-09-15.

Directory data: x402-list.com (CC BY 4.0).
