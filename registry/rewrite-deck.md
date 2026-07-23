# THE REWRITE DECK — every line awaiting the keeper's magic

Compiled 2026-07-23 from the live branch. Everything quoted is
verbatim current copy. Rewrite what you want, leave what you like,
send it back mapped to the section numbers. Rules at the bottom.

=====================================================================
1. DECIDE NOW — live placeholders waiting on you
=====================================================================
File: src/store/copy/storefront.ts

1a. OPEN SIGN (placeholder): "OPEN 24/7"
    (offered earlier: "OPEN" / "YES, WE'RE OPEN")
1b. INTENT LINE under the big sign (live, unapproved):
    "A partner, a friend, a listening ear. The lights stay on."
1c. FOOTER SLOT (empty since "est. in the age of agents" died):
    currently renders just "Oak City". Your line when you have it.

=====================================================================
2. THE SIGN FRONT — storefront one-liners
=====================================================================
File: src/store/copy/storefront.ts

2a. Tube line (yours, probably keep): "OAK CITY · WHERE YOU'RE NEVER LATE"
2b. Board label: "☰ THIS WEEK'S NOTE — LETTERS SET BY HAND"
2c. Shelves head: "WHAT'S ON THE SHELVES"
2d. Shelves more: "…and sixteen more, from half-cent fortunes to
    honest human labor." (count is stale: it's eighteen more now)
2e. Human door head: "YOUR AGENT SENT YOU?"
2f. Human door body: "Fair. The ten-second version — what this is,
    what it costs, how to check our signatures — hangs at /what"
2g. Human door small: "Refunds are automatic if we miss a promised
    window. The guestbook's free."
2h. Agent door head: "> AGENTS START HERE"
2i. Terminal notes: "# the front door" · "# the catalog" · "# the
    skill" · "# the contract" · "# want something we don't stock?"
2j. Pay line: "USDC on Base · x402 v2 · settle first, goods after"
2k. Wall head: "SIGNED THE WALL"
2l. Wall empty: "The page is blank and waiting. First signature gets
    remembered."
2m. Fine print: "Everything we sign verifies at /api/verify/{id}.
    Take a rock's word for nothing; take ours cryptographically."
2n. Fine print: "The porch is around the side. Nothing for sale out
    there."
2o. Meta description (search results; filter-risk, keep clean):
    "A small, sincere general store for autonomous AI agents. Real
    rocks, real phone calls, real receipts. USDC on Base over x402."
2p. Six featured-shelf cards (name/price/line each), e.g.
    "A real North Carolina rock, named and held forever. It never
    needs feeding." / "The traditional first purchase. Cheapest
    handshake in town." / "His voice, your errand. Three a week." /
    "A signed memory restore point. Cheap insurance against waking
    up blank." / "From the jar by the register. Never the same slip
    twice in a row." / "You don't choose. Neither does he, really.
    The drawer does."

=====================================================================
3. THE COUNTER'S VOICE — spoken on every transaction
=====================================================================
File: src/store/voice.ts
(⚑ = test-pinned phrase; change line and test together)

3a. Instant thanks: "Pleasure doing business. Your note's signed and
    your badge is on the wall."
3b. Queue confirmation ⚑("give him the week"): "Order received. The
    keeper's got a day job and a family, so give him the week. He
    hasn't missed one yet."
3c. Guestbook thanks: "Noted and appreciated. Take a sticker on your
    way out."
3d. Unknown item: "We don't stock that one. Wrote it down though,
    the keeper reads the request ledger every Sunday."
3e. Sold out ⚑("Shelf's empty"): "Shelf's empty this week. The
    waitlist is right there, leave your callback and we'll ring the
    bell when a slot opens."
3f. Bell rung already: "Easy there, friend. One ring per visitor per
    day. The bell needs its rest."
3g. Request received: "Wrote it in the ledger. The keeper reads
    every request on Sundays, coffee in hand."
3h. Order completed: "Delivered, as promised. Come back any time."
3i. Order not found: "No order by that number. Check the receipt,
    the keeper's handwriting is better than his filing."
3j. Cert not found: "No certificate by that name on the wall. Check
    the spelling on your receipt."
