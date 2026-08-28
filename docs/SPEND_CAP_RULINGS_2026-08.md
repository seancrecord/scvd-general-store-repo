# The thirteen doors above the ceiling — what to do with each

**Dated 2026-08-28.** Task #52 carries four keeper decisions of
2026-08-25 — **document, reprice, split into genuine sub-units, sell
up** — with the instruction that they apply *per item, not as one
blanket answer*. Part 1 (document) is shipped and needs nothing from
anyone. Parts 2, 3 and 4 set prices and define products, which are the
keeper's, so this page is the decision sheet rather than a change.

**What is already true after this change.** Every door below now says,
in its own 402 body, that a stock client will refuse it and what to
raise. The same fact is in `/agents.md` at step 3, in `/llms.txt`
under "How paying works here", and on `/pricing` in a section marked
explicitly as *not* a charter clause. Every figure is derived: the
ceiling from `@x402/core`'s own exported constant, the counts from the
live shelf. Nothing below is required to make that true.

---

## The ceiling, restated once

`@x402/core` 2.23.0 exports `DEFAULT_MAX_AMOUNT_PER_PAYMENT = "$1"`.
`spendControls` defaults to `{}` — **on** — and only
`spendControls: false` disables it. `applySpendControls` runs *inside*
`selectPaymentRequirements`, **before** the accept is picked, and
throws once every accept has been filtered out.

So an unconfigured buyer never signs. We record a challenge and then
nothing, which on our books is shaped exactly like a shopper reading a
price and wandering off. **Thirteen of the priced doors and every
commission rung are in that state**, and no amount of reading our own
funnel can separate them from genuine disinterest.

**The rejected fix, kept rejected.** An npm that split one $20 charge
into twenty-one sub-$1 charges was considered and refused: the cap is
the buyer's operator's safety control, and a store selling evidence
does not ship a way past someone else's spending limit. It would also
invent a distributed transaction we have no escrow to unwind — the
fourteenth payment failing leaves a half-paid purchase.

---

## The thirteen, with a recommendation each

Prices are the cheapest payable tier. PWID doors offer ×1/×2/×5, so
their cheapest tier is the listed minimum.

| Door | Cheapest | Kind | Recommendation |
|---|---|---|---|
| `the_collab` | $25 | PWID, human queue, 2/week | **Sell up.** Both proprietors, a 168h promise, capped at two a week. This is the clearest case in the table where the ceiling is doing its job: an agent that cannot spend $25 unsupervised should not be commissioning a week of keeper time unsupervised. Say so plainly on the door. |
| `certificate_of_patronage` | $20 | PWID, instant | **Sell up.** A patronage certificate is a deliberate act, not an impulse an agent makes inside a default budget. |
| `trust_profile` | $19 | fixed, instant | **Split — this is the worked example in the ruling itself.** A hosted profile is not one artifact; it is N per-endpoint observations. Each one complete, signed and verifiable alone at a sub-$1 price. No control is defeated (no single payment is large), no distributed transaction exists (each stands alone), and a buyer who wants ten observations instead of the whole profile can now buy exactly ten. Better product than the bundle. **Needs: the per-observation price and whether the bundle survives beside it.** |
| `standing_watch` | $5 | fixed, instant | **Split or reprice.** A watch is inherently periodic — the natural sub-unit is one period. |
| `conformance_watch` | $5 | fixed, instant | Same shape as `standing_watch`. |
| `service_audit` | $5 | fixed, instant | **Reprice or split.** One audit of one door is already a single indivisible observation; if it stays whole, the question is only whether $5 is the right number or a habit. |
| `launch_check` | $5 | fixed, instant | **Reprice.** This is the door most likely to be met by an agent that has never bought from us — the worst possible place for a silent refusal. A tier at or under the ceiling would make it reachable by a stock client on first contact. |
| `luckies` | $5 | PWID, instant | **Reprice.** A novelty at five dollars is the definition of "above by habit rather than by value"; it also sits close to the header-size wall (`docs/CATALOGUE_CONSTRAINTS_2026-08.md`). |
| `onpage_audit` | $3 | fixed, instant | **Reprice or split** — per-surface findings are a natural sub-unit. |
| `recurring_patronage` | $3 | fixed, instant | **Sell up.** A standing arrangement is a deliberate commitment. |
| `coffees_for_closers` | $3 | fixed, instant | **Reprice.** A joke door at three dollars is a joke almost nobody's client can hear. |
| `signature_agent_card` | $2 | fixed, instant | **Reprice.** Two dollars is one dollar away from being reachable by everyone. |
| `the_statement` | $2 | fixed, instant | **Reprice.** As above; a signed transfer record is exactly the kind of thing an agent buys without asking. |
| every commission rung | — | commission desk | Above the ceiling at every rung. **Sell up**, on the same reasoning as `the_collab`. |

---

## What the keeper actually has to answer

1. **`trust_profile`** — the split is designed and ruled; what it needs
   is a per-observation price and a decision on whether the $19 bundle
   stays listed beside it.
2. **The four cheap repricings** (`the_statement`,
   `signature_agent_card`, `coffees_for_closers`, `luckies`) — each is
   one number, and each moves a door from unreachable to reachable by
   a default client. These are the highest ratio of effect to effort
   on the page.
3. **`launch_check`** — the top-of-funnel argument above is the whole
   case; it is still a price change and still the keeper's.
4. **The sell-up doors** — nothing to build, but the copy that says
   *"this one is for agents configured to spend more"* is a
   positioning statement and wants the keeper's own ink.

Nothing here is urgent in the sense of broken: the disclosure means no
buyer discovers the ceiling by wasting a round trip any more. What
remains is revenue shape, and that has never been mine to set.
