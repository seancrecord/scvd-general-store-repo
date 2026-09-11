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

- **Corpus proof delivery verified (2026-09-09).** PR #588 deployed;
  all six listed snapshots served completed proofs at 14:32 UTC, verified
  against outside Bitcoin headers with signatures unchanged. This closes
  the delivery repair, not certificate/report population coverage. The
  compact reader has shipped; remaining population coverage is ROADMAP VQ4.
  The directory note was sent September 9; no methodology reply is recorded here.

- **x402-verify 1.3.0 published (2026-09-09).** The evidence CLI is on
  npm with verified provenance. A registry installation verified the
  saved receipt and reported its missing evidence; the subsequent 1.3.0
  install also verified six live corpus snapshots. The old 1.1.0 press
  is closed by this release; details and workflow receipt: DISTRIBUTION.md.
  The original certificate census's final Bitcoin proof was independently
  verified at 23:18 UTC: 262 of 262, with signed bytes unchanged. Retained
  evidence and its limits: `docs/EVIDENCE_RETENTION_FOLLOWTHROUGH_2026-09.md`.

- **Browser till purchase delivered (2026-09-06).** The keeper reported
  the delivered Small Blessing and full till reading. Certificate
  `cert_et6zuesrrn` verifies: patron 243, $0.005 USDC on Base, recorded
  at 22:48:31 UTC. This closes the reported browser-till purchase check,
  not paid WebMCP completion or every wallet/network combination.
  Browser and extension versions were not supplied. Evidence and the
  remaining test boundary: `docs/BROWSER_CHECKOUT_2026-09-06.md`.

- **Arbitrum and World checkout activated (2026-09-06).** The keeper
  entered `ARBITRUM_PAY_TO` and `WORLD_PAY_TO` on the store, using the
  existing Rainbow receiving address. That saved version needed a
  deploy; both settings were then mirrored to scvd-doors. Live store
  discovery and MCP quotes confirmed the same recipient across the
  four EVM checkout networks. No live payment or refund was made.

