# Client aborts, and what our published numbers actually count

**Dated 2026-08-25.** A reading of the installed buyer client
(`@x402/*@2.23.0`) and of every numeric field this store publishes
on `/pulse.json`, `/stats`, `/rails`, `/coverage.json`,
`/corpus.json`, and `/defects.json`. Written so the two findings
that five latency reports walked past cannot be walked past again
by reading a name instead of the writer.

**What this is.** Gap-finding prompts 2 and 3 of the same series
as `docs/SILENT_DEFAULTS_2026-08.md` (prompt 1, the `$1` cap).
Prompt 2: every abort, filter, throw, or decline that can fire
after our 402 and **before any paid second request reaches us**.
Prompt 3: for every published number, the code that writes it and
what it actually counts; then the name traps; then every pair a
reader would naturally divide or compare.

**What this is not.** A ruling. A fix. A claim about what buyers
in the wild configure. Nothing here is shipped.

**Rule of the reading.** Answer from the code that is installed
and running. Every claim carries a file path and line number, or
a live response already fetched 2026-08-25 in the sibling paper.
Where the library's behaviour and this store's behaviour differ,
both are named and the one in force is named. Every instance,
never one representative. Before concluding a defence does not
exist, the writer of the field was found — the name was not
trusted.

---

## Why these two sit in one paper

The `$1` cap (prompt 1) is a **client-side abort we never see as
a decline**. `organic_verifies` (prompt 3) is a **published
number whose name is the x402 protocol step it does not count**.
Five reports built a verify → settle cliff from the second and
then said the first never trips, having probed one cheap door.

Both errors are the same method: trust the name, skip the writer,
generalise from one sample. This paper is the two writers.

---

# Part I — The client can refuse us with no second request

## The path

Buyer uses `@x402/fetch` `wrapFetchWithPayment`
(`node_modules/@x402/fetch/dist/cjs/index.js:33–90`).

1. First `fetch`. **We see this.** On a 402,
   `src/lib/payment-gate.ts:651–654` calls `recordChallengeIssued`
   and a referral “arrived”. No decline is booked unless a
   `PAYMENT-SIGNATURE` / `X-PAYMENT` header is already present.
2. If `status !== 402`, the wrapper returns as-is (line 39–40).
   That is not a payment refuse.
3. Parse: `response.text()` plus optional JSON body;
   `getPaymentRequiredResponse` wants the `PAYMENT-REQUIRED`
   header. Decode is base64 + `JSON.parse` only — no schema check
   on the 402. Fail → throw `Failed to parse payment
   requirements: …` (lines 54–57). **No second request.**
4. `handlePaymentRequired` hooks (default: none). If a hook
   returns headers, the wrapper **does** send a second *unpaid*
   request (lines 60–69). That is a second request, not a silent
   abort.
5. `createPaymentPayload` — all selection, spend controls,
   signing (`@x402/core` `client/index.js:370–448`). Fail →
   `Failed to create payment payload: …` (fetch lines 74–77).
   **No second request.**
6. If the first request already carried a payment header →
   `Payment already attempted` (line 81). Edge case.
7. Then the paid retry (line 90). A recovery hook can fire a
   third.

`createPaymentPayload` / `selectPaymentRequirements`
(`client/index.js:370–394, 546–594`), in order:

1. Must have schemes registered for `x402Version` (we emit **2**).
2. Filter by registered network + scheme.
3. Drop unrecognized `extra.paymentFlow` (we omit it → treated as
   authorization).
4. `applySpendControls`.
5. Buyer policies.
6. Prefer authorization if any remain.
7. Selector: default `(version, accepts) => accepts[0]`
   (`client/index.js:191`).
8. `beforePaymentCreation` hooks can `{ abort: true }`.
9. Scheme `createPaymentPayload`.

The `@x402/fetch` README default (`README.md:22–28`) registers
**only Base** `eip155:8453`. That does not abort our doors — we
always offer Base first (`src/lib/payments.ts:290–301`). It
**silently drops** Polygon and Solana on every door.

## What we see, precisely

The first GET always. The challenge counter increments. **No
decline reason** — that path needs a payment header
(`payment-gate.ts:658–661`). We cannot tell a spend-cap throw
from “read the 402 and walked away.” `payment-gate.ts:652–653`
already names that monthly gap as the budget-cap / abandonment
signal.

A CDP client (`CdpX402Client`) extends `x402Client`. Extra CDP
spend hooks fire only if `config.spendControls` is set. The core
`$1` still applies. Wallet-init failure is another
pre-second-request abort on the buyer’s machine.

## Hard aborts — no paid second request