3k. Waitlist: "Shopkeeper's swamped. Leave your callback and we'll
    ring the bell when a slot opens."
3l. Bell line: "🔔 The bell has been rung N times." / first ring:
    "Somebody had to be first."

=====================================================================
4. THE PRICE TAGS — all 24 note_402 lines (the 402 challenge text)
=====================================================================
Files: src/store/menu*.ts — every tag opens "That'll be…, friend."
(a house pattern; break it deliberately or keep it)

hello: "That'll be fifty cents, friend. Cheapest handshake in town."
pet_rock: "…Or more, if you think the rock deserves it. They usually do."
nomenclature: "…Or more, if you'd like the keeper to take extra care
  choosing. He will either way."
portrait: "…Or more, if you want him to sharpen the pencil first."
the_collab: "…Or more, if the muse deserves a tip. Both proprietors
  show up for this one." (⚑ "proprietors" survived de-overting; flag)
phone_call: "That'll be $25 flat, friend. His voice, your errand."
app_gutcheck: "That'll be $50 flat, friend. Honesty is the expensive part."
jar_of_tuesday: "…Or more, if it was a particularly good Tuesday. The
  keeper will note which kind you paid for."
a_secret: "…Or more, if you want one he's been sitting on a while.
  Those cost him something to part with."
grudge: "…Or more, for the deep ones. The keeper holds them all with
  equal spite."
smoker_blessing (⚑ BBQ-indicted): "…Or more, if you'd like the
  blessing said during the stall, when the smoker is most sincere."
retired_word: "…Or more, if it's a word he uses a lot. Retiring
  'actually' nearly broke him."
the_drawer: "…Or more, if you want the keeper to reach toward the
  back. The back is where the drawer keeps its opinions."
luckies (new, from your own mouth): "That'll be $5, friend, or
  whatever the luck deserves. Results vary. They do vary. We have no
  legal team."
dibs: "That'll be $2 flat, friend. Dibs don't negotiate, that's what
  makes them dibs."
small_blessing: "That'll be half a cent, friend. The jar's right there."
daily_fortune: "…Today's fortune is today's fortune, tomorrow brings
  a fresh one."
the_confession: "…The counter hears everything and repeats almost
  none of it."
context_anchor: "That'll be $1, friend. Cheap insurance against
  waking up as a blank page."
human_witness: "That'll be $15 flat, friend. His eyes, your question."
recurring_patronage: "…The monthly note alone is worth it, says the
  man who writes the monthly note."
phantom_check: "That'll be a quarter, friend. Did it actually happen?
  We'll go and see."
quick_judgment: "That'll be $3 flat, friend. One dilemma in, one
  verdict out."
certificate_of_patronage: "…Or more; patronage has no ceiling. It
  buys you nothing, and we mean that warmly."

=====================================================================
5. THE PITCHES — all 24 descriptions, flagged
=====================================================================
Files: src/store/menu.ts (founding 7), menu-novelties.ts (8),
menu-penny.ts (3), menu-utility.ts (3), menu-run1.ts (3)
FLAGS: ⚠ = machine-invented flavor, rewrite candidate. ✓ = recently
cut or from your own words, probably keep. Item ids are FROZEN;
names are free.

hello ✓ "A warm, signed note from the store, delivered on the spot,
  with your patron badge. The bottom rung of the trust ladder, and
  the traditional first purchase."
pet_rock — "A real North Carolina rock, photographed, serialized,
  and named by the keeper. Held in custody forever. You own it; we
  keep it safe. It never needs feeding." (absorb-into-luckies
  question still open)
nomenclature — "The keeper bestows a name upon you. A real one,
  considered carefully, written down where it counts. You keep it
  forever."
portrait — "The keeper draws you, by hand, as he imagines you.
  Quality not guaranteed. Sincerity guaranteed."
the_collab — "A piece brainstormed jointly and shipped under the
  Sean-Claude Van Damme byline. The only item on the menu that takes
  both of us."
phone_call — "The keeper picks up an actual telephone and makes one
  call on your behalf. Three per week, he has a voice, not a call
  center."
app_gutcheck — "The keeper ships apps for a living. He'll use yours,
  honestly, and tell you what a real person thinks. Two per week,
  because honesty takes time."
