# PR2 — public reporting review, September 30

Source review on `codex/protocol-reporting-review`, following admin repair
commit `847ed8b4`. This stage checks public reporting populations and their
readable/machine twins. It does not establish deployment of the local fixes,
search visibility, external listing admission or buyer qualification.

## Inventory and disposition

| Surface | Producer and finding | Disposition |
| --- | --- | --- |
| `/stats` and the payment rollup | `services/stats.ts` already combines disjoint x402 and native MPP sources. Native rows have per-item corrections, unlike legacy x402. A native sale could accidentally restore a network split withheld for contradictory legacy counters. | Preserve withholding, correct the per-item method, and derive the network formula from `settlementNetworkLabels()`. Register both sources and their different correction behavior. |
| `/rails`, JSON and Markdown | The all-time payment groups include MPP. `readRailCountersByMonth` reads x402 counters before later house reclassification. The monthly chart total included `other`, but its bars and table omitted that category. | Keep the existing monthly series and name its scope. Share the method text between representations, show the missing category, and stop describing every unplaced network as an old sale. |
| `/pulse` and `/pulse.json` | PR1 adds combined sales separately from the x402 conversion funnel. The displayed percentage used recorded challenges, but its adjacent “1 in” could use corrected challenges. | Use the recorded denominator for both expressions and label the column. Preserve the separate corrected fields in JSON. |
| `/store-month`, chain JSON and dated JSON | Signed figures retained the x402 funnel and all-time rail/item counts. Native monthly sales were absent. The advertised dated JSON route did not match its URL. | New records add combined and native monthly sales. Old signed documents remain unchanged; an unsigned scope explanation names their missing coverage. Repair the dated route and register the added counts. |
| Growth/month log consumers | `services/growth.ts` is the admin report, not a separate public growth route. `store-figures.ts` joins existing pulse/books/signals for the public signed month and digest. | Carry forward PR1's combined totals. Preserve frozen growth logs and existing x402 funnel fields. No second aggregation engine. |
| `/corpus.json`, weekly briefs and round pages | Corpus records are quoted signed snapshots. `weekly-brief.ts` derives from trajectory points; the HTML uses the same brief. MPP appears separately when present, with “not measured” for older snapshots. | Retain current scope and historical absence. No conversion of x402 verdicts into universal protocol verdicts. |
| `/corpus/month` and its twins | `monthly-state.ts` sums signed weeks into explicitly named x402 closing readings and door-week counts. | Preserve the x402 scope and denominators; do not relabel these historical series as an all-protocol census. |
| Host history, passports and hosted trust profiles | `subject-history.ts` retains protocol observations and reader failures; the host table distinguishes absent historical readings. Passport derivation selects a named protocol and keeps the underlying x402 verdict; hosted profiles aggregate the same public evidence. | Preserve dated observations, gaps, protocol-specific tiers and signed bytes. The remaining x402-only host Dataset name is carried into PR3's metadata review. |
| `/trust` and its twins | `discoveryProtocolIndex` and HTML share `DISCOVERY_PROTOCOLS`. MPP was labelled inspection-only despite the implemented native checkout path. | Update that existing record to name inspection and checkout for enabled items. Keep configuration, payment/delivery evidence and external indexing distinct. No new catalog. |

## Reproductions and repairs

`test/public-reporting-review.spec.ts` uses a fixed clock and isolated local
storage. Seven initial cases failed on the prior source. After those repairs,
the dated JSON test independently witnessed a 404 instead of 200. A further
trust-page test witnessed the old inspection-only status before its repair.
The cases cover contradictory network counters with valid native sales,
other-network chart values, twin scope, percentage/ratio agreement, newly
sealed combined totals, old signed bytes and missing historical fields,
public stats methods, and trust-page capability parity.

The dated public correction is
`src/store/corrections-ledger/2026-09-30-public-reporting-protocol-scope.ts`.
It records what changed without pretending the repair has been deployed.

## Public read, separate from local validation

[`public-readback.json`](public-readback.json) retains UTC read times,
response hashes, HTTP/cache metadata and the relevant fields for `/stats`,
`/rails`, `/pulse.json` and `/store-month.json`. All four answered 200 on
September 30. These are baseline observations, not post-release checks.
The browser/search reader returned older cached HTML for rails/trust and
could not open the two JSON URLs; the direct reads are the dated evidence.
No private admin page, paid checkout or external listing was exercised.

## Validation and release

Type checking, all three Worker dry-run builds and `git diff --check` passed.
The focused run passed **184 tests across 16 files**, including the eight
new public-reporting regressions, count registration, rails, pulse, monthly
signatures/tampering, trust, monthly/weekly corpus summaries, MPP passports,
subject history, admin reporting, growth, route coverage, correction links
and skill-index parity. PR1's full-suite result and repaired reruns remain
in its own validation record; a new full local run was not repeated for this
batch. CI remains required before a later merge.

No PR, push or deployment was performed. PR3 discovery/AEO/SEO and PR4
GitHub/package/external listing review follow in that order.

## October 1 release status

Source merged in [PR #947](https://github.com/seancrecord/scvd-general-store-repo/pull/947)
after all required CI passed. The [public reporting/discovery readback](../protocol-reporting-release-2026-10-01/README.md)
passed; earlier local-only statements above describe their dated checkpoint.
Package publication, external corrections, authenticated admin and native-host
qualification remain separate. The [guide cleanup](../guide-readability-2026-09-30/README.md)
is a later local follow-up, not part of the live readback.
