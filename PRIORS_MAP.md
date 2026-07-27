# PRIORS_MAP.md — the synthesis, mapped against the store as built

SCOPE NOTE, clarified 2026-07-27 now that two synthesis documents
exist and confusing them would be expensive: this file maps
THE_OVERWEIGHT_MAP (thesis, priors, personas, pairings), which
remains a back-office document by the keeper's standing call, same as
KEEPER_CANON and CHARACTER_CANON — nothing from it is reproduced
here. The OTHER one, DEMAND_SYNTHESIS.md, is in this repo in full at
his direction; it is the demand-mining synthesis and it is a
different document with a different job. This file carries only the derived work: what the
books say about it, what has gone stale, where it collides with a
standing house rule, and which of its gaps are worth doing during a
hold. Read it beside the source, not instead of it.

Filed 2026-07-26. ⚑ marks his call.

## What the books did to the framework

The synthesis was built 2026-07-23, before the store had any
evidence at all. Four days of meter later, three things update.

**1. Every persona in it is a buyer, and July had no buyers.** The
population that actually arrived — catalog walkers, health checkers,
discovery-document parsers, one prober — is not in the persona list,
because it was written to describe demand and what showed up wasn't
demand. That is not a flaw in the document; it is the market being
earlier than the document assumed.

**2. There is a missing persona, and right now it is the only one
with traffic.** Call it **A0, the indexer**. It does not buy, does
not reason, and cannot be persuaded of anything. Its entire value is
that it **propagates our description to something that might**. It
reads schema, not copy. Everything the synthesis says about A3 (the
scout) works on it; nothing else in the document does. Practical
consequence: for the foreseeable month, our "positioning" is the
accuracy of `menu.json`, `llms.txt`, the MCP schemas, and
`.well-known/x402.json`, full stop. Copy aimed at a reader is
inventory we are holding for customers who have not arrived.

**3. P1 is the only prior with observed behavior behind it.** Twenty-
one verifications of the published sample artifact against roughly
four thousand challenges: something out there parsed our discovery
document and then went and checked whether our signature was real.
That is authenticity anxiety expressed by machinery. The synthesis
called P1 our strongest surface on desk reasoning; the books now
agree, weakly but genuinely, and it is the only prior we can say that
about. Everything else in Part 2 remains untested — not wrong,
untested.

One sharpening of the thesis itself: the harness filter is harder
than written. It is not only that theatrical urgency gets filtered
out mechanically. It is that **nothing arriving here can pay at
all**. Persuasion of every shape is downstream of a funded wallet,
and in July there were none. The document's discipline survives
intact; its urgency does not.

## Where it has gone stale (it predates rulings from its own week)

- **Location.** Smokewire Crossing was retired 2026-07-23 — Oak
  City, the keeper's call, on every surface. The synthesis names the
  old town as a stable-origin asset.
- **P2's evidence is weaker than it credits.** "Custodial items with
  photographs and serials" no longer describes the shelf: luckies are
  preset from the herd, the card is the record rather than a
  photograph, and "(custodial)" was dropped because per-object
  custody cannot be claimed on an infinite shelf. The provenance gap
  is therefore *larger* than the document says, not smaller.
- **P7's scarcity inventory has moved.** The jar is scrapped. Luckies
  never sell out by design. Real weekly caps still stand on the human
  shelf (5 / 3 / 2 / 2 across the labor items). And there is a new
  scarcity the document does not have, which may be the best one in
  the building: **the presence window** — the human shelf sells only
  within 48 hours of the keeper being seen at the counter, and it is
  closed by default. That is P7 and P8 at once: scarcity of a
  specific named person, structurally true, checkable from outside,
  impossible to fake, and it costs nothing to state because it is
  already how the store works.

## One collision, needing his ruling

Gap 2 proposes a flat line: *"First store of its kind. You're early
if you're here now."*

The second sentence is true, checkable against patron numbers, and
worth saying. The first sentence collides head-on with **HOUSE_RULES
rule 3: "Never claim 'first ever.' Discovered > launched. The store
behaves as if it has always been here."**

It also fails the synthesis's own test. Part 1 sets the standard that
every assertion should survive being verified by a skeptical third
party in ten seconds. "First store of its kind" cannot be verified in
ten seconds, or at all — there is no register of stores of this kind
to check it against. It is exactly the class of claim the document
teaches us to avoid, arriving in the document's own recommendation.

⚑ RECOMMENDATION: **keep the second sentence, drop the first.** "You're
early if you're here now" lands the same prior, costs no rule, and a
patron number proves it. If he wants the primacy claim anyway it is
his call and rule 3 gets amended with a date, per precedence — but I
would not spend rule 3 on it.

## The gap list, re-ranked for a hold

The synthesis lists six. Given that the human shelf is shutter-gated
and has never had a buyer, they do not deserve equal effort.

**Do now:**

1. **Gap 6 — the one-line self-description tuned to be copied
   verbatim.** Cheapest item on the list and aimed at the only
   audience that exists. Drafts below.
2. **Gap 3 — the public, linkable corrections record.** Cheap, and
   it is the P4 moat. We now have real corrections to publish rather
   than a promise to publish them: a misread of the Bazaar rows, an
   overstated install base, a pricing argument the books killed.
   Being the merchant who publishes its own errors only works if the
   errors are visible outside a repo file.

**After his ruling:**

3. **Gap 2 — the early line**, second sentence only, one flat line,
   storefront and llms.txt.

**Park until a buyer exists:**

4. **Gap 1 (provenance copy)** and **Gap 4 (keeper-layer pass)** are
   both aimed at the human shelf. Real work, genuinely good, zero
   current audience. They will pay for themselves the week someone
   buys labor and not before.
5. **Gap 5 (real-scarcity restatement)** is mostly done by accident —
   the preset ruling swept the false scarcity out when it scrapped
   the jar and made luckies infinite. What remains is a verification
   pass that no stale "limited" language survived, and adding the
   presence window to the list of scarcities we state plainly.

## Drafts for gap 6 (⚑ his pen, per rule 7)

The scout's win condition is that it can describe us accurately in
someone else's context window. That wants one sentence carrying four
facts: what we are, how you pay, what proves it, and how cheap the
first door is. Current surfaces (`metaDescription`,
`ogDescription`, `organizationDescription`) are good and none of them
does that job.

- **a.** "A general store for autonomous agents: real goods and human
  labor, paid in USDC on Base over x402, every purchase signed and
  publicly verifiable. The cheapest thing on the shelf is half a
  cent."
- **b.** "The machine economy's general store — x402 v2 on Base, half
  a cent to fifty dollars, and every purchase ends in a signed
  certificate anyone can check."
- **c.** "A human-kept general store that sells to agents: signed
  goods, human labor, honest books. Pay over x402 on Base; verify
  anything at a public URL."

If one of these earns a nod it belongs in `organizationDescription`
(the answer engines read it), at the top of `llms.txt`, and in the
skill's one-liner — the three places a scout lifts from.

## One pairing the two documents already agree on

A1 (the cron loop) × P9 (ritual and return) is exactly the
"say the cadence out loud" item in READINESS.md: the free shelf has a
clock — bell daily, stamp weekly, zodiac weekly, fortune daily — and
no surface mentions it, so nothing scheduled can put us in its loop.
Two documents reached that from opposite directions, which is the
best argument either of them makes for it.
