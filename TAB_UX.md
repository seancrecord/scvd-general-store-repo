# The Tab — the flow, from install to steady state

Companion to THE_TAB.md, which is the specification. This one is the
UX: what actually happens, in what order, and who speaks first.

THE ONE STRUCTURAL FACT that shapes everything below: **The Tab has
no interface.** There is no dashboard, no login, no window. The
agent is the interface and a JSONL file is the database — so "UX"
here means exactly one thing: *when does the agent speak, and what
does it say.* Every design decision in this document is a decision
about a moment.

---

## Minute 0 — install

One config block, any MCP client:

```json
{ "mcpServers": { "scvd-tab": { "command": "node",
  "args": ["/path/to/tab/server.mjs"] } } }
```

Restart. The tab's tools appear. Nothing else happens — no account, no
onboarding wizard, no email asked for. The tab is empty and useful
the moment you say your first sentence to it.

**What the agent should say, unprompted, on first sight of the
tools:** nothing. A tool that introduces itself before it has been
asked for anything is a pop-up.

---

## Minute 1 — the first entry

Two ways in, and the difference is how much you feel like typing.

**The sentence.** "Log this on my tab: started an Ahrefs trial for
keyword research, ends the 15th, $29/mo after." → `log_tool_event`.
Everything present, validated, done.

**The fragment.** `/log ahrefs $29 after the 15th` →
`capture_tool_event`. This one **never refuses**. Missing fields come
back named, never invented:

> Logged with gaps: category, problem_solved. Nothing was invented —
> the rounds will ask when it suits.

The distinction matters at the moment of signup, when you have five
seconds and a browser tab still open. A validator that bounces your
fragment is a validator you stop typing at.

---

## Minute 2–20 — the historical pass (optional, and the best five
minutes the product will ever have)

If mail is wired, the agent sweeps six months backward. Most entries
**resolve themselves** and are never put to you:

- a receipt from last week → **active**, logged, no question asked
- a cancellation confirmation → **inactive**, logged, no question
- signed up in March, silence since, no cancellation → **ask**

So the review is not sixty prompts. It is the dozen the mail could
not settle. The rest arrive as a finished list.

**The payoff lands here, before you have typed anything:**

> 23 tools. $340/month — $4,080 a year. $127 of that is image
> generation across four tools. $186/month hasn't seen an event in
> 45 days. Four of these you hadn't mentioned to me.

Recognition beats recall: "is this still active, y/n" is a question
you answer accurately; "what do you pay for" is a memory test you
fail. That inversion is the whole reason the historical pass exists.

**"No, not relevant" does not delete.** It writes a retroactive
`canceled`. The tool leaves the active set and the burn; the history
stays, because `check_before_signup` answering *"you trialed this in
March and cancelled on day 9"* requires the cancelled entry to exist.
Deleting would throw away the thing you are paying the tab to
remember.

---

## Every day — the pager

> Midjourney charges you $30 in 3 days.

That is the save, and it now arrives three ways rather than one.

**With a cron** (`npm run tab:pager`, one line in crontab), the clock
runs whether or not anybody is talking to the agent. It prints nothing
on a quiet morning, because a job that speaks every day regardless is
a job you silence within the week.

**Without a cron**, the clock still runs — on any tool call. Mention a
tool, log a receipt, ask what you're paying: the answer comes back
with the page attached. Timely becomes merely inevitable, which is a
real downgrade and a survivable one.

**Never**, if the agent has no rounds and you installed no cron. That
case is not fixed and is not pretended away.

**Saying it is not the same as sending it.** The page is handed to the
agent; only `acknowledge_pages` records that the agent actually put it
to you. Pages that age out unspoken are counted, not deleted, and the
count rides on the next line:

> Midjourney charges you $30 tomorrow (4 days on the pager, never put
> to you).

That parenthesis is the instrument reporting on its own failure, which
is the only reason to trust the rest of what it says.

---

## Every day, quietly — the drip

`needs_attention`, capped at a handful, dearest first:

> Two things when you have a second: that $49/mo Jasper the sweep
> found — real? And Seedance from Tuesday has no category.