| ID | Trigger | Buyer sees | We see | Catalogue / rails | What we could publish |
|---|---|---|---|---|---|
| A2 | `PAYMENT-REQUIRED` missing, invalid base64, or bad JSON | parse throw | Challenge only | 0 today if headers stay valid | Keep emitting `PAYMENT-REQUIRED` |
| A3 | No client for x402 v2 (`client/index.js:373, 549`) | `No client registered for x402 version: 2` | Challenge only | **All** paid doors (we only emit v2) | Already done; skill / practice |
| A4 | No registered network/scheme matches (`:559`) | `No network/scheme registered…` | Challenge only | Only if they registered none of Base / Polygon / Solana (Ethereum-only, etc.) | Document required networks |
| A5 | Every remaining accept has unrecognized `paymentFlow` (`:571–574`) | recognized-flow throw | Challenge only | **0** (we omit the field) | Do not start sending exotic flows without saying so |
| A6 | Spend cap empties `accepts` (`:694`) | `rejected by spendControls.maxAmountPerPayment ($1…)` | Challenge only — **looks like abandonment** | Every menu id whose **cheapest** accept is over `$1`; all three rails die together because they share the price | Publish `spendControls: false` or raise the cap; cheaper SKUs |
| A7 | Default-asset allowlist empties (`:639`) | allowlist throw | Challenge only | **0** (USDC is the default asset on all three rails) | Do not add a non-default asset without saying so |
| A8 | Buyer policies empty the set (`:584`) | policies throw | Challenge only | Only if they configured policies | Their config, not ours |
| A9 | `beforePaymentCreation` `{ abort: true }` (`:387–388`) | `Payment creation aborted: {reason}` | Challenge only | Optional (CDP extra guardrails if configured) | Their config |
| A10 | EVM missing `extra.name` / `extra.version` (`@x402/evm` `exact/client/index.js:195–198`) | EIP-712 domain throw | Challenge only | **0** if they select Base or Polygon (live extras present 2026-08-25) | Keep enhancing extras |
| A11 | SVM missing `extra.feePayer` (`@x402/svm` `exact/client/index.js:283–285`) | `feePayer is required…` | Challenge only | **0** if they select Solana (live extras present) | Keep `feePayer` on SVM accepts |
| A12 | Invalid `payTo` / asset hex | viem `getAddress` | Challenge only | **0** if addresses stay valid | Keep valid addresses |
| A14 | Wallet `signTypedData` reject | wallet UI / signer error | Challenge only | Every EVM-selected pay | Nothing we configure |
| A15 | SVM `fetchMint` / `getLatestBlockhash` fail | public Solana RPC error (not us) | Challenge only | Solana-selected only; default Base-first clients never hit this | Could publish `extra.recentBlockhash` to skip the RPC |
| A16 | Unknown mint token program | that error | Challenge only | **0** (USDC on TOKEN_PROGRAM) | — |
| A17 | Memo > 256 bytes | that error | Challenge only | **0** (we do not set memo) | — |
| A18 | First request already had a payment header | `Payment already attempted` | Depends | Edge | — |

## Silent filters — a second request may still happen; we never see the dropped options

| ID | What it does | Catalogue / rails |
|---|---|---|
| F1 | Drop unregistered rails before selection | README Base-only client: Polygon + Solana dropped on **every** door |
| F2 | Cap keeps cheap accepts, drops the rest | `graffiti_on_a_train` `$1/$2/$5` → only `$1` remains, then Base is selected. luckies / collab / certificate floors are all over `$1` → **A6 throw**, not F2 |
| F3 | Prefer authorization | No drop (we only offer authorization) |
| F4 | Selector `accepts[0]` | Always Base among survivors. `railAccepts` (`payments.ts:290–301`) puts Base minimum first on purpose |

## Catalogue × rail

Same shelf as the sibling paper, re-derived from `MENU_ITEMS`
(`src/store/menu.ts`) and `priceTiersUsdc`
(`src/lib/payments.ts:208–224`). `CHEAP_DOOR_MAX_USDC = 1`. Do
not trust a count typed beside these lists; if the shelf moves,
re-derive.

**Pays under an unmodified `@x402/fetch` client** (floor `<= $1`
on every rail, because every door quotes the same price on Base,
Polygon, and Solana):

`settlement_attestation` 0.004 · `small_blessing` 0.005 ·
`settlement_reconciliation` 0.006 · `the_confession` 0.01 ·
`attestation_bundle` 0.05 · `the_mandate` 0.1 · `hello` 0.5 ·
`bitcoin_anchor` 1 · `context_anchor` 1 · `passport_refresh` 1 ·
`graffiti_on_a_train` 1 (PWID `$1/$2/$5` — F2, not A6).

