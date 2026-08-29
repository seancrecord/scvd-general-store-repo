# The Provenance Check — product spec (T3 of the G2 ruling)

**Status: SPECCED, NOT BUILT. PRICED 2026-08-29 — $5 for a query
about somebody else's address, FREE for an operator querying their
own, with the consent offer in v1 (ruled 2026-08-29). Shelf copy is
the last thing outstanding — the keeper's pen, M5. THREE DRAFTS NOW
EXIST at docs/POST_ROADMAP_SWEEP_2026-08.md section B7 (name,
description and 402 note, plus the shared factual constraints and one
argument the keeper should have with all three). Nothing is wired;
this item builds when he picks.** Ruling:
docs/G2_OPERATOR_LINKING_RULING_2026-08.md (2026-08-27). This spec is
the tier-3 lane that ruling authorizes: named evidence, by consent or
by purchase, inside a signed dated artifact — never on a public
surface.

## What it is

A paid, signed artifact answering one question with evidence: **what
does the signed chain hold about this receiving address (or this
door's addresses)?** The named join the public tiers deliberately
withhold — which doors advertised the address, in which signed weeks,
with what verdicts and drift — delivered to the buyer, with every
fact naming the snapshot digest it derives from so the buyer can
re-derive the whole artifact without trusting us.

It is a dated observation about an address's public advertisement
history. It is not a risk score, not an identity assertion, not a
compliance verdict, and it says so on the artifact.

## Who buys it

- A counterparty doing due diligence before routing real money at a
  door: "is this the only door this wallet fronts, and how long has
  the pairing held?"
- A marketplace or underwriter checking whether a new applicant's
  address already fronts other listings.
- An operator running the check on THEMSELVES — the self-audit that
  becomes their consent-lane declared cluster if they choose to
  publish it on their passport.

## The artifact (shape)

Signed with the store key, verifiable at /api/verify/{id} like every
artifact, containing:

- `subject`: the queried address (verbatim — the buyer supplied it)
  and its v1 digest, so the buyer can match chain rows themselves.
- `weeks`: for each signed week where any door advertised the
  subject: week, sequence, snapshot digest, and the doors — host,
  verdict, offered price bounds, rails. Named, because this is the
  purchased lane.
- `drift`: dated changes in the subject's pairings (doors appearing/
  disappearing, terms changing) across the covered weeks.
- `standing_note`: the subject's own note verbatim, if one is
  attached — the note rides the paid artifact exactly as it rides
  the free surfaces. Beside, never instead.
- `shared_wallet_caveat`: inline, same words as the public tiers.
  Custodial and platform wallets make unrelated doors share an
  address; the artifact carries observations, the buyer makes the
  call.
- `honest_limits`: weekly cadence; only doors our feeds listed and
  our rounds walked (coverage caveats carried verbatim); nothing
  between snapshots; an address absent from the chain yields a paid
  artifact that says exactly that (rule 52 — the buyer paid for the
  answer, and "we have never seen it" is the answer).
- `how_to_rederive`: fetch the named /corpus/{sequence}.json entries,
  recompute, compare digests.

## Rules carried (non-negotiable, from the ruling)

1. Delivered to the buyer; never published by us. The artifact
   existing does not create a public record keyed to the subject.
2. No score, no `operator` field, no identity assertion — pairings
   and dates only.
3. The subject's standing note always rides, verbatim.
4. The caveat is inline, not in a footnote.
5. The subject can always see what the product sees: every input is
   already on the public chain (as digests) and their own doors'
   402s. Nothing private feeds this.

## Where it sits in the catalog

Menu item (id suggestion: `provenance_check`), input: one address (or
one host, resolved to its advertised addresses). Same deliver-first
till as every shelf; the artifact is the delivery. MCP tool
`buy_observation`-family. Free tier stays as-is: T1 counts and T2
per-host facts remain free — this product's value is the NAMED join
and the signed portability, not access to hidden data.

## Pricing — RULED 2026-08-29 (keeper's K3 call)

| item | price (USDC) | notes |
| ---- | ------------ | ----- |
| provenance_check, single subject | **$5** | keeper's number, ruled 2026-08-29. Sits level with `service_audit` and `launch_check`, which is the right shelf: comparable depth, weekly-data-backed. |
| self-audit (operator queries own address) | **FREE** | keeper's ruling: "self audit should be free we get data tho and store it somehow maybe? Seems like a good funnel." |

### The self-audit is free, and what it costs us is not nothing

The keeper's reasoning is a funnel argument and it is a good one: an
operator asking about their own address is the highest-intent reader
this store has, and charging them $5 to meet us is the wrong toll.

WHAT WE GET IS NOT THE OPERATOR'S DATA. It is worth being exact about
this, because "we get data tho" can mean two very different things and
only one of them is a store this store can be:

  - THE THING WE ACTUALLY LEARN is that somebody cared enough to ask
    about a specific address — a demand signal, and the operator's own
    attention. That is real and it is ours to count.
  - THE THING WE MUST NOT QUIETLY ACQUIRE is a private record of who
    asked about what. Every address in the answer is ALREADY public:
    it comes from our own weekly walk of public doors, and the free
    tiers (T1 counts, T2 per-host facts) already serve it. A
    self-audit reveals nothing about the operator we did not already
    know. What it would reveal, if we logged it, is THEM — which
    endpoint's owner is checking their exposure, and when.

So the retention rule, stated before the thing is built rather than
after somebody notices: WE COUNT THE ASK, NOT THE ASKER. A weekly
integer of self-audits run, no address, no wallet, no timestamp finer
than the week — the same shape as every other counter here.

The one thing worth MORE than a log, and the one the keeper's funnel
instinct is actually pointing at, is CONSENT: an operator who runs a
self-audit can opt in to being listed, and a listing is a durable,
public, attributable good for both sides. That is a thing to offer at
the end of a free answer, in the open, with a yes required — not a
thing to take because they showed up.

RULED 2026-08-29: THE CONSENT OFFER IS IN v1. Asked whether it ships
with the free answer or arrives later, the keeper said yes to v1.

That settles the build order, and it settles something else worth
naming: a free answer with no offer at the end is not a funnel, it is
a giveaway we would have called a funnel in our own notes. The offer
IS the mechanism. Shipping the answer first and the offer "later" would
have meant running the free tier for weeks while calling it customer
acquisition, and measuring nothing.

WHAT v1 THEREFORE OWES, all three or none:
  - the free answer, unchanged and unconditional — the offer is never
    a price on the reading;
  - the offer, in the open, at the end, with a yes required and a
    plain statement of what a listing is and is not;
  - the weekly integer of self-audits run. Count the ask, not the
    asker.

A consent flow that is easier to say yes to than to read is not
consent, so the offer states in the same breath what a listing
publishes, that it is public, and that declining costs the reader
nothing they have already been given.

Shelf copy: M5 gate — keeper words it.

## Build checklist (when priced)

- [ ] Menu item + 402 terms (K3 price)
- [ ] `services/provenance-check.ts`: derive from `listCorpus` only;
      re-uses `pay-to-digest`, `operator-facts` clustering and the
      standing-note read — no new capture, no new joins beyond the
      artifact
- [ ] Signed artifact + verify route registration
- [ ] Spec red-first: named join correctness, note riding, caveat
      inline, never-seen subject answered honestly, no `operator`
      key by regex
- [ ] Discovery surfaces + guide (digest pin re-take)
