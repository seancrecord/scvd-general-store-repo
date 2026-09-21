/**
 * THE PUBLISHED COUNTS, REGISTERED (2026-09-21).
 *
 * Rule 43 as amended says no ratio without its denominator and no
 * verdict without its derivation beside it. The prose on every count
 * page obeyed that; the numbers did not. /pulse computed a corrected
 * rate on months and not on all_time; /observatory filed forty-three
 * named crawlers as organic while /admin/signals filed the same
 * request as a crawler; the signals maps bucketed their overflow
 * into "other" and no page said the cap existed. The August paper on
 * published counts (docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md)
 * filed thirteen defects of exactly this kind and shipped none.
 *
 * WHAT THIS IS. One row per number the six public count routes
 * serve: what it counts, which instrument wrote it, what it is out
 * of, over what window, who was kept out, and any cap or floor that
 * bounded it. The routes emit the rows that apply to them as an
 * additive `published_counts` block beside the numbers — the numbers
 * themselves keep their bytes and their keys, because a reader who
 * cited /stats last month must find the same shape this month — and
 * the HTML twins print the same rows as a table under the figures.
 *
 * WHAT HOLDS IT. test/published-counts.spec.ts walks every numeric
 * leaf each route serves, in the suite and on recorded production
 * shapes, and fails on any leaf without a row here. A number nobody
 * has written a denominator for cannot reach a public route. The
 * rows are typed once; a route that serves a count this register
 * has never heard of is the failure, not a row nobody reads.
 *
 * WHAT IS QUOTED, NOT REGISTERED. /corpus.json carries the newest
 * signed weekly snapshot verbatim under `latest`. Its hundred-odd
 * numbers are that artifact's own fields, sealed and signed on the
 * round; their denominators are inside the round beside them, and
 * re-registering a signed artifact's bytes here would be a second,
 * unsigned copy of the same claims. One row names the subtree as
 * quoted and points at the bytes.
 */

export type CountRoute = "/stats" | "/pulse" | "/rails" | "/observatory" | "/coverage" | "/corpus.json";

export type CountKind =
  /** A tally of events or things. */
  | "count"
  /** Money, in the unit named. */
  | "amount"
  /** A fraction, with its numerator and denominator named. */
  | "rate"
  /** An interval a percentile falls in, never a point. */
  | "range"
  /** A configuration value, published so a bound can be read. */
  | "constant"
  /** Another signed artifact's own fields, quoted verbatim. */
  | "quoted";

export interface PublishedCount {
  route: CountRoute;
  /**
   * The JSON path from the route's root: dots between keys, `[]` for
   * an array element, `*` for one dynamic key (a chain, a surface, a
   * channel), `**` for a whole quoted subtree.
   */
  path: string;
  kind: CountKind;
  /** What one unit of the value is. */
  unit: string;
  /** The code path that wrote the counter, or derived the figure. */
  instrument: string;
  /** What the value is out of: the denominator, in words. */
  population: string;
  /** The span the value covers. */
  window: string;
  /** Who or what was kept out before counting. */
  exclusions: readonly string[];
  /** A bound that can keep the value under the truth, named. */
  floor?: string;
  /** A cap that can keep the value under the truth, named. */
  cap?: string;
}

export const PUBLISHED_COUNTS_RULE =
  "Every published count ships with its instrument, its population, its window, its exclusions, and any cap or floor that bounded it, on every rendering. The rows below are that, one per number this route serves; a number without a row cannot reach this route (test/published-counts.spec.ts).";

const HOUSE = "house traffic: the proprietors' own wallets, agents and tests, flagged at the till";
const RECLASS = "family settles reclassified from organic to house after the fact (/corrections)";
const INFRA = "infrastructure: crawlers, scanners, monitors and indexes by name (lib/channel.ts, lib/crawlers.ts)";
const KV_FLOOR =
  "KV read-add-write before 2026-09-11 could drop a count under a burst; since then the counter ledger's single writer holds the truth and KV mirrors it (services/counter-ledger.ts)";
