# Forty-three doors on a rail nobody measured

**2026-09-17. Arbitrum One, USDC, at block 506120000.** One dated
observation. Not a ranking (rule 43), not an audit of the directory,
and not a claim that any door was paid *for its product*.

## Whose question

StillOS Notary's, generalised from `daxpt` on issue #622: across the
whole of `x402-list.com`, **43 doors advertise USDC on Arbitrum One and
the directory measures none of it** — its largest single coverage gap.
He reads XRPL and cannot read Arbitrum; this store can. So the paper's
§8 put the 43 against our name, and this is that reading.

## What we read, and what we did not

**State only.** Balance and transaction count at the named height, two
calls per address, no transfer window. A positive settles `PAID` from
the balance alone. A zero settles only under the nonce argument — zero
balance at a transaction count of zero is a zero at every prior height
— and so reaches all of history. Everything else is `UNKNOWN`. No
payer counts were attempted and every `PAID` row says so; a 30-day
transfer window on Arbitrum is roughly a thousand log pages per
address, and forty-three of those is a reading nobody would reproduce.

**Every payTo was copied by reference** from the directory's own
per-service endpoint, `pricing[]` entries where `network` is
`eip155:42161`, never re-typed — the provenance is on every row of
`doors.json`. The directory is the source of the address, so an address
wrong in the directory is wrong here, and that is declared rather than
resolved. StillOS's near-miss this week was an address re-entered from a
truncated display; the discipline here is the half of his fix that a
validator cannot supply.

## What we found

| verdict | doors |
|---|---|
| **PAID** — hold USDC on Arbitrum at the named height | **33** |
| **ZERO_OBSERVED** — nothing has ever arrived, all-time | **8** |
| **UNKNOWN** | 2 |
| read failures | **0** |

Forty-three doors, forty-three Arbitrum addresses, forty-one distinct.
All eight zeroes are all-time on the nonce argument. Two runs at the
same height produced identical rows.

The two `UNKNOWN`s are honest and different from each other. `openzoo`
holds nothing at a transaction count of 154: funds may have arrived and
left, and a state read cannot say. `insurance-doi-bulletin-feed-x402`
holds nothing at a transaction count of zero — which would be an
all-time zero — but advertises the `exact-prepay-proof` scheme, under
which a payment need not reach the advertised payTo at all. The nonce
argument settles what arrived at an address; it cannot settle whether
that door was paid. Under the rail rule that is `UNKNOWN`, not a zero.

## The finding is the directory's eight, and it is `daxpt` again

StillOS listed eight doors that are *quiet* — reporting zero or null
all-time on the rails the directory measures — while advertising a
mainnet rail it does not. Six of the eight advertise Arbitrum and are in
this reading:

| door | directory, on its measured rails | Arbitrum, this reading |
|---|---|---|
| `yiduochan-api-credits` | 0 all-time | **PAID** — 0.21 USDC at nonce 0 |
| `warppay402-mcp-gateway` | 0 all-time | **PAID** — 0.20 USDC at nonce 0 |
| `brian-booms-agent-merch-kit` | 0 all-time | ZERO_OBSERVED, all-time |
| `saylor-innovations-watchdog-token-intelligence` | 0 all-time | ZERO_OBSERVED, all-time |
| `uhadev-pdf-data-inspection-api` | null | ZERO_OBSERVED, all-time |
| `insurance-doi-bulletin-feed-x402` | 0 all-time | UNKNOWN (scheme) |

**Two doors the directory reports as never paid hold USDC on the rail
it does not measure.** That is the `daxpt` shape — a true zero on the
measured rail, money on the unmeasured one — reproduced twice more, on
a rail the operator who found the shape cannot read. The other three
are zeroes on both, which is the directory's floor and the chain
agreeing in the strongest form either can offer. None of this is an
error in the directory: its rows name `measured_networks`, and a
reader who keeps that qualifier is never misled.

## What a balance is not, and it matters more here than on Base

Twenty-eight of the thirty-three `PAID` balances are under one dollar.
The two middle values are 0.01 and 0.01 USDC; the smallest is 0.001;
the largest is 3,000. A balance is arrival at an address, never demand
for a product, and on this rail most of the arrivals are dust — test
payments, a first buyer, an operator checking their own door. Nothing
here is revenue and nothing here should be quoted as such.

Two further cautions. **Thirty-eight of the forty-three advertise the
same address on Arbitrum as on Base.** The balances are Arbitrum USDC
and so are arrivals on Arbitrum, but an address serving two rails and
possibly several doors is exactly the case the balance residual
describes. And **this store's own door is in the set** — it advertises
Arbitrum, the directory does not measure it, and it reads `PAID`. It is
in the rows in the directory's order like every other door, and it is
named here so nobody has to find it.

## What this reading changed in the instrument

`npm run paid-doors` gained `--state-only`: balance and nonce at a
pinned height, no window, no `--from-block`. Failed reads are recorded
on the row and the run refuses to publish above one failure in twenty,
carried over from the floor check.

And one row's reason was wrong. `insurance-doi` came back `UNKNOWN`
with the sentence *"a zero balance with a non-zero transaction
count"* beside `nonce: 0`. The verdict was right; the sentence named a
cause that did not exist, because the fallback branch assumed the only
way to reach it was a moved nonce. A caveat that misnames its cause is
worse than none. Fixed, under test, and the published run carries the
corrected sentence — the numbers did not move.

## Reproducing

```
npm run paid-doors -- --rail eip155:42161 --state-only \
  --doors research/arbitrum-43-2026-09-17/doors.json \
  --at-block 506120000 --out <dir>
```

Read-only; signs nothing, spends nothing, needs no key. `doors.json` is
the frozen input, with provenance per address. Directory data:
x402-list.com (CC BY 4.0). Rule 4 holds: forty-three doors can show a
gap; they cannot establish a rate.
