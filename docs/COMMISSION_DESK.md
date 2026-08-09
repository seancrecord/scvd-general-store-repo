# The Commission Desk — spec, for the keeper's decision

**Status:** SPEC. Nothing built. The ranking says "spec before build,"
and this is that. Written against the tree with the tree open, per the
spec checklist's first question.

**What it would do:** retire buy-now for true per-order labor and
replace it with request → quote → agreed price → one-off paid link.

**Why it is Tier 0:** every human-queue item currently takes money at a
fixed price against a fixed 168-hour window, decided before anyone
knows what the work is. The desk kills that exposure at the root. The
bench (shipped 2026-08-09) is the floor underneath it and is not a
substitute — it caps how much unfinished work can be promised, not
whether the promise was priced sanely in the first place.

---

## 1. What already exists, so nobody rebuilds it

Checklist question 1, and the answer is: **more than half the desk is
already in the tree.**

| Piece | State |
|---|---|
| The request door | **BUILT.** `POST /api/request` → `recordCommission()` → `request:<id>` in ORDERS. Takes description, `offer_usdc`, contact, optional claimed identity (stored `identity_verified: false`). |
| The keeper's view | **BUILT.** `requestsHtml()` on the counter page. |
| Order lifecycle | **BUILT.** `OrderRecord`, queue, delivery, `completed_at`, the SLA alert, the refund-window detector. |
| Retirement path for the old items | **BUILT.** `getRetiredItem()` answers 410 with `folded_into` and a buy URL. Certificates issued under a retired item verify forever. |
| Capacity ceiling | **BUILT** (#88). Commissions must count against the same bench. |
| **The quote** | **MISSING.** `CommissionRequest` has no status, no quoted price, no window, no expiry. It is a one-way inbox. |
| **The one-off paid link** | **MISSING**, and it is the hard part. See §3. |

So the desk is: *(exists)* → **quote** → **pay** → *(exists)*.

---

## 2. The six items it would retire

**The note's list of six is stale, and checking beats asking.** All
four of `phone_call`, `human_witness`, `portrait` and `app_gutcheck`
were **retired on 2026-08-05 and folded into `the_collab`** — they are
in `retired.ts`, answering 410 with a pointer, exactly as designed.

So the live human_queue shelf is three items, not six:

| item | price | window | cap |
|---|---|---|---|
| `the_collab` | $25 | 168h | none until #88 |
| `quick_judgment` | $3 | 168h | weekly 5 |
| `the_drawer` | $2 | none | none until #88 |

**That changes the shape of the decision.** The consolidation already
did most of the retiring; `the_collab` is now the single catch-all for
bespoke work and is *precisely* the item a fixed $25 price fits worst,
because four different kinds of job now fold into it.

`quick_judgment` is the other interesting case: at $3 with a stated
"five a week," it is arguably not per-order labor at all — it is a
commodity the keeper priced and rate-limited on purpose.
**Recommendation: the desk replaces `the_collab` and nothing else.**
Making somebody negotiate for a $3 verdict costs more in round trips,
on both sides, than the verdict is worth.

`quick_judgment` is the interesting case: at $3 with a stated "five a
week," it is arguably NOT true per-order labor — it is a commodity the
keeper has priced and rate-limited deliberately. **Recommendation: keep
`quick_judgment` on buy-now and retire only the genuinely bespoke
work.** A desk that makes somebody negotiate for a $3 verdict costs
more in round trips than the verdict is worth, on both sides.

---

## 3. The hard part: a one-off price does not fit the payment stack

**This is the finding that makes the spec worth writing.**

`getPaymentStack()` builds a static `RoutesConfig` once, at
construction: `routes["GET /api/buy/<id>"] = buyRouteConfig(item, env)`,
and `accepts` inside it is computed from `priceTiersUsdc(item)` — a
value, not a function of the request. Almanac pages and Gazette issues
get *pattern* routes (`GET /almanac/:slug`), but every one of them is
**the same penny price**. Nothing in the tree prices a route per
request.

So "agreed price" cannot simply become a 402 for an arbitrary number.
Three ways out, ranked:

**(a) PUBLISHED RUNGS — recommended.** A small fixed ladder of
commission prices, each its own static route:
`/api/commission/pay/25`, `/50`, `/100`, `/250`. The quote names a rung
and carries the commission id as a query parameter. The gate is
untouched, discovery works, and the rungs are public — which is better
manners than a bespoke number quoted in private, and it makes the desk
legible to an agent that wants to know the range before writing in.
Cost: the keeper quotes to the nearest rung.

**(b) A DYNAMIC-PRICE ROUTE.** Teach the stack to compute `accepts`
per request from the stored quote. Genuinely more correct and a real
change to the payment spine — the one part of this store where a bug
takes money incorrectly. Not first.

**(c) OFF-PROTOCOL INVOICE.** A plain address and an amount, reconciled
by the chain-reconciliation walk. Loses the x402 flow, the certificate,
and the whole point. **No.**

**Recommendation: (a) now, (b) only if the rungs visibly bind.**

---

## 4. Lifecycle

```
requested → quoted → accepted (paid) → in_progress → delivered
     └──────→ declined                └→ expired
```

Every transition is the keeper's hand except `accepted` (the buyer
paying) and `expired` (a clock). Rule 30: no agent prices anything.

