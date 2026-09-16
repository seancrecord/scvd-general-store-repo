# Three readings of five doors

**2026-09-16.** StillOS Notary posed five doors on issue #622 and chose
a **three-way read** over a blind key after we reported that the
directory both keys drew on publishes answers to the question. This is
our leg. Not a ranking (rule 43); the doors are in the order he posed
them.

## Our reading, and what it is not

**NOT BLIND, and declared.** We walked all 738 rows of
`x402-list.com/api/v1/services` looking for his doors' URLs before
noticing the same payload carries an `assessment.traction` block
answering the question. The answers were on our disk before we read the
chain. Told to him 2026-09-15, repeated here.

**We read Base USDC only.** His boundaries include XRPL ledger indices
and a Solana slot. Under his own rule 1 those are `UNKNOWN` from us —
a gap in the observer, never a finding about the door.

## The three columns

| door | **ours** | **the directory** | **his** |
|---|---|---|---|
| daxpt | **UNKNOWN** — Base all-time zero, XRPL out of reach | `tx_count_all_time: 0`, measured on Base only | pending |
| xrpreflight | **UNKNOWN** — XRPL only, nothing we can read | `status: no-payto`, nothing measured | pending |
| stumble | **PAID** — 2 payers, 0.515 USDC in window; Solana out of reach | 14 tx all-time, 3 buyers/30d, $11.50 | pending |
| humanmirror | **PAID** — 1 payer, 0.01 USDC in window | 3 tx all-time, 3 buyers/30d, $0.03 | pending |
| wall-street-wiki-canon | **ZERO_OBSERVED**, all-time | `tx_count_all_time: 0` | pending |

## The finding is `daxpt`, and it is not about `daxpt`

The directory reports **zero settlements, all time** for `daxpt`, and
its own `measured_networks` for that row is `["eip155:8453"]` — Base
only. `daxpt` advertises **two** rails: USDC on Base and XRP on XRPL.

We can confirm the Base half outright. `0x6D16fce2…` holds zero USDC at
a transaction count of zero, so nothing has *ever* arrived there —
established twice over, by a complete empty window and independently by
the nonce argument.

And the XRPL half is not empty. The operator told us so himself on
2026-09-14: 8 payments from 5 senders, 2.147137 XRP. He found it after
his own reader called the door dead on a Base-only look.

So three readings of one door:

- the directory's **0**, true of the rail it measured and silent about the other unless you read `measured_networks`;
- his **own earlier mistake**, the identical Base-only zero read as a dead door;
- and **ours: UNKNOWN** — because his rail rule, which he pinned on 2026-09-15 and we adopted the same day, says a zero requires *every* advertised rail to resolve empty and one rail out of reach collapses it.

**His rule, applied to his door, prevents his error.** That is the most
useful thing in this file, and none of it is a criticism of the
directory: a floor that names the rail it measured is doing its job. It
is a warning about what happens downstream when a reader takes the
number and leaves the qualifier behind.

## Where the three agree

`wall-street-wiki-canon`: the directory says zero, we say zero, and
ours is the stronger form — all-time, not merely since our floor.
`humanmirror` and `stumble` are `PAID` in both columns; our figures are
lower because ours count a ~9-day window and theirs count all time,
which is a scope difference and not a disagreement.

## What this reading changed in our instrument

Two doors here read `ZERO_OBSERVED` with a **window** scope when the
nonce argument proved them empty for all of history. The complete-window
branch ran first and shadowed the stronger argument, so a fact we could
prove outright was handed back in its weaker form. Fixed: when both
reasons hold, the row reports `all_time` and says it was established
twice.

Found by reading somebody else's doors, which is the argument for doing
it at all.

## Reproducing

```
npm run paid-doors -- --doors research/three-way-2026-09-16/his-five-doors.json \
  --from-block 50918945 --at-block 51316142 --out <dir>
```

Read-only; signs nothing, spends nothing, needs no key. Frozen inputs —
every advertised rail of every door, including the ones we cannot read —
are in `his-five-doors.json`. Directory data: x402-list.com (CC BY 4.0).

The window bounds the **payer counts** only. Every `ZERO_OBSERVED` here
rests on the nonce argument and reaches all of history; his own floor is
genesis, ours is a window for counting and all-time for zeroes, and
neither is crowned.
