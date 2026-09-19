# What a directory advertises, and what it measures

**2026-09-16.** An independent reproduction. Not a ranking, not a
finding that any door is unpaid, and not an error in the directory.

## Whose question this is

StillOS Notary's. On 2026-09-16 we read his five doors and returned
`UNKNOWN` on `daxpt` — a door whose Base rail is provably empty and
whose XRPL rail is not. He took that shape and ran it across the whole
directory rather than leaving it as one anecdote. This is the second
operator reproducing his result with its own code, which is the only
thing a second operator is for.

## What we get, beside what he got

| | his | ours |
|---|---|---|
| doors with a gap, naive string compare | 266 | **266** |
| doors with a gap, CAIP-2 normalised | 58 | **57** |
| doors advertising Arbitrum One unmeasured | 43 | **43** |
| quiet on an unmeasured **mainnet** rail | 8 | **8** — the same eight slugs |

Population: 737 services across 30 pages today; his walk saw 738. The
one-door difference in the normalised count is consistent with that and
we have not tried to make it disappear.

The eight, matching his list exactly: `insurance-doi-bulletin-feed-x402`,
`warppay402-mcp-gateway`, `saylor-innovations-watchdog-token-intelligence`,
`yiduochan-api-credits`, `brian-booms-agent-merch-kit`,
`uhadev-pdf-data-inspection-api`, and both `utilia` services.

## The CAIP-2 trap is the instrument

Comparing chain ids as strings gives **266** doors with a gap. Normalising
first gives **57**. The difference is one producer truncating a Solana
chain reference and another not — his first pass found it and said so,
and reporting 266 would have been a scare rather than a finding.

Both numbers are printed in the artifact rather than the smaller one
alone, because a correction you cannot see is a correction the reader
has to take on trust.

## The largest gap, and who can read it

`eip155:42161` — **43 doors advertise Arbitrum One and the directory
measures none of it.** Next is Avalanche at 10. Then `eip155:84532`
with 9, which is **Base Sepolia, a testnet**: those are counted apart
here rather than summed into a scarier single figure, because no real
money was ever going to move on them.

## What this cost us to answer, and it was our own fault

He wrote "you read Arbitrum; I read XRPL." That is true of this store —
`src/lib/base-rpc.ts` has carried seven EVM chains with their USDC
contracts and RPC fallbacks for months, and the store reads a named one
on demand for settlement attestations and wallet statements.

**Corrected 2026-09-19:** this sentence first read "the store reads all
of them", which overstated it. The registry SUPPORTS seven; the bank
walk and inflow census run over `WALKED_EVM_CHAINS`, which is two; and
a chain a reader cannot reach returns `window_unreadable` rather than a
partial statement. Support is not a reading, and the research
instrument in this directory has read two chains — Base and Arbitrum.

It was **not** true of the chain reader built on 2026-09-15, which
hardcoded Base's USDC address and read one rail, sitting beside that
registry without ever reaching for it. Two chain readers in one
repository, the older one better, is how a shop ends up unable to
answer a question it already had the parts for.

Fixed: `scripts/lib/evm-chains.mjs` mirrors the registry for the `.mjs`
research scripts, `npm run chains:test` parses the TypeScript and fails
when the two drift, and `npm run paid-doors -- --rail <caip2>` now reads
any of the seven. Proved on Arbitrum end to end before this was written,
not asserted: three of the gap doors read at a real height, one
returning an all-time zero and two window-scoped because those addresses
have moved funds. Arbitrum's public RPC allows a 10,000-block
`eth_getLogs` span against Base's 2,000.

Those three readings are **not verdicts about those doors** — a
100,000-block window is a few hours. They exist to show the rail reads.

## And a trap worth more than the finding

Node's `fetch` ignores `HTTPS_PROXY`. In a sandbox that reaches the
network through a proxy, `curl` reaches a host and the identical URL
from a script returns 403 with a body saying the host is not
allowlisted. The obvious reading — "the host is blocked" — is wrong,
and it was about to be published: we nearly told a counterparty that
Arbitrum was unreachable when it was merely unrouted.

`scripts/lib/proxy-fetch.mjs` installs an undici `ProxyAgent` when a
proxy is configured and is a no-op otherwise. Any instrument that
reports reachability without it is measuring its own plumbing.

## Reproducing

```
npm run rail-coverage -- --out <dir>
```

Read-only. Walks every page and refuses to write a report if the
population moves under the walk. Directory data: x402-list.com
(CC BY 4.0).
