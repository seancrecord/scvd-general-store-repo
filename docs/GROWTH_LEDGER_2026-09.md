# The growth ledger — plan, and what shipped against it

Written 2026-09-11 against HEAD of `claude/modest-brown-q0x5zx`. The
keeper's question: the office has monthly metrics, but is anyone
tracking GROWTH — across the free tools, the pages, the doors agents
arrive by, the settlements — month against month, in one place? And
the sharper version of it: the store's sales funnel starts at the free
instruments, so which free tools are being used, by whom, and does
that use lead anywhere?

## What already exists (read before building)

Nearly everything is counted, and counted by month, since the store
opened in 2026-07. The counters live under `metric:<YYYY-MM>:<kind>:…`
in COUNTERS and never expire; only the raw `evt:` rows expire at 90
days (`src/lib/metrics.ts`).

| Question | Counted? | Where it is read today |
|---|---|---|
| Visits per page / endpoint, organic beside house and crawler | Yes, ~110 named surfaces plus every item page (`src/lib/porch-surface.ts`) | `/observatory`, `/admin` porch table |
| Free tool calls, per tool, per month | Yes, every MCP tool and every HTTP instrument has a surface | `/admin/instruments` |
| Which MCP clients knock | Yes, `clientInfo.name` census since 2026-08-29 (`src/services/mcp-clients.ts`) | `/admin` |
| Channel a request arrived by (mcp / bazaar / skill / webmcp / direct) | Yes, on every 402 and every porch visit | `/admin` sources table |
| 402s, settles, declines, re-checks, revenue, rail, per item | Yes | `/admin`, `/pulse`, `/rails` |
| The x402 market itself: doors listed, probed, payable, defects | Yes, off the signed weekly corpus | `/corpus/month` |
| Referrer hosts | Only off the 90-day event rows | `/admin/referrals`, `/admin/instruments` |
| Bell rings | One lifetime count | storefront, `/admin/bell` |
| Unique visitors | No, by design: no cookies, no IPs | — |

What is NOT here, and this plan does not build: npm downloads, GitHub
stars, skill installs (the keeper tracks these by hand and said not
to aggregate them), and human-browser analytics (Cloudflare Web
Analytics already covers the browser layer). Analytics Engine stays
rung 3 on the roadmap; this is bookkeeping over counters that exist.

## The gaps this plan closes

1. **No single growth view.** `/admin` shows this month and all-time.
   Month against month lives on three other pages, and none of them
   puts porch, tools, clients, settlements and revenue side by side.
2. **Nothing says what is NEW.** A surface or tool that started
   drawing use this month is indistinguishable from one that always
   did. Demand for a new feature has to be noticed by memory.
3. **Referrers have no monthly counter.** They are derived from event
   rows that expire at 90 days, so referrer history disappears.
4. **The bell has no monthly count.** One lifetime number; the porch's
   `bell` surface counts attempts, not rings.
5. **Nothing is LOGGED.** Every figure is derived at request. The
   reclassification walk moves asks between organic and house after
   the fact, which is right, but it means last month's reading is not
   frozen anywhere.

## The build, in order

### 1. Two counters that were missing

- `metric:<month>:bell:rings` — bumped in `ringBell` on a ring that
  counted, never on a refused repeat. `src/services/bell.ts`.
- `metric:<month>:refhost:census` — one key per month holding a
  capped map of referring HOSTS (never paths), written from
  `recordPorchVisit` for organic visits whose referrer is not our own
  host. Bounded exactly as the MCP client census is: past the cap,
  `other` takes the count rather than dropping it. A stranger's
  Referer is a stranger's string, so a per-host KEY would let anyone
  mint counters; the map inside one key cannot.
  `src/lib/referrer-census.ts` (lib, because `lib/metrics.ts` calls it
  and lib does not import services).

### 2. One derivation: `src/services/growth.ts`

`computeGrowth(env, now)` reads every month since opening in one wave
and returns `GrowthLedger { months: GrowthMonth[] }`, newest first.
Each month carries five blocks, every one a count with its
denominator beside it:

- **store** — organic visits (and by surface kind: storefront,
  instrument, door, evidence, room), organic 402s, settles, revenue
  USDC, settles by rail, declines, re-checks, settles per hundred
  402s, bell rings, guestbook writes, bounty claims paid.
- **agents** — MCP handshakes, tools/list reads, tool calls, distinct
  MCP clients and the top of the census, organic visits and 402s by
  channel, re-checks by artifact age (the `verifyage` buckets, which
  nothing read until now), referring hosts, known machinery off the
  reclassification walk.
- **free_instruments** — the free roster off `src/services/instruments.ts`
  (never retyped here): total, argument-carrying uses, reads, per
  instrument with per-day; and the funnel as three counts in a row —
  argument-carrying free uses, organic 402s, organic settles — with
  402s and settles per hundred free uses stated as ratios of counts,
  NOT a joined journey (no identity to join on).
- **demand** — surfaces with organic use this month and none in any
  earlier month (new), the largest rises and falls against the month
  before, and the paid items most asked for.
