# The x402-list night read — 2026-09-05

The keeper's question, verbatim: "we got a bit slower yesterday on
x402-list yet we have a 98 score now. is the slowness / latency cause
i did like a billion deployments maybe? or is there a real latency
check we need to do? we had gotten down to the 100s and id like to
consistently stay there."

Short answer: it was not the deployments. The slow stretch had no
deploy inside it, and the deploy that finally landed is what ended
it. The cost is the cold start of a 3.5 MB script on a quiet colo,
paid many times over by a directory that knocks on every paid door
at once. Everything below is the derivation, with its denominators.

## What the directory saw

x402-list exposes its per-check history at
`/api/v1/services/<slug>/checks` (`limit`, `offset`). One check is
one walk of all 31 listed doors; `response_time_ms` is that walk,
capped near 2,000 ms, and `endpoints_found` falls as doors miss the
cap. 500 checks read, 2026-08-31 02:42 to 2026-09-05 16:15 UTC.

| day (UTC) | checks | avg | median | p95 | over 500 ms | found < 31 |
|---|---|---|---|---|---|---|
| 09-01 | 90 | 235 | 108 | 1,237 | 11 | 90 (25 listed then) |
| 09-02 | 90 | 553 | 424 | 1,279 | 38 | 83 |
| 09-03 | 89 | 547 | 434 | 1,329 | 30 | 27 |
| 09-04 | 90 | 278 | 257 | 477 | 4 | 19 |
| 09-05 (to 16:15) | 61 | 663 | 668 | 1,619 | 33 | 39 |

The 09-05 day, by hour:

| UTC window | avg check | doors found |
|---|---|---|
| 09-04 21:10 to 01:26 | 113 to 525 ms | 30 |
| 01:42 to 10:06 | 620 to 1,464 ms | 25 to 28 |
| 11:10 onward | 65 to 126 ms | 31 |

Every check that ran slow also found fewer than 31 doors. The same
night-time shape shows on 09-02 (03:00 to 12:00) and 09-03 (01:00 to
04:00). The 09-04 night was the exception.

## What the deploys say

The Worker is a git-connected build; a merge to main is a deploy.

| day | merges to main |
|---|---|
| 09-02 | 30 |
| 09-03 | 30 |
| 09-04 | 48 |
| 09-05 | 12 |

The last merge before the slow window landed 22:54 UTC on 09-04. The
next landed 10:59 on 09-05. The slow window ran 01:42 to 10:06. Zero
deploys inside it, and the checks went fast eleven minutes after the
morning merges resumed. The diff between those two merges touches
nothing on the 402 path (`src/lib/payment-gate.ts`,
`src/lib/payments.ts`, the middleware in `src/index.ts`): the same
code served the slow night and the fast afternoon.

## What the store itself says

Read from one vantage with the Server-Timing line the store has
carried since 09-03 (`isolate;desc=cold|warm, age, req`).

- Thirty-one doors knocked at once, the way the prober does: cold
  isolates answered in 0.7 to 1.25 s to first byte; warm ones in the
  same burst took 0.36 to 0.6 s; a tiny warm GET from the same place
  was 0.14 s. The burst woke several cold isolates at once (nine cold
  of thirty-two on a later run, twenty-three seconds after a warm
  knock on the same host).
- On cold isolates the in-request I/O (`req`) was 2 to 5 ms. The KV
  warm and the edge cache are doing their job; the wait is before our
  code runs.
- `npm run cold:read` on one door, handshake subtracted: first knock
  483 ms cold, warm median 53 ms, cold penalty 430 ms.

The deployed bundle is 3.52 MB minified (1.16 MB gzip). By source:

| part | bytes in output |
|---|---|
| src/routes | 1,003,166 (openapi 166,789; llms 98,504; admin 56,133) |
| src/services | 649,108 |
| src/store | 639,765 (defect-vocabulary 43,830; menu-utility 38,577) |
| src/lib | 303,740 |
| src/pages | 225,130 |
| @solana/kit | 213,458 |
| zod | 60,955 |
| test/fixtures | 49,444 |
| till/till.js | 49,180 |
| everything else | under 50,000 each |

About 2.85 MB of the 3.47 MB is the store's own source, most of it
string literals that minify cannot shrink. Dependencies are about
0.5 MB.

## What it is not

