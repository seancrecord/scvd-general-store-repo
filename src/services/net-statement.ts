import { bulkGetText } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { monthsSinceOpening } from "@/lib/metrics";
import type { Env } from "@/types";

/**
 * THE NET-BY-CHAIN STATEMENT (enforcement item #5, the keeper's spec:
 * "by chain and visible in our AI-facing documentation").
 *
 * /stats has said from the start, in its own words, that its figures
 * are OUR BOOKS AND NOT THE CHAIN. This is the instrument that closes
 * that gap to a number: for each chain, each month, what USDC the
 * hourly reconciliation walks actually SAW arrive at our receiving
 * wallets, beside what the till BOOKED as settled on that chain — and
 * the difference, published rather than absorbed, with the things that
 * legitimately live inside it named.
 *
 * BOTH SIDES ARE MACHINE-WRITTEN AND NEITHER TRUSTS THE OTHER. The
 * booked side is the till's revrail counters, written by the same call
 * that produces the organic count. The observed side is banked by the
 * chain walks off RPC reads of the wallets themselves — the one record
 * no failure of our own writes can corrupt. When the two agree, the
 * books are chain-checked to the cent for that month. When they
 * disagree beyond the named buckets, something is wrong and the
 * invariant sweep says so out loud.
 *
 * WHAT THE DIFFERENCE MAY LEGITIMATELY CONTAIN, in one place because a
 * difference with unnamed contents is an accusation against ourselves
 * we can't answer: dust (sub-price transfers that cannot be purchases,
 * metered separately and shown); keeper transfers between own wallets
 * (the chain sees money, the till correctly books nothing); month-edge
 * timing (a transfer is banked in the month the WALK saw it, up to an
 * hour behind the chain; a settle is booked in the month it settled);
 * and the epochs themselves — each meter counts from its own start
 * date, published on the statement, so months before a meter existed
 * are absent rather than zero.
 */

export interface ChainNetMonth {
  month: string;
  /** What the reconciliation walks saw arrive, in USDC. */
  observed_inflow_usdc: number;
  /** Of the observed inflow, sub-price dust — named, never blended. */
  of_which_dust_usdc: number;
  /** What the till booked as settled on this chain, organic + house. */
  booked_usdc: number;
  booked_organic_usdc: number;
  booked_house_usdc: number;
  /** observed − booked. Zero is the healthy state once both meters run. */
  difference_usdc: number;
}

export interface ChainNet {
  /** When this chain's inflow meter started. Null: never banked yet. */
  observed_since: string | null;
  months: ChainNetMonth[];
}

export interface NetStatement {
  base: ChainNet;
  /** The third rail: booked side live from the till's counters the day
   * the rail lights; observed side absent until a Polygon walker
   * ships (observed_since null says so out loud, the same way Solana
   * did before its walk). */
  polygon: ChainNet;
  solana: ChainNet;
  /** When the till started booking revenue by rail. Null: not yet. */
  booked_since: string | null;
  method: string;
  difference_may_contain: string[];
}

export const NET_STATEMENT_METHOD =
  "For each chain and month: observed_inflow_usdc is USDC the hourly reconciliation walk saw arrive at this store's receiving wallet, read from the chain itself; booked_usdc is what the till recorded as settled on that chain, written by the same call that produces the organic count. Neither side copies the other. Amounts are stored as integer millionths and rendered as USDC. A transfer is banked to the month the walk saw it (up to an hour behind the chain at month edges); each meter counts from its own published start date, and months before a meter existed are absent, not zero.";

export const NET_DIFFERENCE_MAY_CONTAIN = [
  "Dust: transfers below the cheapest listing cannot be purchases and are metered separately as of_which_dust_usdc — poisoning lures arrive as money and must not read as revenue.",
  "The keeper moving funds between the store's own declared wallets: the chain sees an arrival, the till correctly books no sale. The wallets are public at /house-ledger.json.",
  "Month-edge timing: the walk banks a transfer when it reads it, the till books a settle when it happens; a sale in the last hour of a month can land one column over.",
  "Meter epochs: inflow counting starts when the walk first banked (observed_since, per chain) and booking-by-rail starts at booked_since; before those instants each side is absent rather than zero.",
  "Anything else is unexplained, and unexplained pages the keeper via the books invariant sweep rather than sitting quietly in a public table.",
];

function microToUsdc(raw: string | null | undefined): number {
  const parsed = parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed / 1_000_000 : 0;
}

export async function computeNetStatement(env: Env): Promise<NetStatement> {
  const months = monthsSinceOpening();
  const chains = ["base", "polygon", "solana"] as const;
  /**
   * Every key is constructed, none listed: the key shapes are ours and
   * the months are enumerable, so this is one bulk read rather than a
   * scan — the storefront-adjacent read stays cheap however many
   * months the store survives.
   */
  const wanted: string[] = [KV_KEYS.railMeterStart];
  for (const chain of chains) {
    wanted.push(KV_KEYS.inflowMeterStart(chain));
    for (const month of months) {
      wanted.push(
        KV_KEYS.metric(month, "inflow", chain),
        KV_KEYS.metric(month, "inflowdust", chain),
        KV_KEYS.metric(month, "revrail", chain),
        KV_KEYS.metric(month, "revrailh", chain),
      );
    }
  }
  const values = await bulkGetText(env.COUNTERS, wanted);

  const chainNet = (chain: (typeof chains)[number]): ChainNet => {
    const rows: ChainNetMonth[] = [];
    for (const month of months) {
      const observed = microToUsdc(
        values.get(KV_KEYS.metric(month, "inflow", chain)),
      );
      const dust = microToUsdc(
        values.get(KV_KEYS.metric(month, "inflowdust", chain)),
      );
      const organic = microToUsdc(
        values.get(KV_KEYS.metric(month, "revrail", chain)),
      );
      const house = microToUsdc(
        values.get(KV_KEYS.metric(month, "revrailh", chain)),
      );
      if (observed === 0 && organic === 0 && house === 0) {
        continue; // A month neither meter saw is absent, not a row of zeros.
      }
      const booked = organic + house;
      rows.push({
        month,
        observed_inflow_usdc: observed,
        of_which_dust_usdc: dust,
        booked_usdc: booked,
        booked_organic_usdc: organic,
        booked_house_usdc: house,
        difference_usdc: Math.round((observed - booked) * 1_000_000) / 1_000_000,
      });
    }
    return {
      observed_since: values.get(KV_KEYS.inflowMeterStart(chain)) ?? null,
      months: rows,
    };
  };

  return {
    base: chainNet("base"),
    polygon: chainNet("polygon"),
    solana: chainNet("solana"),
    booked_since: values.get(KV_KEYS.railMeterStart) ?? null,
    method: NET_STATEMENT_METHOD,
    difference_may_contain: NET_DIFFERENCE_MAY_CONTAIN,
  };
}
