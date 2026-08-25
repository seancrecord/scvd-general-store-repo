import { BASE_USDC } from "@/lib/base-rpc";
import { SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import type { WardHostResult, WardRound } from "@/services/ward-round";

/**
 * THE MARKET DESK (2026-08-19, the keeper's question: "are we
 * checking enough data points? ... we could also be identifying what
 * we could build or what the gaps are").
 *
 * The honest answer was no: every probe fetched a full 402 and kept
 * five bits; every discovery read pulled thousands of registry rows
 * and kept two fields. This desk keeps what was already paid for —
 * ZERO new contact with anyone — and derives the market's shape from
 * it: what the ecosystem charges, which rails it takes, how much of
 * it serves anything verifiable, how much of the registry is rot,
 * and how concentrated the sellers really are.
 *
 * Two register rules, kept strictly:
 *   - Row-level verdicts stay private (the consent ruling). The desk
 *     publishes AGGREGATES; a number about the neighbourhood is not a
 *     score on a neighbour.
 *   - Readings live on the PAGE, numbers in the RECORD. The stored
 *     aggregate block is plain arithmetic anyone can recompute from
 *     the round's own rows; the sentences saying what a number means
 *     can improve without rewriting chained history.
 */

/** USDC's two homes, the only asset the price map counts — imported
 * from the RPC readers so the desk can never disagree with the till. */
const USDC_ASSETS = new Set([
  BASE_USDC.toLowerCase(),
  SOLANA_USDC_MINT.toLowerCase(),
]);

const BASE_MAINNET = "eip155:8453";
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const POLYGON_MAINNET = "eip155:137";

/**
 * WHICH BUCKETS A WEEK'S RAIL SPLIT WAS TAKEN UNDER.
 *
 * Stored weeks carry this, because the buckets changed on 2026-08-25
 * and a reader comparing week 34 to week 40 has to know that. Older
 * rows are NOT back-filled: nobody re-probed those doors, so
 * recomputing their split would be inventing an observation. They
 * keep the shape they were measured in and say so.
 */
export const RAIL_BASIS = "per-rail-v2" as const;

/**
 * The rail split, per rail.
 *
 * BEFORE 2026-08-25 THIS COULD NOT SEE POLYGON. The buckets were
 * `both` / `base_only` / `solana_only` / `other_only`, where `both`
 * meant Base AND Solana — computed from those two networks and no
 * others. So a Polygon-only door landed in `other_only`, next to a
 * typo'd chain id, and a Base+Polygon door was counted `base_only`
 * and described on /registry as turning away "the other rail's
 * buyers", which was simply false.
 *
 * The store's OWN books had carried Polygon since 2026-08-20
 * (metrics.railOf, with a comment about the bug it caught). The
 * telescope had not. For an observatory that is the wrong way round:
 * we could bank the rail and not count it in anybody else's market.
 *
 * Counts are per rail and NOT mutually exclusive — a door offering
 * Base and Polygon is counted in both, and once in `multi`. Summing
 * them does not give `of`, deliberately: the question this answers is
 * "how much of the market can a buyer on rail X pay?", which is the
 * question the old buckets could not ask.
 */
export interface MarketRails {
  /** Doors whose 402 carried a parseable offer. */
  of: number;
  /** Doors accepting this rail, alone or alongside others. */
  base: number;
  polygon: number;
  solana: number;
  /** Doors offering only chains outside the three named above. */
  other: number;
  /** Doors accepting more than one of base/polygon/solana. */
  multi: number;
  /** Doors offering only ONE of the three — the addressable share. */
  single: number;
  testnet_flagged: number;
  basis: typeof RAIL_BASIS;
}

/**
 * A week measured before the buckets changed. Kept as a type rather
 * than migrated, so the compiler forces every reader to handle both
 * rather than quietly reading `polygon` as undefined off an old row.
 */
export interface LegacyMarketRails {
  of: number;
  both: number;
  base_only: number;
  solana_only: number;
  other_only: number;
  testnet_flagged: number;
  basis?: undefined;
}

/** Narrow a stored week's rails to the shape that can see Polygon. */
export function isPerRail(
  rails: MarketRails | LegacyMarketRails,
): rails is MarketRails {
  return rails.basis === RAIL_BASIS;
}

/** What one probed 402 actually offered. Read from the header the
 * probe already fetched; never a second request. */
export interface OfferFacts {
  networks: string[];
  schemes: string[];
  /** Cheapest USDC ask across accepts, in whole USDC. Absent when no
   * entry prices in USDC we recognize. */
  min_usdc?: number;
  /**
   * Dearest USDC ask across accepts (2026-08-20, the keeper's high
   * shelf question). min-only capture made every multi-tier door
   * read as its cheapest item, which hid the top of the market from
   * the one person shopping it for ideas. Absent on rounds captured
   * before this date — a reader treats missing as "not measured".
   */
  max_usdc?: number;
  /**
   * Where the door asks to be paid, verbatim from its own accepts
   * (0x lowercased, base58 preserved — the base58 law), capped at 4.
   * Captured 2026-08-20 so the buy side stops being invisible: USDC
   * inflows to a published payTo are the first honest signal of
   * whether anyone PAYS an ask, not just quotes one.
   */
  pay_to?: string[];
}

export function offerFacts(response: Response): OfferFacts | null {
  const header = response.headers.get("PAYMENT-REQUIRED");
  if (!header) return null;
  let challenge: Record<string, unknown>;
  try {
    challenge = JSON.parse(atob(header)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const accepts = Array.isArray(challenge["accepts"])
    ? (challenge["accepts"] as Record<string, unknown>[])
    : [];
  if (accepts.length === 0) return null;
  const networks = new Set<string>();
  const schemes = new Set<string>();
  let minUnits: bigint | null = null;
  let maxUnits: bigint | null = null;
  const payTo = new Set<string>();
  for (const entry of accepts) {
    if (typeof entry["network"] === "string") networks.add(entry["network"]);
    if (typeof entry["scheme"] === "string") schemes.add(entry["scheme"]);
    const to = entry["payTo"];
    if (typeof to === "string" && to.length > 0 && payTo.size < 4) {
      payTo.add(to.startsWith("0x") ? to.toLowerCase() : to);
    }
    const asset = String(entry["asset"] ?? "").toLowerCase();
    const amount = String(entry["amount"] ?? "");
    if (USDC_ASSETS.has(asset) && /^[0-9]+$/.test(amount)) {
      const units = BigInt(amount);
      if (minUnits === null || units < minUnits) minUnits = units;
      if (maxUnits === null || units > maxUnits) maxUnits = units;
    }
  }
  return {
    networks: [...networks].sort(),
    schemes: [...schemes].sort(),
    ...(minUnits !== null ? { min_usdc: Number(minUnits) / 1_000_000 } : {}),
    ...(maxUnits !== null ? { max_usdc: Number(maxUnits) / 1_000_000 } : {}),
    ...(payTo.size > 0 ? { pay_to: [...payTo] } : {}),
  };
}

/**
 * THE HIGH SHELF — the top of the market, listed for the keeper's
 * desk (his ask, 2026-08-20: "things priced over say $50 … to see if
 * people pay for it and if I could do something similar").
 *
 * Row-level and NAMED, which is correct HERE and nowhere public: the
 * consent ruling keeps row-level readings on the private side, and
 * this desk is the private side. The prices are each door's own
 * published 402 — facts it broadcasts to every caller — and the
 * verdict rides along so a $200 ask on a broken door reads as what
 * it is.
 */
export interface HighShelfRow {
  host: string;
  url: string;
  verdict: string;
  /** Cheapest and dearest USDC asks the door quoted. Equal on
   * min-only rounds (pre-08-20 capture) and single-price doors. */
  ask_min: number;
  ask_max: number;
  networks: string[];
  pay_to?: string[];
}

export const HIGH_SHELF_FLOOR_USDC = 50;
const HIGH_SHELF_CAP = 50;

export function highShelf(
  round: WardRound,
  floorUsdc: number = HIGH_SHELF_FLOOR_USDC,
): { rows: HighShelfRow[]; truncated: boolean } {
  const rows: HighShelfRow[] = [];
  for (const host of round.hosts) {
    const offer = host.offer;
    if (!offer || offer.min_usdc === undefined) continue;
    const top = offer.max_usdc ?? offer.min_usdc;
    if (top < floorUsdc) continue;
    rows.push({
      host: host.host,
      url: host.url,
      verdict: host.verdict,
      ask_min: offer.min_usdc,
      ask_max: top,
      networks: offer.networks,
      ...(offer.pay_to ? { pay_to: offer.pay_to } : {}),
    });
  }
  rows.sort((a, b) => b.ask_max - a.ask_max);
  return {
    rows: rows.slice(0, HIGH_SHELF_CAP),
    truncated: rows.length > HIGH_SHELF_CAP,
  };
}

/**
 * Hosts collapse to OPERATORS before concentration is counted, or a
 * fifty-subdomain oracle farm reads as fifty sellers. The heuristic
 * is named because it is one: on shared platforms (workers.dev,
 * vercel.app, …) the deploying subdomain IS the operator, so one
 * extra label is kept; everywhere else the registrable domain is the
 * operator, approximated as the last two labels (three under the
 * common two-part country TLDs).
 */
const PLATFORM_SUFFIXES = [
  "workers.dev", "vercel.app", "onrender.com", "fly.dev",
  "up.railway.app", "a.run.app", "hf.space", "sslip.io", "nip.io",
  "duckdns.org", "trycloudflare.com", "chatgpt.site", "replit.app",
  "code.run", "zeabur.app", "dpdns.org", "pages.dev", "netlify.app",
];
const TWO_PART_TLD_SECONDS = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

export function operatorOf(host: string): string {
  const lowered = host.toLowerCase();
  for (const suffix of PLATFORM_SUFFIXES) {
    if (lowered === suffix) return lowered;
    if (lowered.endsWith(`.${suffix}`)) {
      const rest = lowered.slice(0, -(suffix.length + 1)).split(".");
      return `${rest[rest.length - 1]}.${suffix}`;
    }
  }
  const labels = lowered.split(".");
  if (labels.length <= 2) return lowered;
  const tld = labels[labels.length - 1]!;
  const second = labels[labels.length - 2]!;
  if (tld.length === 2 && TWO_PART_TLD_SECONDS.has(second) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

export interface MarketAggregates {
  probed: number;
  ready: number;
  /** Listed doors that answer no 402 at all (wrong status or dead). */
  rot: { dead_doors: number; pct: number };
  /** The trust layer's measured TAM: ready doors serving signed offers. */
  signed_offers: { serving: number; of_ready: number; pct: number };
  /** Among hosts whose 402 was parseable. */
  rails: MarketRails;
  /** USDC-priced doors only, cheapest ask per door, whole USDC. */
  price_usdc: {
    sample: number;
    min: number;
    p25: number;
    median: number;
    p75: number;
    max: number;
  } | null;
  schemes: Record<string, number>;
  concentration: {
    hosts: number;
    operators: number;
    top: { operator: string; hosts: number }[];
    top5_share_pct: number;
  };
  /** The feed's own row shape, so the next mining pass reads reality. */
  discovery_fields_seen?: string[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * p)),
  );
  return sorted[index]!;
}

export function marketAggregates(
  hosts: WardHostResult[],
  discoveryFieldsSeen?: string[],
): MarketAggregates {
  const probedRows = hosts.filter((h) => h.verdict !== "not_probed");
  const ready = probedRows.filter((h) => h.verdict === "ready");
  const dead = probedRows.filter(
    (h) =>
      h.verdict === "unreachable" ||
      h.failed.includes("status-402") ||
      h.failed.includes("payment-required-header"),
  );
  const serving = ready.filter(
    (h) =>
      !h.advisories.includes("no-signed-offers") &&
      !h.failed.includes("signed-offers"),
  );

  const withOffer = probedRows.filter((h) => h.offer);
  let baseDoors = 0;
  let polygonDoors = 0;
  let solanaDoors = 0;
  let otherDoors = 0;
  let multiDoors = 0;
  let singleDoors = 0;
  const schemes: Record<string, number> = {};
  const prices: number[] = [];
  for (const host of withOffer) {
    const networks = new Set(host.offer!.networks);
    const hasBase = networks.has(BASE_MAINNET);
    const hasPolygon = networks.has(POLYGON_MAINNET);
    const hasSolana = networks.has(SOLANA_MAINNET);
    if (hasBase) baseDoors += 1;
    if (hasPolygon) polygonDoors += 1;
    if (hasSolana) solanaDoors += 1;
    const known = Number(hasBase) + Number(hasPolygon) + Number(hasSolana);
    if (known === 0) otherDoors += 1;
    else if (known === 1) singleDoors += 1;
    else multiDoors += 1;
    for (const scheme of host.offer!.schemes) {
      schemes[scheme] = (schemes[scheme] ?? 0) + 1;
    }
    if (host.offer!.min_usdc !== undefined) prices.push(host.offer!.min_usdc);
  }
  prices.sort((a, b) => a - b);

  const byOperator = new Map<string, number>();
  for (const host of probedRows) {
    const operator = operatorOf(host.host);
    byOperator.set(operator, (byOperator.get(operator) ?? 0) + 1);
  }
  const top = [...byOperator.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([operator, count]) => ({ operator, hosts: count }));
  const topShare = probedRows.length
    ? Math.round(
        (top.reduce((sum, entry) => sum + entry.hosts, 0) /
          probedRows.length) *
          100,
      )
    : 0;

  return {
    probed: probedRows.length,
    ready: ready.length,
    rot: {
      dead_doors: dead.length,
      pct: probedRows.length
        ? Math.round((dead.length / probedRows.length) * 100)
        : 0,
    },
    signed_offers: {
      serving: serving.length,
      of_ready: ready.length,
      pct: ready.length
        ? Math.round((serving.length / ready.length) * 100)
        : 0,
    },
    rails: {
      of: withOffer.length,
      base: baseDoors,
      polygon: polygonDoors,
      solana: solanaDoors,
      other: otherDoors,
      multi: multiDoors,
      single: singleDoors,
      testnet_flagged: probedRows.filter((h) =>
        h.advisories.includes("testnet-network"),
      ).length,
      basis: RAIL_BASIS,
    },
    price_usdc:
      prices.length > 0
        ? {
            sample: prices.length,
            min: prices[0]!,
            p25: percentile(prices, 0.25),
            median: percentile(prices, 0.5),
            p75: percentile(prices, 0.75),
            max: prices[prices.length - 1]!,
          }
        : null,
    schemes,
    concentration: {
      hosts: probedRows.length,
      operators: byOperator.size,
      top,
      top5_share_pct: topShare,
    },
    ...(discoveryFieldsSeen && discoveryFieldsSeen.length
      ? { discovery_fields_seen: discoveryFieldsSeen }
      : {}),
  };
}
