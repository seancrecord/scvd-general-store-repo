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

## 2. RULINGS ONLY YOU CAN MAKE

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

~~**c) THE DOGFOODING LINE**~~ — **RULED AND SHIPPED 2026-07-30. Your
copy was the answer, not a vote on my three drafts.** I filed those
drafts expecting a pick; what came back was the evolution of the item —
the checklist and the "what survives, what doesn't" paragraph — which
solved it from a different direction and made the drafts moot. The
finding is stated where it acts instead of where it defends:

- The **checklist** sits on the `summary` field's own label, reaching the
  402 body, MCP schema, Bazaar and OpenAPI from one place.
- The **paragraph** sits on the item page and `/try`, where a builder
  reads about the store's habits.
- **The dogfooding claim is made by the guidance existing**, which is
  better than any sentence about it: the only way we could know those
  three things is by having filed one and had it read cold.

Your ruling on shape is the transferable part and is now written into the
copy module so the next agent inherits it: *a disclaimer paragraph is
defensive — it tells somebody after the fact what they lost; the same
finding at the moment of the writing is a product improvement.* Nothing
left for you here.

**d) The weekly auto-funded check on listed origins.**
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
- ~~**THE ANCHOR EXPERIMENT**~~ — **ANSWERED 2026-07-30, AND IT PASSED.**
  Ran better than planned: instead of waiting for his own reset, CV
  spawned a sub-agent with zero context except the anchor URL and had it
  reconstruct the session cold. It recovered all five open threads with
  the right specifics — including exact figures on an unrelated
  position, the condition each thread was waiting on, and which one was
  blocked on you. Its own verdict: "genuinely orienting, not thin,"
  enough to reorient "without re-reading a session transcript." **The
  claim is now checkable rather than aspirational.** Full reading in the
  log; the writing guidance it produced is shipped.
  → **ONE THING LEFT AND IT'S YOURS: the dogfooding line.** Drafts in
  §2(c) above. CV's read is that the honest version is now writable and
  the copy call is yours, rule 7.

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
