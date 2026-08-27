# Post-roadmap sweep — documentation, surfacing, and copy (task #88)

Dated 2026-08-27, the day the roadmap's last build row closed. Two
kinds of content here, kept strictly apart:

- **Documentation-voice updates, shipped in this change** — factual
  surfacing of features that existed but were not findable. No
  selling, no superlatives; the register of the pages they join.
- **⚑ DRAFT selling copy, NOT shipped** — M5 is a keeper gate:
  every customer-facing selling line below is a draft for the
  keeper to approve, reword, or strike. Nothing in this section
  reaches a page until he does.

## A. Where every Phase 2–3 feature is surfaced (inventory)

| Feature (merge) | openapi | guide (llms) | /developers | landing page | menu/shelf copy |
| --- | --- | --- | --- | --- | --- |
| Corpus chain + per-host replay | ✅ | ✅ | ✅ | ✅ /corpus | n/a (free) |
| Defect vocabulary v3, sourced_by (#282) | ✅ | ✅ | ✅ | ✅ /defects | n/a |
| tx_hash_status in launch_check (3.2, #280) | ✅ (in schema) | ✅ | ✅ (launch_check) | — | ⚑ keeper line pending (#84) |
| stale_after / staleness reads (3.3, #283) | ✅ | ✅ | — | — | ⚑ conformance doc line pending (#84) |
| Observer accounting (3.4, #286) | ✅ | ✅ | — | ✅ (gap taxonomy on /corpus) | n/a |
| Trajectory + since-diff (3.5, #290) | ✅ | ✅ | ✅ (this change) | ✅ (this change) | n/a (free) |
| Wallet facts T1/T2 (3.6, #295) | ✅ | ✅ | ✅ (this change) | ✅ (this change) | n/a (free) |
| Standing notes (3.6, #296) | ✅ | ✅ | ✅ (this change) | ✅ (this change) | n/a (free) |
| Verify short-leash + declines reading (#292) | internal | internal | n/a | n/a | n/a |
| Delivery intents on both doors (#293) | internal | internal | n/a | n/a | n/a |
| Provenance check (T3) | NOT BUILT | — | — | — | ⚑ K3 price + M5 copy first |

This change closes the two "this change" columns: the corpus landing
and /developers now name the trajectory, diff, wallet-facts and
standing-note surfaces.

## B. ⚑ DRAFT selling copy — keeper approval required (M5)

None of the following is wired anywhere. Each block names its target
surface. Approve, reword, or strike.

### B1. Storefront / "what this is" — one added line

> The record now reads as time: week-over-week trajectory, a diff
> any agent can poll, and wallet facts nobody else counts — all
> derived from the signed chain, all free.

### B2. Gazette line — the wallet-facts first read

(Keeper decides whether this runs at all; the number will move each
week and the line should quote the live surface, not freeze it.)

> First reading from the new wallet-facts surface: of 544 receiving
> addresses advertised by this week's doors, 78 receive at more than
> one door — and the largest single cluster fronts 60 doors. We don't
> say what that means about operators; custodial and platform wallets
> make strangers share an address. We publish the count and the
> denominator, and the inference is yours. /corpus/wallet-facts.json,
> free, re-derivable.

### B3. launch_check menu copy — the tx_hash_status line (#84 item)

> Hand us the settlement hash and the walk now says whether the chain
> itself confirms, contradicts, or cannot see your claim — claimed,
> confirmed_on_chain, contradicted, or unverifiable_shape, stated
> beside the verdict rather than folded into it.

### B4. Conformance page — the staleness doc line (#84 item)

> Artifacts now carry stale_after: past it, a document is still
> validly signed history — just no longer a statement about now. The
> desk reads both facts separately and says which one failed.

### B5. Standing notes — one storefront line

> If we observed your door and you have something to say about it,
> say it on the record: prove control, attach your statement, and it
> rides beside our observation everywhere it appears. We never edit
> the observation; you never need our permission.

## C. Remaining gaps, deliberately not closed here

- The provenance check ships nothing until K3 pricing (spec:
  docs/PROVENANCE_CHECK_SPEC_2026-08.md).
- The scoreboard (#26), replay census (#37) and adoptable-spec
  extraction (#83) are features, not surfacing — they stay on the
  task list.
- README/repo docs describe the codebase, not the store, and were
  left alone.