- Not the 402 path: 2 to 5 ms of I/O cold.
- Not the deploys: none in the window; a deploy ended it.
- Not fixable by caching the 402: a Cache API or KV read still runs
  inside the Worker, after the isolate has booted. Only Static
  Assets are served before the Worker, and only for files.
- Not fixable by a keep-warm cron: a cron runs on whatever machine
  Cloudflare picks, not the prober's colo.

## What we cannot see from here

The prober's daytime floor moved from ~100 ms (09-01) to ~450 ms
(09-03) to ~70 ms (09-05 afternoon) without the 402 path changing.
Part of "consistently in the 100s" belongs to where their prober
lands. Workers Logs now carry one JSON line per request with the
cold marker, the path, the status and the user agent (`src/index.ts`),
so the next quiet night can be read by filtering `cold:true`.

## Impact, honestly sized

The score is 98, uptime 100 %, payment-ready through 09-12: the
latency is not costing the listing today. What it costs: the
listing's 30-day average reads 468 ms against a warm floor near 70;
39 of 61 checks on 09-05 found fewer than 31 doors (their per-door
`last_seen_at` still refreshes on the next good check, so nothing
decays yet, but that is their rule, not ours); a buyer's first 402 at
a quiet hour pays 0.5 to 1 s once per session; and an observatory
that publishes other doors' latency carries a 1.3 s p95 on its own.

## Our half, measured locally (same day)

`npm run cold:local` bundles the tree as a deploy would and times the
real workerd from spawn to open port, which is compile plus top-level
evaluation, against a script that does nothing.

| script | startup, median of 5 |
|---|---|
| nothing | 29 ms |
| the store (3,522,782 bytes) | 183 ms |
| ours | 154 ms |

Compile is close to linear in bytes (Node compiles and links the same
file in about 120 ms; evaluation is the remaining ~35 ms), and the
whole realistic diet is 21 % of the script:

| candidate | bytes | share |
|---|---|---|
| admin routes and pages | 217,132 | 6.2 % |
| OpenAPI document | 166,789 | 4.8 % |
| llms.txt and the guide | 98,504 | 2.8 % |
| store copy | 87,665 | 2.5 % |
| fixtures, verifier fixtures, conformance vectors | 68,326 | 2.0 % |
| trade counter | 67,931 | 2.0 % |
| spec documents | 56,305 | 1.6 % |
| till source served as text | 49,180 | 1.4 % |
| defect vocabulary | 43,830 | 1.3 % |
| dependencies (cannot move) | 480,006 | 13.8 % |

So the diet as planned buys about 30 ms of the 154 on this machine,
and less on Cloudflare's. The other ~280 ms of the 430 ms live penalty
is on Cloudflare's side of the line: finding, fetching and housing a
1.15 MB (gzip) script. Whether that half also scales with bytes is
what the canary answers; nothing here can.

The one change that would move the directory's number by hundreds of
milliseconds rather than tens is structural: the paid doors, the
discovery document and the payment gate in a Worker of their own
(dependencies and shelf, about 0.7 MB), with a thin front routing
everything else — pages, admin, corpus, wards, the trade counter — to
the store as it is. The prober's burst would then wake a script a
fifth the size. That is a week, it reshapes a test suite built around
one app, and it is the keeper's to rule, not an agent's to start.

## The canary, read (17:49 UTC, the keeper's Mac)

Deployed by the keeper's hand at 17:4x UTC; read from his Mac minutes
later, cold everywhere by construction.

| | first knock | warm median | cold penalty |
|---|---|---|---|
| canary (a Worker with nothing in it) | 29 ms, cold | 24 ms | **5 ms** |
| store, from the sandbox the same hour | 655 ms, cold | 28 ms | 627 ms |
| store, from the sandbox an hour earlier | 483 ms, cold | 53 ms | 430 ms |

Cloudflare's floor is five milliseconds. The store's 430 to 627 ms
cold penalty is the script, all of it — and more than the 154 ms
that compile and evaluation cost locally, so the rest is what a
1.15 MB (gzip) script costs to fetch and house per isolate, which
also scales with bytes. Every byte is ours.

## What a Worker of only the doors would weigh

Bundled from this tree as it stands, no code moved, one trial entry
that mounts only the routes named:

