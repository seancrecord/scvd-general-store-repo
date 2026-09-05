# KEEPER_LIST — the keeper's one desk file

Your hands. Directory entries, walks, presses, and decisions.
Not the feature list.

The feature order is `ROADMAP.md` (now / soon / later).
If a row can be built by an agent without your press or your
pen, it does not belong here.

The previous desk is
`docs/archive/KEEPER_LIST_2026-09-01.md`. The 2026-09-01
intake (batches 1–21) is
`docs/archive/DESK_DUMP_2026-09-01.md`. Do not update
either. Do not refill this file from them.

Taxonomy:

- **LOOK** — open a page, read a number, five minutes.
- **TEST** — exercise something that has never met reality.
- **RULE** — only you can decide; no work happens until you do.

If it is not on this sheet, it is not your work. If it is a
build, it is on the roadmap.

---

## TRUE TODAY

- **CV's four rounds, 2026-09-04, "give me my decisions with
  drafts."** Six on the desk, ruled the same evening. RULED
  1: payer purchases are derived — one lossless record per
  settle (`payer_settle:<wallet>:<tx>`, never read-modify-
  written), the payer row kept as the cache, the
  reconciliation taking the larger of the two per wallet,
  and the certificates as the backfill for history. A lost
  increment on a shared KV key is not a books defect; a
  certificate without a settle, or a settle without a
  certificate, still is. PRESS once deployed: `POST
  /admin/repair/payer-settles`, then read the settle
  reconciliation — the one unexplained settle from CV's
  Base batch should close. PRESSED 2026-09-05: it did not
  close, and the press found the second case — a wallet
  with two Solana penny settles on 2026-08-05, certificates
  minted, no row and no counter, the till's whole wave
  never ran. So the repair now CREATES the missing row from
  the certificates and books each such settle onto the
  month the certificate carries (rows_created,
  counters_rebooked on the record), and the hourly page
  moved: counters-vs-rows is a desk reading of three floors,
  and what pages is a certificate carrying a payer and a
  transaction the books never recorded. PRESS again once
  deployed, then read the books check. RULED 2: the verify-failure
  classifier fixed both ways — a facilitator verdict wearing
  a 4xx books under the facilitator's own reason, and a bare
  401/403/429 books as `upstream_auth`, the emergency.
  RULED 3: the two void certificates (cert_a7qcdbh98v,
  cert_6fbvtpdwgu) get a corrections entry that says why they
  existed, and stay on the wall. INKED 4: the three probing
  notes' refused ending, "We did not knock", wording as
  drafted. RULED 5: aura_walk carries five slots a week, not
  one. RULED 6: PR and merge once the changes are green.
  LOOK after deploy: have CV rerun the anchor, the sheaf and
  the statement over MCP as the acceptance.
- **Reproduce, cite, seats, three grips, 2026-09-04, "do it
  all."** The look takes `since` and answers the class of
  result by the rule at `/criteria#result-class`; every row
  surface prints its citation; the seats ride
  `/.well-known/trust.json` and `/corpus.json` as data;
  `/scorers` opens with the same five steps as shell, CLI
  and MCP; the CLI is 0.2.0 with `corpus --since`, `host`,
  `cite`, `reproduce`. INKED 2026-09-04: the five class
  rules and the note, wording as drafted. RULED 2026-09-04:
  the CLI exit codes stay as built (0 same, 1 moved or
  instrument_moved, 3 nothing compared); deploy cadence
  unchanged for now; the register's five listing facts
  (`src/store/citing-systems.json`, and on `/scorers`).
  PRESS, once the branch is green and merged: the npm
  publish workflow for scvd 0.2.0, so the `npx scvd` lines
  on `/scorers` work for a stranger. LOOK once merged:
  `npx scvd reproduce
  https://lionx402.com/api/x402/wallet-screen-json --since
  2026-W36` and read the class.