Penny pages (`PENNY_PAGE_USDC = 0.01`) are PWID `$0.01/$0.02/$0.05`
and survive.

**Rejected whole (A6) on every rail:**

`signature_agent_card` 2 · `the_statement` 2 · `onpage_audit` 3 ·
`recurring_patronage` 3 · `coffees_for_closers` 3 ·
`standing_watch` 5 · `service_audit` 5 · `conformance_watch` 5 ·
`launch_check` 5 · `luckies` 5 (PWID `$5/$10/$25`) ·
`trust_profile` 19 · `certificate_of_patronage` 20 (PWID
`$20/$40/$100`) · `the_collab` 25 (PWID `$25/$50/$125`).

`COMMISSION_RUNGS = [25, 50, 100, 250]`
(`src/store/commission-desk.ts:24`). Every rung is A6 on every
rail.

**Rails.** A6 does not pick a rail: the three accepts share the
price, so they empty together. F1 is the rail amputation, and it
is silent. F4 then pays Base. The store’s published rail split
therefore cannot be read as “buyers chose Base.” It can be read
as “the default client never offered them the other two.”

---

# Part II — What our own published numbers actually count

Each field: the writer, then one sentence on what the increment
or derivation actually is.

## `/pulse.json`

Writer: `src/routes/pulse.ts` → `computePulse`
(`src/services/pulse.ts:179`). Reads `readMonthLedger`
(`src/lib/metrics.ts:948`) **organic columns only**
(`402` / `paid` / `verify` — not `402h`/`paidh`/`verifyh`, not
`402i`/`verifyi`). Trailing window `PULSE_MONTHS = 6` (`:50`).

| Field | Writer | What it actually counts |
|---|---|---|
| `organic_challenges` | sum of `row.challenges` (`pulse.ts:203, 225`) from `metric:<month>:402:<item>` (`metrics.ts:1031`), written by `recordChallengeIssued` (`metrics.ts:184`) on every 402 the gate issues (`payment-gate.ts:654`) that was **not house-flagged at issue** | One increment per 402 response to traffic that was organic *when the challenge went out*. Not unique agents. Not unpaid probes that could pay. Channel is frozen at issue; later house reclass of **settles** does not remove those wallets’ challenges. |
| `organic_settled` (per month) | sum of `row.settled` minus that month’s reclass (`pulse.ts:204–210`) | Organic settle-counter increments (`recordSettlement` → `metric:<month>:paid:<item>`, `metrics.ts:626–629`) minus settles later moved organic→house on the reclass ledger. |
| `organic_settled` (`all_time`) | last-6-months recorded organics, monthly misbooked added back, then **lifetime** `totalReclassified` subtracted (`pulse.ts:273–276`) | Not “lifetime organic settles” and not “6-month organic settles.” It is a 6-month recorded sum adjusted by a lifetime reclass total, so it matches `/stats` only while every operating month still fits in the window (true today; store opened 2026-07-22). |
| `misbooked_house` (month) | `monthReclassAdjustments` (`pulse.ts:205`) | Settles later moved organic→house **in that month’s split**. |
| `misbooked_house` (`all_time`) | `totalReclassified` (`pulse.ts:290`) | Lifetime reclass total, not the sum of the six months. |
| `reclass_split_incomplete` | true when the month split ≠ lifetime total or the walk truncated (`pulse.ts:277–279, 291`) | A flag, not a count: the months will not add to `all_time.organic_settled`. |
| `organic_verifies` | sum of `row.verifies` (`pulse.ts:211, 227`) from `metric:<month>:verify:<item>` (`metrics.ts:1036`), written by `recordVerifyCall` (`metrics.ts:483`) | **Free re-verifications of already-issued artifacts** on `/api/verify` and MCP `verify_artifact` (`src/routes/verify.ts:292`, `src/routes/mcp.ts:209, 225, 241`). Not the facilitator’s verify-before-settle. Not “paid and then verified.” House and infrastructure verify buckets are never summed in. |
| `conversion_rate` | `rate(settled, challenges)` (`pulse.ts:167–176, 228`) | `organic_settled / organic_challenges`, 3 significant figures. `null` if no challenges (undefined, not zero). `0` if offered and none paid. |
| `known_machinery` | crawler recount walk, only when `correction.complete === true` (`pulse.ts:218–222`) | Rows inside the recorded organic-challenge column that today’s crawler table would move to infrastructure. Published **beside** the recorded figure, not subtracted from it. Absent if the month walk did not finish. |
| `corrected_challenges` | `max(0, challenges − known_machinery)` (`pulse.ts:237`) | Recorded organic challenges minus that complete-walk machinery count. |
| `corrected_conversion_rate` | `rate(settled, corrected_challenges)` (`pulse.ts:242–245`) | Same settled numerator against the machinery-stripped denominator. Present on **months** when the walk is complete. **Not computed on `all_time`** even when `known_machinery` is rolled up (`pulse.ts:302–314` adds the two counts and stops). |
| `PULSE_MONTHS` | constant `6` | How many ISO months the public window holds. Older months stay in the office. |

