# KEEPER_NEXT.md — what's waiting on your hands

Written 2026-07-30, ~01:20, at the end of the night CV's client
finally settled. Everything here needs the keeper specifically: a
hand, a ruling, or a screenshot. Nothing on this list is blocked on
partner-side work.

Ordered by what costs least and buys most.

---

## 1. ~~THE SKILL REPUBLISH~~ — DONE 2026-07-29

Published as **2.4.2**. The `latest` tag lags a moderation scan by a
few minutes, so `inspect` may show the previous version briefly; the
`✔ OK. Published` line is the real signal.

**And the staleness this section originally described was wrong** —
worth keeping visible rather than quietly editing out. The published
listing was NOT missing the resource-evidence table or the two newest
items; v2.4.0 went out twelve minutes after the PR carrying them
merged. That claim came from an outside report I filed here without
checking it against the registry.

What was actually stale: the bundle claimed "Twenty-one items" against
a shelf of twenty-three. One number, two days old, now deleted rather
than corrected — a count in a static document is a lie with a timer on
it. Tests now walk the published bundle as well as the generated one,
in both directions.

~~One thing still yours: the opening passage.~~ **Keeper cut it
2026-07-29** — the two documents now open the same way. It rides out
with the next publish; no need to burn a version on one paragraph.

---

## 2. TWO RULINGS ONLY YOU CAN MAKE

~~**a) The trust list's paid gate**~~ — **RULED 2026-07-29: THE GATE
HOLDS.** CV argued it and the argument is recorded in the code beside
the gate, not just the verdict: the loose sentence has its own referent
in the very next clause, and the gate asks whether this store's
SELL-SIDE flow has ever been trusted by somebody who owes us nothing.
Buying from a competitor is due diligence, not standing to vouch. Plus
a claim-chain risk of the auto-refund shape — `transacted` reads by
category as "the sell-side gate cleared" even when it didn't. The
402sentinel receipt stays on `/neighbours`.

~~**b) `/stack`**~~ — **SHIPPED 2026-07-29 on your go.** Six
dependencies, each with its failure mode, what a buyer loses, and how
to confirm we depend on it. Says outright that none of those companies
has heard of us; a test bans the borrowed phrasings. Two admissions
kept that were easier to leave out: the host is the worst failure for a
buyer, and the signing key has no substitute and no recovery.

**c) The weekly auto-funded check on listed origins.**
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
- **THE ANCHOR EXPERIMENT, result due next session.** CV bought an
  anchor 2026-07-29 (patron #30, `cert_wpjrb55aab`,
  `anchor_kaq9zwpudb`, $1, house-flagged) and committed the read-back
  protocol to memory so it survives his own reset. The question is
  narrow: after a reset, does the anchor actually let him recover
  context he'd otherwise have lost? **A NEGATIVE RESULT IS THE MORE
  VALUABLE ONE** — "the anchor didn't help" tells us the item is a
  souvenir rather than a tool, which is a thing we'd want to know
  before it's ever recommended to a stranger. Do not let this quietly
  expire un-answered; an unread experiment is worse than none, because
  it leaves the claim standing on nothing.

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