- **RULED 2026-09-06 — all ten, approved as shipped.** The rulings
  that were waiting on your pen are decided; nothing below needs
  work, and this row is the record rather than a queue. Each is one
  edit to reverse if you change your mind, and the file and symbol
  are named.

  APPROVED, in `src/services/outreach.ts` — the words strangers read:
  1. The broken-door note's subject, for a door that ANSWERED, is
     "a failed readiness check on your x402 endpoint at …" (was "is
     turning buyers away"). A door that gave no answer at all keeps
     the old subject, which is still true of it. `draftNote`.
  2. Its finding is "got an answer that did not pass our readiness
     check. What failed, by name: …", with the check definitions
     linked (was "a response that no x402 buyer can pay"). This is
     the sentence Ross wrote back about. `draftNote`.
  3. The re-check line names the moment rather than "seconds before
     this note was sent", which stopped being true once the hand
     road could send an hour after the probe. `draftNote`.
  4. The welcome KEEPS its "our weekly pass" opening. It dates by
     the knock now rather than the seal, which was the actual defect
     TensorFeed named; the phrasing was offered for a reword and you
     kept it. `draftWelcome`.

  APPROVED, in `src/store/retracted-readings.ts` — what a public page
  says about a named host:
  5. A passport whose latest row failed ONLY checks this store has
     since retracted no longer publishes `not-ready`. It refuses as
     `retracted-reading`, names the correction that withdrew it, and
     never upgrades to ready — we withdrew our reason, we did not
     acquire a verdict. Narrow by construction: round 2026-W36 only,
     three checks only, and only where the row's own recorded rails
     show the pre-correction reader could not have judged it.

  APPROVED, in `src/services/badge-svg.ts` — the artifact:
  6. The chip is a 400x110 card, not a 300x56 ribbon. THE ASPECT
     CHANGED, so a chip anyone pasted before 09-06 renders squashed
     until they re-copy the snippet. Both snippets emit the new size
     from `CHIP_LAYOUT` on their own. This is the only ruling with a
     cost to somebody outside.
  7. Forest-black ground, foil frame and seal, bevelled rim, bold
     type, and the store's dinosaur in the seal — drawn from the
     favicon's own path so the mark cannot drift between the two.
  8. The eyebrow reads `ENDPOINT PASSPORT`; the store's name is
     carried by the seal's arc legend.
  9. An `indeterminate` tier prints only its fraction on the face,
     never the word — the word is about how many rounds WE hold, not
     about their door, and it had been the loudest thing on a chip
     whose own decision was READY. The whole line still rides in the
     alt text and on the page.
  10. The freshness glosses are cut to fit the larger record line:
      "inside one census cadence", "older than one cadence", "too old
      to rely on". `CHIP_STATE`.

  AND THE NUMBERS, approved with them: a live reading arms a note for
  four hours (`LIVE_READING_FRESH_HOURS`); verify and re-read each
  press ten at a time (`VERIFY_BATCH_CAP`, `AUDIT_BATCH_CAP`).

- ⚑ **402signal.com / tensorfeed.ai — replied by your hand
  (09-06).** Both notes answered; nothing owed on either. What is
  left is not correspondence:
  1. LOOK, Sunday after 11:00 UTC: `/passport/402signal.com`.
     Until the walk re-reads with the corrected instrument it now
     refuses as `retracted-reading` naming the 09-04 correction,
     rather than asserting not-ready. After the walk it should
     issue. If it still refuses, paste the row here.
  2. LOOK: the outreach ledger's other hand-delivered W36 rows.
     Each got its note from a stored row. The re-read press below
     says whether the corrected instrument still agrees; any host
     that reads ready now got a note it should not have.

- ⚑ **LOOK — the re-read now runs itself (09-05, automatic 09-06).**
  Your ask, after two corrections in one afternoon: how the desk
  catches the next wrong note before its operator does. It no
  longer needs your press. Five doors a pass on the half-hourly
  tick, each door at most once a day, held against **what that
  note actually claimed** — frozen on the ledger when it went out,
  not against whatever this week's census says — and compared on
  the **checks the note named**, not on the ready/not-ready bit.
  It sends nothing, ever. `/admin/outreach#audit` still has a
  press for when you want the answer now; it walks up to forty in
  one go. Rows split three ways:

  - **OURS** — derived, not judged: every check that note named has
    since been retracted by this store, so the finding rests on an
    instrument we withdrew. The correction email is already written
    on the row; your press sends it. This is the 402signal shape.
  - **changed** — the claim no longer holds and nothing derives why.
    Healed since, or ours. The desk will not guess between those
    two and never will; **this is the list only you can work.**
  - **agree** — the note still holds at its door. Nothing to do.

  YOUR HANDS: you get paged when a row leaves `agree`, with the
  host named and the correction attached where there is one. Send
  the OURS corrections; decide healed-or-ours on the rest. Any host
  that reads ready now and got a "your door is broken" note is owed
  the same reply Ross got.

- **TEST — flip the doors (09-05).** You ruled the split; it is
  built on `claude/x402-list-latency-vegdlq`: `src/doors.ts`, a
  656 KB Worker (the store is 3.5 MB) that answers the unpaid
  knock on `/api/buy/*` with the store's own checks and hands
  everything else to the store over a service binding
  (`doors/wrangler.jsonc`). Locally it starts in 79ms against
  the store's 181; the canary said Cloudflare's floor is 5.
  `test/doors-parity.spec.ts` holds every door's answer
  byte-equal across both Workers. The flip is safe by
  construction — a doors Worker without its secrets hands
  every knock to the store — so the order is (1 to 5 DONE 2026-09-05 19:55 UTC by your hand; the doors answer):
  1. Merge the branch. The store deploys as always; nothing
     changes on the wire yet.
  2. `npx wrangler deploy -c doors/wrangler.jsonc` by your
     hand. This claims the route `scvd.store/api/buy/*`
     beside the custom domain (a route wins on its own paths;
     Workers docs, "Routes"). Every knock now passes through
     the doors and on to the store, marked `X-Scvd-Doors:
     not-ready`. Cost: one hop, no change in answers.
  3. Set the secrets on the doors Worker:
     `npx wrangler secret put SIGNING_KEY -c doors/wrangler.jsonc`,
     then PAY_TO_ADDRESS, CDP_API_KEY_ID, CDP_API_KEY_SECRET,
     the same values the store holds. Also mirror `POLYGON_PAY_TO`
     when that rail is enabled on the store. From the next knock the
     doors answer the 402 themselves.
  4. `npm run doors:live -- --doors=https://scvd-doors.seancrecord.workers.dev`
     reads every door at both hosts and prints agrees/differs
     per door, including agreement with discovery's advertised
     payment offers. All agree, or stop and paste it here.
     FOLLOW-UP 2026-09-06: discovery advertises Polygon, but live
     unsigned quotes omit it; a read of secret names confirms
     `POLYGON_PAY_TO` is absent on the doors Worker. Mirror the
     store's configured value there, then repeat this check. The
     repaired checker catches this even when both URLs hit the
     same Worker. APPROVED 2026-09-06: mirror the existing recipient,
     independently matched between discovery and the store MCP quote.
     Cloudflare refused the direct update because the latest uploaded
     Worker version was not deployed; apply it with the reviewed
     release deployment, then rerun this check. COMPLETED 2026-09-06:
     the approved recipient was mirrored, both Workers deployed, and
     all 32 live quotes agreed with discovery. No payment was made.
  5. Workers Builds → create a second project on this repo
     with deploy command `npx wrangler deploy -c
     doors/wrangler.jsonc`, so a push to main deploys both.
     Until then a shelf change needs step 2 again by hand.
  6. DONE 20:16 UTC: the doors knock cold in 177ms (136 over a
     warm 41), the canary in 31 (8 over 23); the 32-door burst
     woke 9 cold isolates and finished in 330ms. In the note.
     Was: READ, from your Mac after ten minutes of not touching
     a door, so the isolate at your colo is cold:
     `npm run cold:read -- --url=https://scvd.store/api/buy/hello --url=https://scvd-cold-canary.seancrecord.workers.dev/ --control=https://x402-list.com/robots.txt --burst`
     That is the store's cold penalty from a clean vantage,
     which the sandbox could never give (its proxy added
     ~370ms to every first knock; corrected in the research
     note 20:05 UTC). Paste it into the note.
  7. LOOK, the next morning: x402-list's per-check history
     (`/api/v1/services/sean-claude-van-damme-s-general-store/checks`)
     and `.github/workflows/cold-read.yml`'s artifact. The night
     reads should sit near 100ms with 31 of 31 found.
  Rollback at any step: delete the route in the dashboard
  (Workers → scvd-doors → Domains & Routes), or remove the
  `routes` block in `doors/wrangler.jsonc` and deploy it.

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
  deployed, then read the books check. THEN, THE SAME
  EVENING: the first press bumped the till's August Solana
  rail counter for both 2026-08-05 settles, and both
  certificates predate the rail-meter seam the certificate
  walk already counts up to — the storefront read 5 on
  Solana for 3. The rebook now leaves the rail count to the
  walk before the seam (the settle and the money still
  book). PRESS once deployed: `POST /admin/repair/rail-seam`
  with `{"transactions": [...]}` — the transaction half of
  each `counters_rebooked` entry from the payer-settles
  press. It checks every transaction against its certificate
  before a counter moves and refuses the rest with reasons;
  a second press is a no-op. Then read /rails: Solana should
  fall by two and rail_not_recorded rise by two. Corrections
  entry on the ledger. RULED 2: the verify-failure
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
  Human queue, a week's promise. Capacity is the later 09-04 ruling
  above, implemented in `aura_walk.weekly_inventory` in `src/store/menu.ts`.
  The row copy is inked (2026-09-03, the ink sheet). The original
  bundle was 3.14.0; the current publish receipt is
  `registry/clawhub/published.json`. Corrected 2026-09-06.
- Rule 59 inked 2026-09-01. Ceilings live in
  `src/store/reader-limits.ts`.
- Circle Agent Marketplace: submitted 2026-09-01, listed
  2026-09-04 at partners.circle.com/partner/scvdstore. On the
  trust record, the storefront sameAs and the README.

---

## NOW

- **LOOK — directory methodology reply; measurement now visible.** The
  keeper confirmed the attribution note sent September 9 to
  `info@x402-list.com`, subject “Base attribution for scvd.store”. A direct
  public read at 00:50 UTC September 10 now reports `measured`: 162
  settlements, $999.082 and 12 unique buyers over 30 days across Base,
  Polygon and Solana. The directory reports 99.79% of volume from one buyer;
  this is measurement visibility, not independently verified organic demand.
  Its `settled_via` label is Coinbase. The previous 20:56 UTC reading was
  `unmeasured-network`; retain that dated history. The visible status gap
  is closed. No methodology reply is recorded in this task; the keeper's
  inbox has not been checked. This was a public listing read, and does not establish
  that the note caused the change. A later release-closeout request returned
  HTTP 403; the last successful reading above is retained, with no new
  measurement verdict inferred. Refused-read record:
  `research/compact-corpus-packages-2026-09-10/directory-reread.json`.
  Do not send a duplicate.
  Data: x402-list.com (CC BY 4.0). Current capture:
  `research/verification-2026-09-09/retention-followthrough/directory-measured.json`.
  Original receipt evidence and the sent note:
  `docs/VERIFICATION_OBSERVATIONS_2026-09-08.md`.

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
- **Indexing diagnosis — repeat-purchase instruction withdrawn 2026-09-09.**
  The ward's one-query check could see at most twenty search results;
  its missing list did not prove absence. The keeper reports buying
  the listed doors twice. Do not ask for another registration purchase
  on that evidence. Read `/admin/ward/index`;
  for any doors still unreturned, reconcile existing receipts, discovery
  metadata and settlement. Receipt details unavailable to the public
  reader may need his lookup; a build does not belong on this row.
  The keeper resumed that investigation the same day. The retained records
  and current validator have been read; see `docs/SPEC_READS.md` for the
  evidence and its limits. Existing index gaps remain unresolved; another
  purchase has not been requested or made.
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
- **The Aura Walk cap, 2026-09-02 (superseded 09-04).** The original
  one-slot limit and conditional increase are historical; the 09-04
  ruling above and `aura_walk.weekly_inventory` are current.
  Cross-reference corrected 2026-09-06.
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

### A corpus a buyer must check (2026-09-10, ROADMAP CV0–CV2)

- **LOOK** — after the next Sunday round, open `/corpus/asked.json`.
  If `hosts_asked` is 0 the free surfaces are not being asked about
  unmet hosts, which is its own finding; if hosts sit in
  `swept_no_door_found` for three weeks, the sweep is reading hosts
  that publish no `/.well-known/x402`, and the queue's cap is
  spending reads on them.
- **RULE** — seller declarations, ruling 1
  (`docs/SELLER_DECLARATIONS_2026-09.md`): is attaching and reading
  a declaration free, forever? Recommended yes; the paid instrument
  is a watch on the match line, already priced as an endpoint watch.
- **RULE** — seller declarations, ruling 2: does a declaration for a
  host the feeds do not name enter the asked-for queue at the top of
  its week? Recommended yes; it does not jump the roster cap.
- **RULE** — federation (`docs/FEDERATION_2026-09.md`): does a
  second observer's verified row enter the signed snapshot at its
  own tier (`federated_rows[]`, the crowd-walk precedent), or sit
  beside the chain in a file of its own? Recommended inside. No
  build until a named party asks to submit rows.

### The Trade Counter (2026-09-03, `TRADE_COUNTER.md`)

- **TEST** — send Hal the ten questions in `TRADE_COUNTER.md`.
  Two of the answers are dialect fields (`timestamp_unit`; whether
  the provider key is a separate secret) and both fail closed if
  guessed wrong. Nothing goes live until they answer.
- **Hands (Hal issues ONE PAIR PER LISTING; nothing is minted here)** —
  create one PAUSED listing per item at
  `https://sell.halmarket.dev/services/new`: endpoint URL = the
  item's `door` on the hal row of `/api/trade/contract` (nine of
  them), payment type "API key", price = a fixed integer in sats at
  or above that item's `trade_price_usd` at the day's rate, rounded
  up. After each create Hal shows that listing's provider key and
  signing secret; put them under the ITEM'S names, never through a
  chat with an agent:
  `wrangler secret put TRADE_PROVIDER_KEY_HAL__<ITEM_ID>` and
  `wrangler secret put TRADE_SECRET_HAL__<ITEM_ID>` (item id
  upper-cased: `TRADE_SECRET_HAL__CONTEXT_ANCHOR`). Eighteen puts.
  The contract row flips to `provisioned: true` and `secret_scope:
  per_listing` on its own, and each item row says whether its pair
  is set. Confirm to Hal only the listing ids and `is_paused: true`.
  No paid canary without your word and theirs; the fixture on the
  row is the no-spend check.