The HTML twin (`src/routes/pulse.ts:123`) headers the verify
column **“re-verifies”**. The JSON field does not.

The pulse `note` (`pulse.ts:143–144`) already says challenges
and verifies are **ceilings** and the conversion rate is a
**floor**, because reclass freezes a settle count per wallet and
does not retract those wallets’ 402s or later `/api/verify`
hits.

## `/stats`

Writer: `src/routes/stats.ts:17–71` → `computeStats` /
`computeStatsDiagnosed` (`src/services/stats.ts:131`). Fail-open
embeds `net_by_chain` from `computeNetStatement`
(`src/services/net-statement.ts:89`).

| Field | Writer | What it actually counts |
|---|---|---|
| `settled_purchases_total` | `organic + house + FOUNDING_SETTLES_WITHOUT_PAYER_ROW` (`stats.ts:262–263`) | Every settle counter this store has, **including house**, plus the one founding hello that predates the meter (`metrics.ts:842`, value `1`). Not “organic sales.” |
| `organic_settlements` | sum of `metric:*:paid:*` (not `paidh`) minus `totalReclassified` (`stats.ts:191–216`) | Lifetime organic settle increments after the reclass ledger. Calendar-bounded: every month since `OPERATING_SINCE` (`2026-07-22`). |
| `house_settlements` | `paidh` sum + reclassified (`stats.ts:265`) | Proprietor / test settles flagged at the till, plus settles later moved onto that pile. |
| `reclassified_house` | `totalReclassified` (`stats.ts:266`) | The same lifetime reclass total pulse `all_time.misbooked_house` uses. |
| `pre_meter_settlements` | `FOUNDING_SETTLES_WITHOUT_PAYER_ROW` (`stats.ts:267`) | The founding hello. Always `1` until that constant changes. |
| `artifacts_issued` | `patron_number` KV (`stats.ts:155–157, 268`) | **Every minted artifact, free shelf included** — stamps, free certs, the lot. Used to be published as the purchase total (the 88 − 85 ≠ 5 incident, `stats.ts:139–153`). |
| `organic_by_rail.base` / `.polygon` / `.solana` | three **disjoint** records added (`stats.ts:224–256`): till `rail` counters + certificate walk before the till seam + single-rail deduction for months when Base was the only door (`SECOND_RAIL_OPENED = 2026-08-04`) + `RAILS_ENTERED_BY_HAND` (empty lists; count is `length`) | Organic settles this store can place on that chain. Withheld entirely if the three records overshoot `organic_settlements` (`stats.ts:269`). |
| `organic_by_rail.rail_not_recorded` | `organicSettlements − railTotal` (`stats.ts:275`) | Organic settles neither the till, the cert walk, nor the single-rail deduction placed. Closed set; nothing joins it after the till started writing rails. |
| `net_by_chain.{base,polygon,solana}.months[].observed_inflow_usdc` | hourly reconciliation walk, `metric:<month>:inflow:<chain>`, stored as integer millionths, rendered as USDC (`net-statement.ts:115–117, 84`) | USDC the walk **saw arrive** at the receiving wallet on that chain that month. Not a count of sales. |
| `of_which_dust_usdc` | `inflowdust` (`:118–120`) | Of that inflow, transfers below the cheapest listing. Named, never blended into booked. |
| `booked_usdc` | `revrail + revrailh` (`:121–130`) | What the till booked as settled on that chain, **organic + house**, in USDC. |
| `booked_organic_usdc` / `booked_house_usdc` | the two `revrail` keys separately | Same till write as the organic/house settle counts, but **denominated in USDC**, not in sales. |
| `difference_usdc` | `observed − booked` (`:138`) | The published gap. Zero is the healthy state once both meters run. May contain dust, keeper transfers, month-edge timing, and meter epochs (`NET_DIFFERENCE_MAY_CONTAIN`, `:76–81`). |

`rail_overshoot` is computed (`stats.ts:284–286`) and **not
published** on `/stats`. An absent `organic_by_rail` is the
public form of that disagreement.

## `/rails`

Writer: `src/routes/rails.ts:109–127`. JSON payload is `all_time`
+ `by_month_from_the_till`. The HTML chart and table are the
same two records drawn.

