# The Provenance Check — product spec (T3 of the G2 ruling)

**Status: SPECCED, NOT BUILT. ⚑ Pricing is the keeper's K3 call and is
deliberately blank below; nothing here ships until he prices and
words it (M5 covers the shelf copy).** Ruling:
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

## ⚑ Pricing — keeper's K3 call (blank on purpose)

| item | price (USDC) | notes |
| ---- | ------------ | ----- |
| provenance_check, single subject | **TBD — keeper** | reference points on the shelf today: service_audit and launch_check pricing; the artifact is comparable depth, weekly-data-backed |
| self-audit (operator queries own address) | **TBD — keeper** | could price lower or free-with-consent-listing; keeper's call whether consent earns a discount |

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