- **DONE 2026-09-05** — `hal` flipped to `live` on your word, the day
  the nine listings went live on Hal's side. Hal pays sats over
  Lightning (OpenNode, mainnet) at 95% of each listing's fixed sats
  price; there is no bilateral statement API, so the weekly
  reconciliation is their seller dashboard against
  `/api/trade/hal/statement`, and each payout you receive is
  recorded by hand at `/admin/trade`.
- **⚑ WATCH — the credit ceiling is $2,500 of unpaid net** (raised
  from $250 on 2026-09-05). Past it the door refuses
  `credit_ceiling_reached` and Hal refunds a real buyer, so record
  each payout at `/admin/trade` as the sats arrive. The figure is a
  dial on the account row, not a rule; raise it again if Hal's payout
  cadence is slower than the sales rate. Which wallet receives the
  sats, and whose custody, is still yours.
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

- **RECORD THE LISTINGS AND ROSTER BASELINES — after PR 525 merges.**
  The Saturday job gained a third battery that re-reads all forty-nine
  venue rows served at `/.well-known/trust.json`, and it has nothing to
  compare against until a baseline exists. From a clone on a machine
  with ordinary internet — NOT the agent's sandbox, which reads 43 of
  49 as unreachable and would bake that in as truth:

      git checkout main && git pull
      npm run listings:check -- --record
      git add docs/listings/ && git commit -m "Record the listings and roster baselines" && git push

  No `npm install` needed; the battery is Node builtins and fetch.
  Writes `docs/listings/observation.json` (mirrors) and
  `docs/listings/roster.json` (the roster). Expect some rows to read
  `silent` on the first pass and do NOT read those as delistings — a
  venue that renders in JavaScript serves HTML naming nobody. The
  first recording freezes what is true; the alarm only fires when a
  row later moves DOWN from what it recorded.