| entry | bytes | of the store |
|---|---|---|
| `/api/buy/*` (the gate, the shelf, signing, the facilitator client) | 1,114,761 | 32 % |
| `/api/buy/*` plus every `/.well-known/*` | 1,610,407 | 46 % |

The well-known routes drag the guide (`llms.ts`, 98 KB) and the rest
of the store's copy in; the two the directory reads (`/.well-known/
x402` and `x402.json`) need only the shelf. What `/api/buy/*` still
drags on its own — 250 KB of services, 198 KB of store copy — is the
gate reaching into the corpus for `archive_depth` and the vocabulary
for its decline reasons, and is prunable to about 0.7 MB. At the
penalty per byte measured above, a 1.1 MB doors Worker knocks cold
in roughly 140 to 200 ms; a 0.7 MB one in roughly 90 to 120 ms.

## The doors, built (the same evening)

The keeper ruled for the split. What was built, on this branch:

- `src/routes/door-checks.ts`: the seven refusals before the gate and
  the gate itself, moved out of `routes/buy.ts` unchanged, exported as
  one ordered list both Workers register.
- `src/lib/edge.ts`: the store's global middleware, moved out of
  `index.ts` unchanged, exported as one ordered list both Workers
  register.
- `src/lib/doors-app.ts` and `src/doors.ts`: the doors Worker. A knock
  with a payment header, or any knock while the Worker lacks its
  secrets or its STORE binding, goes to the store over the service
  binding as it came; everything else meets the same edge and the same
  checks and gets the same 402. A knock that passes every check
  without a 402 (an unpaid HEAD, an OPTIONS, a POST) also goes to the
  store, because the store's own handler answers those.
- Three import cuts so the doors carry no delivery code: a constant
  out of `services/fulfillment.ts`, `listCorpus` out of
  `services/corpus.ts` (which reaches the whole observatory), the two
  settlement-record functions out of `services/chain-reconciliation.ts`
  (the chain walker). Each old module re-exports, so no caller moved.

| Worker | bytes, minified | workerd start, this machine | ours |
|---|---|---|---|
| the store | 3,522,974 | 181 ms | 152 ms |
| the doors | 656,415 | 79 ms | 50 ms |
| nothing | | 29 ms | |

`npm run cold:local` now times both and fails if the doors pass
1,000,000 bytes or carry `services/fulfillment.ts`.

What the parity test found on its first runs, none of it imagined:

- An unpaid HEAD passes the gate (x402 requires payment of a GET) and
  is answered by the store's handler, not its gate. The doors hand it
  over. Same for an OPTIONS on a paid door and a POST with no payment.
- With a trailing slash, the store's 402 is thinner: the root app is
  strict, `routes/buy.ts`'s non-strict setting does not survive
  mounting, and the item lookup inside the body keeps the slash and
  misses. A non-strict doors app trimmed the slash and answered the
  fuller body. The doors are strict now and answer as the store does.
  Whether the store should be fixed is a separate question for
  `routes/buy.ts`.

## The plan, in order

1. Measure before cutting (this branch): the per-request log line;
   `scripts/cold-read.mjs` with `.github/workflows/cold-read.yml`
   reading one door cold then warm, and the whole shelf at once,
   after every push to main; `canary/` — a Worker with nothing in it
   and the same Server-Timing line, deployed by the keeper's hand, so
   the store's penalty minus the canary's is our script's share.
2. DONE the same evening: the canary read 5 ms, the keeper ruled, the
   doors are built (above); the flip is on the keeper's desk as six
   steps (KEEPER_LIST). Earlier text of this step, kept for the record: The diet (30 ms of
   430) is not worth its churn. The split is the move, and it is on
   the keeper's desk as a RULE (KEEPER_LIST): the paid doors and the
   two x402 well-known documents in a Worker of their own, reached by
   zone routes on the same hostname (`scvd.store/api/buy/*` and
   `scvd.store/.well-known/x402*` to the doors Worker, `scvd.store/*`
   to the store as it is; the more specific pattern wins, no thin
   front and no second hop), the same KV namespaces bound to both,
   the trade-counter Durable Object left where it is. Rollback is
   deleting two routes. `npm run cold:local` before and after is the
   local check; the workflow is the live one.
3. The door their count missed from 09-04 19:34 to the 10:59 deploy:
   the keeper has already resubmitted it.
