# The catalogue against every constraint that gates a purchase

**Dated 2026-08-25.** Every paid door on the live shelf, measured
against every constraint that can stop a purchase before goods
move. Direct heir to "one endpoint, one price": three rails times
three PWID tiers times a signed offer per accept is how a `$1`
tag that *survives* the spend cap still dies in the client's
HTTP parser.

**What this is.** Gap-finding prompt 5 of the same series as
`docs/SILENT_DEFAULTS_2026-08.md` (prompt 1),
`docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md` (prompts 2–3),
`docs/LIBRARY_VS_STORE_2026-08.md` (prompt 4) and
`docs/DISCOVERY_SURFACES_2026-08.md` (prompt 6). The whole
catalogue, not a sample. Every 402 fetched the same day.

**What this is not.** A ruling. A fix. A claim about what buyers
in the wild configure. Prompt 1 already ranked the `$1` cap.
This paper puts that cap in a table with the other gates and
names the ones prompt 1 did not measure: header size, inputs an
agent cannot possess, and the store-side 503s that never become
a challenge.

**Rule of the reading.** Live `GET /api/buy/{id}` with
`Accept: application/json` from `https://scvd.store` on
2026-08-25, plus `MENU_ITEMS`, `buyInputSchema`
(`src/lib/bazaar-discovery.ts:48`), `priceTiersUsdc`
(`src/lib/payments.ts:208`), `railAccepts` (`payments.ts:295`),
and the buy-route guards in `src/routes/buy.ts`. Header sizes
are the last HTTP response block on the wire, not curl's
`size_header` (that figure includes the status line twice on
some paths).

---

## The finding that is the point of the paper

The `$1` default spend cap kills thirteen menu ids and every
commission rung. That was prompt 1.

The header kills a fourteenth that the cap *lets through*.

`graffiti_on_a_train` is `$1 / $2 / $5` on three rails: nine
accepts, each carrying a signed offer-receipt. Live 402 on
2026-08-25: **17,007 bytes of response headers**,
`PAYMENT-REQUIRED` alone **16,280 bytes**. Node's default
`--max-http-header-size` is **16,384** and applies to request
*and* response headers (Node docs; undici's `maxHeaderSize`
defaults to the same number). `@x402/fetch` is a Node fetch
wrapper. The client throws while *reading* the 402. We have
already recorded a challenge. No payment comes back.

`the_collab` (16,763) and `certificate_of_patronage` (16,739)
fail the same parser and also fail the cap. `luckies` (16,205)
and every almanac penny page (15,029) sit inside 20% of the
line. The cheap PWID door — `$0.01 / $0.02 / $0.05` × three
rails — is the one that *passes* the cap and still walks up
to the header wall, because nine signed accepts do not care
that the dollars are pennies.

That is "one endpoint, one price" inverted. One endpoint, nine
prices, one header.

---

## The catalogue, enumerated