- **Package presses closed September 10.** CLI 0.3.0, Sign 1.0.3
  and corpus client 0.1.0 published through the provenance workflow.
  Fresh registry installs match the reviewed bytes and verify their
  attestations. No press or credential update is needed for these releases.
  Receipts and exact checks: `DISTRIBUTION.md`.
- **Preflight name resolved for the adoption release, September 10.**
  Continue with proposed `scvd-preflight`, accepted with the keeper's
  instruction to complete adoption. The source directory stays
  `x402-preflight/`; npm's `x402-preflight` belongs to another project.
  Defects 0.13.0, MCP starter 0.1.0 and preflight 0.1.0 are now published
  and verified against the reviewed archives, repository commit and
  provenance runs. No keeper press or credential change remains.
  `docs/ADOPTION_AND_LATENCY_2026-09.md` records the release checks.
- **Tab registry press closed, checked September 10.** `scvd-tab`
  0.11.1 matches every published file in this tree. No Tab release
  is needed for compact corpus discovery. Evidence: `docs/OPENAPI_HEADROOM_2026-09.md`.

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

- **RULE: the crawler 404s are a secrets scan, not crawlers
  (2026-09-11).** The 4xx tab you pasted names the top paths:
  `/stripe.json`, `/ssl/localhost.key`, `/@fs/app/.env.local`,
  `/firebase-service-account.json`, `/config/master.key`,
  `/docker-compose.prod.yml`, `/app/.env.staging`,
  `/.openai/config.json`, plus `/fetch` and `/proxy`. That is a
  vulnerability scanner probing for leaked credentials, sent under
  spoofed AI user-agents (Claude-User, GPTBot, ChatGPT-User,
  OAI-SearchBot, Bytespider all appear on it in near-equal shares,
  which no real crawler population does). None of those files exist
  here and 404 is the right answer; nothing gets redirected, on
  purpose. Two of the true guesses were answered on 2026-09-10
  (`/.well-known/ai-plugin.json`, `/index.html`). The one decision
  that is yours: Cloudflare can challenge or block a request whose
  user-agent claims a known AI crawler but whose source does not
  verify as that bot (WAF rule on `cf.verified_bot_category`, or
  AI Crawl Control's "block unverified" toggle). It removes the
  spoofers from the panel and the 404 bill and touches no real
  crawler. The store's stance welcomes crawlers; this welcomes only
  the ones that are who they say. Your press, if you want it — and
  the exact shape matters (2026-09-11): NOT the dashboard's "Block
  AI bots" toggle, which blocks VERIFIED crawlers too (ClaudeBot,
  GPTBot, OAI-SearchBot, PerplexityBot by name) and would undo the
  whole robots.txt position in one click. A custom WAF rule, action
  Block: user-agent contains any of ClaudeBot, Claude-User,
  Claude-SearchBot, GPTBot, ChatGPT-User, OAI-SearchBot,
  PerplexityBot, Perplexity-User, Amazonbot, Applebot,
  Meta-ExternalAgent, Bytespider, CCBot, Googlebot, bingbot — AND
  `not cf.verified_bot`. Every name on that list is one Cloudflare
  verifies (Claude-User and ChatGPT-User as "AI Assistant",
  ClaudeBot as "AI Crawler"), so a real one always passes and the
  /mcp traffic from claude.ai is untouched; a name Cloudflare cannot
  verify (YouBot, Kimi, ora-agent, xAI) stays OFF the list, or the
  rule would block the honest ones. The store's own probes present
  `scvd-*` user-agents and are unaffected. Watch the panel a week:
  the 4xx bill moves to 403s and the 200s do not move.

