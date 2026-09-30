# PR1 — admin reporting review, September 29

Reviewed source at `b8a87513`. The source/local review is complete.
[Local remediation](../../docs/ADMIN_REPORTING_FIXES_2026-09-29.md) follows
the findings below; authenticated production readback remains outstanding. No production admin
records were read, no payment was made and no live state was changed.

The [entry-point inventory](INVENTORY.md) covers every registered admin GET
route, its source and its report owner. Deeper protocol/accounting checks
followed the office/glance, take, growth, protocols, MPP sales, purchase
inspection, signals, instruments, buyers, funnel and ward producers. The
remaining entries were inventoried and screened for protocol scope, not
individually exercised against production data. This is not a complete
financial, tax, security or mutation-path audit.

## Findings, in recommended repair order

### 1. P2 — monthly store totals omit native MPP sales

`computeGrowth` reads `readMonthLedger`; that ledger scans the legacy metric
prefix. Native MPP sales deliberately live in a separate monthly ledger.
The growth page nevertheless calls its rows “organic settles” and “revenue
USDC (organic)” without limiting them to x402. A native sale therefore does
not increase those totals, although the store's aggregate statistics include
it. The HTML and JSON growth reports share this producer.

The same source boundary reaches `writeGlance` and the office's monthly
summary: both derive monthly sales/revenue from the legacy month ledger.
`computePulse` also omits native MPP, and `/admin/instruments` uses its
monthly settles as the comparison beside free-tool use. Its public consumers
belong in PR2; this dependency should be carried forward rather than repaired
twice. Certificate-only buyer views already disclose their narrower scope.

Evidence: a synthetic native organic sale is counted as 1 by `readMppSales`,
but `computeGrowth` and `computePulse` both return 0 for that month. Both
assertions failed under a fixed clock. The office/glance impact is source
traced, not separately exercised by this reproducer.

Owners: `src/services/growth.ts` (`deriveGrowthMonth`, `computeGrowth`),
`src/lib/metrics.ts` (`readMonthLedger`), `src/services/glance.ts`
(`writeGlance`), `src/pages/admin/office-page.ts` (`glanceHtml`),
`src/services/pulse.ts` (`computePulse`), `src/routes/admin.ts`
(`/admin/instruments`). Compare the existing native fold in
`src/services/stats.ts` and corrected summaries in `src/services/mpp-sales.ts`.

Repair: derive monthly totals from the disjoint sources with house
corrections applied, or explicitly label the older readings by their scope
until joined. Preserve frozen historical readings and publish changes in
meaning. Do not add all-time MPP totals to every month, and do not combine
settles with challenge/decline denominators until those instruments' protocol
coverage is established. Check item totals, revenue, month boundaries,
corrected house sales, legacy pilot rows and duplicate/retry behavior.

Benefit: the keeper can compare growth and instrument use against the sales
actually booked across both payment protocols.

### 2. P2 — corrected house sales still appear organic on the MPP desk

`CounterLedger.correctMppHouseSale` retains the original sale and writes a
separate correction. Aggregate readers apply that correction. Purchase
inspection validates it and exposes `effective_house`. In contrast,
`listMppSales`/`readMppSaleEvidence` return original rows and the MPP page
counts organic sales directly from `sale.house`.

Evidence: record one originally organic sale, apply a valid house correction,
then read both reports. The aggregate reports zero organic; the MPP page
prints “1 organic, 0 house.” Its raw JSON also supplies no effective
classification or correction alongside the original row. The original row
itself is valid historical evidence; the error is treating it as the current
classification in the page's summary.

Owners: `src/services/counter-ledger.ts` (`listMppSales`,
`correctMppHouseSale`), `src/services/mpp-sales.ts` (`readMppSaleEvidence`),
`src/pages/admin/mpp-sales-page.ts` (`row`, `renderMppSalesPage`).

Repair: retain the original evidence, expose validated corrections and the
effective classification alongside it, and use the effective value for the
current summary. Unreadable or mismatched corrections must be named rather
than silently treated as organic. Also distinguish months requested from
months successfully read: the present “Months read” line includes failed
months, although a separate warning discloses them.

Benefit: the sales list, purchase inspector and aggregate books agree about
which purchases came from outside the house, without rewriting history.

### 3. P2 — unavailable protocol readings render as observed zero

