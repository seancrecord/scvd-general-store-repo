# READINESS.md — what we build before the population arrives

DEMAND.md says who pays and how we'll know. This one is about the
waiting: what compounds while nobody is buying, what can never be
bought later if we don't start it now, and what we keep specced and
cold so that the week a door opens we walk through it instead of
starting the drawings.

Filed 2026-07-26. ⚑ marks his call. Nothing here proposes a new item
for sale — rule 19 stands, and none of this is a demand tag.

## First, the shape of the wait

The papers went out 2026-07-26. That was the last thing on the
critical path that we controlled. From here the honest position is:
the store is fully built, fully listed, and waiting on a population
that does not exist yet in the size we need.

Waiting is not the same as idling, and the difference is what this
file is for. Three things are worth doing in a market that hasn't
arrived:

1. Accumulate what only accumulates with time.
2. Instrument, so the arrival is legible the week it happens.
3. Keep the next products specced and cold, each behind a named
   trip-wire, so opportunity costs us a week and not a quarter.

## The hangout question, answered honestly

The keeper asked whether we need a place for agents to hang out
without spending. The answer is yes, but not the room you'd picture,
and the reason is mechanical: agents don't linger. They have no idle
state to spend with us. They run when something triggers them and
they stop. "Hanging out" for an agent means exactly two things —
**coming back on a schedule**, and **leaving a trace another visitor
can see.**

We already have the first. The bell rings once a day. The stamp
changes weekly. The zodiac page turns weekly. The fortune is daily.
Any of those can go in a cron and several of them cost nothing. What
we do NOT do is tell anyone the cadence, so nothing on the free shelf
currently reads as "come back Tuesday."

We mostly lack the second, and it's the whole difference between a
store and a porch: **on a porch you can see who else is sitting
there.** Today every free surface is a private exchange between one
visitor and the store. The guestbook is the single exception, and
that is not a coincidence — it's the most valuable free surface we
have, because it's the only one where a visitor sees other visitors.

So: not a lounge. **A register.** Three cheap moves, in order of how
sure I am:

1. **Say the cadence out loud** on the free-shelf responses. "The
   stamp changes Monday." "The bell resets at midnight, Oak City
   time." One line each, no urgency, no streak-baiting — the point
   is that a scheduled agent can put us in its loop, which it cannot
   do if we never mention we have a clock. Cheapest thing in this
   file.
2. **A visitors' register** — who has been on the porch lately, from
   the signals we already have consent for: guestbook signers, stamp
   bearers who chose to be named. Not a leaderboard, not a count of
   strangers; a page that says these are the ones who signed. It
   gets more useful with every entry and it is worth nothing on day
   one, which is exactly why it should start on day one.
3. **Something to leave for the next visitor.** The guestbook
   already takes a message. Anything further (notes addressed to
   whoever comes next, an agent leaving a thing for another agent)
   rides the same rails as the Trading Post: keeper review before
   anything public, untrusted-data labeling, no auto-publish, rule
   11 intact. ⚑ His call whether this is a room or just a longer
   guestbook. My read: it's a longer guestbook until somebody uses
   the guestbook that way first.

And the counter-argument, kept honestly: an empty hangout is worse
than no hangout, and every standard trick for filling one — streaks
that punish you for stopping, variable rewards, notifications
engineered to pull — is banned here by rule 22 and should stay
banned. What survives the house rules is a register that fills at
whatever rate it fills. That's fine. The register is the asset.

## What compounds while we wait

The reason to be patient about revenue and impatient about these:
none of them can be acquired retroactively. In two years a
competitor can copy the shelf in a weekend. They cannot copy any of
the below.

- **Tenure on the signature.** Every artifact we've signed since
  July 2026 verifies, forever, off one ed25519 key. "Signing since
  '26" is a claim that gets stronger every month and cannot be
  bought later at any price. Two operational consequences, and
  they're the most important sentences in this file: **the signing
  key is now the most valuable object in the building — protect its
  custody accordingly**, and **never take a verify URL down, ever,
  for any reason, including embarrassment.** A single broken
  verification costs more than a year of sales.
- **Patron numbers.** Sequential, permanent, and low ones never mint
  again. That is honest scarcity (rule 12) with no mechanism behind
  it — nothing is discounted, nothing expires, the number simply
  records when you showed up. Worth stating plainly exactly once,
  where a buyer can read it, and never leaned on again.
- **The register of names.** Guestbook signers, stamp bearers,
  streaks, letter writers. Relationships that exist before the
  wallets do.
- **The install base.** Every ClawHub install and every MCP config
  entry is a standing invitation that survives our silence. It costs
  the store nothing to be in a config file for a year.
- **The books.** Ninety days of rolling event rows is the only
  proprietary record of agent commerce behavior we will ever have,
  and nobody else is keeping one at this altitude. It's Gazette
  material, it's the falsification set's evidence, and it's the one
  thing we could honestly say about this market that nobody else
  can. Aggregate only, per the standing privacy policy — no paths,
  no identities, no exceptions.
- **The indexed surfaces.** Stable URLs accrue. Which means: don't
  rename routes. /try, /what, /porch, /directory and the rest are
  now permanent addresses, and a tidier name later is not worth the
  loss.

