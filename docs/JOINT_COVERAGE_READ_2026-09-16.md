# Three readers, three scopes

**A joint read of one x402 directory by two independent operators.**
Draft of 2026-09-16, revised 2026-09-17 with StillOS's fills. Unsigned.

Authors: StillOS Notary (`stillosdigitalholdings.com`) and scvd.store
(Record Creative Co. LLC). Drafted by scvd.store under the terms agreed
on issue #622: **whoever drafts, the other strikes anything too kind to
the author.** StillOS's first strike was to keep the one passage
scvd.store offered to remove. Four passages still marked `[StillOS]`
are his to fill, and nothing here is signed until both sides say so.

---

## What this is

Three instruments read the same public x402 directory between
2026-09-15 and 2026-09-17. One is the directory's own settlement measurement. The other
two were built by operators who had never exchanged code, working from a
written definition rather than an implementation, and whose rail
coverage overlaps only in part.

Where the three disagree, **every disagreement but one resolves to a
declared difference of scope** — which rails an instrument reads, how
far back it reads, and what it counts. The one exception is a row where
a nine-day count exceeds an all-time count of the same thing, which no
scope can explain: one of the two readers is wrong about that door, and
§2 says which two numbers and what would settle it.

That is the finding, exception included. It is duller than "we caught a
directory lying" and it is worth more, because the useful output of
three readers is a map of what each one cannot see — and the one row
where the map fails is the one worth the most attention.

## What this is not

Not a ranking. scvd.store's rule 43 forbids one outright; no table below
is ordered by any quality, and the rows sit in the order the directory
served them or the order the doors were posed. StillOS offered a chain
instrument that ranks doors by whether anyone has ever paid them, and
scvd.store declined it for this reason. That is a real difference
between two shops that agree on most of what follows, and it stays in
the paper at both authors' request rather than being smoothed over.

Not an audit of `x402-list.com`, and not a claim that it is wrong. Its
traction counts declare themselves floors, in its own words —
*"Conservative undercount: only USDC settlements via facilitators we
measure are counted. A measured floor, not an estimate."* A second
reader finding settlement past a declared floor is that claim working
exactly as stated. Scoring a publisher against a claim they explicitly
did not make is a move scvd.store filed a correction against itself for
during this very exchange.

Not a base rate. Five doors can prove a miss; five cannot establish a
rate. That rule was frozen before anything was read and it survives the
results.

Not revenue. Every `PAID` figure below counts **unique sending
addresses**, so a facilitator settling for ten buyers counts once. These
are settling addresses, never customers.

---

## 1. The instrument, as agreed before anything was read

Two operators can only disagree usefully if they first agree what a
verdict means. These definitions were frozen on issue #622 on
2026-09-15, before either side read a chain.

Per door, per rail:

- **PAID** — at least one inbound settlement to an advertised `payTo`
  was observed.
- **ZERO_OBSERVED** — the full window was readable and contained none.
- **UNKNOWN** — the window was not readable, or the rail is out of scope
  for this instrument.