const SINCE_OPENING = "since 2026-07-22, the store's first day";
const TILL = "the till, in the call that produces the organic count (lib/metrics.ts recordSettle)";
const PORCH = "the porch counter on every counted surface (lib/metrics.ts recordPorchVisit, lib/porch-surface.ts)";
const PORCH_FLOOR =
  "the porch records at most 100 visits a minute per isolate and drops the rest; the monthly ledger scans at most 5,000 keys and says when it hit the cap";

const STATS_ORGANIC: Omit<PublishedCount, "path" | "route"> = {
  kind: "count",
  unit: "settled purchases",
  instrument: TILL,
  population: "every payment that settled at this store",
  window: SINCE_OPENING,
  exclusions: [HOUSE, RECLASS],
  floor: KV_FLOOR,
};

function rows(route: CountRoute, entries: Array<Omit<PublishedCount, "route">>): PublishedCount[] {
  return entries.map((entry) => ({ route, ...entry }));
}

const RAIL_SPLIT = (route: CountRoute, prefix: string): PublishedCount[] =>
  rows(route, [
    {
      path: `${prefix}.*`,
      kind: "count",
      unit: "settled organic purchases on the named network (rail_not_recorded: settled, network unrecorded)",
      instrument:
        "three disjoint records: the till's rail written with the settle; the certificates for sales before the till kept rails; the store's own single-rail configuration for sales before 2026-08-04 (routes/stats.ts rail_split_method)",
      population: "organic_settlements; the named networks plus rail_not_recorded always sum to it",
      window: SINCE_OPENING,
      exclusions: [HOUSE, RECLASS],
      floor: KV_FLOOR,
    },
  ]);

const PAYMENTS_ROLLUP = (route: CountRoute): PublishedCount[] =>
  rows(route, [
    {
      path: "payments.organic_purchases",
      ...STATS_ORGANIC,
      instrument: "the payment rollup over the same settle counters (services/stats.ts payments)",
    },
    {
      path: "payments.by_protocol[].purchases",
      kind: "count",
      unit: "settled organic purchases over the named payment protocol",
      instrument: "the payment rollup (services/stats.ts payments)",
      population: "payments.organic_purchases; the groups divide it and are never added together",
      window: SINCE_OPENING,
      exclusions: [HOUSE, RECLASS],
      floor: KV_FLOOR,
    },
    {
      path: "payments.by_network[].purchases",
      kind: "count",
      unit: "settled organic purchases on the named settlement network",
      instrument: "the payment rollup (services/stats.ts payments)",
      population: "payments.organic_purchases; the groups divide it and are never added together",
      window: SINCE_OPENING,
      exclusions: [HOUSE, RECLASS],
      floor: KV_FLOOR,
    },
    {
      path: "payments.by_currency[].purchases",
      kind: "count",
      unit: "settled organic purchases in the named currency",
      instrument: "the payment rollup (services/stats.ts payments)",
      population: "payments.organic_purchases; the groups divide it and are never added together",
      window: SINCE_OPENING,
      exclusions: [HOUSE, RECLASS],
      floor: KV_FLOOR,
    },
  ]);

