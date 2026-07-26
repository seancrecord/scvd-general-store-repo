# LEDGER_READINGS.md — what the books actually said

Dated readings of the store's own ledger, newest first. Rule 20: the
ledger outranks all research. Then the ledger gets read out loud, on
a date, by name, including the parts that don't flatter us.

---

## 2026-07-26 (later) — are the books credible?

The keeper's question, and the right one: the books are our own code
grading its own homework. The only thing known for certain from
outside the building is that he bought things and they landed in his
other account.

So: audited. What follows separates what has an outside witness from
what does not.

### The money has an outside witness, and it reconciles to the penny

House revenue on the books reads **$187.78**. One of every item on
the shelf, at the time of the shopping run (22 items, the jar still
alive), came to **$182.78**. The difference is **exactly $5.00**, and
the ledger shows **two** house settles against luckies — a $5 minimum
pay-what-it-deserves item bought twice.

    182.78  the full walk, one of each
      +5.00  a second luckies
    -------
     187.78  what the books say

That reconciles against the one record we do not control: the chain.
It also means the settle path — verify, settle, then mint — is doing
exactly what it claims, because every one of those rows corresponds
to money that actually moved into his other account. **The revenue
column is the most trustworthy number in the store.**

### One thing does not reconcile, and it's small and worth chasing

The house settle breakdown reads `direct: 23 · mcp: 1 · direct
(founding, by hand): 1` — twenty-five events. The payer record for
the house wallet says **24 purchases**, first seen 2026-07-22.

Every house purchase came from one wallet, and `recordSettlement`
writes the payer record on the same call that bumps the counters. So
those two numbers should agree and they differ by one. Either the
founding purchase is being displayed in two buckets at once, or one
settle bumped a counter without writing a payer record. Not a crisis
— but it is precisely the kind of off-by-one that, left alone, turns
into "the books say 12 and the wallet says 11" the month it matters.

### Where the counts are structurally soft

Not speculation; this is what the code does.

1. **Every counter is a read-modify-write against KV.** `bump()`
   reads the current value, adds one, writes it back. Two requests in
   flight at the same moment both read the same number and both write
   the same number, and one increment vanishes. Under a catalog walk
   — which is exactly what July was — this happens constantly.
   **Direction of error: undercount.** 3997 is a floor, not a
   ceiling.
2. **KV is eventually consistent**, so the read half of that
   read-modify-write can be stale on its own. Same direction.
3. **Porch visits are sampled on purpose** — a token bucket caps
   porch writes at 100 a minute per isolate, documented in the code
   as making porch counts "floors under storm conditions." A crawler
   storm is a storm condition. **402s are never sampled.** So
   porch-to-purchase divides an unsampled numerator by a sampled
   denominator, which biases it upward, on top of the crawler problem
   already noted. The 0.738 is a ceiling wearing a rate's clothing.
   Said now on the admin page itself, beside the number.
4. **⚑ THE ONE HE CAN ANSWER TODAY: is the Cloudflare account on the
   paid plan?** TASKS still carries "KEEPER HANDS, urgent: upgrade to
   Workers Paid — the free tier's 1,000 KV writes/day." Each 402
   writes four or five keys (item counter, channel counter, day
   counter, sometimes a venue counter, plus the event row). July's
   ~6,300 challenges alone are somewhere north of 25,000 writes. On
   the free tier, writes past the daily cap **fail silently** — no
   error surfaces to the page, the number simply stops growing for
   the rest of the day. If any day this month ran capped, that day's
   entire tail is missing and nothing in the books says so. The trend
   table (62 / 665 / 1083 / 673) does not obviously plateau, which is
   mild evidence the writes were landing. Mild is not certain, and
   the Cloudflare dashboard answers it outright.
5. **402s are per request, with no dedupe.** One client hitting a
   route forty times is forty challenges. "3997 challenges" was never
   "3997 interested parties" and shouldn't be read as one.

### What was built to settle it: the recount

Channel is inferred once, at write time, and never revisited — which
is why yesterday's fix was described as forward-only. That turns out
to be **wrong, and this corrects it**: every raw row stores the
user-agent and referrer it arrived with, so today's crawler table can
be applied to old rows. July can be re-read after all.