**Why capped, and this is load-bearing rather than polite:**
confirmation is the *only* security layer that actually holds. The
quarantine, the schema validation, the DKIM check are all filtering;
the human look is what keeps a forged receipt out of the pooled
corpus. And a human confronted with 200 rows taps yes 200 times,
which is rubber-stamping, not verification. Two questions a day is a
habit. A queue is a chore nobody finishes.

Everything unconfirmed still counts toward **your** burn — it is
probably your money, and a number you can see beats one you can't.
It simply never becomes a published statistic.

---

## Before you buy anything — the interception

You mention wanting a tool; the agent calls `check_before_signup`
first:

> You trialed this in March and cancelled on day 9. You currently
> cover seo with semrush (free tier). Last recorded signup friction:
> phone_required — a human was needed at the door.

Facts, never a verdict. No "risky", no "you should". You draw the
conclusion; the tab is a mirror, not a critic. The friction line is
the practical one: an agent about to drive a signup learns a human
will be needed **before** the flow dead-ends.

---

## Monthly — the confrontation

`burn_rollup`, arriving rather than waiting:

> $340/month, $4,080/year, across 23 tools.
> image-gen $127 · llm $88 · hosting $45 · …
> Idle 45 days: $186/month.
> Up $61 since May — leonardo, seedance and vercel account for it.

The trajectory is the part no statement-reader can produce: the tab
holds **events**, so burn is replayable at any past date along with
the signups that moved it.

**The badge**, two forms and the fork is deliberate:
- *local card* — everything, yours, on your machine
- *shareable* — `23 tools · $340/mo · 41% agent-native`. Counts,
  never vendors, and private tools are excluded from the count
  itself rather than merely unnamed. Publishing your whole
  operational stack is the concentration risk squared.

---

## What the agent must never say

No cheaper-alternative suggestions. No "consider cancelling." No
rating of a tool. This is not squeamishness — it is the line that
keeps the product from becoming a critic, which is a different
business with a different balance sheet and an obvious affiliate-money
rot vector.

**What answers the same question honestly:** category overlap ("three
paid tools in image-gen"), price dispersion in your own tab, and —
once layer 3 exists — the replacement graph: *"of agents who left
Ahrefs, 60% went to Semrush."* That is what people **did**, not what
you should do. Same information, different register, and only one of
them is buildable here.

---

## Asking for it

Any time: *"what am I paying for"* → `stack_audit`. *"anything
converting?"* → `trials_converting_soon`. *"give me everything"* →
`export_tab`, jsonl or csv, no charge, no lock-in, coverage record
included.

---

## Consent, and where it sits in the flow

Pooled contribution is **off** by default and layer 3 is not live, so
nothing leaves the box no matter what you do. If you ever turn it on,
the refusal you get before you do spells out exactly what would be
sent — tool, category, outcome, weeks held rounded to the week, and
nothing else, ever. `set_consent` is the only door, recorded as an
event in the tab itself so the history of the decision is auditable
like everything else.

---

## The honest edges, stated where a user meets them

- **The tab only knows what it is told or shown.** No browser
  extension, no bank feed, no telemetry. Sign up for something and
  never mention it and the tab stays empty on that.
- **"Unused" means no logged event** — commitment silence, not usage
  truth. A tool you use by hand every day can appear idle.
- **The burn number never ships bare.** It arrives with what fed it,
  when the sweep last ran, and what it structurally cannot see.
- **Local-first is conditional on deployment.** If the sweep runs on
  your machine, it holds. Run it through a hosted agent and mail
  content transits a third party — the claim does not survive that,
  and the copy must not pretend otherwise.

---

## Open, and named as open

1. **The sweep is not built.** Manual and `/log` work today; mail is
   spec'd and unwritten. Largest remaining gap.
2. **No ground truth for burn.** Card reconciliation is the only
   thing that can prove the number, and it does not exist yet — which
   is why `variability_pct` reads `null` rather than a flattering
   zero.
3. **The pager still needs somebody to run the clock.** A cron makes
   it timely, an agent with rounds makes it inevitable, and neither
   makes it certain. `unspoken_pct` is how you find out which one you
   actually have.
4. **No ground truth for the pre-filter either.** The sweep now has
   to state how many messages it read, and anything it read but never
   classified is published as `unclassified`. That catches filtering
   by omission. It does not catch a sweep that reports numbers it
   made up — nothing here can.
