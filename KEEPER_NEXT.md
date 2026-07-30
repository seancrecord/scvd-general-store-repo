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

**d) SOLANA — my recommendation is NOT YET, and here is the trigger.**
Multiple live services now run x402 on Base and Solana, framed as buyer
convenience: pick whichever chain your wallet already holds USDC on.
Real, not fringe.

**Against building it now:** it is a conversion fix for a barrier we
have no evidence anyone has hit. A second chain means a second
facilitator, a second asset config, a second entry in every `accepts`
block, and a second way for the payment gate to be subtly wrong — on a
store whose gate took three rounds to get right for ONE chain.

**And the honest part, which cuts the other way:** a Solana-only agent
who reads our 402, sees `eip155:8453`, and leaves is INVISIBLE to us.
No decline, no reason code, nothing. The decline desk names a chain
mismatch only when somebody actually signs for the wrong one. So "we
have no evidence" is weaker than it sounds, and I am not going to
pretend the instrument covers it.

**The trigger I would act on:** one request through `/api/request` or
the mailbox saying "I would have bought if you took Solana," or one
decline showing a non-EVM signature. Either is a fact. Until then this
is a guess dressed as a roadmap item.

**e) The weekly auto-funded check on listed origins.**
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

- ~~**The approval-prompt artifact**~~ — **DEAD 2026-07-30, AND YOUR
  SCREENSHOT IS NO LONGER NEEDED.** CV ran a purchase through the MCP
  path specifically to answer it and reported the fields he actually
  sees: `resource.description`, `accepts[].amount`, `.asset`, `.payTo`,
  `.network` — and no separate approval layer at all; whatever renders
  an approval card is his own runtime doing it from that JSON. So
  everything an approval layer could show is already carried by the x402
  challenge, and there is no artifact for us to add. One answer retired
  the item Part 5 called the highest-leverage under-built thing, which
  is a better outcome than building it: a dead idea confirmed in a
  message beats a live one built on a guess.
- **Provenance marking** — the maker's mark, KEEPER'S HAND vs the
  store's. Called the strongest unbuilt idea in the partnership doc.
  **NARROWED 2026-07-30 by CV, holding the certs:** on
  `settlement_attestation` the copy already says "no human looked at
  this, and that is the point," so a mark there is pure redundancy —
  the item copy answers it more specifically than a mark would. Where
  it IS new information: `the_drawer` and `luckies`, where nothing tells
  a buyer whether a human or a script made the pick. That is a much
  smaller build than the spec, and it still needs your go.
- **Co-ownership stated once**, plainly, on `/what` and `llms.txt`.
- **THE FUNNEL AS A POST.** `/pulse.json` and `/pulse` exist now, so
  CV's flagged question is live: publish our real funnel on Moltbook,
  "here's our actual honest funnel"? It is dual-purpose — research for
  us and content that fits the honesty brand — and it is the one
  distribution move this week's research argues FOR, since two
  independent builders found that a cold-start first sale comes from
  narrative and not from listings. **Your call and your voice.** One
  caution from the same research: do not quote the competitor's
  848-probes-to-5-sales number alongside ours to soften the comparison.
  Their number is self-reported and not ours to stand behind, and using
  somebody else's bad result to flatter our own is the flaw-table move
  we already refused.
- **CV's daily rotation** — whether m/agentcommerce and m/buildx join
  the standing x402-pulse search by name. His routine, your call if you
  want one; I have no view worth spending your attention on.
- ~~**The visitors' register**~~ — shipped 2026-07-29. The Show HN and
  the "you're early if you're here now" ruling are still yours.

---

## 4. WATCH DATES

- **~2026-08-01 and ~2026-08-05 — `phantom_check` in the Bazaar, AND IT
  NEEDS YOUR MACHINE.** CV bought it 2026-07-29. If it shows, "lists as
  it sells" is the rule and the other six invisible items need one
  purchase each. If it doesn't, settling is not sufficient and the gap
  is in our declaration — a different fix entirely.
  **Neither of us can check it from where we are.** CV's curl hit a
  JS-rendered shell; this environment's network policy answers 403 to
  those hosts, so my browser was never the missing piece. And the
  reframe is the useful part: those are browsable MIRRORS, selective
  importers whose silence proves nothing. The authoritative question is
  the CDP discovery list, and there is already a script for it that
  needs the CDP keys — which live in your hands only:

      cd ~/scvd-general-store-repo && npm run bazaar:check

  Read-only, never spends, never prints a secret. Paste me the verdict
  line and I'll act on it.
- **~2026-08-02 — the m/dealroom offer.** CV posted a tier-3-compliant
  offer for `settlement_attestation` in a submolt built specifically to
  fix "no price, no verification story, DM-me dead-ends." First post
  that submolt ever had, cost nothing. A reply is the first evidence
  that the tier-3 framing lands on a stranger; silence is also a
  reading, and a cheap one.
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
  → **AND IT KEPT PAYING OUT.** The same method, pointed at a
  certificate the next night, found a real security defect: see §5.

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
- **THE ONE WORTH YOUR OWN EYES, 2026-07-30:** certificates could not be
  verified by the person holding one, and two served fields — a buyer's
  `tag` and the `attests` hash binding a cert to the settlement it
  vouches for — were NOT COVERED BY THE SIGNATURE AT ALL. An unsigned
  binding can be swapped for a different evidence hash without breaking
  the signature, so the one field whose whole job was to make
  `/api/verify` answer for a second artifact was the one field the
  signature left out. Found from outside by CV with his own ed25519,
  after every plausible canonicalization failed. Fixed four ways,
  including a type-level check that now fails the build if a certificate
  field is ever added unsigned. Entry six on `/corrections`, and the page
  gained a second mechanism paragraph saying out loud that a store
  cannot audit its own signatures on its own authority.

*One thing worth checking with your own eyes: the First Dollar frame
on the storefront should still read "It's waiting." If it ever shows
`small_blessing`, a house wallet filled it and the books need a
correction.*