- **For scorers and marketplaces, 2026-09-03, "build it."**
  `/scorers` names the two seats — the record, and the
  reproducible dispute artifact — and how to pull, verify,
  cite, reproduce and re-observe the evidence. It names
  seats, not occupants: the named-integrations block renders
  `src/store/citing-systems.json`, empty today, and
  `npm run citations:check` fails when a listed citation
  disappears. INKED 2026-09-04: the seats sentence and the
  misuse clause (`src/store/copy/doctrine.ts`), wording as
  drafted. RULED 2026-09-04: `/scorers` stays off the
  storefront, like `/operators`. ⚑ SUPERSEDED the same day
  ("how do we broadcast scorers so its used? how do we make
  it incredibly obvious?"): the room is ON the front now.
  The ruling rested on a comparison that was not true —
  `/operators` was never held back, it has had a storefront
  slot all along — so the rule it invoked did not exist.
  Also: every `/corpus` door now answers with
  `Link: <…/scorers>; rel="help"` and the licence, so a
  client reading only headers (or sending HEAD) learns where
  the terms are; and the README names the room. PRESS: when a system meets
  the five listing facts, add it to the register with the
  citing URL and the date first seen, and nothing else.
  AUTOMATED 2026-09-04 ("can we not just automate this
  weekly check in admin?"): the citation watch rides the
  Sunday press with the ward round, and since CV's register
  landed it reads ONE hand-kept list —
  `registry/scorers-outreach.json`. The cron fetches the
  rows you have written to (plus any already citing) and
  pages `citation_seen` when one starts carrying a row or a
  listed page stops; `npm run outreach:check` sweeps all
  101 from your machine. The rows print on `/admin/outreach`
  under "Citations — who carries a row" with a Check-now
  button. Your hand: set `note_sent` on a row the day you
  send, run `npm run outreach:build`, and move a system into
  `src/store/citing-systems.json` only when the five facts
  hold. ⚑ STAMP THE 20+ ALREADY SENT (2026-09-04, the
  keeper: "weve sent 20+ notes"). The register recorded
  none of them, so the Sunday watch was reading zero pages
  while the work was done — the automation idle beside a
  finished job. One command now, no JSON by hand:
  `npm run outreach:sent -- "Glama" x402scan --date
  2026-09-02`, which stamps, re-renders the table and the
  edge's watched file, and prints how many pages the watch
  will read. It refuses an argument that matches nothing or
  matches two rows rather than guessing, because a wrong
  stamp claims a note went somewhere it did not.
  `npm run outreach:sent -- --list` shows who is stamped.
  Stamping a send is a one-field edit that breaks
  nothing: the derived table carries WHO EXISTS only, and
  the status columns moved into the JSON alone (2026-09-04),
  because a table that carried them failed the build every
  time you did the one thing the whole loop is for.
  ⚑ CORRECTED 2026-09-04, and worth knowing: the first
  sweep reported SEVEN directories as citing us. Six carried
  this store's own README sentence ("read the dated,
  Bitcoin-anchored corpus, free, at scvd.store/corpus") and
  one our own sample certificate — our words on their page,
  which listing fact 4 excludes by name. The matcher now
  counts only a page pointing at ONE ROW: a verify URL, a
  numbered entry, a host history, a round, or the cite
  shape. The seven `cites_since` dates were cleared; the
  check re-establishes any that are real. Nobody has cited
  us yet, which is the true reading.
  ⚑ THE FIRST REAL SWEEP CONFIRMED IT (2026-09-04, your
  `npm run outreach:check` over all 101). It reported three
  citations and all three were false: x402-bazaar and
  x402scan were showing the EXAMPLE PURCHASE this store
  publishes into bazaar discovery — a certificate whose
  signature is the literal string "<128 hex chars,
  ed25519>" — and socketcat was showing a clipped URL,
  `/api/verify/ce`, that resolves to nothing. Both are now
  excluded by name and by shape, and all three pages are
  pinned as fixtures. The count of systems citing this
  store is STILL ZERO, and every reading that said
  otherwise was this store reading its own words.

- Evidence observatory for agentic commerce, and a general
  store on the same door. Not an escrow, a guarantor, or a
  dispute court.
- Two living queues, one job each: this desk, and
  `ROADMAP.md`. Nothing else is a queue.
- `main` is at `2ce6990` (through PR #397). Landed
  2026-09-01/02: N2 first screen (your sixty words), the
  watch end-of-term pointer, rule 59 inked, the audience
  sentences, `/becoming` re-inked, S4 subtitles, S2
  passport on the front with the colophon, S1 The Week's
  Doors, S3 The Opening Day ($9), N4 The Company an
  Address Keeps ($5, free self-audit), N3 specimens and
  limits on the item pages, N5 our-doors freshness on
  every round, the verify-time revert reading, the
  all-time take by item, and the ready-door welcome on
  `/admin/outreach`. S5, the `/try` demo, recorded by you
  2026-09-02. The roadmap's NOW section is the open queue
  in order, done rows at the bottom (your ask, 2026-09-02).
- `daily_fortune` is back on the Penny Shelf as of
  2026-09-02, your ruling: three organic settles (the
  most of any door) and x402-list still listing it. Same
  id, same copy, same penny; skill bundle 3.10.0. Nothing
  to press — their prober sees a 402 again on its own.
- The doctrine sentence changed 2026-09-02 on your ruling
  (N7a) and the passport tier shipped behind it (N7b):
  every passport, chip, profile and per-host read carries
  a tier with its fraction and rows; `/corpus/tiers.json`
  is alphabetical. Rule 43's amendment in HOUSE_RULES.md
  is inked (2026-09-02, wording as drafted).
- The Case File (N8) is on the shelf at $0.25, confirmed
  2026-09-02. It never says who was in the wrong; when we
  are a party it says so on its face.
- The Operator's Statement (S10) is on the shelf at $21 a
  month as `operator_statement`, your name, price and
  cadence (2026-09-02): four signed chain reads a day on a
  receiving address for 30 days, payers counted, never a
  renewal. Skill bundle 3.15.0. The copy on the row is
  inked (2026-09-03, the ink sheet, "im good with these").
- The Aura Walk (S11) is on the shelf at $150 as
  `aura_walk`, your number and your model rule
  (2026-09-02): keeper-time answers to two doors now.
  Human queue, a week's promise, one a week. The row copy
  is inked (2026-09-03, the ink sheet). Skill bundle 3.14.0.
- Rule 59 inked 2026-09-01. Ceilings live in
  `src/store/reader-limits.ts`.
- Circle Agent Marketplace: submitted 2026-09-01, listed
  2026-09-04 at partners.circle.com/partner/scvdstore. On the
  trust record, the storefront sameAs and the README.

---

## NOW

- ⚑ **THE TWO STORAGE MOVES (2026-09-05, "yes i agree with the two
  moves").** A week's evidence lived in ONE KV value (the walk
  state) and the sealed round in three more, each carrying every
  row's evidence at ~6 KB a host against KV's 25 MB a value — a
  ceiling near 3,900 hosts that lane C could have reached next
  week. Now: each walked batch lands under its own key
  (`long_walk_results:{week}:{n}`, expiring three weeks on) and the
  state keeps the roster, the cursor and the counts; Sunday reads
  the batches back in order and the round says `walk.batches_missing`
  if one could not be read. The sealed round keeps its rows in R2
  (`ward/{week}/hosts.json`) with a pointer and `hosts_count` in KV;
  `latestWardRound` returns it whole, the heartbeat reads the count
  off the pointer, and a pointer whose object is gone reads as NULL,
  never as a round nobody walked. A store with no bucket keeps rows
  inline as before. `WALK_ROSTER_CAP` raised 2,000 → 10,000; the
  ceiling now is the walk's own ~16,800 knocks a week.
  YOUR PRESS: none. The first round sealed after deploy is the first
  in the new shape; `/admin/ward` and `/corpus/latest.json` should
  read exactly as before.

- ⚑ **LANE C — THE DIRECTORY'S PAGE FOR A HOST (2026-09-05, "i added
  you access for fuchss").** The sweep read each name-only host's own
  `/.well-known/x402`; most hosts serve none, and the register kept
  ~5,300 names the walk could not knock on. x402.fuchss.app, the
  directory that names them, also serves one page per host listing
  its endpoints, paths in the markup (`<span class="r-path">`).
  Saymon's page lists his five best-scored doors. So: where a
  host's own file gives no door, the sweep reads the directory's
  page for that host and takes one path, joined to that host and
  nothing else. Source `directory` on the row — a feed's word, not
  the host's — out of the listed/gone delta and out of the door
  bank like a revisit; the store keeps the record under `via:
  "directory"`, and a host's own file wins over the page for the
  same host. Counts ride the round under `walk.sweep.directory`
  (read / found / none / unreadable / doors_added), kept apart from
  the file's. Worst case four GETs a host, inside the sweep's
  budget. Nothing in the guide changed: this asks nothing of an
  operator.
  LOOK next Sunday: `walk.sweep.directory.found` on
  `/corpus/latest.json`, and `coverage_pct` against 17.1 — this is
  the lane that should move it.

- ⚑ **THE FEED OUTGREW THE READ, AND THE REGISTER CALLED IT
  SILENT (2026-09-04, your paste of "Not answering: discovery"
  and "why not raise higher then that even? what happens when
  things grow?").** The Bazaar passed 6,000 declared resources
  before W35; the one-shot read stops at sixty pages; every
  round since recorded discovery as unreadable to the census
  (rightly — a short list is not a census) while the walk walked
  the first 6,000 rows' hosts. The register, opened the same
  day, had no word for "answered short" and published
  `never_answered`. Two fixes. The word: the census writes WHY
  beside a null (`unreadable`, `capped`, `pagination`); the
  register's own word for that feed is `partial`, landed the same
  day from another desk (#487) — the feed is not down, the read is
  not wide enough. The read: the long walk
  reads the feed ACROSS hourly firings on a stored cursor
  (`FEED_PAGES_PER_PASS`, 300 pages a firing — main's cap for the walk's start firing, shipped the same day by another hand, and now not the last word) until the feed's
  own declared total is reached; no page cap binds at any size.
  "Why not raise it higher?" — because the next ceiling is not
  the feed: a week's evidence lives in ONE KV value and would
  fail near 3,900 walked hosts, silently, on an hourly write.
  So `WALK_ROSTER_CAP` = 2,000 feed doors, announced in the
  round (`walk.roster_capped`, `walk.feed_hosts`), declared and
  swept doors riding BEHIND it, the census counting every host
  the feed named. Past that cap is results stored per batch and
  the round's hosts in R2 alone — named in `ROADMAP.md` R9, not
  built. Corrections entry recorded.
  YOUR PRESS: none. Next Sunday, `walk.feed_hosts` on the round
  should exceed 1,088 and `per_source` discovery should be a
  number, not null; `/sources` should show discovery `live`.

- ⚑ **THE CENSUS NOW READS WHAT A HOST DECLARES ABOUT ITSELF
  (2026-09-04, "could we add a way to add apis to walk or
  somehow pick up doors that arent on bazaar?").** The register
  knew 6,367 hosts by name and the walk knew 1,088 doors by
  URL; the 5,279 between were "listed, not walked" every week
  and the long walk's own comment claimed it finished the
  universe by midweek. It finished the feed. Two lanes now,
  one consent line — a door enters the walk only from a feed
  or from the host's OWN `/.well-known/x402`, and a file may
  only declare doors on the host that serves it:
  Lane A, THE SWEEP: once the roster is walked, the idle
  hourly firings read every name-only host's own file (and an
  agent-card pointer, one hop); a door a host declares for
  itself joins the roster's tail, source `well-known`, and is
  knocked on by a later firing. One file read and one knock per
  host per week; the round's `walk.sweep` and
  `population.per_source` say what it read, found, and could
  not read. Well-known rows sit out the listed/gone delta and
  never enter the door bank (the directory's word only).
  Lane B, `POST /api/declare-door {"host"}`: the same read by
  hand today; a door found joins THIS week's roster. One per
  host per day. `/operators` gained the "Be found" stage and,
  because it now has a door, a rule-60 feature row.
  YOUR PRESS: none — the sweep starts on the next hourly
  firing after deploy and finishes within the week. LOOK next
  Sunday: `walk.sweep` on `/corpus/latest.json` (found / none /
  unreadable, and `capped`), and `coverage_pct` against 17.1.
  Then tell Saymon: serve the file, or POST the host.

- ⚑ **THE WALK CALLED 61 WORKING DOORS BROKEN (2026-09-04).**
  Two preflight checks read every chain as Ethereum or
  Solana. An XRPL address is base58 inside the Solana window,
  Stellar and Algorand are base32 and matched nothing, and
  XRPL issued currencies are decimal by the ledger — so
  round W36 flipped 61 hosts from ready to not_ready and
  moved published tiers (agent402.tools read "broken" on a
  door answering a clean 402). Three of the 61 were on your
  outreach list. Rule 52 already forbade it; its test walked
  only KV reads. FIXED: unknown rails are named, never
  judged, and the rule-52 guard now walks the readers that
  judge strangers. `/corrections` carries it. YOUR PRESS,
  after this deploys: walk the ward once by hand at
  `/admin/ward` so the 61 get fresh rows before Sunday, and
  do not hand-deliver any drafted note to a host in that 61
  until the walk has re-read it. The next walk will list
  them as "newly fixed" — that is us, not them; do not read
  it as outreach working.


- **Post this week's bounties.** The five on the board
  expired 2026-08-27 and read as open until 2026-09-01
  (`/corrections`). The board now says "between postings"
  until you press. CV's batch A drafts the five; you paste
  them at `/admin/market`. Monday, weekly, your press.
- **Hand CV the batches** — `docs/CV_BATCHES_2026-09.md`,
  one at a time. A is sent. B is runnable now
  (`scripts/walkabout.mjs`, roadmap N6 done) once the
  field wallet holds Base USDC.
- **Fund the field wallet** for the walkabout: Base USDC
  to the declared field wallet; Polygon if you want
  Polygon walks. Not a code task.
- **Send the welcomes.** `/admin/outreach` now lists the
  READY doors, newly listed first, each with a drafted
  welcome (their passport page, the colophon, the chip as
  two paste-ready snippets — markdown and HTML, nothing to
  claim, since 2026-09-04 — the free checks, the two priced
  lines). Hand-deliver, stamp. The
  wire stays paused. This is the seller loop; it is your
  press.
- **Re-register the missing doors.** After Sunday's round,
  `/admin/ward` prints `our_doors` — which of our paid
  doors the CDP search index still returns. `opening_day`
  and `provenance_check` will be missing until you press.
- No agent item is queued (2026-09-02, after S6). The
  roadmap's NOW table is empty; S8-v3 waits on your yes /
  no / later, not on a date; everything in LATER needs a
  trigger or your ruling. One branch at a time (#65).

---

## RULINGS THIS SITTING (2026-09-01)

Do not relitigate without you.

- **S8, 2026-09-02, "agreed on all."** Tier B rides
  `service_audit` always, same price, no flag. The
  `llms.txt` price convention: a dollar amount in a code
  span beside an endpoint path, machine-read, never prose.
  The practice door is `two-surfaces`. The three Tier A
  advisories beyond the two that fold into v3 fold only
  after a month of rows, by your hand. Design:
  `docs/S8_CROSS_SURFACE_2026-09.md`. PRs 1, 3 and 4
  shipped 2026-09-02; PR 2 (the v3 fold) waits on the
  SOON row: your yes / no / later. The "not before
  2026-10-02" an agent wrote here was struck 2026-09-03
  ("i dont wait i decide yes/no/later"); nothing on this
  list waits on a calendar.
- **The Aura Walk cap, 2026-09-02.** One a week; two after
  the first three ship inside the window.
- **The next builds, 2026-09-02, "On do that then."** After
  the SOON/LATER review: L6 (the look) first, then L7 (the
  CI check for our fixtures). L6 shipped the same day. The
  look's copy — the door's own document at `/api/look/v1`,
  the `look_at_door` tool description, the guide paragraph
  and the atlas line — is inked (2026-09-03, the ink sheet).
  L7 shipped the same day: `action/preflight/`, used by
  path from this repository; a Marketplace listing is your
  press (rule 30) and is not needed for `uses:` to work.
- **The next three, 2026-09-02, "Agreed do em."** In order:
  the statement on Solana (parity gap 1), Cairn's
  disagreement surface (rule 51), the observatory page
  reading the porch. The first shipped the same night; the
  two statements' row copy is inked (2026-09-03, the ink
  sheet; widened to seven chains the same day, item 14). The
  second shipped the same night: `/disagreements`, seeded
  with the X-PAYMENT entry. Its prose is inked (2026-09-03,
  the ink sheet), and PRIVATE-FIRST applies to
  the page itself: tell Cairn the record exists before it is
  named anywhere outside this repo. Every future entry is your
  hand, from a named trigger. The third shipped the same night
  too: `/observatory`, the porch's counts read per surface and
  month. Both pages' prose is inked (2026-09-03, the ink
  sheet). The storefront slot for both: ON, ruled 2026-09-03
  ("go ahead and do those", reversing the sheet's default of
  leave the same afternoon) — roadmap V1. TEST when a Solana
  statement is
  bought: the RPC endpoint order is Helius then the public
  fallbacks, and a wallet with hundreds of USDC transfers in
  eleven hours will read window_unreadable by design — read
  the reason on the artifact before treating it as a fault.
- **The ROI three, 2026-09-03, "okay lets do it."** Visibility,
  revenue and market size, demand and your notes set aside:
  the badge loop, the operators' page, the EVM chains. The
  first two shipped in one PR: the passport page now offers
  the chip as a Markdown and an HTML snippet to paste beside
  a door, and the JSON carries it as `embed`; `/operators`
  is the shelf from the seller's side in the order a launch
  happens, free first at each moment, prices read off the
  shelf. The four stage questions, the standfirst, the
  "what this is not" paragraph on `/operators` and the
  one-line note beside the paste snippets are inked
  (2026-09-03, the ink sheet). Storefront slot for
  `/operators`: ON, ruled 2026-09-03 with item 11 (roadmap
  V1). LOOK once merged: open
  `/passport/{a ready host}`, paste the Markdown into any
  README preview, and see the chip render and link back. The
  third shipped as its own PR: Ethereum, Arbitrum One, OP
  Mainnet and Avalanche C-Chain as reader chains — the
  statements, the receivability read and the canonical-USDC
  test now answer on them; the till, the bank walk and the
  census do not move (PAYMENT_RAILS.md Part F). The two
  statements' shelf copy names seven chains, inked
  (2026-09-03, the ink sheet); the rows' descriptions and
  constraints were widened to match the same day (item 14,
  read as the ink requiring it — reverse it with a word).
  TEST when you can: buy `the_statement` with
  `network=arbitrum` on any busy wallet — no RPC host answers
  from the agent's environment, so the span and the public
  endpoints on all four chains have never met the network;
  read `coverage` on the artifact before treating a
  `window_unreadable` as a fault. Optional: the three RPC
  slots per chain (`ETHEREUM_RPC_URL` and kin) are yours to
  set the day a public endpoint is not enough.

- **Provenance (M5).** Name: "The Company an Address Keeps"
  (B7c). Body takes B7b's refusal. State the free self-audit
  offer on the shelf. $5 / free for proved-own. Inked
  2026-09-03 (the ink sheet); roadmap N4 is DONE. Spec:
  `docs/PROVENANCE_CHECK_SPEC_2026-08.md`. Drafts:
  `docs/archive/POST_ROADMAP_SWEEP_2026-08.md` §B7.
- **#82.** Paid audit to battery v2 everywhere. Dated
  instrument-change note. Roadmap N1.
- **#65.** Serial. One branch at a time.
- **#84.** Stale window 24h. Control beacon unset until
  there is a real `CONTROL_BEACON_URL`.
- **Copy.** Draft, then ink. Rule 7.
- **`/how-it-works`.** You rewrite. Agents do not.
- **Public nouns.** Passport and Corpus. New checks are
  modules / battery families, not brands.
- **Wedge.** Signed observations, contradictions,
  corrections, batteries, expiry. Not scores.
- **Walkabout (2026-09-01, "agreed with all listed").**
  Spec approved as written. Rule 1 amended: standing
  approval for one run per week at $0.05 / $10 / one per
  domain; anything above is a press. Runner is roadmap N6.
- **Bounty board.** Weekly repost is your press, Monday.
  Board surfaces its live open count on the storefront and
  agents.md; expired bounties read as expired everywhere.
- **CV.** Six batches in `docs/CV_BATCHES_2026-09.md`,
  sent one at a time. Research trails restart under
  batch D; merging the PR is the publish.
- **Bounty tweet.** Three drafts in the batches file,
  appendix. Your ink, and only after the board carries
  live bounties.

### Eliminate / defer

- Generic trust score — eliminate.
- Cards on artifact-minting items — eliminate for now.
- MPP sessions — defer until a named counterparty.
- D6 ACP/UCP merchant checkout — read only, do not join.
- One-off conceptual modules with new product names —
  eliminate as naming.
- Replay census (#37) — on the roadmap after N1.

---

## NEXT — your hands

### The Trade Counter (2026-09-03, `TRADE_COUNTER.md`)

- **TEST** — send Hal the ten questions in `TRADE_COUNTER.md`.
  Two of the answers are dialect fields (`timestamp_unit`; whether
  the provider key is a separate secret) and both fail closed if
  guessed wrong. Nothing goes live until they answer.
- **Hands (Hal answered 2026-09-04; nothing is minted here)** —
  create ONE PAUSED LISTING PER ITEM at
  `https://sell.halmarket.dev/services/new`: endpoint URL = the
  item's `door` on the hal row of `/api/trade/contract` (nine of
  them), price = a fixed integer in sats at or above that item's
  `trade_price_usd` at the day's rate, rounded up. Hal shows a
  provider key and a signing secret; put them with `wrangler secret
  put TRADE_PROVIDER_KEY_HAL` and `TRADE_SECRET_HAL`, never through
  a chat with an agent. If Hal issues a pair PER LISTING rather than
  per account, tell me before putting anything: secrets keyed per
  item is a small change on this side. Confirm to Hal only the
  listing id and `is_paused: true`. The contract row flips to
  `provisioned: true` on its own. No paid canary without your word
  and theirs; the fixture on the row is the no-spend check.
- **RULE** — flip `hal` from `test` to `live` in
  `src/store/trade-counter.ts` when the listings resume. Hal pays
  sats over Lightning (OpenNode, mainnet) at 95% of each listing's
  fixed sats price; there is no bilateral statement API, so the
  weekly reconciliation is their seller dashboard against
  `/api/trade/hal/statement`. Receiving sats is a new treasury rail:
  which wallet, whose custody, is yours to decide before the flip.
- **RULE** — `TRADE_UPLIFT_BPS` (20% over retail, net) is the
  opening figure. Yours to move.
- **Your press (rule 30), nothing else pending on the counter** —
  `docs/TRADE_OUTREACH.md` is the letter and the four platforms CV
  named; `docs/TRADE_HAL_LETTER.md` is Hal's. Check each paragraph
  against their site, then send. The copy on `/trade` is inked on your
  waiver ("I'm gonna let you ink this one"); move any line you like.
- **Done on your word ("agreed lets do them all")** — `/trade` is on
  the storefront; the sandbox, check desk, statement API, catalog
  feed and credit ceiling are live; rule 60 and the feature register
  hold every future feature to the same surfaces. Your ink is still
  owed on the copy at `/trade` (rule 7): the five "why a marketplace
  would" bullets and the two rule-60 sentences in
  `src/store/trade-counter.ts` (`TRADE_PROPOSITION`, `TRADE_FOR_MONEY`).
- **LOOK** — `/admin/trade.json` on the Sunday grind, against the
  partner's statement; record each payout with `POST
  /admin/trade/hal/payout`.

### Presses waiting (2026-09-03, evening)

- **npm publish scvd-cli 0.2.0** from `cli/` on main — look,
  before-you-pay, month, feeds, the FIX lines (roadmap C5). The
  Saturday listings read will say the registry differs from the
  tree until you press.
- **npm publish x402-verify 1.1.0** from `verifier/` on main (A1).
- **npm publish the four new packages** from main (roadmap C5b):
  `x402-preflight` 0.1.0 (`x402-preflight/`), `scvd-corpus-client`
  0.1.0 (`corpus-client/`), `scvd-defects` 0.10.0 (`defects/`),
  `scvd-mcp-starter` 0.1.0 (`mcp-starter/`). Until you press, the
  Saturday listings read shows them unreachable on npm, never
  differs.
- **The tab registry press** via the `tab` input on the publish
  workflow (V4).

### Decisions that unblock the roadmap

- **Rail run-through** (eleven checks, drafted against
  `docs/PROTOCOL_EXPANSION_2026-08.md`) and the
  `PAYMENT_RAILS` vs cheap-door intake collision. The eleven
  checks are APPROVED as the standing gate (2026-09-03, the
  ink sheet, item 12, "im good with these"). The collision
  is still yours: which intake wins when they disagree was
  not named, and the counterparty rule stands until it is.
  Roadmap L3 does not start without that word.
- **MPP, 2026-09-04, your read of the design.** Decision 3 is
  FIRM: the top-level preflight `verdict` keeps meaning x402-ready,
  permanently, and `protocols_spoken` is the union field — never to
  be relitigated, because a field that changes meaning breaks every
  historical row's comparability. Decision 2 (a passport for an
  MPP-only door) waits on an actual mockup of the passport copy,
  now in the design note's rulings section: read it, then yes / no
  / later. Framing, sourcing, zero added cost, versioning and the
  risk section approved as-is. "Get bolder on actual
  implementation": PR 1 is built the same day. Decisions 1, 4, 5
  and 6 stand as recommended until you say otherwise.
- **PROTOCOL_EXPANSION §11.** MPP wait-and-see on the TILL
  stands; the READ-ONLY battery is GO (2026-09-03, "go ahead
  and do those", reversing the sheet's default of wait the
  same afternoon): designed first as roadmap V3, and you rule
  on the design before code. Chargeback. Circle deeper vs Chargeback.
  Circle deeper vs listing-only. Gateway receivable cap.
  Sub-cent tier and mandate-desk price. One-liner goes
  cross-protocol before or after a second protocol runs
  (standards-boundary law says after).
- **`/how-it-works`.** Send the rewrite.
- **60-word value proposition.** INKED 2026-09-01, then
  the sharper draft the same evening ("i like the sharper
  60 word draft"); the category clause in the first
  sentence 2026-09-03 ("agreed on all", AEO F19). Live as
  `VALUE_PROPOSITION`:

  > scvd.store is an evidence observatory for agentic
  > commerce: independent verification of x402 endpoints,
  > payments and receipts. Before an agent pays an x402 endpoint, we
  > check that it can be paid. After it pays, we check
  > the signed receipt. Over time we watch endpoints and
  > publish a dated, signed corpus. Sellers use it to
  > prove a door works; buyers use it before spending.
  > Every artifact is signed, expires, and names what we
  > did not see. Not escrow, not a rating, not a
  > guarantee.

  N2 applied it on every first screen (rule 44 sweep in
  `test/first-screen.spec.ts`). Do not write a second
  one-liner per marketplace; the npm packages do not
  list items and need no republish for it.
- **`/trust`, `/profiles` storefront slots.** ON, ruled
  2026-09-03 ("go ahead and do those", roadmap V1);
  `/passport` went on 2026-09-01 by your ruling.
- **The Aura Walk, nothing left to rule.** The copy on the
  row (`src/store/menu.ts`, the description, the 402 line and
  the constraints) is inked (2026-09-03, the ink sheet); the
  price, the model rule and the cap of one a week were yours
  already (cap ruled 2026-09-02, "agreed"; raise to two after
  the first three ship inside the window).
- **The Aura Walk, the first order.** TEST: when one lands,
  `/admin` prints the door under "Door to walk" and the
  buyer's detail under it. The passes are your machines and
  your wallet; what each pass paid is on its transcript. The
  report goes on the completed order as the deliverable.

### Directory and listings (press is yours, rule 30)

- **The ChatGPT plugin in review is the wrong shape by your own
  memo (2026-09-03 evening).** "SCVD General Store" was submitted
  that morning; the memo says submit "SCVD x402 Verifier" with five
  read-only tools. RULE: withdraw and resubmit, submit the verifier
  as a second plugin, or keep the one in review. The tool subset
  is roadmap A3 and builds the day you choose. Two more rulings
  from the same memo sit in
  `docs/DELEGATED_AGENT_PLAN_2026-09.md`: the package name for the
  verification front door (`x402-verify` 1.1, recommended, or a
  scoped `@scvd/...`), and the A2A task endpoint's shape (the
  spec's `message/send`, recommended).

- **Publish the two MCP servers at their new versions.** Both
  now speak MCP 2026-07-28 beside the handshake revisions
  (`server/discover`, per-request `_meta`, cache hints), every
  tool shows a worked call, the tab's parameters are all
  described. READ BY MACHINE 2026-09-03 (`npm run
  listings:check`, roadmap V4): the registry lists
  `general-store` 0.2.2 with the old description against
  0.2.3 in `server.json`, and `tab` 0.5.0 against 0.11.1 —
  npm already carries 0.11.1 (you pressed it 15:04 UTC), so
  step 1 below is done and step 2 is the one left. The same
  read found x402-list's copy without the doctrine sentence
  and counting 31 doors of 32 (their resubmit, below).
  ClawHub and agentic.market refuse the agent's egress; the
  Saturday job reads them from CI. Nothing outside reads it
  until you press:
  1. Actions → "Publish npm package" → `scvd-tab`, version
     `0.11.0`, dry run then real. The `--provenance` flag is
     in the workflow; a hand publish from the laptop is why
     VerifyMCP's provenance row reads Fail today.
  2. Actions → "Publish MCP registry listing" → `0.2.3`
     (store), then the tab's `server.json` at `0.11.0`.
  3. `wrangler deploy` (or the usual press) so
     `/.well-known/owners.json` goes live.
- **VerifyMCP claim.** LOOK, after the deploy:
  https://verifymcp.io/servers/store-scvd-general-store/scvd
  should read "claimed" from the owners.json within their
  re-check cycle. The tab has no host to serve one from;
  their other route is connecting the GitHub account that
  holds the repo, on their site. Your press.
- **DNSSEC.** VerifyMCP's one Fail on endpoint security.
  Cloudflare dashboard → DNS → Settings → Enable DNSSEC,
  then paste the DS record at the registrar. Five minutes,
  yours alone; no code can do it.
- **`check_before_you_pay` — rename or leave.** RULE.
  VerifyMCP reads "pay" in the name as an irreversible act
  and wants a `destructiveHint` on it; the tool declares
  `readOnlyHint: true` because it is read-only, and their
  grader discounts a destructiveHint under a read-only flag.
  The only fixes are a rename (drops "pay" from a name six
  documents use) or a false flag. Recommendation: leave it
  and take the row.
- **Context footprint.** RULE. VerifyMCP measures the
  store's tool and resource definitions at ~9.3k tokens (21
  items) and the tab's at ~2.3k (18) and calls both over
  budget. The store's descriptions are the product's own
  voice (rule 7, your pen) and were left alone; trimming is
  a wording decision, not a code one. The tab's grew with
  the parameter descriptions their other row asked for.
- **Sasame.** LOOK: their observatory query for
  `scvd-store-MCP` returned nothing; try `scvd.store`,
  `general-store`, or the bare `/mcp` URL — their probe
  (`sasame-audit`) did connect. https://srl-sasame.com
- **The handshake census venues.** LOOK, five minutes each,
  in order of handshake volume; the list with what each is
  lives in `registry/directory-blitz.md` under "Handshake
  census". Unopened as of 2026-09-02: glimind.com (286
  handshakes, the most of anyone), mcpbeat.com,
  proofbench.dev, mcphq.ai, hultra.link, golemreach.com,
  mcpplaygroundonline.com/mcp-checker, factanker.com,
  orank.ai.
- **endpoint.x402jp.com.** LOOK, five minutes, browser only
  (the sandbox cannot reach it). An x402 host index that
  found us on its own; we are row 50 of 1,031. Its row says
  61 routes at a 2.5 USDC median; the well-known file the
  same day says 39 at 0.99. Find whether it reads the Bazaar
  or the well-known file and whether a listing can be
  claimed or refreshed; nothing that wants a token. The
  full read and the table live in
  `registry/directory-blitz.md` §5 and
  `research/x402-pulse.md` under 2026-09-03.

- **ClawHub republish.** 3.15.0 went out 2026-09-02 by
  your hand (done), carrying everything since 3.8.0: the
  fortune, the doctrine sentence, the passport tier, the
  case file, the aura walk, the operator's statement. The
  tree and the registry agree at 3.15.0; the next press is
  due when `SKILL_VERSION` moves again.
- **x402-list owner update, round five (09-02).** Submitted
  by your hand: the five doors listed W35-W36 and the
  description. Their token is served at
  `/.well-known/x402list.txt` until 09-06 and then stops on
  its own (the file now renders from a dated list; no
  removal to remember). Request id is in
  `src/store/site-verification.ts`. LOOK that the update
  went through, then LOOK the description carries the
  doctrine sentence ("never a ranking, and never a verdict
  without its derivation and denominator beside it") and
  not the old one. LOOKED 2026-09-02 22:30 UTC by the
  agent: the update went through — the five doors first
  seen by their prober 21:52 UTC, all active, service
  ONLINE, 14 of 14 — but the description on file still
  ends "Not escrow, not a rating, not a guarantee" and the
  instruments list, WITHOUT the doctrine sentence (dropped
  in the update or capped by their field). And
  `operator_statement`, listed the same day, is not in
  their record. Both are one more owner update: resubmit
  the sixty-word description and add the sixth door. The
  "degraded" you saw on good_buyer was their intake window
  between submission and first confirmed check; by 22:23
  UTC it read online. daily_fortune active, DEGRADED gone:
  97, third of ~50. The last points, per the 08-24 read:
  signability re-capture (their eip712_domain_extra check
  read unknown from a pre-08-21 envelope; the live 402
  passes) and the FORTE tier (they pay one real call;
  `settlement_attestation` at $0.004 is the cheapest
  target). Both are asks through the same owner flow.
- **OpenAI / Claude MCP hosts.** LOOK: what they require
  to list vs what we already declare. Do not start a
  second WebMCP note.
- **skills.sh.** LOOK:
  https://skills.sh/seancrecord/scvd-general-store-repo
  — render or 404? Index lag, not a missing file.
- **Agent Almanac.** Submit returned 500. Optional: issue
  on `jonradoff/awesome-agent-almanac`, or email
  hello@agentalmanac.org. Not worth a fight.
- **W34 → `/registry`.** One press; may already be done.
- **Directory PR sidecar** (08-19). Follow-through.
- **LinkedIn for Record Creative Co.** Skipped
  2026-09-01: the page exists but is positioned for
  Little Wheels. No `sameAs`.
- **Press / NAP.** Rule 58. Apex links, not a redirect
  chain. No Wikipedia.
- **After the 60-word is inked:** paste it on npm
  package descriptions and marketplace profiles. Same
  sentence. Your press.

### Walks

- **Findability afternoon.** Run the batch 4 queries
  (attic). Write who appears. Google still blank for
  `scvd.store` / "SCVD general store." No new `/x402/`
  tree.
- **Indexability LOOK (dump 22).** `robots.txt` already
  allows and points at the sitemap. Titles, meta, OG,
  canonicals are derived from rooms. Confirm we are
  not blocking a major answer bot. Do not add
  BreadcrumbList or more JSON-LD types to score —
  Organization / Product / FAQ / Dataset already
  ship. LOOK, then a bug if something is actually
  noindexed.
- **Bank walk.** Records disagreed. Open the dashboard.
- **Outreach.** `/admin/outreach`, 08-19.
- **Shopfront rail line.** LOOK, check don't act.
- **Alerts mailbox.** One outside test mail.
- **Polygon flag.** On or dark? `/becoming` is silent.
  If on, graduate it; if dark, say so.
- **Maha Strategies observatory.** LOOK their surfaces
  the way we read Cairn. Do not write an arrangement
  until you say yes.
- **Agent Economy card, read (09-02).** Their 66% is not
  uptime: it is 21 of 33 CDP catalog rows answering 402.
  The other 11 are the retired shelf, each a 410 we
  serve on purpose (`a_secret`, `app_gutcheck`, `dibs`,
  `grudge`, `human_witness`, `nomenclature`,
  `phantom_check`, `phone_call`, `portrait`,
  `quick_judgment`, `the_drawer`). Eight of them have
  been 410 for the whole 17 days they have watched us,
  so 66% was the ceiling from day one, not a decline.
  The catalog admits on first settle and never delists;
  we never registered, so there is nothing of ours to
  re-register. The ward round now names these as
  `stale` on `/admin/ward` and alerts when the set
  changes. Three hands, in order:
  1. SEND the methodology ask to André (drafted in
     chat, not in the tree): a 410 carrying RFC 8594
     Sunset should read as retired, not down; and the
     request for the 33 URLs and which catalogs they read.
  2. SEND the removal ask to Coinbase CDP support: drop
     the 11 URLs. The only fix that lands on the catalog.
  3. RULED 09-02: the 11 doors stay shut.
  Separately: 9 menu doors have never settled and are
  not in the catalog at all (the next `our_doors`
  reading names them). One house buy each is their
  registration fee; their adoption signals exclude
  captive wallets, so the buys cannot flatter the
  grade. Their grade is still not ours. LOOK your books.
- **Receipt treaty.** Ask is drafted
  (`docs/RECEIPT_TREATY_ASK.md`). Send is your hand.
- **Key succession.** Gate is physical: a second seed,
  not beside the first. `PROBLEMS.md` #1. We cannot
  check it from here.
- **ERC-8183.** Seat ruled 08-18. Two gates still
  open: wallet-law blanks, testnet run. Do not
  relitigate the seat.
- **World ID** (#52 remainder). Your enrollment.
- **`launch_check` on Polygon.** Fund the field wallet
  with Polygon USDC. Not a code task.
- **Chrome origin-trial.** Expires 2026-11-17. Guard
  already derives expiry from the token. Google mails.
  Edge token still optional.

### Housekeeping, your machine

- `main-local-unrelated-backup` can be deleted.
- `claude/payment-methods-expansion-27gom3` remote can go
  (merged).
- Dependabot (#378 cheapest, then signing / x402-family).
  CI-green is not the merge bar. AT_SCALE rule 6.

---

## WAITING


---

## STANDING

- **Monday bounties:** paste CV's batch A draft at
  `/admin/market`. A board between postings is honest
  and earns nothing.
- **Sunday Grind:** ward round; Gazette draft behind
  THE_NINETY; recount before the digest; trip-wire
  glance; weekly `/llms.txt` cold read; glance at
  whether machine surfaces still fit their readers
  (rule 59).
- **Weekly corpus drop is the metric** —
  `docs/CORPUS_VELOCITY.md`.
- **Monthly ledger:** npm trends, census line, kill-
  criteria, and asking an outside model "where can an
  agent buy a signed artifact."
- **Rule 44** is a stop after changes, never a chore.
- **Assumption 0:** a stranger paying for a
  verification-tier item reorders the *roadmap* behind
  that item.
- **Serial (#65).** One branch. No parallel collision
  on agent-facing copy or digests.
- **Copy.** Draft, then ink. Rule 7.

---

## HOLD

Empty. Next paste lands here.
