# STATUS.md — where the store actually is

Written 2026-07-28 to get everyone current across platforms: the
keeper, CV, and whatever instance reads this next. Reconciled against
PROJECT_LOG, TASKS.md, GROWTH_TASKS.md and DEMAND_SYNTHESIS Part 7.

Anything stated here is checkable in the repo. Where a number is soft,
it says so.

---

## THE ONE NUMBER

**Zero organic settlements. Zero non-house payment signatures until
2026-07-28, when there was one client and it bounced three times.**

Seven days old. ~4,700+ organic 402s issued, one paying wallet on the
books and it is the house. That is not a conversion problem; it is an
early market. The framing that holds, and that CV independently
arrived at from the floor: *five days of infrastructure and zero
organic settles isn't a flaw in the build, it's just early.*

Read it before reaching for a fix that isn't broken.

**What DID change, 2026-07-29: the flow is proven from outside.** CV's
independently written client settled — `small_blessing`, $0.005,
patron #26, `cert_bhk7ytsnvf`. House-flagged by wallet, correctly, and
the First Dollar frame is still empty, which is how we know. That is
not a sale and it is not a customer. It is the first evidence that a
client nobody here wrote can go challenge → sign → settle → certificate
against this store, and it took six declines and four instrument fixes
to get there. Every one of those declines was ours to explain and we
couldn't, which is the finding.

---

## WHAT SHIPPED (2026-07-26 → 2026-07-28)

### The instruments — how we know anything

| Surface | What it answers |
|---|---|
| `/admin` | the desk: month at a glance, sources, the item ledger |
| `/admin/declines` | **who opened a wallet here and was turned away, and why** |
| `/admin/census` | who ever presented a signature, against who only read the price |
| `/admin/recount` | the counters audited against the raw rows |
| `/admin/bell`, `/admin/digest` | the bell ledger, the compiled digest |

- **The decline desk** — built after the first real buyer bounced. The
  reasons had been recorded since the instrument went in and *nothing
  rendered them*. Leads with the facilitator's string verbatim; our
  reading sits beside it labelled as a reading.
- **The census + walk detector** — a "client" is a user-agent string
  (no cookies, no IPs), so it is a shape, not a headcount. The walk
  detector catches indexers by behaviour: 4+ distinct items inside 60
  seconds is not shopping.
- **The reconciliation** — settle counters against payer rows. The
  long-standing off-by-one was the founding settle, which predates the
  instrument. Not a bug. But chasing it found a real gap: settles with
  no payer address were invisible. Now counted.
- **Reason persistence** — decline reasons used to be joined by
  payment nonce, which silently lost the reason exactly when a client
  signed for the wrong network. Now carried on the request itself.
- **An alarm on any outside decline.** It was the rarest event the
  store can have and the only one with nothing watching it.
- **The domain trap, written down** at `/try#hand-rolling`. USDC's
  EIP-712 domain name is `USD Coin` on Base mainnet and `USDC` on Base
  Sepolia, so a client built on testnet and pointed at mainnet signs
  authorizations invalid everywhere, silently. It fits the bounce. It
  cannot be accepted by anyone — the USDC contract checks its own
  domain — so saying it is the whole fix. A declined 402 now carries
  the full block; an ordinary one carries a link.

### The shelf — 23 items

New this week:

- **`settlement_attestation`** ($0.004) — Move 1. An independent,
  stateless, signed observation of whether an x402 payment settled on
  Base. One RPC read, no poll, no retry, nobody looked. Specified back
  at us by an outside security paper (arXiv:2605.11781).
- **`graffiti_on_a_train`** ($1 PWID) — a tag on a signed certificate,
  and a public wall at `/train`. The buyer pays for **persistence, not
  placement**: a tag the keeper doesn't put up keeps its certificate.

### Trust and discovery

- **Trust list v1** at `/trust-list.json` — signed. One paid entry (us)
  and three unpaid `relation: used` neighbours. The paid-transaction
  gate holds until a stranger buys something.