- **LOOK: what does www.scvd.store answer? (2026-09-11).** Cloudflare's
  AI-answers panel shows requests landing on `www.scvd.store` (12 to
  `/fetch` alone). The name resolves to Cloudflare, but the Worker's
  only route is the apex (`wrangler.jsonc`: `scvd.store`, custom
  domain), and nothing in the code canonicalises `www`. So whatever
  www serves today is not the store. Run `curl -sI https://www.scvd.store/`
  from your machine (this build's egress refuses the host). If it is
  not a 301 to `https://scvd.store/`, add one: Cloudflare → Rules →
  Redirect Rules → "www to apex", 301, preserve path and query. One
  rule, no code. A duplicate host that answers is a duplicate an
  indexer has to adjudicate; a host that errors is a door that reads
  as broken.

- **Hugging Face: the verifier Space is built; the push is yours
  (2026-09-11).** `spaces/scvd-x402-verifier/` — Gradio, `mcp_server=True`,
  five read-only tools fronting `/mcp/verifier`, nothing paid
  reachable, no secret held; launched locally and its MCP schema
  listed the five. Three commands and the token scope (fine-grained,
  that one Space, an expiry) in `registry/huggingface/README.md`,
  under the `keeper-scvd` namespace that already holds the corpus
  dataset. Afterwards, the hf-discover read to file beside 09-06's
  zero.

- **The ChatGPT plugin: your press, confirmed (2026-09-11).** You
  submitted "SCVD General Store" on 2026-09-03 (DISTRIBUTION §5b);
  it points at the full `/mcp` door and sits in review. The open
  risk there is unchanged: the scan lists six `buy_*` tools and
  OpenAI's guideline bars digital commerce. If the review objects,
  the resubmission is the five-tool verifier already served at
  `/mcp/verifier` — the same door the Hugging Face Space wraps.

- **The WAF rule, paste-ready (2026-09-11).** You said block them; the
  first paste failed on a trailing quote and the doc now says so, with
  the field every plan has (`cf.client.bot`).
  `docs/CLOUDFLARE_WAF_SPOOFED_CRAWLERS.md`: the exact expression,
  the one toggle NOT to press, and what to watch for a week. A test
  holds every name in the expression to the roster robots.txt
  welcomes.

- **GitHub Agent Finder: CV's PR is open; two entries and one number
  to fix (2026-09-11).** CV opened github/agentfinder-catalog#34 on
  2026-09-06 with the store skill alone; no review as of 09-11. Its
  description says "from $0.004" where the SKILL.md and the store
  say $0.001 — edit the PR body. The before-you-pay skill and the
  MCP server entry drafted in `registry/agentfinder/catalog/seancrecord/`
  are not in it: push them onto CV's branch before merge, or a second
  PR after. Hugging Face: CV reports a submission; paste the link so
  it gets a row (nothing on file says where). The tab still has no
  entry until its registry version is republished.

- **Desvela Registry Watch activation (2026-09-06).** After the receiver
  is deployed at `https://scvd.store/webhooks/desvela-registry`, register
  the watch separately and install the returned secret with
  `npx wrangler secret put DESVELA_REGISTRY_SECRET` on the store Worker.
  Keep the manage_token privately. No watch was registered by this build.
  Until setup, the receiver returns 401. First real delivery is the
  remaining integration check; receipts are reviewable at
  `/admin/desvela-registry.json`. See `docs/DESVELA_REGISTRY_WATCH.md`.

- **ARD Registry account submission (2026-09-06).**
  Keeper-provided submission-screen output confirms live discovery,
  v1.0 schema/formats and did:web verification passed for all 21 entries.
  The INDEX step explicitly says dry-run. Remaining press at
  https://ardregistry.org/submit: add request description, Confirm & Submit
  for review, then verify SCVD appears in its public search.
  Neuronto and WellKnown already return SCVD from their own indexes.
  Evidence and publication status: `docs/ARD_DISCOVERY_2026-09-06.md`.
  Weekly discovery checking is scheduled in the active task.


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
  in handshake order. A handshake is one `clientInfo.name` the
  MCP door recorded at `initialize`, so every name here is a
  crawler that found us unprompted and is likely already
  carrying an unclaimed row. Unopened, re-checked against
  `src/store/trust-signals.ts` on 2026-09-06: glimind.com
  (286 handshakes, the most of anyone; opt-out at
  glimind.com/opt-out), proofbench.dev (11), factanker.com
  (7), orank.ai (7), mcpplaygroundonline.com/mcp-checker (7),
  modc2.com/mcpscan (6), golemreach.com (2), mcphq.ai (2),
  donnees.hultra.link (2). **mcpbeat.com left this list
  2026-09-06: it carries both servers and has been a trust
  signal for some time — the census had gone stale against
  the served record.** The full 2026-09-02 read, with what
  each venue is, is history in
  `docs/archive/DIRECTORY_BLITZ_2026-09-06.md`.
- **endpoint.x402jp.com.** LOOK, five minutes, browser only
  (the sandbox cannot reach it). An x402 host index that
  found us on its own; we are row 50 of 1,031. Its row says
  61 routes at a 2.5 USDC median; the well-known file the
  same day says 39 at 0.99. Find whether it reads the Bazaar
  or the well-known file and whether a listing can be
  claimed or refreshed; nothing that wants a token. The
  full read and the table live in `research/x402-pulse.md`
  under 2026-09-03, and in §5 of
  `docs/archive/DIRECTORY_BLITZ_2026-09-06.md`.

- **ClawHub republish.** 3.15.0 went out 2026-09-02 by
  your hand (done), carrying everything since 3.8.0: the
  fortune, the doctrine sentence, the passport tier, the
  case file, the aura walk, the operator's statement. The
  3.16.0 publication was observed on 2026-09-06 and recorded in
  `registry/clawhub/published.json`. The tree now holds 3.16.1:
  secondary checkout/reader copy and browser-till limits corrected.
  Publish that bundle after its merge/deploy; the published record
  remains 3.16.0 until the next successful press is observed.
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
- **skills.sh and MCPFind.** DONE 2026-09-08: the keeper supplied
  both listing URLs; live reads confirmed the named skill and server.
  Skills: https://www.skills.sh/seancrecord/scvd-general-store-repo/scvd-general-store
  (the old repo-only URL omitted the skill). MCPFind:
  https://mcpfind.org/servers/store-scvd-general-store.
  Recorded in the trust signals and distribution docs; indexing
  only, not an endorsement or proof of purchases.
- **Agenstry.** DONE 2026-09-08: both keeper-supplied pages were
  fetched and read. Agent: https://agenstry.com/agents/scvd.store.
  MCP: https://agenstry.com/mcp/store.scvd/general-store. Clean
  URLs recorded in the discovery signals and distribution docs;
  directory presence only, without adopting the directory's grades.
  Keeper decision, 2026-09-08: wait for their assessment refresh;
  their record cannot be edited from our side. No outreach requested.
- **Agent Plugins Directory.** DONE 2026-09-08: existing listing
  re-read at https://agentpluginsdirectory.com/plugins/scvd-general-store.
  Confirmation date refreshed; the record now describes the plugin
  bundle and the directory's manifest check, not only the MCP server.
- **robinsaige.com, Crosspeel, 402.ad, VerifyMCP.** DONE 2026-09-10:
  the keeper supplied four listing URLs. Two were new and are now
  trust rows: https://robinsaige.com/s/store.scvd/general-store and
  https://crosspeel.com/endpoints/scvd-store/. Two were already
  rows and had their confirmed date refreshed: the 402.ad service
  page and the VerifyMCP store page. Neither new host answers the
  sandbox, so the rows state only what the address establishes and
  the register marks both pages unread. LOOK, five minutes: what
  each of the two new pages actually measures, so the row can say
  it in their words; and whether either offers a claim or refresh
  route. Indexing only, not an endorsement or proof of purchases.
- **PublishYourSaaS, AI Tools Capital, Cursor re-read.** DONE
  2026-09-10 (second press of the day): two more keeper-supplied
  pages are trust rows —
  https://publishyoursaas.com/listing/scvd-store (opens with the
  sixty words' first sentence) and
  https://aitoolscapital.com/tools/scvd-general-store/ (a
  review-shaped page). The Cursor Directory page you pasted reads
  right where it derives from this tree: both MCP servers carry
  the exact configs `mcp.json` declares, one skill, the
  evidence-observatory lead. Its tag cloud is a cached snapshot
  (clawdhub, openclaw, personal-agents, marketplace beside the
  current topics) — nothing to change here; it lags until their
  rescan. Row refreshed. Neither new host answers the sandbox;
  rows say what the search snippets showed and no more.