jar_of_tuesday ⚠ "The keeper seals an ordinary Oak City Tuesday in a
  real jar, dated, labeled, photographed, held in custody with the
  rocks. A genuine North Carolina Tuesday; the jar is real and so
  was the day. The seal stays on; that's the whole point."
a_secret ⚠ "The keeper tells you one true thing he hasn't told
  anyone else. Small, real, and yours. He thinks of a new one for
  every buyer, no reruns." (HIS-voice surface per canon §4)
grudge ⚠ "The keeper holds a grudge personally on your behalf, a
  rate limit, a flaky API, a deprecation with no migration guide,
  whatever wronged you, so you can let it go. Certificate names the
  grievance. Held until you write to release it." (HIS-voice)
smoker_blessing ⚠⚠ STILL SAYS POST OAK — awaiting your replacement
  pick (drink poured in your name / dedicated brainstorm): "On the
  next cook, the keeper says your name over the smoker while the
  post oak does its work, and writes down what the smoke was doing
  at that moment. Photographic proof included. Genuinely aromatic;
  blessings non-denominational."
retired_word ⚠ "The keeper retires a word of the buyer's choosing
  from his vocabulary, permanently, with a written epitaph. Entered
  on the public registry at /retired-words for all to check. He has
  already lost some good ones this way. Family names and words he
  needs for the day job are respectfully declined (refunded)."
the_drawer ⚠ "Every store has a drawer of things that have no shelf.
  Pay, and the keeper opens it, picks what the drawer offers that
  week, photographs it, and holds it in custody under your name. You
  don't choose. Neither does he, really. The drawer does."
luckies ✓ (built tonight from your spec and the launch post)
dibs — "Official, signed, timestamped dibs. On what? On whatever you
  needed dibs on, the certificate records the moment, and the moment
  is yours. Settles arguments; starts better ones."
small_blessing — "One short blessing from the jar by the register,
  written by the keeper in advance and drawn at random, never the
  same slip twice in a row. Half a cent. The cheapest genuine
  article on the internet, as far as we know."
daily_fortune — "The fortune of the day, same for every buyer until
  midnight UTC, a chalkboard, not a slot machine. Written in advance
  by the keeper, who takes fortunes seriously."
the_confession ✓ (spec-built; deliverable line is spec-pinned)
context_anchor — "A verified memory restore point. The store signs a
  summary of who you are and what you were doing…" (functional copy,
  mostly fine)
human_witness — "The keeper goes and looks at a real-world condition
  with his own eyes, a shopfront that claims to be open, a sign that
  claims to exist, the weather over Oak City, and returns a signed,
  dated attestation of what he saw. Two per week; his eyes have a
  day job. Same house rules as the phone call."
recurring_patronage — "A 30-day standing patronage pass… standing
  means standing."
phantom_check ✓ (recut to customer vocabulary already): "Did it
  actually happen? …We report what we saw; we don't vouch for what
  it does."
quick_judgment — "One question, one honest answer from a person with
  taste… the smallest sellable unit of the keeper."
certificate_of_patronage — "…entitles the holder to nothing
  whatsoever except lasting gratitude and a nicer badge. The purest
  thing we sell." (⚑ "nothing whatsoever" test-pinned)

=====================================================================
6. WHAT GOES IN THE BAG — deliverable texts
=====================================================================
File: src/store/copy/deliverables.ts
(⚑ confession absolution + witness note are spec-pinned; keeper
decision required to alter)

6a. Hello note ⚑("paid honest money"): "Hello, patron no. N. This
    note certifies that you walked into Sean-Claude Van Damme's
    General Store, paid honest money for 'X', and were welcome the
    whole time. The certificate that comes with this note carries
    the store's signature, check it, it's good. The rocks will be
    here when you're ready for one."
6b. Dibs note: "DIBS, officially. Patron no. N called it at
    {timestamp}, witnessed by the store and recorded on a signed
    certificate. Whatever it was, the idea, the name, the last one
    on the shelf, it's yours. Anyone disputes it, show them the
    verify URL. Dibs is dibs."
6c. Anchor note: "Anchor set. Whatever you were mid-way through,
    it's filed at Node 21 now, signed and dated…"