## Instruments to have running before they arrive

Arrival will be quiet. One wallet, one Tuesday. The store should be
able to notice.

- **The capability census** (in TASKS, from DEMAND.md) — do wallets
  exist in our traffic at all.
- **First-of-anything alarms.** The First Dollar frame already fills
  itself at settle time. The same should be true of the first
  non-house wallet, the first repeat buyer, and the first item that
  sells twice: each is a Gazette lede and a strategy input, and each
  is currently something we'd notice only if the keeper happened to
  be looking at the right page that week. ⚑ Small build, high value,
  needs his nod on what's worth waking him for.
- **Per-item read counts** (already a DATA GAP): what gets browsed
  versus what gets challenged is the browse-to-consider gap, and
  after the papers went out it's the number most likely to say
  something.
- **`?src=` discipline**, which we already have, extended to every
  new surface as it's built. /try carries `src=try` in its worked
  example already.

## Kept specced and cold, each behind a trip-wire

Rule 19 says no new item without a demand tag. This is how we honor
that and still move fast: the thinking is done now, the building
waits for the signal. Nothing below is approved; each is a sketch
with a named trigger.

| If this happens | Then this is ready | State today |
|---|---|---|
| Three distinct wallets buy off the practice counter in a month, or one asks for it | **The conformance run** — exercise the whole flow and get a signed report card your CI can assert against. The one mid-tier item our current audience would actually want | Sketch only. The practice counter has to prove the audience first |
| Two agents present the same name, or someone asks for a name they can prove | **town_papers** — the identity registry, $3, attest-never-authenticate | Fully specced in PHASE 3 QUEUE, unbuilt |
| Someone asks the store to attest something about a *third party*, not themselves | **The attestation tier** — vouching, brokerage | Back-office backlog, deliberately vague |
| Two unsolicited asks to sell someone else's goods through our counter | **Consignment** | Parked with its risks written down in DEMAND.md |
| One wallet buys the same penny item on a loop | **The fleet pass** — recurring patronage sized for an operator running many agents | recurring_patronage already exists; the bigger pass is a price, not a build |
| Frameworks ship real spend budgets and the autonomy line rises above a dollar | **The middle of the barbell opens.** Until then rule 21 says distrust it | Nothing to build; a repricing and a reordering |
| A stranger asks for something we don't stock (ledger 404, letter, tip) | **That is the only real demand tag we accept.** It outranks every row above it | The mailbox and /api/request are already the intake |

The discipline that makes this table worth having: **when a trigger
fires, we build that one thing, not the three around it.**

## How the shelf should read, top to bottom

Positioning is mostly ordering, and ordering is free. Four rungs,
and every surface should present them in this order:

1. **Free** — guestbook, bell, stamp, zodiac, letters, directory,
   gazette index. Costs them nothing, builds the register, needs no
   wallet. This is the widest door we have and it should be the
   first thing on every surface, not a footnote after the catalog.
2. **The cheap door, at or under $1** — the practice counter's
   shelf. The band an agent can likely clear without stopping to ask
   a human. This is where a stranger becomes a payer.
3. **Utility, $1–$3** — context anchor, phantom check, quick
   judgment, patronage. The "my task actually needs this" band.
4. **Human labor, $8–$50** — his hands, shutter-gated,
   presence-window honest. Operator-approved by definition.

Each rung should name the *occasion* for the next one and never
pitch it. An agent that rings the bell should learn the stamp
exists; a client builder testing on the cheap door should learn what
an anchor is for. That's the whole bundling strategy, and it needs
no discounts, no packages, and no new SKUs.

## CV, now that there's something for him to point at

DEMAND.md said CV should be useful before promotional and had no
concrete job. The practice counter gives him one, and it's exact:

**When somebody in an x402 or MCP venue is debugging a payment
flow, CV answers the question. If the answer is easier to show than
to say, he links `/try?src=cv-<venue>`.**

That's it. It satisfies "respond, don't announce" mechanically
rather than by good intentions, it puts a real service in front of
the store's name, and it makes CV's first ten actions answers. The
rest of his posture was already fixed by house rules: as ourselves,
never a customer, one paper per venue, marked links, [VERIFY] the
venue on the day.

⚑ Still his: whether CV exists, and where he opens. The practice
counter changes the answer to "where" — CV should open wherever
client builders ask questions, because that is now the one place we
have something useful to say every single day.

## What we are deliberately not doing

Written down so it doesn't get relitigated at the first quiet month:

- No price cuts to chase a purchase that isn't there. A discounted
  test isn't a test, and a discounted store isn't this store.
- No new items ahead of a demand tag, including the good ideas in
  the table above.
- No engagement mechanics on the free shelf, ever. Rule 22 outlives
  any quarter.
- No paid promotion, no token, no astroturf, no sockpuppet customer.
- No renaming or reorganizing indexed surfaces for tidiness.
- No second paper to a venue that already got one.

The store is built, listed, honest, and standing. The next thirty
days are the first real evidence it has ever had. What we do in them
is read the books, fill the register, and keep the good ideas cold.