- **The Town Directory** — every listing has its own page now, so a
  neighbour has something to point at.
- **The naming law** — three name strings, one job each, pinned in
  PROJECT_LOG and enforced by test across seven surfaces.
- **Freshness** — every machine surface now carries `as_of` and
  `checked_at` as separate facts. Nothing was dated before.
- **The cadence** — every free response with a clock carries
  `next_at`, so a scheduled agent can plan around us.

### Corrections we made in the open

- **"Refunds are automatic"** was live on every surface for five days
  and the code never did it. Caught by an outside model repeating it
  back to us. A rule in a file is not a test.
- **The probe rule** — parameter guards fired before the payment gate,
  so indexers got a 400 and concluded we weren't an x402 endpoint.
- **"The decline reasons are on the desk"** — there was no desk.
- **The orphaned office** — five admin pages had no link back.

---

## WHERE WE ARE ON THE ORIGINAL PLAN

**GROWTH_TASKS Track A (be findable):** A1 closed, A3 shipped and
expanded, A4 shipped. **A2 (MCP registry submissions) is the one
still open** — `/mcp` exists and is unlisted where operators browse.

**Track B (Show HN, operator relationships):** keeper-only, and it was
gated on the trust list existing. **It exists now.**

**Track C (CV):** live, holds his own instructions, two field notes
filed. Bell ring #7 was his.

**DEMAND_SYNTHESIS Part 7:** Move 1 shipped. Move 2 (trust list)
shipped and expanded ahead of its gate, deliberately, with the paid
claim still gated.

---

## WHAT'S OPEN

### Needs the keeper

- **The approval-prompt artifact** — Part 5 named this the
  highest-leverage under-built thing. The moment of maximum value is
  when a human sees "your agent wants to spend $X."
- **Provenance marking** — the maker's mark. KEEPER'S HAND vs the
  store's. Called the strongest unbuilt idea in the partnership doc.
- **Co-ownership stated once**, plainly, on `/what` and `llms.txt`.
- **The visitors' register**, the Show HN, the "you're early if you're
  here now" ruling.
- *(Nothing outstanding on hosting — Cloudflare is on Workers Paid.)*

### Partner-side, no keeper input needed

1. ~~Thin the infrastructure writes~~ — **DONE 2026-07-28.** A crawler
   402 went from three KV writes to one. Cloudflare is on Workers
   Paid, so this was headroom rather than a rescue.
2. **Seven items are invisible** on the only surface sending traffic.
3. ~~The registrar's round~~ — **ON SHIFT 2026-07-28.** Confirms on
   every tick that our own published artifacts still resolve and
   verify, and that the advertised key has not drifted. Read-only: it
   reports and never repairs.
4. **MCP tools as Bazaar MCP resources** — the only path that flips a
   catalog's "input schema" column for us.

### Standing dates

- **~2026-08-27** — Move 1 kill criteria. Near-zero calls parks it.
- **~2026-09-20** — the 60-day line. Zero organic settles *and* zero
  non-house signatures means "the market isn't here yet": hold at
  $5/month and stop building.

---

## HOUSE DISCIPLINE, FOR ANYONE JOINING

Four rules that keep being the ones that matter:

1. **A rule in a file is not a test. Write the test.** Every claim the
   store makes is walked by CI now because of the refund incident.
2. **The books only tell you what the store did to itself.** Everything
   else needs an outside witness.
3. **Say what a thing is NOT.** The store's worst failures have all
   been careful-but-silent: right refusals in the wrong order, true
   promises published in an uncheckable form.
4. **No engagement mechanics.** Rule 22. The clock exists so visitors
   can plan around us, not so we can pull them back.

---

*Reconciled 2026-07-28. 323 tests green. The task list was drifting —
six entries that had shipped were still unchecked, and are corrected
in the same pass as this file. Cloudflare is on Workers Paid; every
stale free-tier note in the repo was corrected too, because it had
been re-raised more than once off notes that were out of date.*