New fields on `CommissionRequest`, all optional so existing rows stay
valid:

- `status` — absent means `requested`, so no migration.
- `quote_usdc`, `quote_window_hours`, `quoted_at` — the keeper's terms.
- `quote_expires_at` — **required whenever a quote is set.** A quote
  with no expiry binds the store to a price forever, and the keeper
  will not remember.
- `pay_url` — the rung plus `?commission=<id>`.
- `order_id` — set on payment, joining the desk to the machinery that
  already delivers and already gets audited for missed windows.

**The window is per-quote, not global.** That is most of the point: a
168-hour promise on unknown work is the thing being retired.

---

## 5. Against the nine-point checklist

1. **Already built under another name?** Half of it. §1.
2. **Invents a namespace?** No. No new artifact class needed either —
   the deliverable is an ordinary order and an ordinary certificate.
3. **Signs anything the buyer supplied?** The description and the
   requester's `offer_usdc` are buyer text and are already stored
   unverified. **The certificate must bind the KEEPER'S quote, never
   the requester's offer.** Naming the buyer's own number on a signed
   artifact is the referral-certificate defect again.
4. **`does_not_prove`?** N/A — no new signed class.
5. **Observation-shaped or warranty-shaped?** The quote is an offer to
   do work, not a verdict about anybody. Fine.
6. **Assumes infrastructure we do not have?** **YES, and this is the
   blocker** — see §3. Everything else is KV.
7. **What does one unit cost us?** The keeper's hours, which is the
   whole reason for the desk. The desk itself costs one KV write per
   transition.
8. **Does it spend money?** No. It *takes* money, which is the gate,
   not the wallet law.
9. **Attack surface?** No URL fetching. Two real ones: **quote
   forgery** (the pay route must read the quote from KV, never from a
   query parameter — a `?price=1` that the gate honours would be the
   whole store's worst bug) and **double payment** on one commission
   (the pay route must refuse a commission already `accepted`; the
   existing idempotency key is per-surface and does not cover this).

**The filter question — will this still be valuable after the
individual receipt is forgotten?** Honestly, **no.** The desk creates
no new class of signed observation; it is operational hygiene that
removes a liability. That is a fine reason to build it and a bad reason
to rank it against index work — which is exactly why the doc files it
under debts rather than features.

---

## 6. What the keeper has to decide

1. **The item list.** Three live, not six — the other four folded into
   `the_collab` on 2026-08-05. (Recommendation: the desk replaces
   `the_collab` alone. `quick_judgment` and `the_drawer` are priced
   commodities the bench now caps, and are not worth a negotiation.)
2. **The rungs.** What price ladder? (A starting suggestion, entirely
   his to overrule: 25 / 50 / 100 / 250.)
3. **Quote expiry default.** (Suggestion: 14 days.)
4. **Whether a declined request gets a reply**, and whether that reply
   is public. The store publishes its corrections; it has never
   published its refusals, and there is a real argument either way.

---

## 7. Interim risk, stated plainly

Until this is built, standing SLA exposure is capped by three things
that all now exist: the 48-hour presence window, the bench's open-queue
ceiling (#88), and the refund-window detector (#81) that finds a missed
promise and names what is owed.

That is detection plus a ceiling, not prevention. **The uncapped
failure the desk removes is pricing bespoke work at a fixed number
before anyone knows what it is** — and no gate can fix that, because
the mistake is made at listing time, not at purchase time.