const PULSE_WINDOW = (prefix: string, window: string): Array<Omit<PublishedCount, "route">> => [
  {
    path: `${prefix}.organic_challenges`,
    kind: "count",
    unit: "402 challenges issued",
    instrument: "the payment gate, one count per 402 sent (lib/metrics.ts recordChallengeIssued)",
    population: "every 402 this store issued; the funnel's denominator",
    window,
    exclusions: [HOUSE, INFRA],
    floor: PORCH_FLOOR,
  },
  {
    path: `${prefix}.organic_payments_presented`,
    kind: "count",
    unit: "payments presented",
    instrument: "derived: organic_settled + organic_declines, never a meter of its own (services/pulse.ts)",
    population: "every payment an organic buyer actually presented; each is booked as exactly one of settled or declined",
    window,
    exclusions: [HOUSE, INFRA],
  },
  {
    path: `${prefix}.organic_settled`,
    kind: "count",
    unit: "settled purchases",
    instrument: `${TILL}, with the reclassification ledger already subtracted`,
    population: "organic_payments_presented",
    window,
    exclusions: [HOUSE, RECLASS],
    floor: KV_FLOOR,
  },
  {
    path: `${prefix}.misbooked_house`,
    kind: "count",
    unit: "settles reclassified from organic to house",
    instrument: "the reclassification ledger (services/reclassify.ts)",
    population: "the raw organic settle count before subtraction; published so the subtraction can be checked",
    window,
    exclusions: [],
  },
  {
    path: `${prefix}.organic_declines`,
    kind: "count",
    unit: "payments presented and refused",
    instrument: "the decline desk, one count per refused presentation (lib/declines.ts)",
    population: "organic_payments_presented",
    window,
    exclusions: [HOUSE, INFRA],
  },
  {
    path: `${prefix}.organic_rechecks`,
    kind: "count",
    unit: "free re-verifications of already-issued artifacts at /api/verify",
    instrument: "the verify route's own counter (routes/verify.ts recordVerifyCall)",
    population: "every verify call; not a funnel step, a different event by different callers",
    window,
    exclusions: [HOUSE, INFRA],
  },
  {
    path: `${prefix}.conversion_rate`,
    kind: "rate",
    unit: "organic_settled / organic_challenges",
    instrument: "derived at read (services/pulse.ts rate)",
    population: "organic_challenges; null when nothing was offered, zero when offered and nobody paid",
    window,
    exclusions: [HOUSE, INFRA],
  },
  {
    path: `${prefix}.known_machinery`,
    kind: "count",
    unit: "402 challenges re-read as machinery",
    instrument: "the hourly correction walk re-reading raw rows with today's crawler table and the behavioural walk detector (services/reclassify.ts)",
    population: "organic_challenges; published beside the recorded figure, never subtracted from it",
    window,
    exclusions: [],
  },
  {
    path: `${prefix}.known_machinery_by_user_agent`,
    kind: "count",
    unit: "402 challenges whose client named a machine",
    instrument: "the correction walk's user-agent half (services/reclassify.ts)",
    population: "known_machinery",
    window,
    exclusions: [],
  },
  {
    path: `${prefix}.known_machinery_by_behaviour`,
    kind: "count",
    unit: "402 challenges whose client walked the catalogue like a machine",
    instrument: "the correction walk's behavioural half: WALK_MIN_ITEMS distinct doors inside WALK_WINDOW_MS (lib/walkers.ts)",
    population: "known_machinery",
    window,
    exclusions: [],
  },
  {
    path: `${prefix}.corrected_challenges`,
    kind: "count",
    unit: "402 challenges",
    instrument: "derived: organic_challenges − known_machinery, only when the walk completed (services/pulse.ts)",
    population: "organic_challenges",
    window,
    exclusions: [HOUSE, INFRA, "machinery the correction walk found after the fact"],
  },
  {
    path: `${prefix}.corrected_conversion_rate`,
    kind: "rate",
    unit: "organic_settled / corrected_challenges",
    instrument: "derived at read (services/pulse.ts)",
    population: "corrected_challenges; the same three states as conversion_rate",
    window,
    exclusions: [HOUSE, INFRA, "machinery the correction walk found after the fact"],
  },
];