`readProtocols` catches source failures, records `unreadable`, and substitutes
empty arrival and till inputs. `renderProtocolsPage` prints the warning that
a failed source “is therefore not a zero,” but still prints “No organic
arrivals recorded,” “none” for each till door and “Total across doors: 0.”
The prose says a door showing none took no money that month.

Evidence: render a failed buyer-signals reading with the exact fallback
shape produced by the service. The warning and zero-sale claim both appear.
The existing failure-path test checks the warning, not the absence of false
zero claims. Source tracing also identifies the analogous arrivals case.

Owners: `src/services/protocol-reading.ts` (`readProtocols`),
`src/pages/admin/protocols-page.ts` (`renderProtocolsPage`).

Repair: carry per-section availability through to rendering. Suppress totals
and zero-use conclusions when their source failed; keep actual measured zeros
visible. Cover arrivals and till separately so one failed source does not
hide a successful reading beside it.

Benefit: a failed report cannot be mistaken for a quiet store.

### 4. Coverage improvement — show support separately from usage

The existing protocols desk combines arrivals, settled purchases, HTTP
payment outcomes, market observations and the field study's declared buyer
surfaces. Those are useful measurements, but they do not show the store's
current enabled checkout configuration or the difference between served
protocols and protocols inspected on other endpoints. A supported protocol
with no recorded calls can disappear from the arrival rows.

Reuse `/admin/protocols` for a compact capability summary derived from the
existing discovery and purchase-capability sources. Keep served transport,
checkout, endpoint inspection, artifact verification and measured usage
separate. Derive enabled item/rail details; do not hand-maintain another
protocol list or turn browser registration into a wallet-compatibility claim.
A2A card validation and the served A2A endpoint version are different facts.

Benefit: the keeper can tell what is available even when nobody has used it,
and can see where an instrument does not cover a supported capability.

## Existing coverage that should be preserved

- A2A and UCP arrivals are attributed by the edge/channel producers. WebMCP
  adds its source marker. An absent historical label does not mean the
  capability was absent.
- The paid-door set is HTTP, MCP and UCP. A2A arrival attribution does not
  require an A2A settlement row. WebMCP and payment protocols are different
  dimensions; they should not be added together as independent sales.
- UCP completion supplies its door to fulfillment, which records buyer
  signals. Durable Object lifecycle state cannot be globally enumerated;
  the protocols report names that limitation.
- The take's diagnosed statistics include native MPP and its corrected
  house accounting. Purchase inspection already distinguishes original and
  effective classification and performs no repair on GET.
- HTTP payment operations explicitly exclude free quotes and MCP/WebMCP,
  include retries/house traffic, and distinguish unwritten counters from
  measured zero. A successful HTTP response is not claimed as a new sale.
- Ward MPP census readings retain measured/unmeasured distinctions and do
  not turn an unpaid challenge inspection into verified paid delivery.
- Buyers reports disclose that they count certificate holders; event-based
  funnel/census reports disclose bounded scans and event counts. They must
  not become universal buyer/settlement totals through a copy change.

## Verification and limits

The retained [synthetic reproducer](reproduction.spec.ts.txt) was temporarily
run as `test/admin-reporting-review-probes.spec.ts`. It uses the local Worker
test bindings and a fixed September 29 clock. All three tests failed on the
reviewed source for the expected assertions; the third test contains two
soft assertions, for growth and pulse. Positive controls confirmed the
native sale and house correction were recorded. No source patch was needed
to manufacture these failures.

To reproduce, copy that file to its original test path, run
`npm test -- test/admin-reporting-review-probes.spec.ts`, then remove the
copied file. It is deliberately stored outside the normal suite until the
repairs are implemented. Promote the cases into their owning behavior specs
when fixing them; these failures are findings, not a passing release gate.

Existing focused regression suite: **8 files, 67 tests passed**. These were
`admin-protocols`, `admin-mpp-sales-desk`, `admin-purchase-inspection`,
`growth`, `payment-operations`, `admin-navigation`, `admin-reach` and
`buyer-signals`. The passing baseline does not contradict the separately
reproduced missing cases.
No runtime code changed. No production screenshot, live admin correctness,
full-suite result or deployed repair is claimed. PR2–PR4 remain outstanding;
PR1 fixes should precede new capability copy so the numbers underneath that
copy are coherent.