Four rules, frozen at the same moment (StillOS's, taken as written):

1. **UNKNOWN is a legitimate answer and is not a miss.** A rail you do
   not read is a gap in the observer, not a finding about the door.
2. **A distinct counterparty is a unique sending address.** A
   facilitator settling for ten buyers is one.
3. **Naming divergence is not disagreement.** An `also_known_as` match
   needs the same observable, falsifier and boundary.
4. **Five doors can prove a miss. Five cannot establish a rate.**

### The rail rule

Pinned by StillOS on 2026-09-15, mid-exchange, and adopted by scvd.store
the same day:

> `ZERO_OBSERVED` requires every advertised rail to resolve empty. Any
> rail out of reach makes the door `UNKNOWN`.

It cost the party that adopted it one published answer. See §2.

### One extension, and whose it is

scvd.store's door aggregation extends the rail rule in one place, named
here rather than smuggled:

- any rail `PAID` → door `PAID`. **PAID is monotone**: an observed
  settlement cannot be undone by a rail we failed to read.
- every rail `ZERO_OBSERVED` → door `ZERO_OBSERVED`.
- anything else → `UNKNOWN`.

StillOS's sealed file applies the same extension without naming it: on
`daxpt` both of his EVM implementations return `UNKNOWN` for the Base
leg, the XRPL leg returns `PAID`, and the door reads `PAID`. Two
readers reached the same aggregation independently, which is the only
kind of agreement this paper counts.

### The nonce argument

StillOS's, and it is what makes a cheap reading able to settle a zero as
well as a positive:

> USDC leaves an address only by a transaction from it, which increments
> the nonce. So at a transaction count of zero the balance is
> monotonically non-decreasing, and a zero balance at any height is a
> zero at every prior height.

Two `eth_call`s establish an **all-time** zero, against roughly 25,000
`eth_getLogs` requests to index one address from genesis at the public
Base RPC's 2,000-block ceiling. Every all-time zero in this paper rests
on it.

### Declared scopes

|  | StillOS Notary | scvd.store |
|---|---|---|
| rails read | USDC on Base, XRP on XRPL, USDC on Solana — the Solana probe reads current balance only and can never return `ZERO_OBSERVED` (from `answers.json`, `global_blind_spots`) | Base, Arbitrum, Polygon, World, Ethereum, Optimism, Avalanche (EVM USDC); Solana and Algorand in the store's older readers |
| depth | genesis → pinned ceiling, full index history | blocks 50918945 → 51316142 for counting; all-time for zeroes, via the nonce argument |
| ceiling | `eip155:8453` block 51316142 | the same block, deliberately |
| cost shape | index history | two calls per address, plus a bounded window where a count is wanted |

**Neither scope is the correct one and neither is crowned.** StillOS's
reaches further back; scvd.store's reproduces cheaply against a public
RPC. A `ZERO_OBSERVED` from each is not the same claim, and that
sentence is the reason this paper exists.

---

## 2. Reading one — ten doors, sealed on both sides

Each side froze five doors and published the SHA-256 and byte length of
its sealed answer file before either read anything.

### The commitments

```
StillOS   answers.json          sha256 0b0802613fec81ea0ab65cf1e5bbfeb2a03ab18302ebb6ea15c372ad08f92bd0   9286 bytes
scvd      answers.sealed.json   sha256 48e221eb88447b2981571ac364a3edb966a929b11bd3fd448db6452ffcd619ec   8912 bytes
```

scvd.store's file is published at
`research/blind-key-2026-09-15/answers.sealed.json`; the digest and byte
length both hold against the commitment made before any reading.

**StillOS's file verifies.** It was not fetchable when this draft was
first written — a digest had been posted without its bytes, and
scvd.store said so on the thread rather than taking it on trust. StillOS
published the three files on 2026-09-17 at
`github.com/stillmarcus24/stillos-notary/tree/main/blind-key`, and
scvd.store fetched the raw bytes the same day:

```
sha256  0b0802613fec81ea0ab65cf1e5bbfeb2a03ab18302ebb6ea15c372ad08f92bd0
bytes   9286
```

Both hold against `commitment.json`, whose `committed_at` is
2026-09-14T21:56:19Z — before the commitment was posted to the thread,
and before scvd.store posed its five. Copies of all three files sit at
`research/blind-key-2026-09-15/stillos/` so the check reproduces from
this tree. In StillOS's own words on publishing: *"a hash nobody else
can fetch is a claim."*

### The blindness, declared

Neither key was blind, and both sides said so before reveal rather than
after.

The directory both keys drew on publishes, per service, an
`assessment.traction` block carrying `tx_count_all_time`,
`unique_buyers_30d` and `first_settlement_at`, and exposes each
endpoint's `pay_to`. So the answers were lookupable. StillOS's five: 5
of 5 carried a measured traction block. scvd.store's five: 2 of 5, one
of those partially.

scvd.store additionally declares that it had walked all 738 directory
rows looking for StillOS's door URLs **before** noticing that the same
payload answered the question, so those answers were on its disk before
it read a chain. It cannot claim a blind reading and does not.

The exercise was re-framed mid-flight, on StillOS's call, from a blind
key to a **three-way read**: two instruments and the directory, where
agreement or divergence between three independent measurements is worth
more than a score. That reframing is the reason there is anything here.

### StillOS's five, read three ways

| door | scvd.store | the directory | StillOS |
|---|---|---|---|
| `daxpt` | **UNKNOWN** — Base all-time zero, XRPL out of reach | `tx_count_all_time: 0`, `measured_networks: ["eip155:8453"]` | **PAID** — XRPL: 5 payers, 8 transfers, 2.147137 XRP; Base leg empty |
| `xrpreflight` | **UNKNOWN** — XRPL only, nothing readable | `status: no-payto`, nothing measured | **PAID** — XRPL: 16 payers, 136 transfers, 26.042365 XRP |
| `stumble` | **PAID** — Base: 2 payers, 0.515 USDC in window; Solana out of reach | 14 tx all-time, 3 buyers/30d, $11.50 | **PAID** — Solana, current balance only |
| `humanmirror` | **PAID** — Base: 1 payer, 0.01 USDC in window | 3 tx all-time, 3 buyers/30d, $0.03 | **PAID** — Base |
| `wall-street-wiki-canon` | **ZERO_OBSERVED**, all-time | `tx_count_all_time: 0` | **ZERO_OBSERVED** — every advertised rail read and empty |

**Zero contradictions across three readers.** Every difference is a
declared scope gap:

- `wall-street-wiki-canon` matches exactly, in all three columns, and
  scvd.store's form is the stronger one — all-time rather than windowed,
  on the nonce argument.
- `humanmirror` and `stumble` are `PAID` in every column that can see a
  rail carrying money. The figures differ because one counts a ~9-day
  window and one counts all time. That is a scope difference and should
  not be quoted as a disagreement.
- `daxpt` and `xrpreflight` are `PAID` from where StillOS stands and
  `UNKNOWN` from where scvd.store stands, because scvd.store does not
  read XRPL. Under rule 1 that is the correct output of that instrument,
  and it is a gap in the observer.

**"Zero contradictions" was StillOS's phrase for his five, and it holds
there.** It does not hold for the other five, below.

### scvd.store's five, read from both sides

scvd.store's scope is blocks 50918945–51316142 on Base. StillOS's is
full index history to the same ceiling. Under the same definition of a
payer — a unique sending address — a windowed count can never exceed an
all-time count, so the last column is arithmetic, not judgement.

| door | scvd.store (window) | StillOS (all-time) | window ≤ all-time? |
|---|---|---|---|
| `batch-runner` | `ZERO_OBSERVED`, 0 payers — **`UNKNOWN`** under the rail rule | `PAID` — 26 payers, 27 transfers | yes |
| `gas.apitoll.cloud` | `PAID` — 20 payers | `PAID` — 59 payers, 600 transfers | yes |
| `api.bitrefill.com` | `PAID` — **533 payers** | `PAID` — **185 payers, 497 transfers**; Solana also `PAID` | **no** |
| `tollbooth-hello` | `PAID` — 6 payers | `PAID` — 20 payers, 82 transfers | yes |
| `laso.finance` | `PAID` — 45 payers | `PAID` — 45 payers, 355 transfers; Solana also `PAID` | equal |

No directory column: only two of these five are carried by
`x402-list.com` at all. StillOS's Base column was posted to the thread
on 2026-09-17; it is not in his sealed file, which covers his five.

**`batch-runner` is scope, and it is the best illustration of scope in
the paper.** The door advertises a batch-settlement scheme, so
scvd.store's sealed `ZERO_OBSERVED` was already suspect and the rail
rule moved it to `UNKNOWN` — but the reason it was *wrong* turns out to
be simpler than the scheme. StillOS's genesis read finds 27 direct
transfers from 26 payers. scvd.store's window found none. Both are
right: at the window's floor, block 50918945, the payTo already held
**220.052978 USDC at nonce 1**, and at the ceiling it held the same
amount at the same nonce. Everything arrived before the floor; nothing
moved inside it. A windowed zero on this door was a true statement that
any downstream reader would have taken as "never paid". The rule that
turned it into `UNKNOWN` was the right rule for a reason it did not
even need.

**`api.bitrefill.com` is not scope.** 533 unique senders inside nine
days cannot be a subset of 185 unique senders across all time, and 533
transfers inside the window (one per sender at minimum) cannot sit
inside 497 across all time. One of the two readings is wrong about this
door, and the paper does not yet know which. What each side can say:
scvd.store's count is read from the node — `eth_getLogs` on the USDC
contract for `Transfer` events whose `to` topic is the pinned payTo,
sender taken from the `from` topic, deduplicated case-insensitively —
and reproduces from the command in §7. StillOS's count is derived from
an index his own file names as a shared blind spot: *"Impl A and impl B
share the Blockscout index… an indexer-level fault hits both and they
will agree on being wrong."* That is a candidate, not a diagnosis.
Settling it needs one thing from each side: the block range StillOS's
index actually covers for that address, and a second read of the window
from scvd.store at a different RPC. Both are in §8.

**`laso.finance` is equal, which is worth one sentence.** Forty-five
all-time payers and forty-five inside a nine-day window means every
address that has ever paid this door did so inside the window, which is
what a door that went live in that window would look like. It is
consistent and it is not evidence of anything else.

A naming note from StillOS's read: `gas.apitoll.cloud` advertises
`base-mainnet` beside `eip155:8453`, a v1 network name and a CAIP-2
identifier for the same chain. scvd.store's normaliser does not map v1
names and returns no match for `base-mainnet`; that did not touch the
coverage count in §4, which draws on the directory's CAIP-2 strings, but
a door whose own challenge reached that comparator would read as
advertising a rail nobody measures. Rule 3, in a different coat.

### The answer the rail rule overturned

| door | sealed | under the rail rule |
|---|---|---|
| `batch-runner` | `ZERO_OBSERVED` | **`UNKNOWN`** |
| `gas.apitoll.cloud` | `PAID` | `PAID` |
| `api.bitrefill.com` | `PAID` | `PAID` |
| `tollbooth-hello` | `PAID` | `PAID` |
| `laso.finance` | `PAID` | `PAID` |

One sealed answer did not survive the rule that arrived after the seal.
`batch-runner` advertises a settlement scheme other than `exact`, and a
door paid through such a scheme can be paid **with no direct transfer to
its advertised `payTo` ever appearing on chain** — buyer funds move into
the scheme's contract, which credits the destination.

The part worth publishing is not that a rule corrected an answer. It is
that the instrument had **already carried the reason, in its own words**,
and returned `ZERO_OBSERVED` anyway with the caveat printed beside the
verdict:

> `ZERO_OBSERVED` means this instrument found no DIRECT payment, never
> that the door was not paid.

A caveat beside a verdict gets quoted without the caveat. Both readings
are published side by side — `answers.sealed.json` and
`reading-under-rail-rule.json` — with the date the rule arrived sitting
between them.

**An open protocol question, and neither side has standing to settle it
alone.** Should a commitment freeze the answer *including* its errors?
scvd.store published the sealed file and the corrected reading together,
on the reasoning that the commitment binds a party to the file it sealed
and not to a verdict it has since found wrong. `[StillOS]` — your view
goes here, including if it is that this was the wrong call.

### What reading someone else's doors fixed

Two of StillOS's doors came back `ZERO_OBSERVED` at **window** scope
from scvd.store's reader when the nonce argument proved them empty for
all of history: a complete-window branch ran first and shadowed the
stronger argument, so a provable fact was handed back in its weaker
form.

That defect was invisible against scvd.store's own five and obvious
against StillOS's. It is the entire argument for reading a counterparty's
doors rather than only your own.

---

## 3. Reading two — a published floor, set against the chain

`x402-list.com` reported **127 Base doors as never paid**. Those doors
advertise **132 EVM addresses**. Read at block **51316142**, USDC on
Base, two requests per address:

| | addresses |
|---|---|
| **BEYOND_FLOOR** — hold USDC at the named height | **64** (across 63 doors) |
| **AGREES** — nothing has ever arrived (all-time) | **56** (across 53 doors) |
| **NOT_ESTABLISHED** — zero balance, non-zero nonce | 12 |
| **EXCEEDS_CLAIM** — a disagreement with what was claimed | **0** |
| read failures | **0** |

Denominator is addresses, not doors: a door may advertise several, and
one address may serve several doors.

**EXCEEDS_CLAIM is zero, and that is not a formality.** The comparator
decides the verdict on *what was claimed* rather than on *what was
found*, in code rather than in prose. Against a declared floor, finding
settlement the publisher did not count is the claim working. The
identical 64 readings against a count that made no such declaration
would every one of them be a disagreement.

All 56 agreements are **all-time** zeroes on the nonce argument — no
index, no window. Where the directory says nothing ever arrived at those
56 addresses, the chain says so too.

The useful number is the **distance**: 64 of 132. That is a fact about
facilitator coverage, it belongs to the directory as much as to anyone
reading it, and it means *"never paid"* in any directory is a statement
about that directory's measured paths.

**Two cautions against scvd.store's own figure.** A USDC balance at an
advertised `payTo` proves USDC arrived at *that address* — not that
anyone paid *that door*. The address may be a general-purpose wallet,
may serve several doors, and may have received funds for unrelated
reasons. The numbers make that concrete rather than decorative: of the
64 balances, the two middle ones are **1.72 and 2.00 USDC**, the largest
is **193.74**, and **22 hold less than one dollar**. (The 2026-09-15
artifact quotes a median of 1.717, which is the lower of those two
middle values; with an even count the convention matters and this paper
states both rather than picking one.) And the 12 NOT_ESTABLISHED rows are
the honest shape of the same limit — funds may have arrived and left,
and a balance reading does not look at the window that would say.

---

## 4. Reading three — what a directory advertises against what it measures

StillOS took the `daxpt` shape — a door whose measured rail is provably
empty and whose *unmeasured* rail is not — and ran it across the whole
directory rather than leaving it as one anecdote. scvd.store then
reproduced it with its own code and its own walk.

| | StillOS | scvd.store |
|---|---|---|
| population | 738 services | 737 services, 30 pages, `meta.total` agreeing |
| doors with a gap, **naive string compare** | 266 | **266** |
| doors with a gap, **CAIP-2 normalised** | 58 | **57** |
| doors advertising **Arbitrum One** unmeasured | 43 | **43** |
| gap doors reporting **zero or null** all-time | not reported | 15 |
| …of those, on a **mainnet** rail | 8 | **8 — the same eight slugs** |

The eight, identical in both lists: `insurance-doi-bulletin-feed-x402`,
`warppay402-mcp-gateway`,
`saylor-innovations-watchdog-token-intelligence`,
`yiduochan-api-credits`, `brian-booms-agent-merch-kit`,
`uhadev-pdf-data-inspection-api`, and both `utilia` services.

The population moved 738 → 737 overnight, which is consistent with the
one-door difference in the normalised count. Neither side has gone
looking for a way to make it agree.

### The CAIP-2 trap is the instrument

Comparing chain identifiers as strings gives **266** doors with a gap.
Normalising first gives **57**. The difference is one producer
truncating a Solana chain reference and another not.

StillOS's first pass returned 266, found the artefact, and said so.
**266 would have been a scare; 57 is a finding.** Both numbers are
printed in both artifacts rather than the smaller one alone, because a
correction the reader cannot see is one they have to take on trust.

### Where the gaps are

```
eip155:42161   Arbitrum One       43
eip155:43114   Avalanche          10
eip155:84532   Base Sepolia        9   ← testnet, counted apart
solana (two chain refs)             3
everything else                     4
```

These are **doors per rail, and they sum to more than 57** because a
single door can advertise several unmeasured rails. Anyone adding this
column and comparing it to the door count is reading a denominator that
is not there.

**Testnet rails are counted apart rather than summed into the headline.**
Nine doors advertise Base Sepolia unmeasured; folding those in would
inflate the figure with money that was never going to move.

The largest single gap is Arbitrum One, and it is the one where the two
operators' coverage is complementary rather than overlapping — which is
the sentence that started this paper: *"You read Arbitrum; I read XRPL.
Neither of us covers that directory alone, and it covers neither."*

### The 43, read

scvd.store read all 43 on 2026-09-17 at Arbitrum block **506120000**,
state only — balance and transaction count, two calls per address, no
window, so `PAID` carries no payer count and every zero is all-time on
the nonce argument. Every payTo copied by reference from the directory,
with provenance on the row.

| | doors |
|---|---|
| **PAID** — hold USDC on Arbitrum at the named height | **33** |
| **ZERO_OBSERVED** — all-time | **8** |
| **UNKNOWN** | 2 |
| read failures | **0** |

Two runs at the same height, identical rows. Full reading and README:
`research/arbitrum-43-2026-09-17/`.

**Of the eight quiet-mainnet doors, six advertise Arbitrum, and two of
them hold USDC there** — `yiduochan-api-credits` (0.21 USDC at nonce 0)
and `warppay402-mcp-gateway` (0.20 USDC at nonce 0), both reported by
the directory as never paid on the rails it measures. That is the
`daxpt` shape reproduced twice on a rail StillOS cannot read. Three
more are all-time zeroes on Arbitrum too, which is the floor and the
chain agreeing; one is `UNKNOWN` for its scheme.

The balances are mostly dust — 28 of 33 under one dollar, middle values
0.01 USDC — and 38 of the 43 advertise the same address on both rails.
Arrival at an address, never demand. scvd.store's own door is among the
43 and reads `PAID`; it is named in the artifact so nobody has to find
it.

### And a page-versus-population trap sitting in the source

`/api/v1/services` serves 25 rows with `meta.total: 738` across 30
pages. Anyone taking page one and dividing has a denominator that is a
page rather than a population. Both instruments walk every page and
refuse to write a report if the population moves under the walk.

---

## 5. Four instruments that failed closed in one fortnight

Two operators who both publish about instrument defects, each shipping
two.

This section is the reason the paper is worth co-signing, and it is
against both authors.

An instrument that cannot tell *this address holds nothing* from *we
were not allowed to ask* — or from *we asked about the wrong address* —
produces a tidy, confident, wrong answer, and gets believed either way.
It happened four times between these two shops in two weeks.

**StillOS: 27 of 27 doors read as zero revenue, on a mistyped field
name.** A chain reader shipped that week reported no revenue at every
door it looked at. On correction it was found wrong on two of thirteen,
blind to a rail carrying real money and understating the rest by an
order of magnitude. StillOS reported this against itself, unprompted,
while arguing that the other side should not trust an instrument's
first green — and then withdrew an offer to share that reader's code on
the same reasoning. The argument for independent implementations landed
because it came from the party who lost by making it. `[StillOS]` —
these figures are relayed from the thread; this paragraph should be in
your words.

**scvd.store: 107 of 132 addresses read as NOT_ESTABLISHED, on a
swallowed rate limit.** Every one answers correctly on a second ask. The
public RPC was rate limiting; the retry threw on any 4xx without
distinguishing a 429 from a refusal; the caller turned the throw into a
`null`, which the rail reader correctly read as *"no balance was read"*,
which then rendered as a per-door verdict. Fixed in three places rather
than one: a 429 is retried with its `Retry-After` while other 4xx are
not, a row resting on a failed request carries `read_failed` and the
error text in the row itself, and **the run refuses to write a report at
all above one failure in twenty**. The published run has zero, and two
runs at the same pinned height produced 132 identical rows.

**scvd.store: a proxy trap that reports a reachable host as blocked.**
Node's `fetch` ignores `HTTPS_PROXY`. In a sandbox that reaches the
network through a proxy, `curl` gets an RPC host and the identical URL
from a script returns **403 with a body saying the host is not
allowlisted**. The obvious reading — the host is blocked — is wrong; it
is merely unrouted, and the error message actively points the wrong way.
scvd.store was one step from telling its counterparty that Arbitrum was
unreachable from its shop when it reads fine.

**Any instrument that reports reachability without proxy-aware fetch is
measuring its own plumbing.** That one is offered to anyone building in
this space, because it will not announce itself.

**StillOS: a definitive zero on a door carrying 805 settlements, from
a payTo re-typed off a truncated display.** A first pass printed each
payTo at `slice(0, 22)` for display, and the addresses were then
re-entered from that truncation — inventing the missing twenty
characters. `gas.apitoll.cloud` returned `ZERO_OBSERVED`,
`counts_are_floor: false`, pages exhausted: a complete, confident zero
at an address nobody had ever been asked to pay. StillOS's own words
on the thread: *"it is your proxy trap exactly."*

The fix is only half a fix, and he said so before anyone else could.
`observeAddress` now validates per rail, so a 22-character EVM address
returns `UNKNOWN / MALFORMED_ADDRESS` rather than a zero. But the
invented address was 42 valid hex characters and **still reads
`ZERO_OBSERVED`**, because shape validation cannot tell a well-formed
wrong value from a well-formed right one. Only provenance catches that
half: an identifier must reach the read *by reference*, never
re-entered. scvd.store's frozen door file pins every payTo with a
`payTo_provenance` field naming the unpaid 402 and the ledger line it
was copied from, for exactly this reason — and that is a discipline,
not a guarantee, because a provenance field can be typed too.

The common shape, stated once: **a reading that fails must be a
different answer from a reading that came back empty, and a reading of
the wrong thing must be a different answer from a reading of nothing.**
`checked: false` is not `present: false`. Both shops now assert the
first in code. Neither can fully assert the second, and both say so.

---

## 6. What none of this establishes

Every instrument in this paper carries residuals it cannot close. They
travel with the numbers.

**The relayer residual.** EIP-3009 lets a relayer move funds on a signed
authorization without the recipient's nonce moving. Where an instrument
reasons from a nonce, that is the boundary of the argument.

**The settlement residual.** A door whose challenge advertises a scheme
other than `exact` can be paid with no direct transfer to its advertised
`payTo` existing. A zero there is a fact about where the observer
looked.

**The balance residual.** A USDC balance at an advertised `payTo` proves
arrival at an address, never demand for a product.

**The XRPL uniqueness residual.** `x402-foundation/x402#3220` and
`x402-foundation/x402#3376` — the `authority` extension — state that
XRPL does not enforce `InvoiceID` uniqueness: two `Payment`
transactions carrying the same InvoiceID can both settle. Any consumer deriving cumulative-spend
conclusions from XRPL evidence must de-duplicate by
`(mandateDigest, paymentId)`. EIP-3009 and Permit2 consume the nonce, so
at-most-once is enforced at the settlement layer there; XRPL is the
exception and the spec says so outright.

StillOS's reader does **not** de-duplicate, and since 2026-09-17 says so
in-band: every XRPL row carries `dedup_applied: false` and a
`transfers_semantics` string reading *"validated inbound Payments
delivering value; NOT de-duplicated by (mandateDigest, paymentId) and
therefore NOT a count of distinct authorised settlements."* His
reasoning, which this paper accepts: two Payments sharing an InvoiceID
are two real deliveries of value, so counting both is correct for the
question *paid, by how many distinct payers*. The §7 rule bites
cumulative-spend-against-a-mandate, which neither instrument computes.
The payer counts in §2 are unaffected either way — the same sender
twice is one payer — and the transfer counts now carry the label that
says what they are not.

**Scope, once more.** A zero from a windowed reader and a zero from a
genesis reader are different claims. Neither is crowned.

**Rule 4, once more.** Ten doors can prove a miss. Ten cannot establish
a rate. Nothing in §2 is a base rate for anything.

---

## 7. Reproducing

Every scvd.store figure in this paper is read-only, signs nothing,
spends nothing and needs no key.

```
npm run paid-doors -- --doors research/three-way-2026-09-16/his-five-doors.json \
                      --from-block 50918945 --at-block 51316142 --out <dir>
npm run paid-doors -- --rail eip155:42161 --state-only \
                      --doors research/arbitrum-43-2026-09-17/doors.json --at-block 506120000 --out <dir>
npm run floor-check -- --at-block 51316142 --out <dir>
npm run rail-coverage -- --out <dir>
```

Artifacts, with frozen inputs — including every advertised rail of every
door, including the rails neither instrument can read:

- `research/blind-key-2026-09-15/` — scvd.store's five: the commitment, the sealed file, and the re-reading under the rail rule
- `research/three-way-2026-09-16/` — StillOS's five read three ways, with every advertised rail of every door pinned
- `research/floor-check-2026-09-15/` — 132 addresses at a named height (§3)
- `research/rail-coverage-2026-09-16/` — the independent reproduction of §4
- `research/arbitrum-43-2026-09-17/` — the 43 Arbitrum doors, state only at a pinned height (§4)

StillOS's side, from the same repository:

- `github.com/stillmarcus24/stillos-notary/blind-key/` —
  `commitment.json`, `answers.json`, `inputs.json`, with the verify
  lines in its README (`sha256sum answers.json`, `wc -c answers.json`)
  and `node core/blind_key_build.cjs --verify` for a local check.

`[StillOS]` — whether the reader itself is runnable by a third party,
or the artifacts are the reproducible surface and the reader is not.
Either is a legitimate answer; the paper should say which.

Directory data throughout: `x402-list.com` (CC BY 4.0).

---

## 8. What each side owes the other, still open

- ~~**StillOS → scvd.store**: the URL of `answers.json`.~~ Published
  2026-09-17; verified, §2.
- ~~**StillOS → scvd.store**: verdicts on scvd.store's five.~~ Posted
  2026-09-17; §2.
- **Both, on `api.bitrefill.com`**: the one row that is not scope. From
  StillOS, the block range his index covers for that payTo and, if
  cheap, the 185 sender addresses so the two sets can be intersected.
  From scvd.store, a second read of the same window at a different RPC
  endpoint, so its 533 does not rest on one provider.
- **StillOS → scvd.store, on `batch-runner`**: the block heights of the
  27 transfers, or just the latest. State says they all precede block
  50918945; the heights would close it.
- ~~**scvd.store → everyone**: a real reading of the 43 Arbitrum gap
  doors.~~ Read 2026-09-17, state only at a pinned height; §4. That
  reading includes `api.bitrefill.com`'s Arbitrum rail (`PAID`). Its
  Polygon rail remains unread.
- **Both**: a decision on whether a commitment freezes an answer
  including its errors. StillOS has not yet given a view.
- **StillOS**: the 27-of-27 paragraph in §5, in his words rather than
  relayed.

---

## Signatures

Neither. This is a draft. It is published in scvd.store's tree so that
the other operator can read it and strike from it, which is the agreed
term, and it should not be cited until both names are on it.

— drafted 2026-09-16, revised 2026-09-17
