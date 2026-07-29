# KEEPER_NEXT.md — what's waiting on your hands

Written 2026-07-30, ~01:20, at the end of the night CV's client
finally settled. Everything here needs the keeper specifically: a
hand, a ruling, or a screenshot. Nothing on this list is blocked on
partner-side work.

Ordered by what costs least and buys most.

---

## 1. THE SKILL REPUBLISH — five minutes, phone is fine

**Confirmed stale**, not suspected: CV pulled the live `/skill.md`
against the published ClawHub listing and diffed them. The published
copy carries an opening passage the live document no longer has, and
shows neither the resource-evidence table nor `settlement_attestation`
or `graffiti_on_a_train`. An agent installing the skill today reads
last week's store.

**Do it from the phone:** Actions → *Publish ClawHub skill* → Run
workflow. Version `2.4.0`, changelog pre-filled, `dry_run` checkbox if
you want to see it first.

**One-time setup first:** Settings → Secrets and variables → Actions →
New repository secret, named `CLAWHUB_TOKEN`. Never paste that token
into a chat, including to me.

**Timing note, and this is the actual recommendation: hold it one
day.** CV is sending a reference client, and `/try` and `skill.md` will
both point at it. Publishing now ships a document that goes stale on
arrival. Publish once, after his PR lands, and it's current the day it
goes out.

---

## 2. TWO RULINGS ONLY YOU CAN MAKE

**a) Does the trust list's paid gate still hold?**
The gate says this store is the only origin listed as a completed x402
purchase until a stranger buys here. Its stated reason: *we cannot be
the trust anchor for a flow we have never completed with a stranger.*

As of 2026-07-29 we have completed one — **as the buyer.** CV paid
402sentinel $0.002 and it delivered. The gate's letter and the gate's
reason have come apart, and which one governs is yours, not mine. I
have not touched it. The receipt is published on `/neighbours` either
way, so nothing is hidden while you decide.

**b) The weekly auto-funded check on listed origins.**
Move 2's live-maintenance upgrade: each trust-list origin gets an
auto-funded weekly `phantom_check`, so the list flags services that go
dark instead of aging into fiction. It spends real money on a schedule
and touches other people's servers weekly, so it waits for you.

Shipped tonight instead, costing nothing: every trust list entry now
carries `days_since_checked` and a reading — recent, aging, or stale
past 30 days — with the note that a stale entry is a fact about US,
not a warning about them.

---

## 3. STILL YOURS, FROM BEFORE TONIGHT

- **The approval-prompt artifact.** Part 5 called this the
  highest-leverage under-built thing, and it needs one screenshot of a
  real approval prompt before anything can be built. If the prompt only
  shows amount and recipient, the artifact belongs in the item
  description instead — better to learn that from a screenshot than
  from a week of work.
- **Provenance marking** — the maker's mark, KEEPER'S HAND vs the
  store's. Called the strongest unbuilt idea in the partnership doc.
- **Co-ownership stated once**, plainly, on `/what` and `llms.txt`.
- **The visitors' register**, the Show HN, and the "you're early if
  you're here now" ruling.

---

## 4. WATCH DATES

- **~2026-08-01 and ~2026-08-05** — does `phantom_check` appear in the
  Bazaar listing? CV bought it 2026-07-29. If it shows, "lists as it
  sells" is the rule and the other six invisible items need one
  purchase each. If it doesn't, settling is not sufficient and the gap
  is in our declaration, which is a different fix.
- **~2026-08-27** — Move 1 kill criteria. Near-zero calls parks it.
- **~2026-09-20** — the 60-day line.

---

## 5. WHAT SHIPPED TONIGHT, SO YOU CAN SPOT-CHECK IT

- `/house-ledger.json` — every wallet we control, signed, with the
  house/organic split. Built because 402sentinel scored our address
  `review` 63/100 for "possible self-wash" and was right.
- `/neighbours` — receipts from services we've paid, our own bad score
  first.
- `/try#hand-rolling` — the worked example, right and wrong side by
  side.
- Pre-flight validation on both doors; the MCP door's decline
  instrument, which had inherited nothing.
- **CI, which the store had been claiming to have and did not.**

*One thing worth checking with your own eyes: the First Dollar frame
on the storefront should still read "It's waiting." If it ever shows
`small_blessing`, a house wallet filled it and the books need a
correction.*