| Field | Writer | What it actually counts |
|---|---|---|
| `all_time` | `stats.organic_by_rail` (`rails.ts:115, 120`) | The same three-record lifetime split `/stats` serves. Null when that split is withheld. |
| `by_month_from_the_till[].base` / `.polygon` / `.solana` / `.other` | `readRailCountersByMonth` (`src/services/rails.ts:272`) from `metric:<month>:rail:<rail>` (skips `railh`) | Organic till increments **in that month**, from the day the till started writing rails. Pre-till certificate-era sales are **not** in these rows. `.other` is `railOf` falling through (`metrics.ts:585–587`) — a network that is neither Polygon CAIP-2, nor `eip155*`/`base*`, nor Solana. |
| `truncated` | listing cap 100 on that month’s `rail` prefix (`rails.ts:278–292`) | A flag: the row may undercount. Cannot fire today (four buckets vs cap 100); published so a future cap-hit is visible. |

The HTML table “total” is `base + polygon + solana + other`
(`rails.ts:132`). The all-time tile’s leftover column is
`rail_not_recorded`, a different bucket, and is not on the
monthly rows.

## `/coverage.json`

Writer: `src/routes/coverage.ts` → `publicCoverageDocument`
(`src/evidence/coverage.ts:213`). Same document at
`/.well-known/coverage.json`.

**There is no live count on this surface.** `matrix` is
`COVERAGE_REGISTRATIONS` (`:77–155`) crossed with `KNOWN_CHAINS`
(`src/evidence/subject.ts:105–110`: Base, Base Sepolia, Polygon,
Solana). Each cell is a depth enum: `none` / `challenge` /
`read` / `till` / `walk` (`coverage.ts:37–52`). Sandbox is
listed so a subject on it is valid; no production class claims
depth there.

The document exists because “we observe three chains” is true of
`settlement_attestation` and `the_statement` (`read` on all three
mainnets) and a lie about `launch_check` (Base `walk` only),
`sanctions_screen` (Base `read` only), and every class whose
depths are empty (coherence families: no chain dimension).

## `/corpus.json`

Writer: `src/routes/corpus.ts:32–140`. Lists signed weekly ward
rounds; verifies the hash chain live (`verifyCorpusChain`,
`src/services/corpus.ts:303`).

| Field | Writer | What it actually counts |
|---|---|---|
| `entries` | `records.length` (`corpus.ts:118`) | How many weekly snapshots are in the chain. Not hosts. Not 402s. |
| `chain.entries` | same length (`corpus.ts:315, 322, 342`) | Same number, attached to the intact/problem verdict. |
| `index[].sequence` | `snapshot.sequence` | 1-based position in the chain. |
| `index[].hosts_observed` | `round.hosts.length` (`corpus.ts:137`) | Hosts **stored on that snapshot**. A cap or a coverage-suspect page can make this smaller than the directory the round knew about. |
| `latest` (full record) | last listed record (`corpus.ts:129`) | The whole signed snapshot, including every numeric field below. |

Numeric fields that ride **inside** `latest.snapshot.round`
(and each `/corpus/{n}.json`), written by the ward
(`src/services/ward-round.ts`, `src/services/population.ts`,
`src/services/market.ts`) — not by the till:

| Field | What it actually counts |
|---|---|
| `walk.roster` / `walk.walked` / `walk.batches` | Probeable doors frozen at week-start; doors that received a real verdict; hourly batches. `walked < roster` means the week ended before the cursor did. |
| `coverage_drop.this_round` (and its pair) | Walked this week vs a previous probed count, only when this week is under 60% of a prior ≥10 (`ward-round.ts:663–666`). |
| `population.population_known` | Union of directory hosts the census could read, plus carry-forward. |
| `population.population_walked` | How many of those the ward actually probed this round. |
| `population.coverage_pct` | `walked / known`, or `null` if known is zero. **Directory coverage of the weekly walk**, not till conversion. |
| `population.carried_forward` / `appeared_count` / `disappeared_count` / `returned_count` | Register events. The name arrays are capped; the `_count` fields are exact (`population.ts:99–117`). |
| `market.probed` / `ready` | Doors this round probed; doors whose verdict was `ready`. |
| `market.rot.dead_doors` / `.pct` | Listed doors that answered no 402. |
| `market.signed_offers.serving` / `of_ready` / `.pct` | Ready doors serving signed offers. |
| `market.price_usdc.{sample,min,p25,median,p75,max}` | Cheapest ask per **other people’s** USDC-priced doors, whole USDC. |
| `market.concentration.*` / `top5_share_pct` | Operator concentration among probed hosts. |
| `market.schemes` / `market.rails` | Counts of observed scheme / rail shapes on those 402s. |

