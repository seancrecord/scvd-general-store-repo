# The failure modes we have no instrument for

**Dated 2026-08-25.** The meta-prompt of the gap-finding series.
Everything above is six readings of installed code and live
fetches. This paper does not find a seventh mechanism. It asks
which of those mechanisms can run all day, cost money or
credibility, and still print as ordinary operation.

**What this is.** Prompt 7. Ranked blind spots. For each: the
mechanism, why it is invisible today, the cheapest counter that
would make it visible, and whether the published numbers look
**better** or **worse** than the truth. That last column is the
sort. A hole that flatters us is the one to fix first. We sell
the argument that unfalsifiable numbers are the problem.

**What this is not.** A ruling. A fix. A claim that the till is
silent — it is not. `recordChallengeIssued`,
`recordPaymentDecline`, `recordSettlement`, `recordVerifyCall`,
the delivery audit, the chain walks, `books_invariant`, and
`catalog_stale` all page or publish. This list is what those
instruments cannot see, or what they publish under a name that
hides the mechanism.

**Rule of the reading.** Every mode is one that prompts 1–6
already named with a file:line or a live fetch. If a defence
already exists, it is named. Absence in the files opened for
those papers is not claimed as absence here without a writer.

---

## The finding that is the point of the paper

We already measure the two ends of a purchase: a 402 went out,
a payment came back. Everything that dies *between* those two
requests — and everything that dies *before* the 402 — prints
as the same two healthy states we already know how to read:
abandonment, or nobody asked.

The holes that make the **published** figures look better than
the truth are not the `$1` cap. The cap makes conversion look
worse (challenges with no settle). The holes that flatter are:

1. demand that never becomes a challenge (shutter / capacity
   503),
2. an `agree` that only joins item ids,
3. a `corrected_conversion_rate` that only strips crawlers,
4. a freshness stamp that does not watch the shelf,
5. a rail split that cannot tell preference from `accepts[0]`,
6. a trust list whose `confirmed` dates are typed by hand.

Those are the ones that let us publish a coherent, fresh,
multi-rail, already-corrected store while the client, the
listings, and the human-labor door say otherwise.

---

## What already has an instrument

So the list below is not "we measure nothing."

| Event | Instrument | What it cannot see |
|---|---|---|
| 402 issued | `recordChallengeIssued` (`metrics.ts:184`), pulse `organic_challenges` | *Why* no second request followed |
| Payment header presented and refused | `recordPaymentDecline` (`metrics.ts:336`) + `payment_declined` alert | Any abort that never sent a header |
| Payment settled | `recordSettlement` (`metrics.ts:591`) | Tips that were offered and not selected |
| Artifact re-checked | `recordVerifyCall` → pulse `organic_verifies` | The facilitator verify step (prompt 3) |
| Settled, no goods | `undelivered_sale` (`delivery-audit.ts`) | A 402 that never settled |
| Chain inflow ≠ books | hourly walk + `books_invariant` | Client-side aborts (no chain, no book) |
| Catalog date > 30 days | `catalog_stale` (`health.ts:87`) | A date that did not move because `catalogLastUpdated()` does not read the menu |
| Own catalogs' item ids | self-row CI (`src/discovery/self-row.ts`) | Prices, rails, names, dates, third parties (prompt 6) |

`payment-gate.ts:652–653` already names the monthly gap as
"budget-cap / abandonment." It does not split them. That
comment is the instrument we have for the largest money hole:
a sentence.

---

## Ranked. Last column first.

**Better** = the number we publish is more flattering than the
underlying fact. **Worse** = the number is harsher than the
fact. **Name** = the published name implies a fact the writer
does not count; the direction depends on the reader.

Within **Better**, order is credibility first, then money.
Credibility is the product.

### Better than the truth — fix these first

#### 1. `corrected_conversion_rate` looks like the correction

| | |
|---|---|
| **Published numbers vs truth** | **Better.** The field name says the noise has been removed. Only crawler rows have. |
| **Mechanism** | Pulse publishes `corrected_challenges` = recorded organic 402s minus `known_machinery` when that walk finished (`pulse.ts:237`). `corrected_conversion_rate` is settles over that smaller denominator (`:242–245`). Client aborts (prompt 2 A2–A6, prompt 5 C2 header overflow, C3 walk-away) stay in the denominator. They are not machinery. |
| **Why invisible** | The uncorrected rate is also published, beside it. A reader who takes the word `corrected` has been handed a floor dressed as a cleaned rate. `all_time` does not even compute the corrected rate (`:302–314`). |
| **Cheapest check** | Rename, or publish a third denominator: challenges that later presented a payment header (declines + settles). That is "someone opened a wallet." Everything else is 402-then-silence. One ratio, two existing counters. |
| **Cost right now** | Credibility of the pulse — the surface that exists to stop a flattering funnel. Money: none directly. |