export const PUBLISHED_COUNTS: readonly PublishedCount[] = [
  // /stats — the books.
  ...rows("/stats", [
    {
      path: "settled_purchases_total",
      kind: "count",
      unit: "settled purchases",
      instrument: TILL,
      population: "every payment that settled at this store: organic + house + pre-meter",
      window: SINCE_OPENING,
      exclusions: [],
      floor: KV_FLOOR,
    },
    { path: "organic_settlements", ...STATS_ORGANIC },
    {
      path: "house_settlements",
      kind: "count",
      unit: "settled purchases by the house",
      instrument: `${TILL}, plus the reclassification ledger`,
      population: "settled_purchases_total",
      window: SINCE_OPENING,
      exclusions: ["everything not flagged house"],
      floor: KV_FLOOR,
    },
    {
      path: "reclassified_house",
      kind: "count",
      unit: "settles moved from organic to house at read",
      instrument: "the reclassification ledger (services/reclassify.ts); raw counters untouched",
      population: "house_settlements; subtracted from organic, added to house",
      window: SINCE_OPENING,
      exclusions: [],
    },
    {
      path: "pre_meter_settlements",
      kind: "count",
      unit: "settled purchases from before the channel meter existed",
      instrument: "the founding ledger, attributed to nobody",
      population: "settled_purchases_total",
      window: "before the channel meter, 2026-07",
      exclusions: [],
    },
    {
      path: "artifacts_issued",
      kind: "count",
      unit: "artifacts minted, free shelf included",
      instrument: "the patron counter (services/certificates.ts)",
      population: "every artifact ever minted: stamps, free certificates, house tests, the lot; NOT a sales figure",
      window: SINCE_OPENING,
      exclusions: [],
    },
    {
      path: "distinct_organic_buyers",
      kind: "count",
      unit: "distinct paying wallets",
      instrument: "one payer row per wallet, counted (services/stats.ts)",
      population: "wallets that settled an organic purchase; one buyer on two wallets reads as two",
      window: SINCE_OPENING,
      exclusions: [HOUSE],
      floor:
        "a settle whose wallet never came back with the money writes no payer row; the founding settles have none; null, never zero, when the scan truncates",
    },
    ...RAIL_SPLIT("/stats", "organic_by_rail").map(({ route: _route, ...row }) => row),
    {
      path: "payment_sources[].organic",
      kind: "count",
      unit: "settled organic purchases over the named protocol and currency",
      instrument: "the payment-source rollup over disjoint sets (services/stats.ts payment_sources)",
      population: "organic_settlements",
      window: SINCE_OPENING,
      exclusions: [HOUSE, RECLASS],
      floor: KV_FLOOR,
    },
    {
      path: "payment_sources[].house",
      kind: "count",
      unit: "settled house purchases over the named protocol and currency",
      instrument: "the payment-source rollup (services/stats.ts payment_sources)",
      population: "house_settlements",
      window: SINCE_OPENING,
      exclusions: ["everything not flagged house"],
    },
    {
      path: "payment_sources[].house_correction.purchases",
      kind: "count",
      unit: "MPP sales corrected to house after the fact",
      instrument: "the MPP house-correction ledger (services/mpp-sales.ts)",
      population: "payment_sources[].house for the MPP row",
      window: SINCE_OPENING,
      exclusions: [],
    },
    {
      path: "payment_sources[].amounts.decimals",
      kind: "constant",
      unit: "decimal places of the asset",
      instrument: "the asset's own contract",
      population: "not a count",
      window: "n/a",
      exclusions: [],
    },
    ...PAYMENTS_ROLLUP("/stats").map(({ route: _route, ...row }) => row),
    {
      path: "till_by_item.*.organic",
      kind: "count",
      unit: "settled organic purchases of the named item (a penny page by its path, slashes as colons)",
      instrument: `${TILL}: metric:<month>:paid:<item>, every month added (services/stats.ts till_by_item)`,
      population: "the raw organic settle count before reclassification; the items sum to organic_settlements + reclassified_house",
      window: SINCE_OPENING,
      exclusions: [HOUSE],
      floor: `${KV_FLOOR}; the reclassification ledger cannot be applied per item, so a family settle booked organic before its wallet was listed still sits here`,
    },
    {
      path: "till_by_item.*.house",
      kind: "count",
      unit: "settled house purchases of the named item",
      instrument: `${TILL}: metric:<month>:paid:<item> (services/stats.ts till_by_item)`,
      population: "the raw house settle count before reclassification",
      window: SINCE_OPENING,
      exclusions: ["everything not flagged house at the till"],
    },
    {
      path: "net_by_chain.*.months[].observed_inflow_usdc",
      kind: "amount",
      unit: "USDC",
      instrument: "the hourly reconciliation walk reading the chain for transfers into the receiving wallet (services/net-statement.ts)",
      population: "every USDC transfer the walk saw arrive on that chain that month, banked to the month the walk saw it",
      window: "per month, from each meter's own published start date",
      exclusions: [],
      floor: "a transfer the walk has not yet seen (up to an hour behind the chain at month edges)",
    },
    {
      path: "net_by_chain.*.months[].of_which_dust_usdc",
      kind: "amount",
      unit: "USDC",
      instrument: "the same walk, metering transfers below the cheapest listing separately (services/net-statement.ts)",
      population: "observed_inflow_usdc; dust cannot be a purchase and must not read as revenue",
      window: "per month",
      exclusions: [],
    },
    {
      path: "net_by_chain.*.months[].booked_usdc",
      kind: "amount",
      unit: "USDC",
      instrument: `${TILL}; neither side copies the other`,
      population: "every settle the till booked on that chain that month, organic and house",
      window: "per month",
      exclusions: [],
    },
    {
      path: "net_by_chain.*.months[].booked_organic_usdc",
      kind: "amount",
      unit: "USDC",
      instrument: TILL,
      population: "booked_usdc",
      window: "per month",
      exclusions: [HOUSE],
    },
    {
      path: "net_by_chain.*.months[].booked_house_usdc",
      kind: "amount",
      unit: "USDC",
      instrument: TILL,
      population: "booked_usdc",
      window: "per month",
      exclusions: ["everything not flagged house"],
    },
    {
      path: "net_by_chain.*.months[].difference_usdc",
      kind: "amount",
      unit: "USDC",
      instrument: "derived at read: observed_inflow_usdc − booked_usdc (services/net-statement.ts)",
      population: "the two figures beside it",
      window: "per month",
      exclusions: [],
    },
  ]),

  // /pulse — the funnel.
  ...rows("/pulse", [
    ...PULSE_WINDOW("all_time", SINCE_OPENING),
    ...PULSE_WINDOW("months[]", "the named month"),
    {
      path: "latency.bucket_edges_ms[]",
      kind: "constant",
      unit: "milliseconds",
      instrument: "the histogram's bucket edges, published so the ranges can be read (services/pulse.ts)",
      population: "not a count",
      window: "n/a",
      exclusions: [],
    },
    {
      path: "latency.routes.*.samples",
      kind: "count",
      unit: "server-side timings recorded",
      instrument: "one counter per route class per bucket, bumped after the response is sent (lib/metrics.ts)",
      population: "every timing of this store's own server producing a 402, house and infrastructure included",
      window: "the current month",
      exclusions: [],
      floor: "KV read-modify-write with no compare-and-swap: two timings landing in one bucket in one instant can record as one",
    },
    {
      path: "latency.routes.*.buckets.*",
      kind: "count",
      unit: "timings in the named bucket",
      instrument: "the same per-bucket counters (lib/metrics.ts)",
      population: "latency.routes.*.samples",
      window: "the current month",
      exclusions: [],
      floor: "the same last-write-wins floor as samples",
    },
    {
      path: "latency.routes.*.p50_ms_range[]",
      kind: "range",
      unit: "milliseconds, [at least, under]",
      instrument: "derived from the histogram at read (services/pulse.ts)",
      population: "latency.routes.*.samples; a histogram supports an interval, never a point",
      window: "the current month",
      exclusions: [],
    },
    {
      path: "latency.routes.*.p95_ms_range[]",
      kind: "range",
      unit: "milliseconds, [at least, under]",
      instrument: "derived from the histogram at read (services/pulse.ts)",
      population: "latency.routes.*.samples",
      window: "the current month",
      exclusions: [],
    },
  ]),

  // /rails — where the money settles.
  ...PAYMENTS_ROLLUP("/rails"),
  ...RAIL_SPLIT("/rails", "all_time"),
  ...rows("/rails", [
    {
      path: "by_month_from_the_till[].*",
      kind: "count",
      unit: "settled organic purchases on the named network (other: a network the series has no column for)",
      instrument: "the till's own rail counters, written with the settle (services/rails.ts readRailCountersByMonth)",
      population: "the month's organic settles the till recorded a rail for; certificate-era sales before the till kept rails appear only in all_time",
      window: "the named month",
      exclusions: [HOUSE],
      cap: "a month whose key scan hit its cap is marked truncated on its row",
    },
    {
      path: "trade_counter.accounts[].delivered_live",
      kind: "count",
      unit: "deliveries billed to the named trade account",
      instrument: "the trade ledger (services/trade-counter.ts tradeLedger)",
      population: "every live delivery on that account; off-chain, never inside a rail",
      window: SINCE_OPENING,
      exclusions: ["test-mode deliveries (delivered_test beside it)"],
    },
    {
      path: "trade_counter.accounts[].delivered_test",
      kind: "count",
      unit: "test-mode deliveries on the named trade account",
      instrument: "the trade ledger (services/trade-counter.ts)",
      population: "every delivery on that account",
      window: SINCE_OPENING,
      exclusions: ["live deliveries"],
    },
    {
      path: "trade_counter.accounts[].net_usd",
      kind: "amount",
      unit: "USD",
      instrument: "the trade ledger: the account's statement total (services/trade-counter.ts)",
      population: "delivered_live at the account's per-delivery price",
      window: SINCE_OPENING,
      exclusions: ["test-mode deliveries"],
    },
    {
      path: "trade_counter.accounts[].paid_usd",
      kind: "amount",
      unit: "USD",
      instrument: "the trade ledger: payments the keeper recorded against the statement",
      population: "net_usd",
      window: SINCE_OPENING,
      exclusions: [],
    },
    {
      path: "trade_counter.accounts[].outstanding_usd",
      kind: "amount",
      unit: "USD",
      instrument: "derived: net_usd − paid_usd (services/trade-counter.ts)",
      population: "net_usd",
      window: SINCE_OPENING,
      exclusions: [],
    },
    {
      path: "trade_counter.delivered_live_total",
      kind: "count",
      unit: "live deliveries across every trade account",
      instrument: "derived at read: the sum of accounts[].delivered_live (routes/rails.ts)",
      population: "every live trade delivery",
      window: SINCE_OPENING,
      exclusions: ["test-mode deliveries"],
    },
    {
      path: "trade_counter.outstanding_usd_total",
      kind: "amount",
      unit: "USD",
      instrument: "derived at read: the sum of accounts[].outstanding_usd (routes/rails.ts)",
      population: "the sum of accounts[].net_usd",
      window: SINCE_OPENING,
      exclusions: [],
    },
  ]),

  // /observatory — what gets read.
  ...rows("/observatory", [
    {
      path: "floors.porch_writes_per_minute",
      kind: "constant",
      unit: "porch writes a minute per isolate",
      instrument: "lib/metrics.ts PORCH_WRITES_PER_MINUTE, held equal by test",
      population: "not a count; the floor every visit count below is bounded by",
      window: "n/a",
      exclusions: [],
    },
    {
      path: "floors.ledger_key_cap",
      kind: "constant",
      unit: "counter keys the monthly ledger scans",
      instrument: "lib/metrics.ts METRIC_KEY_CAP, held equal by test",
      population: "not a count; the cap every month below is bounded by",
      window: "n/a",
      exclusions: [],
    },
    {
      path: "months[].organic_visits",
      kind: "count",
      unit: "requests to counted surfaces (one agent reading a page ten times is ten)",
      instrument: PORCH,
      population: "every request to a surface the porch counts by name; a surface absent from counted_paths is not counted, not unvisited",
      window: "the named month",
      exclusions: [HOUSE, INFRA],
      floor: PORCH_FLOOR,
    },
    {
      path: "months[].surfaces[].organic",
      kind: "count",
      unit: "requests to the named surface",
      instrument: PORCH,
      population: "months[].organic_visits",
      window: "the named month",
      exclusions: [HOUSE, INFRA],
      floor: PORCH_FLOOR,
    },
    {
      path: "months[].surfaces[].by_channel.*",
      kind: "count",
      unit: "requests to the named surface that arrived on the named channel",
      instrument: `${PORCH}; the channel from lib/channel.ts inferChannel`,
      population: "months[].surfaces[].organic; the channels divide it",
      window: "the named month",
      exclusions: [HOUSE, INFRA],
      floor: PORCH_FLOOR,
    },
    {
      path: "months[].surfaces[].house",
      kind: "count",
      unit: "requests to the named surface by the house",
      instrument: PORCH,
      population: "every request to the surface; kept beside organic, never inside it",
      window: "the named month",
      exclusions: ["everything not flagged house"],
      floor: PORCH_FLOOR,
    },
    {
      path: "months[].surfaces[].infrastructure",
      kind: "count",
      unit: "requests to the named surface by machinery",
      instrument: `${PORCH}; machinery by name, lib/channel.ts isInfrastructureUserAgent`,
      population: "every request to the surface; kept beside organic, never inside it",
      window: "the named month",
      exclusions: ["everything that did not name itself machinery"],
      floor: PORCH_FLOOR,
    },
  ]),

  ...rows("/observatory", [
    {
      path: "months[].host_pages.by_format_and_reader.*",
      kind: "count",
      unit: "reads of a corpus host page in the named format by the named reader class",
      instrument: "the buyer-signals page-read row, classed by lib/channel.ts readerClass (services/buyer-signals.ts recordPageRead)",
      population: "every read of a corpus host page the chain has met, house excluded; the classes and formats divide it",
      window: "the named month",
      exclusions: [HOUSE],
      floor: "before the signal store (2026-09-21) the map was KV read-modify-write, a floor under contention",
    },
    {
      path: "months[].host_pages.histogram.subjects",
      kind: "count",
      unit: "subjects read by a browser, an agent or a fetcher",
      instrument: "derived from the per-subject, per-format map (lib/signal-histogram.ts)",
      population: "every host with a page that was read this month by anyone but a crawler; the denominator of every histogram figure",
      window: "the named month",
      exclusions: [HOUSE, "crawlers by name"],
      cap: "on the KV fallback only, 400 subjects; the overflow figure beside it counts what fell past it",
    },
    {
      path: "months[].host_pages.histogram.by_formats.*",
      kind: "count",
      unit: "subjects read in the named number of formats",
      instrument: "derived (lib/signal-histogram.ts)",
      population: "histogram.subjects",
      window: "the named month",
      exclusions: [HOUSE, "crawlers by name"],
    },
    {
      path: "months[].host_pages.histogram.repeat.*",
      kind: "count",
      unit: "subjects with at least the named number of reads across every format",
      instrument: "derived (lib/signal-histogram.ts)",
      population: "histogram.subjects",
      window: "the named month",
      exclusions: [HOUSE, "crawlers by name"],
    },
    {
      path: "months[].host_pages.histogram.reads",
      kind: "count",
      unit: "reads behind the histogram",
      instrument: "derived (lib/signal-histogram.ts)",
      population: "every read of a page about a host by anyone but a crawler; a mean per subject can be checked against histogram.subjects",
      window: "the named month",
      exclusions: [HOUSE, "crawlers by name"],
    },
    {
      path: "months[].host_pages.histogram.overflow",
      kind: "count",
      unit: "reads that fell past a capped map into its other row",
      instrument: "the capped map's other row (services/buyer-signals.ts)",
      population: "histogram.reads + overflow; zero on the signal store, where the subject map has no cap",
      window: "the named month",
      exclusions: [],
    },
  ]),

  // /corpus.json — the index of the signed weekly chain.
  ...rows("/corpus.json", [
    {
      path: "entries",
      kind: "count",
      unit: "signed weekly snapshots in the chain",
      instrument: "the corpus listing, one record per sealed round (services/corpus.ts listCorpus)",
      population: "every round that ran and was sealed; continuity.weeks_missing names the weeks that were not",
      window: "since the first sealed round",
      exclusions: [],
    },
    {
      path: "chain.entries",
      kind: "count",
      unit: "chain links verified at read",
      instrument: "verifyCorpusChain over the listed records (services/corpus.ts)",
      population: "entries",
      window: "since the first sealed round",
      exclusions: [],
    },
    {
      path: "continuity.weeks_held",
      kind: "count",
      unit: "ISO weeks holding a snapshot",
      instrument: "derived from the chain's own week keys, never a parallel count (routes/corpus.ts)",
      population: "every week between the first and newest entry; weeks_missing beside it is the remainder",
      window: "since the first sealed round",
      exclusions: [],
    },
    {
      path: "citation_shape.json.sequence",
      kind: "constant",
      unit: "an example sequence number",
      instrument: "the worked citation example (routes/corpus.ts)",
      population: "not a count",
      window: "n/a",
      exclusions: [],
    },
    {
      path: "index[].sequence",
      kind: "constant",
      unit: "the round's position in the chain",
      instrument: "the snapshot's own sequence field, signed",
      population: "not a count",
      window: "n/a",
      exclusions: [],
    },
    {
      path: "index[].hosts_observed",
      kind: "count",
      unit: "rows the round carries, not_probed population rows included",
      instrument: "the round's host rows, counted at read (routes/corpus.ts); the historical meaning under the frozen-fields law",
      population: "every host the round listed, walked or carried forward",
      window: "the named week",
      exclusions: [],
      cap: "the round's own caps ride inside it verbatim: capped, coverage_suspect, coverage_drop",
    },
    {
      path: "index[].hosts_probed",
      kind: "count",
      unit: "hosts the round actually knocked on",
      instrument: "the round's host rows with a probe, counted at read (routes/corpus.ts)",
      population: "index[].hosts_observed",
      window: "the named week",
      exclusions: ["population rows carried without a knock"],
      cap: "the round's own caps ride inside it verbatim",
    },
    {
      path: "latest.**",
      kind: "quoted",
      unit: "the newest signed weekly snapshot, verbatim",
      instrument: "the ward round, sealed and ed25519-signed on the Sunday cron (services/corpus.ts takeCorpusSnapshot)",
      population: "each figure inside carries its own denominator beside it in the signed bytes; this register does not restate a signed artifact",
      window: "the named week",
      exclusions: [],
      cap: "stated inside the round: listed_resources, capped, door_bank, coverage_suspect",
    },
  ]),
];