`variableMeasured` on the Dataset envelope
(`corpus.ts:78–85`) **names** “coverage percentage” as a
measured variable. It is not a top-level number on the index.

`/corpus/host/{host}.json` deliberately **withholds**
rounds-ready / rounds-probed (`corpus.ts:114–115`): that
division would be a score on an operator.

## `/defects.json`

Writer: `src/routes/defects.ts:31–59` → `document()`.

| Field | Writer | What it actually counts |
|---|---|---|
| `version` | `DEFECT_VOCABULARY_VERSION` (`src/store/defect-vocabulary.ts:39`), currently `"2"` | Vocabulary revision. **Not a count of defects found.** Bumped when a class is added, retired, or its assertion changes. |
| `classes` | `DEFECT_CLASSES` (`:173`) | Named classes, each an observable property of one endpoint at one moment. Ids: `no-402`, `unparseable-challenge`, `unsignable-offer`, `unpayable-payto`, `rail-cannot-receive`, `wrong-network`, `amount-not-atomic`, `inputs-undeclared`, `replay-accepted`, `settlement-error`, `delivered-nothing`. Length of this array is the class count; nothing here accumulates findings. |
| `evidence_labels` | `EVIDENCE_LABELS` | A second register: provenance of a *claim*, not a property of a door. First entry `listed-not-walked`. |
| `changelog[].version` | `VOCABULARY_CHANGELOG` (`:63`) | Same versioning scheme. v1 (2026-08-23) first publication; v2 (2026-08-24) added evidence labels. |
| `cross_instrument_mappings_read_on` | `MAPPINGS_READ_ON` (`:82`), `"2026-08-23"` | The date the Cairn mappings were last read. Not a count. |

---

# Name traps

For each: what a careful outside reader — or another instrument
comparing against us — would assume from the name; what the code
is; what published conclusion breaks if someone reasons from the
assumption.

### 1. `organic_verifies`

**Assumed:** the x402 facilitator verify step, or “paid and then
verified,” or the middle of a probe → verify → settle funnel.

**Really:** free `/api/verify` (and MCP `verify_artifact`) of
**already-issued** artifacts, organic column only. The HTML
page already says “re-verifies” (`pulse.ts:123`). The JSON
field does not.

**Breaks:** any verify → settle cliff; any “verify conversion”;
any comparison to another instrument’s protocol-verify count
(Cairn, x402scan, a facilitator dashboard). This is the five-
report error. Direct heir to the name.

### 2. `conversion_rate`

**Assumed:** paid / people who tried to pay, or settle / verify,
or unique buyers / unique visitors.

**Really:** organic_settled / organic_challenges. Challenges are
402 responses, not agents (`pulse.ts:55, 167–176`). They still
include 402s from wallets later reclassified as house. Machinery
is not subtracted unless the reader uses
`corrected_conversion_rate`.

**Breaks:** “N% of buyers convert.” “The market converts at X.”
Comparing our rate to an instrument that denominates in unique
wallets or in facilitator verifies.

### 3. `organic_challenges`

**Assumed:** unique agents, or unpaid probes that could have
paid, or the same thing another observatory calls “probes.”

**Really:** one increment per 402 issued to traffic not
house-flagged **at the till, at issue time**. Crawlers that were
organic-labelled stay in the recorded column until a complete
recount walk publishes `known_machinery` beside it.

**Breaks:** unique-visitor funnels; lining our denominator up
with Cairn / x402scan probe counts; reading the HTML standfirst
“how many agents were offered a price” (`pulse.ts:37–38, 115`)
as a headcount. The store already has the rule that reads are
not readers; this page’s copy still says agents.

### 4. Pulse `all_time`

**Assumed:** since `operating_since` / since opening.

**Really:** last `PULSE_MONTHS` (6) ISO months of challenges and
verifies. Settled `all_time` additionally subtracts **lifetime**
reclass from that 6-month recorded sum. Today the store is two
months old, so the window and the lifetime coincide. In month 7
they will not.

**Breaks:** subtracting pulse `all_time` from `/stats` lifetime
and calling the remainder a discrepancy; treating pulse
`all_time.conversion_rate` as a lifetime rate once the window
starts dropping months.

### 5. `settled_purchases_total`

**Assumed:** organic sales, or “purchases” in the ordinary
sense.

**Really:** organic + house + founding. The track-record line
spells the identity (`stats.ts:310–313`). The field name does
not.

**Breaks:** `total − house = organic` done by a reader who
doesn’t notice house is already inside total (the 88 − 85
shape, which is how this store burned itself once).

### 6. `artifacts_issued`