#### 2. Shutter and bench 503 never enter the funnel

| | |
|---|---|
| **Published numbers vs truth** | **Better.** Human-labor demand is excluded from `organic_challenges`. Conversion is only among people who were allowed to see a price. |
| **Mechanism** | `shutterCheck` and `capacityCheck` (`buy.ts:664–715`) run *before* `paymentGate` (`:1006`). Keeper away, or `the_collab` at 2/week / queue full → **503, no 402, no challenge.** Closed by default if no visit is on record (`shutter.ts:52–55`). Commission rungs share the shutter (`commission.ts:145`). |
| **Why invisible** | Pulse conversion is settles / challenges (prompt 3). A week of 503s does not move either number. Looks like nobody asked. Prompt 5 named this; nothing increments a `refused:shutter` key. |
| **Cheapest check** | One counter, same shape as `402`: `metric:<month>:503s:<item>` (or `refused:shutter` / `refused:capacity`). Publish next to challenges. The 503 body already exists. |
| **Cost right now** | If the keeper has been away, `the_collab` demand is uncounted. Conversion and "the shelf is quiet" both flatter. Money: the lost sales are real; the books never heard the knock. |

#### 3. Self-row `agree` is sold as "the surfaces agree"

| | |
|---|---|
| **Published numbers vs truth** | **Better.** The observatory's own first subject reports agreement. The join is item ids (prompt 6). |
| **Mechanism** | `selfRowFromCatalogs` (`src/discovery/self-row.ts:32`) extracts `route_identity` and `service_identity` (`claims.ts`). CI blocks release on a non-empty only-left / only-right. Live 2026-08-25: twenty-four ids match. `menu.json` `store.chains` is still `["base","solana"]`. Translations omit Polygon. `/skill.md` H1 is the long name. `as_of` is not the shelf. Third-party listings sell retired SKUs. |
| **Why invisible** | `freshness-coherence.ts` and `capability-claims.ts` exist on this branch and are not the live fold. Production `discovery_coherence` pointed at us that says `agree` is true and incomplete. We sell "everyone validates each surface alone; we validate whether they agree." |
| **Cheapest check** | Turn on the batteries already written: join `acceptedNetworks()` against every `chains` / `network` / translation; join `as_of` against `MENU_ITEMS` dates. Fail CI on `store.chains` ≠ live rails. No new fetcher. |
| **Cost right now** | The product. An outside analyst who reads our agree-stamp and then Glama is entitled to conclude the stamp is decorative. |

#### 4. `trust.json` `confirmed` is a typed date, not a fetch

| | |
|---|---|
| **Published numbers vs truth** | **Better.** The diligence document still carries grades and descriptions a live fetch on 2026-08-25 contradicted (prompt 6): x402-list `DEGRADED` / 15 endpoints / $0.004–$19; Glama still selling fortunes and a $50 app review; Bazaar identity = `small_blessing`; m8ven "18 tools" vs `tools/list` of 10. |
| **Mechanism** | `EXTERNAL_RECORDS` (`trust-signals.ts:79–297`). `confirmed` is ISO of a person opening a tab. The Worker cannot reach those hosts (`:75–76`). No cron. `catalog_stale` does not walk this list. |
| **Why invisible** | The document that exists to be checked is the one that cannot check its own citations. A reader of `trust.json` alone sees A / 14 of 14 / "probes the paid routes itself." |
| **Cheapest check** | Keeper-side: a weekly script that fetches each `url` and diffs title, endpoint count, tool count, price band against `menu.json`. Fail or rewrite `confirmed`. Do not put the fetch in the Worker if the environment still cannot reach out. One file, one cron, the list you already typed. |
| **Cost right now** | Credibility of the one machine document a diligence pass reads first. |

#### 5. `as_of` does not watch the shelf