/** The rule sentence and the rows that apply to one route, for its JSON twin. */
export function publishedCountsBlock(route: CountRoute): {
  rule: string;
  rows: ReadonlyArray<Omit<PublishedCount, "route">>;
} {
  return {
    rule: PUBLISHED_COUNTS_RULE,
    rows: PUBLISHED_COUNTS.filter((row) => row.route === route).map(({ route: _route, ...row }) => row),
  };
}

function segments(path: string): string[] {
  return path.split(".").filter((segment) => segment.length > 0);
}

/**
 * Does a registered path cover a served path? `*` covers one key,
 * `[]` is literal, `**` covers everything beneath. Array markers ride
 * inside the key they belong to (`months[]`), so `months[].organic`
 * has two segments.
 */
export function pathMatches(registered: string, served: string): boolean {
  const want = segments(registered);
  const have = segments(served);
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    if (w === "**") return true;
    const h = have[i];
    if (h === undefined) return false;
    if (w === "*" || w === "*[]") {
      if (w.endsWith("[]") !== h.endsWith("[]")) return false;
      continue;
    }
    if (w !== h) return false;
  }
  return want.length === have.length;
}

/** The registered row for a served path on a route, or undefined: what the guard test asks. */
export function registeredCount(route: CountRoute, served: string): PublishedCount | undefined {
  return PUBLISHED_COUNTS.find((row) => row.route === route && pathMatches(row.path, served));
}

/** The rows as an HTML table for a route's page, under the figures. */
export function denominatorsSectionHtml(route: CountRoute, escape: (text: string) => string): string {
  const block = publishedCountsBlock(route);
  const rowsHtml = block.rows
    .map(
      (row) =>
        `<tr><td><code>${escape(row.path)}</code></td><td>${escape(row.kind)}</td><td>${escape(row.unit)}</td><td>${escape(
          row.population,
        )}</td><td>${escape(row.window)}</td><td>${escape(row.exclusions.join("; ") || "none")}</td><td>${escape(
          row.instrument,
        )}${row.floor ? ` Floor: ${escape(row.floor)}` : ""}${row.cap ? ` Cap: ${escape(row.cap)}` : ""}</td></tr>`,
    )
    .join("\n");
  return `<section id="denominators">
    <h2>Every number above, with what it is out of</h2>
    <p class="menu-meta">${escape(block.rule)}</p>
    <table border="1" cellpadding="6" class="denominators">
      <tr><th>number</th><th>kind</th><th>unit</th><th>population</th><th>window</th><th>excluded</th><th>instrument, floor, cap</th></tr>
      ${rowsHtml}
    </table>
  </section>`;
}