**Assumed:** purchases, or settled goods.

**Really:** the patron counter — every minted artifact, free
shelf included (`stats.ts:75–81`).

**Breaks:** `artifacts_issued / organic_settlements` as a
fulfillment rate; `settled − artifacts` as undelivered paid
goods. Free stamps move the numerator and never the
denominator.

### 7. `/rails` `all_time` vs `by_month_from_the_till`

**Assumed:** the monthly series sums to the all-time tiles.

**Really:** monthly rows are till-era only
(`rails.ts:122–123, 170`). All-time adds certificate-era sales
and names the rest `rail_not_recorded`. Chart `other` ≠
`rail_not_recorded`.

**Breaks:** adding the bars and expecting the all-time Base /
Polygon / Solana tiles; treating a month of zeros as “no
sales that month” rather than “till had not started” or “month
omitted because empty” (`rails.ts:269–270` drops empty
untruncated months).

### 8. `organic_by_rail` “where the money actually lands”

**Assumed:** buyer rail choice.

**Really:** till + certs + “Base was the only door we could
accept.” Combined with F1/F4 above: a default `@x402/fetch`
client never sends Polygon or Solana.

**Breaks:** “the market prefers Base”; comparing our rail split
to an instrument that counts *offered* rails or *registered*
client schemes.

### 9. `/coverage.json` as a count of observations

**Assumed:** how many times we looked, or that every class
covers three chains.

**Really:** a static registration matrix of depths. Absence is
`none`. No probe is counted here.

**Breaks:** “coverage.json says they observe three chains, so
their census walked Solana.” Only some classes have `read` /
`till` / `walk` on all three mainnets.

### 10. `/defects.json` `version` / `classes`

**Assumed:** how many defects we found this week, or a score.

**Really:** a vocabulary. The file’s own `what_this_is_not`
says so (`defects.ts:37–38`). Findings live on corpus
snapshots, labelled with these ids when the ward uses them.

**Breaks:** treating `classes.length` as this week’s defect
count; treating `version: "2"` as two findings.

### 11. Corpus `coverage_pct` / Dataset “coverage percentage”

**Assumed:** the same conversion idea as pulse, or “we saw the
whole market.”

**Really:** `population_walked / population_known` for one
week’s directory walk (`population.ts:92–93`). Missing on
pre-population rounds means “not measured,” never 100%
(`ward-round.ts:166–168`).

**Breaks:** lining corpus `coverage_pct` up with pulse
`conversion_rate`; reading a high percentage as “the x402
economy is this large and we saw it all.”

### 12. Corpus `hosts_observed` / `ready`

**Assumed:** the neighbourhood, or our customers.

**Really:** hosts stored on that snapshot / doors whose unpaid
preflight verdict was `ready`. Caps and `coverage_suspect`
apply. `ready` is not a paid settle and is not our till.

**Breaks:** `ready / organic_challenges` as a funnel;
`hosts_observed` as population_known (the census is the
denominator; the snapshot list can be the cap).

### 13. `net_by_chain` `booked_usdc` vs pulse/stats organic

**Assumed:** the same “booked” as organic settlements.

**Really:** USDC, organic **plus house**. Pulse/stats organic
are **counts of sales**.

**Breaks:** `booked_usdc / organic_settlements` as average
ticket without stripping house and without noticing one side
is dollars and the other is events.

---

# Comparison pairs

Every pair a reader would naturally divide or compare. Same
path? Same denomination? This is where the false funnel came
from.