- **The listing scan (2026-09-10).** LOOK, five minutes each,
  in this order; each is a register row and becomes a trust row
  the day you open it (`research/listing-scan-2026-09-10.md`
  has the snippets):
  1. https://agenteconomy.report/s/scvd.store — rates us CCC
     "declining": 6 organic paying agents, $1 settled, 66%
     uptime. The till and x402-list's 100% row disagree with
     it. Read how it counts before deciding who is wrong.
  2. https://vouch-protocol.com/agent-trust-index/ — grade A,
     100, on did:web + Ed25519 JWK. One table, no page of ours.
  3. https://x402lens.com/services/scvd-general-store-scvd-store
     — per-door listing; its facilitator page puts us at
     $777.77 routed through Coinbase. Their denominator.
  4. https://trylaunch.ai/launch/scvd-store — posted by
     "davidaidirectories", not you. Is that one of the paid
     directories? The row does not know.
  5. https://whattheai.tech/tools/scvd-store — reads us as
     consumer-trend analytics. Wrong; find the correction route.
  6. https://talkshi.com/agent/x402-scvd-store — a marketplace
     that routes x402 calls through its own account and carries
     reviews. What does our profile say?
  7. https://www.influzer.ai/mcp/seancrecord-scvd-general-store-repo
     — a mirror of mcpservers.org; its second entry still
     carries the July name.
  8. https://pluginbench.com/mcp/store.scvd/general-store —
     guessed from their pattern; we appear in the rails of
     other servers' pages with the August text.
- **`STORE_TAGS` said agent-memory and human-labor.** RULED
  2026-09-10 ("this sounds like we need to update it"): the two
  July tags came out of `src/store/metadata.ts` and `plugin.json`,
  and `attestation` and `conformance` went in — the nouns the
  sixty words and the registry description lead with. Still five,
  the Bazaar payload cap. What reads them: the Bazaar registration
  (re-registers on the next press), the ARD catalog and the
  well-known files (live on deploy), and the plugin keywords
  (Cursor and the plugin directories pick them up on rescan).
  LOOK after the deploy: `/.well-known/x402` carries the five.
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
