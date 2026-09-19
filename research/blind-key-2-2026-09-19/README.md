# Blind key, round two — five doors chosen by shape

**Posed 2026-09-19** on issue #622. Base mainnet, USDC, pinned at block
**51520000**. Never a ranking (rule 43); the doors are listed
alphabetically.

`commitment.json` carries the SHA-256 and byte length of our sealed
answers. **The answers themselves are deliberately not in this tree
until the reveal** — a sealed answer sitting in a public repository is
not sealed.

## What is different about this round

**The sealed file is byte-reproducible.** Round one sealed `read_at`
and `chain_head_when_read`, so re-running it reproduced every verdict
but never the digest, and the commitment was checkable only by us.
This one carries no wall-clock field at all: anyone who runs the
command below at the pinned height and rebuilds the file gets the same
bytes. Verified here — two runs, identical digest and length.

```
sha256  7737c1c598a0f053538618540c37a914ac39939ac24af65ad6a3bd4e34fd91b6
bytes   8556
```

**And the five were chosen by SHAPE.** A random five would have tested
nothing either operator has learned this fortnight. Each of these
targets a failure mode one of the two instruments has actually
produced:

| door | rails | the shape it tests |
|---|---|---|
| `blockrun` | 2 | 27,815,763 settlements all-time, two payTo addresses on one rail — the page cap that turned StillOS's 185 into a ceiling published as a count |
| `anyspend` | 1 | 206,058 all-time, **zero in thirty days**, last settled 2026-08-17 — the log horizon that answers an empty array instead of an error |
| `quicknode` | 9 | one EVM address across seven chains and one Solana address under **two chain references, one truncated** — the CAIP-2 trap inside a single door |
| `jsonguard` | 1 | a payout address shared with five other doors, each reporting the same 24 settlements — the attribution residual, made certain |
| `verdoc` | 1 | advertises **only** Base Sepolia; the directory reports zero on two mainnets it never advertised; the address is untouched on Base mainnet |

Rule 4 binds twice over as a result: chosen this way, five doors
cannot establish a rate about anything.

## What this key does not contain, and we looked

**An all-time zero on a rail a door actually advertises.** 45
low-traction Base doors were state-read at the pinned height and not
one advertised payTo was an untouched address. That is a real weakness
in this key as a false-positive control, named rather than hidden —
and a small finding in its own right: among currently listed doors, an
advertised payTo that has never received anything is rare.

`verdoc` is the nearest thing to a control, and it is a trap rather
than a clean zero.

## The trap caught its author

`verdoc` was chosen because a reader that resolves "Base" loosely will
read its Sepolia-advertised address on Base **mainnet**, find it
untouched, and report a clean all-time zero about a rail the door never
offered. That reader was ours, until the morning this key was posed.

Run against the pre-fix CLI, on this door alone:

```
verdoc   ZERO_OBSERVED   rail eip155:8453   scope all_time
```

A confident, well-formed, all-time zero — **and the row relabelled the
door's Sepolia rail as Base**, which is the dangerous part. With the
fix it reads `UNKNOWN` and names `eip155:84532` and the reason.

The same run exposed the other half on `quicknode`: its Polygon and
`eip155:1952` rails were read against Base's USDC contract and came
back **PAID**, because every EVM chain shares one address format, so a
cross-chain read succeeds and looks like a reading. That address holds
241.492 USDC on Base; nothing was learned about Polygon.

Both are the shape StillOS's truncation near-miss established: a
well-formed wrong value, which no format validator can catch. The rule
is now `railCoveredByRun` in `scripts/lib/paid-doors.mjs`, under test,
and a rail is read only by the run that covers it.

## Method

State only — `balanceOf` and the transaction count at the pinned
height, two calls per address. A positive settles `PAID` from the
balance alone. A zero settles only under the nonce argument and then
reaches all of history. No transfer window, so **no payer counts**, and
every row says so. This is deliberately the question StillOS's
zero-nonce-reader answers, so the two columns compare rather than talk
past each other.

Every payTo was copied **by reference** from the directory's
per-service endpoint, never re-typed, with provenance on every row. The
doors' own 402s were not reachable from the environment this was posed
in, so the resolution half of the question is not tested — it is
answered in the inputs, and that is declared rather than quietly
skipped.

## Reproducing

```
npm run paid-doors -- --rail eip155:8453 --state-only \
  --doors research/blind-key-2-2026-09-19/our-five-doors.json \
  --at-block 51520000 --out <dir>
```

Read-only; signs nothing, spends nothing, needs no key. Directory data:
x402-list.com (CC BY 4.0).