| | |
|---|---|
| **Published numbers vs truth** | **Better.** `as_of` / sitemap `lastmod` / llms "Last checked by hand" all read `catalogLastUpdated()` (`freshness.ts:48`), which is the newest of directory / trust-list / almanac dates. A new SKU does not bump it. `catalog_stale` watches that same date (`health.ts:87`). |
| **Why invisible** | The freshness guard can stay quiet while the menu moved. The stamp looks like a check of the catalogue. Prompt 6. |
| **Cheapest check** | Add `MENU_ITEMS[].listed_week` (or a single `SHELF_AS_OF` derived from the aisle files' dates) to `latestOf`. The function already exists. |
| **Cost right now** | Agents cache an old shelf with a current-looking date. We look maintained. |

#### 6. `/rails` cannot tell preference from the default selector

| | |
|---|---|
| **Published numbers vs truth** | **Better** for the three-rail story, if almost all volume is Base. The chart is true of *where money landed*. It reads as *where buyers chose*. |
| **Mechanism** | Unmodified `@x402/fetch` README registers Base only (prompt 2 F1). After spend controls, `accepts[0]` (prompt 1 #3). We put Base minimum first on purpose (`payments.ts:290–301`). Settles write `organic_by_rail` (`stats.ts:271`). `/rails` draws those integers (`rails.ts:20–24`). |
| **Why invisible** | There is no counter for "accepts offered vs accept selected" and no counter for "client registered only one network." A 100% Base split is observationally identical to "nobody wanted Polygon." |
| **Cheapest check** | On settle, we already know the rail. Publish, next to the chart, the one sentence that is already in `railAccepts`: default clients are steered here. Optional: a canary that registers only Solana and buys `hello` — if that settle is rare in the wild, the chart is the default, not the market. |
| **Cost right now** | We claim three rails in every briefing. The published split cannot falsify "only Base is real." |

#### 7. PWID amputation looks like a completed sale

| | |
|---|---|
| **Published numbers vs truth** | **Better** for that SKU's conversion; **worse** for revenue vs the offer. A `$1` graffiti settle is a success. The `$2` and `$5` accepts never happened (prompt 1, prompt 5 C6). Almanac `$0.01` same shape. |
| **Why invisible** | `recordSettlement` records what was paid, not what was dropped. No `tip_left_on_table`. Looks like the buyer chose the floor. |
| **Cheapest check** | When `priceTiersUsdc(item).length > 1` and `paid_usdc === min`, bump `pwid_floor:<item>`. Compare to that item's settles. If floor-rate is ~100% on graffiti, the cap (or the selector) is the shopper. |
| **Cost right now** | Tips on the one PWID door a default client can still pay. Small dollars; the mechanism is the same one that kills luckies / collab / certificate entirely. |

---

### Name traps — direction depends on the reader

#### 8. `organic_verifies` next to `organic_settled`

| | |
|---|---|
| **Published numbers vs truth** | **Name.** The JSON field does not say "re-verify." The HTML twin does (`pulse.ts` header). Five reports built a verify → settle cliff from the JSON (prompt 3). That made *settle* look broken (worse). A reader who takes the name as "we are in the payment path" is flattered. |
| **Mechanism** | `recordVerifyCall` on free `/api/verify` and MCP `verify_artifact` (`metrics.ts:483`). Not facilitator verify. |
| **Why invisible** | The writer is correct and documented in the pulse `note`. The field name is the trap. Pairing it with `organic_settled` on the same object invites the divide. |
| **Cheapest check** | Rename the JSON key to `organic_rechecks` (or ship `organic_verifies` as an alias that dies). The HTML already did the honest job. |
| **Cost right now** | Every outside funnel that cites us. We have already watched this one travel. |

**Done, 2026-08-27 (task #53):** the key is `organic_rechecks`, the
pulse `note` carries the dated naming correction, and the middle the
five reports were reaching for exists now — `organic_payments_presented`,
derived as settled + declined from counters that already ran, with
zero new writes on the paid path. `test/pulse.spec.ts` holds all of it.

---

### Worse than the truth — still real money, already making us look unwanted

These crush `conversion_rate`. They cost sales. They do **not**
flatter the pulse. They are second because a harsh number we
cannot explain is still a number we can stand next to. A kind
number we cannot defend is the thing we said we would not sell.

#### 9. Client abort after 402, no payment header (A2–A6, C2)

| | |
|---|---|
| **Published numbers vs truth** | **Worse.** Each abort is a challenge and not a settle. Conversion is a floor that mixes "will not pay $5" with "cannot parse the header" with "closed the laptop." |
| **Mechanism** | Prompt 2's table, in force: spend cap empties accepts (A6) — thirteen menu ids + every commission rung (prompt 1, 5). Node 16 KiB header parser throws on `graffiti_on_a_train` (17,007 bytes), `the_collab`, `certificate_of_patronage` (prompt 5). Parse failure (A2) if `PAYMENT-REQUIRED` is truncated. No `PAYMENT-SIGNATURE` → no `recordPaymentDecline` (`payment-gate.ts:658–661`). |
| **Why invisible** | The first GET always. The comment at `payment-gate.ts:652–653` is the only split, and it is prose. Per-item `402` counters exist in KV (`metrics.ts:213`) and are not on `/pulse.json`. Admin can see graffiti 402 ≫ settle and still not know header from cap from walk-away. |
| **Cheapest check** | Two cheap things, in order. (1) Publish per-item `402` / `paid` on pulse or `/stats` — the keys already exist. A `$1` door with header > 16 KiB and a 0% paid rate is not abandonment. (2) A house canary: unmodified `@x402/fetch`, default spend cap, `GET /api/buy/graffiti_on_a_train` and `GET /api/buy/standing_watch`. Alert if the client throws before a second request. That is A6 and C2, named, on a cron. |
| **Cost right now** | Every default-client attempt on the thirteen over-$1 doors, and every Node client that hits graffiti. Looks like a quiet shop. |

#### 10. Required `tx_hash` the cold agent does not have (C3)

| | |
|---|---|
| **Published numbers vs truth** | **Worse** if they 402 and leave (challenge, no settle). **Neutral** if they 400 on the paid request — we see the decline. |
| **Mechanism** | `settlement_attestation` / `settlement_reconciliation` / `attestation_bundle` require a prior identifier (`bazaar-discovery.ts:292, 314, 327`). Probe rule still 402s (`buy.ts:148`). Cheapest item on the shelf is the one a new agent cannot fill. |
| **Why invisible** | Same bucket as A6. `attest_this_purchase` on a *later* response is the workaround for people who already bought something else. |
| **Cheapest check** | Count 402s on those three ids that had no `tx_hash` query (the price-ask). Publish as `asked_price_without_input`. The URL is already on the request. |
| **Cost right now** | The floor SKU's conversion looks like a failed practice door. |

#### 11. Third-party catalogs selling a store we do not run

| | |
|---|---|
| **Published numbers vs truth** | **Worse** when an agent fetches *them* (retired SKUs, `thing`, 18 tools, Base-only). **Better** when they fetch only `trust.json` (mode 4). |
| **Mechanism** | Prompt 6 live fetch. No store-side crawl. Agents that pay `daily_fortune` or `buy_small_blessing` never reach a 402 we understand, or they 404. |
| **Why invisible** | Those failures happen on someone else's host, or as a 404 that is not a challenge on a live id. |
| **Cheapest check** | Same weekly script as mode 4. Plus: log 404s on `/api/buy/*` for ids not on `MENU_ITEMS`. A bump on `retired_id:<name>` is the directory lag, arriving. |
| **Cost right now** | Inbound from Glama / x402scan / Bazaar. We look discontinued. |

---

## Sort, compressed

| # | Mode | Looks | What it costs while looking normal |
|---|---|---|---|
| 1 | `corrected_conversion_rate` is only crawlers | Better | The pulse's own honesty |
| 2 | 503 shutter/capacity | Better | Uncounted `the_collab` / commission demand |
| 3 | Self-row `agree` = ids only | Better | The observatory claim |
| 4 | `trust.json` `confirmed` | Better | Diligence document vs live listings |
| 5 | `as_of` ignores the menu | Better | Cached stale shelf, current stamp |
| 6 | `/rails` = default selector | Better | Three-rail claim unfalsifiable |
| 7 | PWID floor-only settles | Better (rate) | Lost tips on graffiti / almanac |
| 8 | `organic_verifies` name | Name | The five-report funnel, again |
| 9 | Cap / header / parse, no 2nd request | Worse | Thirteen ids + graffiti + commission, as "abandonment" |
| 10 | Cold agent, no `tx_hash` | Worse | Cheapest SKU looks dead |
| 11 | Stale third-party SKUs | Worse out there | 404s and wrong tools, off our books |

---

## What this series cannot see either

Stated so the paper does not pretend to close the set.

- **Whether default `@x402/fetch` is most of inbound.** The cap
  and the header only cost what that client mix costs. We have
  User-Agents on organic events (`metrics.ts` event rows) and
  have not published a split of `x402` / `@x402/fetch` /
  hand-roll. Cheap: group organic 402 User-Agents. Still not
  the spend-cap throw — the UA of a client that *would* have
  thrown.
- **Facilitator-side rate limits and spend caps.** Prompt 1
  looked; they are not in this install.
- **How many 503s already happened this week.** No counter.
- **How many Node clients died on 17 KiB.** No canary.

---

## Provenance

Gap-finding prompt 7, 2026-08-25, last. Papers 1–6:

`docs/SILENT_DEFAULTS_2026-08.md`,
`docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md`,
`docs/LIBRARY_VS_STORE_2026-08.md`,
`docs/CATALOGUE_CONSTRAINTS_2026-08.md`,
`docs/DISCOVERY_SURFACES_2026-08.md`.

Nothing here is a keeper ruling. The cheapest checks are named
so the next session does not have to invent a programme. If
`corrected_conversion_rate` has been renamed and shutter 503s
increment a public counter, rows 1 and 2 are the ones that
went stale.
