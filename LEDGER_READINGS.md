# LEDGER_READINGS.md — what the books actually said

Dated readings of the store's own ledger, newest first. Rule 20: the
ledger outranks all research. Then the ledger gets read out loud, on
a date, by name, including the parts that don't flatter us.

---

## 2026-07-26 — the first reading

Four days of meter (revenue counts from this deploy forward; the
founding fifty cents predates it).

**The headline: we are extremely well-indexed in a market with no
shoppers.**

    3997 organic 402s
       0 organic settles
       0 payment signatures ever presented by anyone but us
    3724 organic porch visits
       1 paying wallet on file, and it is ours (24 purchases,
         the shopping run, $187.78 house money)

That third line is the whole month. Nearly four thousand times we
quoted a price, and not once did anything on the other end even
attempt to sign. Not a decline, not a failed settle — no attempt.
That is the capability census answered before we built it: **nothing
arriving here carries money.**

### What the traffic actually is

Of 3724 porch visits, 2754 landed on `/.well-known` — 74% of
everything, and 2745 of those classified as *direct*.

`direct` is defined in `src/lib/channel.ts` as "a user-agent with no
referrer." That definition describes an indexer exactly as well as it
describes a customer, and in this month's books it was mostly the
former. Three tells, none ambiguous:

1. **The per-item 402 counts have the fingerprint of a catalog walk,
   not of shopping.** Eight items cluster at 132–141 (dibs 141,
   daily_fortune 141, quick_judgment 139, recurring_patronage 136,
   human_witness 134, the_collab 133, portrait 132, phone_call 132).
   Three more sit at 396–399. Two run hot at the top (hello 864,
   small_blessing 633). And the far end of the walk barely got
   touched at all: grudge 10, nomenclature 10, the_confession 10,
   jar_of_tuesday 11, the_drawer 11, context_anchor 2, phantom_check
   0, coffees_for_closers 0. Nobody shopping touches eight unrelated
   items 133 times each. Machines walking a list do exactly that.
2. **`mako-pulse-prober/0.1` is sitting in the organic column right
   now**, in the last-fifteen table, labeled *direct (organic)*. A
   thing with "prober" in its name is not a customer, and our
   conservative crawler table didn't have a word for it.
3. **`menu.json` took 300 visits, 271 of them "unknown"** — no
   user-agent, no referrer. Bare fetches of the catalog. Same story
   at the zodiac (159, of which 153 unknown).

So the honest organic number is not 3997. It is much smaller, and
right now it is unknowable, and that is a truth-in-books problem
rather than an analytics-hygiene one: the ledger only gets to outrank
research if the ledger is clean.

**Shipped with this reading:** the crawler table now catches
machinery that names its own job — prober, monitor, watchdog,
checker, scanner, inspector, sentinel, canary, heartbeat, synthetics.
`bot` stays off the list deliberately; a clawdbot is a customer.
**This is forward-only.** Every stored event keeps the channel it was
written with, so July's rows stay dirty and August's come out clean.
Better to say that out loud now than to quietly restate July later.

### What is genuinely organic in here

Three things, all small, listed honestly rather than talked up.

**1. Twenty-one verifications of the hello certificate.** Every other
item has one. This is `cert_4dww28dx5j`, the founding certificate,
which we publish as the sample artifact on `.well-known`, in
`skill.md`, in every JSON 402 body, and now on `/try`. So the honest
caveat first: this is largely machines following a link we put in
front of them, not admirers. But following it means parsing our
discovery document and then exercising our verification path — which
is precisely what an indexer doing due diligence does, and precisely
what somebody building a client does. The store's own Sunday-sweep
rule says re-verification outranks revenue as a demand signal. Under
our own rule, this is the best number in the month.

**2. The only engagement traffic we got came through the skill.**
Four guestbook reads carrying `?src=clawhub-skill`, one bell ring,
one guestbook signature. Six events in four days. But it means the
skill works *when it is actually run* — the loss is upstream of us.

**3. Nothing else.** No letters, no tips, no confessions, no orders,
no refund requests. The mailbox is empty and so is the queue.

### ClawHub: 239 downloads, four arrivals

Sixty to one. Downloads are not installs, installs are not runs, each
release re-downloads, and registry mirrors and scanners pull copies
too. The correct read is that the skill is being **catalogued about
sixty times faster than it is being used** — the same disease as the
402s, one layer up.

Consequence, and it's a correction to something I wrote yesterday:
READINESS.md called the install base a compounding asset. On this
evidence that is overstated, and it's been marked there. A download
count is not an install base. Four marked arrivals is the install
base.

### Two things worth your eyes, not mine

- **Every Bazaar extension row says `processing`** — all twenty, all
  from the 07-24 shopping run, verify and settle alike. If those
  never advance, our Bazaar discovery may not be live at all, and
  Bazaar is the venue we have been counting as working. [VERIFY] with
  your own eyes; I can't see their pipeline from here.
- **Two alarms are waiting at the counter** and nobody has opened
  them.

### What this changes

1. **The 60-day line has effectively answered at day four**, in the
   "the market isn't here yet" direction. Zero settlements is the
   weaker half of that test; zero *signature attempts in four
   thousand challenges* is the strong half, and it is unambiguous.
   The correct response is the one already written down: hold, keep
   the shelf standing, stop building demand-side levers. Not a kill.
   A hold.
2. **The one exception is `/try`**, because the only organic behavior
   in the entire month — parsing discovery documents, following the
   sample artifact, exercising the verify path — is the behavior of
   the audience it was built for. That is thin evidence. It is also
   the only evidence in the books that points anywhere at all.
3. **Position on the list determines exposure, and now we've measured
   it**: 864 touches at the top of the walk, 2 at the bottom. That is
   a machine-reading effect, not a shopping preference — but indexers
   list what they reach, so leading with the cheap door is now
   supported by our own numbers instead of by theory alone.
4. **Do not hand out more papers.** The papers we handed out produced
   catalog entries, and catalog entries produce crawlers. More venues
   right now buys more noise floor, not more buyers. One paper per
   venue already said this; the books now say it with numbers.
5. **Build the register and the cadence lines** (READINESS.md). They
   are the only things that get more valuable during a hold.

### What I would not conclude

- **Not "the store failed."** It's been four days on the meter.
- **Not "the copy is wrong."** Nothing organic ever got far enough to
  form an opinion about the copy.
- **Not "the prices are too high"** — and this corrects my own
  emphasis in DEMAND.md. The autonomy-line hypothesis (sub-dollar
  clears, above escalates) is untested and currently *untestable*:
  you cannot be too expensive for something that has no wallet. Zero
  signature attempts means price was never the binding constraint.
  The cheap-door reordering is still right, for the exposure reason
  in point 3 — but it is no longer supported by the pricing argument,
  and it should stop being sold as if it were.
- **`porch-to-purchase 0.738` means nothing yet.** It is 402s per
  porch visit, and it reads high because scanners hit buy routes
  directly without browsing first. Right now it measures crawler
  manners. It becomes meaningful the first month the organic column
  is actually organic.
