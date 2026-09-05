import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import { HOUSE_AGENTS, INFRASTRUCTURE_UA_HINTS } from "@/lib/channel";

/**
 * NAMED EXCLUSIONS ON THE DEMAND NUMBERS (roadmap S9, 2026-09-02).
 *
 * Every organic count this store publishes — the funnel, the pulse,
 * the take, the fresh set's bot-vs-organic split — subtracts three
 * kinds of traffic: the house's own wallets, the house's own agents by
 * name, and machinery whose user-agent says it is looking rather than
 * buying. Until this file the subtraction was real and the list was
 * in code. An outside desk publishes its exclusions by name and says
 * out loud when an exclusion changes a published number; that is
 * more rigorous than a split nobody can audit, so this is the list,
 * served on /corpus/wallet-facts.json, and the dated register of
 * every time it moved.
 *
 * THE COUNTS on the older rows are the table's own order read back —
 * each pass appended its names, so the size after a pass is the index
 * of the next pass's first name. The house-wallet counts on the older
 * rows are read off the register's `since` dates.
 *
 * THE MECHANISM, not the intention: the latest row here pins the size
 * of both tables. Adding a wallet or a crawler name without writing a
 * dated row fails test/named-exclusions.spec.ts, so a change to what
 * the numbers exclude cannot land quietly.
 */

export interface ExclusionChange {
  date: string;
  what_changed: string;
  /** Which published numbers moved, and which way. */
  effect: string;
  /** The sizes of the two tables after this change. */
  house_wallets: number;
  crawler_names: number;
}

export const EXCLUSION_CHANGES: readonly ExclusionChange[] = [
  {
    date: "2026-07-26",
    what_changed:
      "Ten names for looking (prober, monitor, watchdog, checker, scanner, inspector, sentinel, canary, heartbeat, synthetics) joined the crawler table after mako-pulse-prober walked the catalog and landed in the organic direct column.",
    effect: "The organic 402 count and every conversion denominator fell by the probes that had been counted as buyers. No settle moved.",
    house_wallets: 1,
    crawler_names: 49,
  },
  {
    date: "2026-07-27",
    what_changed:
      "probe, qos, liveness and nohumans.directory joined the table: two directory liveness probes had spent a day in the organic column.",
    effect: "The organic 402 count fell by those probes. No settle moved.",
    house_wallets: 1,
    crawler_names: 53,
  },
  {
    date: "2026-08-04",
    what_changed:
      "Three cross-model walker wallets (the sonnet, haiku and gpt-mini passes) were listed as house AFTER their first purchases had booked as organic: six settles and nine settles were reclassified through the ledger, the story at /corrections.",
    effect: "Organic settles and the first-dollar frame moved DOWN by fifteen settles. The lesson attached to the register: every test-pool wallet is listed before its first purchase.",
    house_wallets: 6,
    crawler_names: 53,
  },
  {
    date: "2026-08-19",
    what_changed:
      "Eleven self-identifying survey, index and discovery clients (entropy-daemon, apistrust, coinbasebazaardiscovery, radar-x402, indexer, mpp32, trustindex, x402stats, brick.blue, healthbot, contact-discovery) joined the table, read by the keeper off the live walkers-still-organic page.",
    effect: "The funnel's flat-profile denominator fell; the organic 402 count dropped by those clients' visits. No settle moved.",
    house_wallets: 6,
    crawler_names: 64,
  },
  {
    date: "2026-08-20",
    what_changed:
      "The house's own field agent, scvd-walkabout, is excluded by name: five family declines at the half-cent door had booked as organic with no payer to match.",
    effect: "Five organic declines became house declines; the first-outside-signature alert stood down. No settle moved.",
    house_wallets: 6,
    crawler_names: 64,
  },
  {
    date: "2026-08-24",
    what_changed: "The store's own Virtuals ACP agent wallet (Solana) was listed as house the day it was provisioned, before any purchase.",
    effect: "None on any published number: listed before its first settle, which is the rule.",
    house_wallets: 10,
    crawler_names: 64,
  },
  {
    date: "2026-09-04",
    what_changed:
      "x402watch joined the crawler table off the census: x402watch/1 (+https://x402watch.vercel.app) walked 21 of 32 doors inside a minute, 45 asks in a day, and sat in the organic column naming its own job. Two of CV's hand-rolled test clients (cv-handrolled, cv-mcp-hand) joined the house agents, confirmed by the keeper: they had sat on the census as the store's only two outside presenters, 13 declines between them. And the census now applies today's house-agent list to rows already stamped, so a name added after its rows were written does not stay on the census as a buyer for ninety days.",
    effect: "The organic 402 count fell by x402watch's asks. The census's outside-presenter line fell by two clients and the decline desk's outside count by thirteen — the store's own testing, no longer counted as intent. No settle moved.",
    house_wallets: 10,
    crawler_names: 65,
  },
  {
    date: "2026-09-05",
    what_changed:
      "A dedicated field wallet (0x4040…017F) was listed as house the day it was funded and before its first signature. It is the wallet behind FIELD_WALLET_KEY from today: launch checks, bounty payouts, store-credit cash-outs and the paid x402scan directory walk sign from it, so the most the store can ever lose from the key is that wallet's own balance. It takes that role over from CV's wallet, which stays listed for his live buy tests.",
    effect: "None on any published number: listed before its first settle, which is the rule.",
    house_wallets: 11,
    crawler_names: 65,
  },
];

export interface NamedExclusions {
  what_this_is: string;
  rule: string;
  /**
   * By who, since and why. The ADDRESSES are not on this surface: the
   * wallet-facts page names no address by the G2 ruling (T1), and the
   * house's own are already public at the house ledger, linked below.
   */
  house_wallets: Array<{ who: string; since: string; why: string }>;
  house_wallet_addresses_at: string;
  house_agents: readonly string[];
  crawler_names: readonly string[];
  /** Newest last. The latest row pins the table sizes above. */
  changes: readonly ExclusionChange[];
}

export function namedExclusions(base: string): NamedExclusions {
  return {
    what_this_is:
      "Everything this store subtracts from its organic numbers, by name: its own wallets (who, since and why here; the addresses at the house ledger, since this page names no address), its own agents, and the user-agent strings of machinery that looks rather than buys. Published so the bot-versus-organic split can be audited by anyone, and dated every time it moves.",
    rule: "A wallet is listed before its first purchase. A crawler name is added only when the string names its own job — surveys, indexes, probes — never a generic client library, because a generic string promoted here is misclassified forever. Every change writes a dated row below saying which published number moved and which way, and the newest row pins the sizes of both tables so a change cannot land without its row.",
    house_wallets: HOUSE_WALLET_FILE.wallets.map((entry) => ({
      who: entry.who,
      since: entry.since,
      why: entry.why,
    })),
    house_wallet_addresses_at: `${base}/house-ledger.json`,
    house_agents: HOUSE_AGENTS,
    crawler_names: INFRASTRUCTURE_UA_HINTS,
    changes: EXCLUSION_CHANGES,
  };
}