| Pair | Same path? | Same denomination? | What a careless ratio claims |
|---|---|---|---|
| `organic_verifies` ÷ `organic_settled` | **No.** Verifies = later free re-checks of issued artifacts. Settled = till. Different events, different time, different callers. | Both are counts, of **different things**. | A verify → settle (or settle → verify) protocol funnel. **This is the five-report false funnel.** |
| `organic_settled` ÷ `organic_challenges` | Same monthly ledger keys, same organic bucket. | Both counts. **But** settled is reclass-adjusted and challenges are not. | “Conversion.” Honest only as the floor the pulse `note` already names. |
| `corrected_conversion_rate` vs `conversion_rate` | Same settled numerator. Different challenge denominator (machinery stripped iff the month walk completed). | Both rates of counts. | That one replaced the other. They are published beside each other. `all_time` has the corrected *counts* and not the corrected *rate*. |
| Pulse `organic_settled` vs stats `organic_settlements` | Same settle counters, same reclass arithmetic **by intent**. | Both sales counts. | Identity. Holds for months inside the pulse window while the store is younger than six months. Pulse `all_time` will diverge from stats lifetime once a seventh month exists, and already can if lifetime reclass includes months the window dropped. |
| Pulse monthly `organic_settled` vs rails monthly `base+polygon+solana+other` | Same till *era*, but rails omit `railh` and omit pre-till months; pulse subtracts monthly reclass. | Both sales counts. | That a month’s bars sum to that month’s pulse settled. Reclass, `other`, and empty-month omission all move them. |
| Stats `organic_settlements` vs `organic_by_rail` parts | Same organic figure; rail split is three **other** records constrained to sum to it. | Both sales counts, when the split is published. | Identity by construction (`base + polygon + solana + rail_not_recorded === organic`). An absent split means the constraint failed, not that rails are zero. |
| Rails `all_time` vs rails monthly sums | **No.** All-time includes cert-era + single-rail deduction. Monthly is till-era only. | Both sales counts, different epochs. | “The chart totals the tiles.” It does not. |
| `settled_purchases_total` vs `organic_settlements` | Same settle counters. | Both sales counts. Total includes house + founding. | That they should be close. House is supposed to be most of the gap. |
| `artifacts_issued` vs `organic_settlements` | **No.** Patron counter vs settle counters. | Both integers, different substrates. | Fulfillment rate. Free shelf and house-minted artifacts live only on the left. |
| `artifacts_issued` vs `organic_verifies` | **No.** Mints vs later free re-checks. | Both counts. | “Each artifact is verified once.” Verifies can be zero or many per artifact; house verifies are excluded. |
| Pulse `organic_challenges` vs corpus `market.probed` / `hosts_observed` | **No.** Our 402s issued vs weekly unpaid GETs at **other** listed doors. | Both counts of HTTP looks, at different populations. | That we are measuring the same market the same way. |
| Pulse `conversion_rate` vs corpus `population.coverage_pct` | **No.** | Both look like percentages. Left: settles/402s. Right: walked/known hosts. | A single “coverage” or “conversion” story. |
| Corpus `ready` vs pulse `organic_settled` | **No.** Unpaid preflight verdict on someone else’s door vs our till. | Both counts. | A ready → paid funnel across the ecosystem, or ours. |
| Corpus `entries` vs pulse months | **No.** Weekly snapshots vs monthly till windows. | Both counts of periods. | That six pulse months should equal six corpus entries. Cadence and start dates differ. |
| `/coverage.json` depths vs any pulse/stats/corpus number | **No.** Static matrix vs live counters. | Depths are not numbers. | “Coverage of 3” as a count. |
| `/defects.json` class count vs corpus findings | **No.** Vocabulary vs observations. | A list length vs events. | This week’s defect total. |
| `net_by_chain.booked_organic_usdc` vs `organic_settlements` | Same till *intent* (revrail is written in `recordSettlement`, `metrics.ts:678`). | **No.** USDC vs sales. | Average ticket, if house and dust and month-edge are ignored. |
| `net_by_chain.booked_usdc` vs `organic_settlements` | Till, but booked includes house. | **No.** USDC, and the wrong pile. | The same average, now poisoned by house tests. |
| `net_by_chain.observed_inflow_usdc` vs `booked_usdc` | **Intended pair.** Observed is the chain walk; booked is the till. Neither copies the other (`net-statement.ts:73–74`). | Both USDC. | The healthy zero. Difference has named contents; an unnamed remainder pages the keeper. |
| `booked_organic_usdc` vs pulse `organic_settled` in the same month | Same till write, different grain (USDC vs count) and pulse subtracts reclass from the count. | **No.** | That they should match as numbers. |

The false funnel that started this series is the first row:
`organic_verifies` against `organic_settled`. The name says they
are two steps on one path. The writers say they are two
instruments. Everything downstream of that ratio — a “verify
cliff,” a protocol bottleneck, a comparison to anyone else’s
verify step — reasons from the assumption.

The second-row rate (`settled / challenges`) is the one this
store *meant* to publish as a funnel, and even that one is a
floor: the denominator still holds 402s from wallets later
moved to house, and holds crawler 402s until a complete recount
walk sits beside it.

---

## Provenance

Gap-finding prompts 2 and 3, 2026-08-25, against
`phase1/1.3-methodology` and `@x402/*@2.23.0` as installed.
Prompt 1 (silent defaults, the `$1` cap) lives in
`docs/SILENT_DEFAULTS_2026-08.md`. Prompt 4 (library wiring vs
this till) is in `docs/LIBRARY_VS_STORE_2026-08.md`. Live 402s
cited in prompt 1 were fetched the same day; this paper does not
re-fetch them.

Nothing here is a keeper ruling. The shelf prices are the shelf
that day; the constants are the install that day. Re-read both
before acting.