`/admin/recount` does exactly that. It walks the raw rows (bounded,
and it says how far back it actually got instead of implying it read
everything), then reports:

- how many rows the books recorded as organic that today's table
  calls machinery, with the user-agents responsible, commonest first;
- the corrected organic challenge count for that window;
- rows against counters, with the reading spelled out — rows above
  counter means lost increments, the expected direction; counter
  above rows means something wrote a counter without a row, which
  would be a bug worth finding.

The rows are the appeal court: one row per event, unique key, no
contention, no read-modify-write. When the rows and the counters
disagree, believe the rows.

**Run it before trusting any number in the first reading above.** The
headline finding — zero payment signatures in thousands of challenges
— is not affected by any of this, because it is a claim about
something that never happened, and none of these failure modes
invents events. Everything else in the first reading is a floor, a
ceiling, or awaiting the recount.

### Bazaar: I misread it yesterday, and here is what it actually is

I flagged "every Bazaar row reads `processing`" as a possible broken
pipeline. Reading `src/lib/bazaar-observer.ts` says otherwise, and the
correction matters because it changes what "fix Bazaar" even means.

**What those rows are.** The observer taps global fetch once and
captures the `EXTENSION-RESPONSES` header off the facilitator's
`/verify` and `/settle` calls — the x402 core SDK only console.logs
that header, so we keep it ourselves. Each row is the facilitator
saying what it did with our Bazaar discovery declaration.
`processing` is an asynchronous acknowledgement: received, queued.
Not an error. Not a stall we can see.

**Why they are all from 07-24.** That header can only be observed
during a payment. Twenty rows exist because twenty-odd payments
exist, all of them the house, all on one day. "Every row says
processing" is not a pipeline stuck in a state — it is twenty
samples, from one afternoon, of the only payments this store has ever
taken. There is no evidence of failure in there, and there was never
going to be evidence of success either.

**The structural fact underneath, which is the real finding.** In
x402 v2, Bazaar catalogs resources it sees settle. That is why
PROJECT_LOG has said since day one that "other routes list as they
sell." So:

    routes get listed by selling · we sell by being listed

Bazaar depth is a function of sales, and we have no sales. Whatever
is listed today is whatever the shopping run paid for on 07-24, and
nothing else will join it until money moves. **Bazaar is a listing,
not a channel, and it cannot be a demand source before it is a
demand result.** Rule 13 closes the obvious shortcut: no automated
self-purchase heartbeats, real unique payers or nothing. Correct
posture is to stop counting Bazaar as a venue that owes us traffic.

**What actually answers the question, and none of it is in our
logs:**

1. ⚑ Look at the catalogs with his own eyes — does `scvd.store`
   appear, and which routes? Nothing on our side can see their index.
   (Attempted from the build environment 2026-07-26; the proxy
   refuses outbound to both our own domain and theirs, so this is
   keeper hands by necessity, not by preference.)
2. ⚑ Re-verify the declarations against the current
   `@x402/extensions` release. They were [VERIFIED] once, against
   2.19.0, in July. A version drift would be silent.
3. Accept that **Bazaar attribution is close to unmeasurable for us
   by design**: the `bazaar` channel requires a referrer mentioning
   x402scan or a catalog page, and machine clients mostly send no
   referrer at all. Anyone arriving from a listing today lands in
   `direct` and is indistinguishable from a bookmark. Worth knowing
   before we read anything into that column being empty.

### Verdict

- **Trust the money.** It has an outside witness and it reconciles.
- **Trust "nobody ever tried to pay."** Undercounting cannot
  manufacture a zero.
- **Treat every traffic count as a floor**, the organic column as
  dirty until the recount says otherwise, and porch-to-purchase as
  meaningless for now.
- **Answer the plan question today.** It is the only failure mode
  that could be silently eating whole days.

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
  from the 07-24 shopping run, verify and settle alike. ~~If those
  never advance, our Bazaar discovery may not be live.~~ CORRECTED
  the same day, see the credibility audit above: `processing` is the
  facilitator's async acknowledgement, the header can only be
  observed during a payment, and twenty rows on one afternoon is
  simply the only twenty payments this store has ever taken. No
  evidence of failure. The real finding is structural — Bazaar
  catalogs what settles, so it is a listing, not a channel.
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