- **x402_economy** — the closing reading off `/corpus/month` for the
  month (listed, probed, payable, not payable, unreachable), rounds
  in the month, the top defects. Null when the chain has no week in
  that month; null is not zero and the page says so.

Floors ride with the row: the ledger and porch scans say when they
hit their cap; the porch write cap is quoted from the counter.

### 3. The page: `/admin/growth`, and `/admin/growth.json`

A reading in the nav ("Growth"), months as columns, newest first, one
table per block. Same shape at `.json` for a spreadsheet or a script.
The free-instrument table is the funnel's top and is placed first.

### 4. The log: `growth_log:<month>`

The hourly cron writes the closed month's `GrowthMonth` once, the
first firing after the month ends, and never overwrites it. The page
marks a logged month and, where the live reading has since moved
(the reclassification walk, a late reconciliation), prints both. The
live figure is the book; the log is what the book said at close.

### 5. Tests — `test/growth.spec.ts`

The bell counter moves on a ring and not on a refused repeat; the
referrer census records an outside host, ignores our own, keeps the
host and never the path, and caps to `other`; the derivation finds a new surface only
when no earlier month had it; the funnel's three counts come off the
counters they name; the page and the JSON render for the keeper; the
log writes once and a second firing leaves it alone. Nav and reach
tests already walk every admin page.

## What shipped, 2026-09-11

Everything in "The build" above, in that order, on one branch:

- `src/services/bell.ts` — `metric:<month>:bell:rings`, bumped on a
  ring that counted; `readBellRings`.
- `src/lib/referrer-census.ts` — the monthly host census, written from
  `recordPorchVisit` for organic visits only; our own host excluded;
  capped at 40 with `other`.
- `src/services/growth.ts` — `computeGrowth`, `deriveGrowthMonth`
  (pure, tested on typed inputs), `readVerifyAge` (the first reader
  the `verifyage` buckets ever had), `logClosedMonth`, `monthBefore`.
- `src/pages/admin/growth-page.ts`, `/admin/growth`,
  `/admin/growth.json`, the "Growth" reading in the nav, the JSON on
  the back shelf.
- `src/index.ts` — the hourly press calls `logClosedMonth`; a failure
  alerts.
- `src/lib/metrics.ts` — `MonthLedger.truncated`, and the fence that
  stops non-shelf counter kinds minting all-zero shelf rows (every
  `verifyage`, `lat`, `err`, `mcpclient` and referral key used to).
- `test/growth.spec.ts` — eleven cases, all listed under "Tests" above.

What the first reading will show: July and August have no free
instrument lines before their logged-since dates, no bell line, and
no referring hosts — unmeasured, printed as such. September is the
first month with every block. The first frozen month is written on
the first hourly firing of October.

## The follow-through, 2026-09-11 (the same day)

The first reading of the ledger put a question on the desk: the
conformance desk read 791 organic calls in the last eleven days of
August and 247 in the first eleven of September. Nothing on any page
could say whether August was seventy callers or one script, and no
instrument here could see whether anyone else was taking that trade.
Three things closed those two gaps, on one branch:

1. **The client census, per instrument** (`src/lib/client-census.ts`).
   Every organic call to a free instrument or a paid tool adds one to
   a capped map of user-agent → calls under
   `metric:<month>:uaclient:<surface>`, the MCP client census's shape.
   Handshakes and catalogue reads are not censused; known crawlers
   never reach it. The growth ledger prints distinct clients beside
   each instrument's count and the busiest three; the instruments desk
   prints the month's list with each name linked to its trail. The
   roster the census consults moved from `services/instruments.ts` to
   `src/lib/instrument-roster.ts` so the porch counter in lib could
   read it; the service re-exports every name.
2. **A day, on request** (`?day=YYYY-MM-DD` on `/admin/instruments`).
   The census starts today; August's rows are still in the ninety-day
   window but the month scan reads newest-first under a cap a busy
   month exhausts inside a day. The day sample lists one UTC day by
   its inverted-timestamp key slices (ten listings, not a walk through
   everything newer) and groups the day's organic instrument calls by
   client. Two August days answer the August question.
3. **The peer shelf** (`src/services/peer-shelf.ts`, `/admin/peers`).
   x402-list.com publishes, CC BY 4.0, a measured thirty-day
   settlement floor for every service it lists. The hourly press reads
   the category our own row sits in (read off that row, never typed)
   once per ISO week and keeps it: every service alphabetical, ours
   among them, the category's measured totals, our floor per hundred
   of the category's, who arrived and who left. Never a ranking; their
   percentile does not travel. It sees paid settlements through the
   facilitators they measure, and nothing about anyone's free
   instruments — the page says so.

## What this is not

Not unique visitors. Not attribution of a free check to a later
purchase by identity (the handoff on `/admin/instruments` does that
by user-agent inside a window, and says why it is a floor). Not a
ranking of anything. Not a replacement for Cloudflare Web Analytics,
which sees the browser this store deliberately does not.