Twenty-four `MENU_ITEMS` plus four commission rungs plus the
almanac pages (six live, one 402 shape). Gazette issues: none
live, so none measured. Rails on every door today:
`eip155:8453`, `eip155:137`,
`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. `accepts[0]` is
Base. `maxTimeoutSeconds` is 300 on every accept (prompt 1 #2).

Required inputs are `buyInputSchema(item).required`
(`bazaar-discovery.ts:48–338`). The unsigned GET still 402s
(the probe rule, `buy.ts:148–152`); the paid request without
the field is 400 before settle.

Returns: instant items deliver the goods plus a signed
certificate in the 200 (`buyOutputExample`,
`bazaar-discovery.ts:439–461`). Human-queue items deliver an
`order_id` and a 168-hour SLA (`:463–473`). Capability prose
is `SPEC_RETURNS` (`src/store/spec.ts:335`).

| id | min $ | pricing | required | accepts | hdr B | PR B | returns |
|---|---:|---|---|---:|---:|---:|---|
| `settlement_attestation` | 0.004 | fixed | `tx_hash` | 3 | 9705 | 8980 | signed observation (SETTLED / NOT_FOUND / …) |
| `small_blessing` | 0.005 | fixed | — | 3 | 7443 | 6724 | blessing slip + cert |
| `settlement_reconciliation` | 0.006 | fixed | `tx_hash` (Base `0x` only) | 3 | 9105 | 8376 | signed cap observation |
| `the_confession` | 0.01 | fixed | `confession` | 3 | 8049 | 7332 | absolution cert |
| `attestation_bundle` | 0.05 | fixed | `tx_hashes` (2–20 Base) | 3 | 8451 | 7724 | sheaf of attestations + cert |
| `the_mandate` | 0.10 | fixed | `mandate` | 3 | 9109 | 8388 | signed mandate record |
| `hello` | 0.50 | fixed | — | 3 | 7313 | 6588 | signed hello + badge |
| `bitcoin_anchor` | 1.00 | fixed | `digest` | 3 | 8349 | 7628 | cert binding sha256 + OTS URL |
| `context_anchor` | 1.00 | fixed | `summary` | 3 | 8281 | 7564 | stored summary + anchor URL |
| `passport_refresh` | 1.00 | fixed | `url` | 3 | 8433 | 7716 | census observation folded into passport |
| `graffiti_on_a_train` | 1.00 | PWID 1/2/5 | `tag` | 9 | **17007** | **16280** | tag on cert; wall is separate |
| `signature_agent_card` | 2.00 | fixed | `url` | 3 | 8479 | 7756 | signed directory card |
| `the_statement` | 2.00 | fixed | `wallet` (0x EVM) | 3 | 8687 | 7964 | signed transfer record (Base/Polygon) |
| `onpage_audit` | 3.00 | fixed | `url` | 3 | 8291 | 7576 | signed on-page report |
| `recurring_patronage` | 3.00 | fixed | — (`pass_id` optional) | 3 | 7733 | 7012 | 30-day pass + monthly note |
| `coffees_for_closers` | 3.00 | fixed | `win` | 3 | 7943 | 7220 | win on cert; Sunday coffee |
| `standing_watch` | 5.00 | fixed | `url` | 3 | 7917 | 7196 | watch id + 7-day history URL |
| `service_audit` | 5.00 | fixed | `url` | 3 | 8221 | 7504 | signed preflight audit |
| `conformance_watch` | 5.00 | fixed | `url` | 3 | 8371 | 7652 | 7 daily signed passes |
| `launch_check` | 5.00 | fixed | `url` | 3 | 8357 | 7640 | signed field-wallet walk |
| `luckies` | 5.00 | PWID 5/10/25 | — | 9 | **16205** | 15484 | lucky draw + cert |
| `trust_profile` | 19.00 | fixed | `url` | 3 | 8393 | 7672 | 30-day hosted evidence page |
| `certificate_of_patronage` | 20.00 | PWID 20/40/100 | — | 9 | **16739** | 16016 | cert + gilt badge; entitles nothing |
| `the_collab` | 25.00 | PWID 25/50/125 | — (`detail` optional) | 9 | **16763** | 16040 | queued order, 168h, 2/week |
| `commission/25` | 25 | fixed | quote (off-shelf) | 3 | 5922 | 5224 | same class as `the_collab` |
| `commission/50` | 50 | fixed | quote | 3 | 5922 | 5224 | same |
| `commission/100` | 100 | fixed | quote | 3 | 5948 | 5252 | same |
| `commission/250` | 250 | fixed | quote | 3 | 5946 | 5252 | same |
| almanac page | 0.01 | PWID 0.01/0.02/0.05 | — | 9 | **15029** | 14300 | markdown page |

`hdr B` is the response header block. `PR B` is the
`PAYMENT-REQUIRED` value alone (base64). Optional fields
(`agent_name`, `callback_url`, `payer`, `hours`, …) are on
the schema and are not gates.

---

## The constraints

From prompt 1, plus what this fetch added.

| # | Constraint | Threshold | Where it binds | Invisible to us? |
|---|---|---|---|---|
| C1 | `@x402/core` `DEFAULT_MAX_AMOUNT_PER_PAYMENT` | `"$1"` (`<=` on atomic USDC) | buyer `applySpendControls`. Empty `{}` still applies it. | **Yes.** Challenge, no settle. |
| C2 | Node / undici / `@x402/fetch` header parser | **16,384** bytes, request *and* response | client throws while reading the 402 | **Yes.** Challenge already booked. |
| C3 | Required input the agent does not possess | field missing on the *paid* request | `buy.ts` guards, 400, nothing charged | **Half.** The 400 we see. Walking away after the 402 we do not. |
| C4 | Rail missing from the 402 | `acceptedNetworks()` | none today — all three rails on every door | n/a today |
| C5 | Instrument cannot consume the rail they paid on | schema pattern | `settlement_reconciliation` / `attestation_bundle` Base-only; `the_statement` EVM-only | 400 on paid request if they send the wrong shape. Walk-away after 402 is invisible. |
| C6 | PWID silent amputation | cap keeps the `$1` accept, drops tips | `graffiti` only, under default client | **Yes.** Looks like a cheap success. |
| C7 | 300s offer / `maxTimeoutSeconds` | 300 | every accept, every door | Late sign: facilitator reject we may see. They never retry: invisible. |
| C8 | Shutter (keeper presence) | 48h window, closed by default | `the_collab` + commission, **before** the gate (`buy.ts:664`, `:961`) | **503, no 402, no challenge.** Conversion never sees the ask. |
| C9 | Bench capacity / weekly cap | `the_collab` 2/week + queue cap | `capacityCheck` `:697`, 503 before gate | Same as C8. |
| C10 | `wrapFetchWithPayment` pays once | one rail, no walk | buyer machine | Failed settle on Base, Polygon sitting unused. We see one fail, not the skip. |

Prompt 1 defaults that do **not** gate this catalogue today:
default-asset allowlist (USDC is listed), `validAfter: "0"`,
Solana compute budget, CDP JWT 120s, description cap 480
(already truncated), `serviceName` 32 (already the short name),
facilitator 30s timeout (store-side, after they have paid).

nginx's 8 KiB `large_client_header_buffers` is a *request*
buffer. It is not this 402. A buyer behind a proxy that also
caps *upstream response* headers at 8 KiB would fail every
door (smallest PR is 5,224). That configuration is not the
Node default and is not counted as a fail below.

---

## Item × constraint

Legend: **F** = fails. **~** = within 20% of the fail line
(price ≥ $0.80 for C1; header ≥ 13,107 for C2). **A** =
amputation, not a hard fail. **—** = does not apply or
passes with room. C4 is — for every row today.

| id | C1 $1 | C2 16 KiB | C3 unknown input | C5 rail/input | C6 PWID | C8/C9 shutter |
|---|---|---|---|---|---|---|
| `settlement_attestation` | — | — | **F** `tx_hash` | — (Base/Solana/Polygon by shape) | — | — |
| `small_blessing` | — | — | — | — | — | — |
| `settlement_reconciliation` | — | — | **F** `tx_hash` | **F** Base hash only | — | — |
| `the_confession` | — | — | — (they compose it) | — | — | — |
| `attestation_bundle` | — | — | **F** 2–20 hashes | **F** Base only | — | — |
| `the_mandate` | — | — | — (they compose it) | — | — | — |
| `hello` | — | — | — | — | — | — |
| `bitcoin_anchor` | **~** $1 exact | — | — (they hash their bytes) | — | — | — |
| `context_anchor` | **~** $1 exact | — | — (they write it) | — | — | — |
| `passport_refresh` | **~** $1 exact | — | — (they have a URL) | own host refused | — | — |
| `graffiti_on_a_train` | **~** min $1; tips F | **F** 17007 | — (they write a tag) | — | **A** | — |
| `signature_agent_card` | **F** | — | — | own host refused | — | — |
| `the_statement` | **F** | — | — | **F** 0x EVM only, no Solana | — | — |
| `onpage_audit` | **F** | — | — | own host refused | — | — |
| `recurring_patronage` | **F** | — | `pass_id` only on renew | — | — | — |
| `coffees_for_closers` | **F** | — | — (they name the win) | — | — | — |
| `standing_watch` | **F** | — | — | own host refused | — | — |
| `service_audit` | **F** | — | — | own host refused | — | — |
| `conformance_watch` | **F** | — | — | own host refused | — | — |
| `launch_check` | **F** | — | — | own host refused; field spend $0.05 is about *their* till | — | — |
| `luckies` | **F** | **~** 16205 | — | — | A moot (min already F on C1) | — |
| `trust_profile` | **F** | — | — | own host + census-ready | — | — |
| `certificate_of_patronage` | **F** | **F** 16739 | — | — | moot | — |
| `the_collab` | **F** | **F** 16763 | — | — | moot | **F** when away or at 2/week |
| `commission/*` | **F** all four | — | need a quote | — | — | **F** same shutter |
| almanac page | — | **~** 15029 | — | — | **A** | — |

---

## Every item that fails any constraint

**Hard fail for a default `@x402/fetch` Node client** (C1 or C2).
They never send a payment.

- C1 only: `signature_agent_card`, `the_statement`,
  `onpage_audit`, `recurring_patronage`, `coffees_for_closers`,
  `standing_watch`, `service_audit`, `conformance_watch`,
  `launch_check`, `luckies`, `trust_profile`, and commission
  rungs 25 / 50 / 100 / 250.
- C1 and C2: `certificate_of_patronage`, `the_collab`.
- C2 only (cap lets them through): **`graffiti_on_a_train`**.

**Fail C3 — cannot possess the input without a prior settlement.**
The 402 still issues. The paid request without the field is 400.
A cold agent who does not already hold a transaction identifier
cannot complete:

- `settlement_attestation` (`tx_hash`)
- `settlement_reconciliation` (`tx_hash`, and it must be Base)
- `attestation_bundle` (`tx_hashes`, two to twenty Base hashes)

`digest`, `summary`, `url`, `wallet`, `mandate`, `confession`,
`tag`, `win` are facts the agent has or writes. They are
required. They are not unknowable.

**Fail C5 — paid on a rail the instrument will not read.**

- `settlement_reconciliation`: schema is `^0x[0-9a-fA-F]{64}$`
  (`bazaar-discovery.ts:296`). A Solana signature is refused.
  They may have just paid *us* on Solana.
- `attestation_bundle`: Base hashes only (`:322`).
- `the_statement`: `wallet` is a 0x address; `network` is Base
  or Polygon (`:180–190`, `buy.ts:488`). A Solana-only agent
  cannot buy a statement about their paying wallet.

**Fail C8/C9 when the keeper is away or the bench is full.**
`the_collab` and every commission rung. 503, no 402
(`buy.ts:664–715`). `weekly_inventory: 2` (`menu.ts:50`).
Closed by default if no keeper visit is on record
(`shutter.ts:52–55`).

**C6 amputation, not a fail.** `graffiti_on_a_train` under a
default client: `$2` and `$5` vanish, Base `$1` pays. Almanac
pages: `$0.02` and `$0.05` vanish, `$0.01` pays.

---

## Within 20% of failing

**C1.** Fail line is `$1.01`. Within 20% of that line is min
price ≥ $0.80. Four items sit *on* the cap and pass (`<=`):

- `bitcoin_anchor` $1
- `context_anchor` $1
- `passport_refresh` $1
- `graffiti_on_a_train` min $1 (then dies on C2)

No item lives in ($0.80, $1.00). `hello` at $0.50 is half the
cap, not near it.

**C2.** Fail line is 16,384 bytes of response headers. 80% is
13,107.

- **Fail:** `graffiti_on_a_train` 17,007; `the_collab` 16,763;
  `certificate_of_patronage` 16,739.
- **Near:** `luckies` 16,205 (99% of the line);
  almanac page 15,029 (92%).

`PAYMENT-REQUIRED` alone on graffiti is 16,280 — 99.4% of 16
KiB before any other header is counted. One more rail, or a
longer offer, and the single field overflows even if the
runtime counted only that name.

---

## Which failures are invisible to us

The store's published conversion is settles / challenges
(prompt 3). Anything that dies after the 402 and before a
second request is the same number as walk-away.

| Failure | What we see | What we cannot tell apart |
|---|---|---|
| C1 `$1` cap | challenge + 0 | A6 vs closed laptop |
| C2 header overflow | challenge + 0 | same. They may not have parsed the body. |
| C3 walk-away (no `tx_hash`) | challenge + 0 | same |
| C6 PWID amputation | a `$1` graffiti settle | looks healthy. The tip never existed. |
| C7 300s, they never retry | challenge + 0 | same |
| C8/C9 shutter or capacity | **503, no challenge** | worse: conversion never sees the demand. The human-labor door can be closed all week and pulse still reads as "nobody asked." |
| C10 first-rail fail, no walk | one failed settle | not that Polygon/Solana were sitting in the same 402 |

Visible, and already refused before money moves: paid request
missing `tx_hash` / `summary` / `url` / … (400). Own-hostname
refuse (400). Bad digest (400). Those are not silent.

`trust_profile` can also refuse a URL that is not on the ready
side of the census (`bazaar-discovery.ts:176`). That 400 we
see. An agent who reads the 402, cannot tell whether their
door will pass, and walks away, we do not.

---

## Rails, so the column is not a rumour

Every live 402 on 2026-08-25 carried three networks. C4 does
not fail any item today.

What still lies is the *listing*, not the till:
`listingSpec` hard-codes `network: "Base (eip155:8453)"`
(`listing-spec.ts:174`) and `priceText` says "x402, Base"
(`:182–187`). Prompt 6 already caught `menu.json`
`store.chains`. An agent who trusts the spec and not the 402
will believe there is one rail. The 402 will still take their
Solana money.

`launch_check`'s `FIELD_SPEND_CAP_USD = 0.05`
(`launch-check.ts:48`) is a cap on *our* field wallet at
*their* till. It does not block buying `launch_check`. It can
turn their walk into `unpaid_by_rule`. That is a quality of
the goods, not a gate on the purchase.

---

## What a default Node `@x402/fetch` client can actually buy

No `spendControls`, stock Node header limit, no prior
`tx_hash`, keeper present.

**Completes:** `small_blessing`, `the_confession` (if they
bring a sentence), `the_mandate` (if they bring text),
`hello`, `bitcoin_anchor` (if they bring a digest),
`context_anchor` (if they bring a summary),
`passport_refresh` / the url-doors at **$1 only** —
`passport_refresh` is the only url-door at $1; the $2–$19
url-doors die on C1. Almanac pages complete at $0.01 with
tips amputated.

**Gets a 402 and dies in the parser:** `graffiti_on_a_train`.

**Gets a 402 and throws on the cap:** everything ≥ $2, plus
commission.

**Gets a 402 and cannot fill the form:** the three attestation
doors, unless they already hold a hash.

The practice-counter pitch — cheapest no-arg door, real
settlement — is still `small_blessing` at $0.005. The
cheapest door on the shelf is `settlement_attestation` at
$0.004, and a cold agent cannot buy it.

---

## Provenance

Gap-finding prompt 5, 2026-08-25, against live `scvd.store`
and this tree. Twenty-four menu 402s, four commission 402s,
one almanac 402. Prompt 1 for the cap and the other library
defaults. Prompt 2 for why C1/C2/C3-walkaway are the same
published number. Prompt 6 for the listing still saying Base.

Nothing here is a keeper ruling. Re-fetch the 402s before
acting; if offer-receipt is dropped from the header or PWID
accepts are collapsed, the header half of this paper is the
thing that went stale.