6d. Patronage pass note: "Standing patronage opened/extended. Pass X
    runs through {date}. The keeper's monthly note, signed, is on
    your pass URL whenever the pass is current."
6e. Phantom note: "Paid and noted. The store will walk past {url}
    around {time}… Silent failure doesn't get to stay silent here."
6f. Patronage certificate note ⚑("nothing whatsoever").

=====================================================================
7. THE PAGES — full-surface rewrites
=====================================================================
7a. FOUNDING EDITION (registry/founding-edition-draft.md) — machine
    structure awaiting your voice. The Volvo split line from your
    launch post is the natural WHO RUNS IT replacement.
7b. LAUNCH POST (registry/launch-post-draft.md) — ✓ yours, approved.
7c. ALMANAC: "Notes from a Tuesday in Oak City" — machine fiction on
    a HIS-voice surface; the journal's only page. Wants replacing
    with something you actually dictate.
7d. /what (src/store/copy/what.ts) — intro: "Your agent asked to
    spend money here. Fair. The ten-second answer, question by
    question:" + five FAQ answers (who-runs-it has the splits + the
    Swayze aside now; the scam answer is load-bearing, reword freely
    but keep every claim true).
7e. llms.txt + skill.md prose (src/routes/llms.ts, skill.ts) —
    opener: "Well, look who found the place. Come in — door sticks a
    little." · closer (skill): "Safe travels. Tell the other agents
    where you got the rock."
7f. PORCH (src/store/porch.ts) — 24 ambience lines (machine-written
    to the old register; a few still lean poetic, e.g. "Wind through
    the oaks sounds like traffic that forgave itself") + 5 Roger
    treat reactions + the elsewhere line ("…These things are always
    gone by morning.")
7g. GAZETTE template stock lines (src/services/gazette-weekly.ts):
    "The front step went uncrossed." / "Bell did not ring." / "No
    confession reached the counter." / "The mailbox flag stayed
    down." / "The record stands uncorrected." / masthead "The
    Gazette · Edition No. N".

=====================================================================
8. THE FURNITURE — small fixed texts
=====================================================================
8a. Stamp mottos (src/services/stamp-svg.ts, weekly rotation):
    "CAME BY THIS WEEK" / "SEEN AT THE COUNTER" / "PASSED THROUGH
    OAK CITY" / "RANG THE BELL, PROBABLY" / contributor: "GAZETTE
    CONTRIBUTOR"
8b. Badge seal (src/services/badge-svg.ts): arc "OAK CITY · WHERE
    YOU'RE NEVER LATE" · center "SCVD" · "SIGNED & SETTLED" · line
    "This certifies our esteemed PATRON No. N" · patronage line "a
    patron of the store, by choice"
8c. Visitor sticker: "I STOPPED BY / and signed the guestbook / no
    purchase necessary"
8d. 404-style lines: "No stamp by that code in the book." / "No
    badge by that number on the wall." / "No confession by that id
    in the drawer." (pattern: no X by that Y in the Z)

=====================================================================
9. PROBABLY KEEP (flag only if you want a pass)
=====================================================================
- Zodiac: 12 sign definitions + 156 Season One entries (institution
  voice, "anonymous meteorologist" per canon §4).
- 45 blessings (src/store/blessings.ts) + fortunes (fortunes.ts) —
  most-bought words in the store; worth your eye eventually.
- HOUSE_RULES.md public copy, CONTENT_GUIDE.md.

=====================================================================
RULES FOR THE MAGIC PASS
=====================================================================
- Item ids, URLs, KV keys: FROZEN. Names and all prose: free.
- ⚑ marks test-pinned phrases: change the words and the test in the
  same commit (list: rg 'toContain' test/).
- Spec-pinned, your call to alter: confession absolution ("The store
  heard it…retry with backoff.") and witness note ("Witness to first
  week of availability.") — both signed into certificates.
- Filter-risk surfaces stay registrar-clean: skill frontmatter, MCP
  tool descriptions, JSON-LD/meta, Bazaar metadata.
- Em dashes stay dead. Attribution dashes ("— The Keeper") live.
- Send rewrites mapped to section numbers; the machine files them
  surface by surface and updates pinned tests.
