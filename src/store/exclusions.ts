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
  {
    date: "2026-09-06",
    what_changed:
      "Seven names for looking (validator, verifier, observatory, no-pay, dry-only, agenteconomyreport, band-hunt) joined the crawler table off the census's walkers-still-organic page, read live: five clients — AgentEconomyReport/1.0, the402-validator/0.2, nsgoods-payability-observatory/1.0, Dexter-Verifier/1.0 and x402-band-hunt-b/1.0 (+dry-only; no-pay) — each walked six or more doors inside a minute, never opened a wallet, and named its own job in its user-agent; the last writes its intention into the string. The generic clients walking beside them (curl, node, axios, Deno, undici, the bare no-user-agent row) were deliberately left out, because a generic string promoted here is misclassified forever. AND THE STORE'S OWN COLD READ, scvd-cold-read, joined the house agents: scripts/cold-read.mjs must knock from outside to measure the cold path, so its workflow carries no house secret, and it never pays, so there was no payer to match — both house tests blind at once, exactly as they were for the field run and CV's hand-rolled clients. It had walked all 32 doors, 288 asks in twelve hours, as the store's busiest organic client.",
    effect:
      "The organic 402 count falls by those five clients' asks and by the cold read's 288 — the largest single subtraction this register has recorded, and most of it is the store reading itself. Every conversion denominator computed from organic asks deflates accordingly, which moves the published rates UP without a single new sale. No settle moved: none of these six ever paid.",
    house_wallets: 11,
    crawler_names: 72,
  },
  {
    date: "2026-09-15",
    what_changed:
      "One name for looking, `lint`, joined the crawler table off the decline desk. x402lint/0.1 (+https://x402lint.dev) sat in the intent-bearing column with two declines three seconds apart on two different doors, both local:input_missing — the walk of a conformance linter reading input contracts, not a buyer, and behaviourally identical to the observatory rows beside it. The table already held validator, verifier, checker, inspector, scanner and monitor; a linter lints, which is the same verb and was the only one of them missing. Kept as the bare word rather than the versioned string, and the generic clients walking beside it (node, curl, python-httpx, axios, Deno, the bare no-user-agent row) are still deliberately out, for the reason this register keeps repeating: a generic string promoted here is misclassified forever.",
    effect:
      "The organic 402 count falls by this client's asks, and its two declines move off the decline desk's intent-bearing column into the noise floor — 27 intent-bearing declines in the 2026-09-06 window become 25, from four outside clients to three. No settle moved: it never paid, and no conversion RATE published before today was computed from a denominator this changes downward without also naming it here.",
    house_wallets: 11,
    crawler_names: 73,
  },
  {
    date: "2026-09-17",
    what_changed:
      "The keeper's AgentCash Base qualification wallet was listed as house before its first purchase, for the bounded live checkout qualification authorized by the keeper.",
    effect:
      "No prior settle was reclassified and no published number moved: listed before its first purchase. Future qualification purchases from this wallet are house activity, excluded from organic demand.",
    house_wallets: 12,
    crawler_names: 73,
  },
  {
    date: "2026-09-21",
    what_changed:
      "One name for looking, `census`, joined the crawler table off the avoidable-400s desk. StillOS-payability-census/1.0 writes its own intention into its user-agent — measurement, no payment attached — and was sitting in the intent-bearing column anyway, because the table held `census-probe` and this client calls itself a census without the probe. That is this register's oldest lesson arriving again: a string nearly right matches nothing. The table already held validator, verifier, observatory, prober and scanner; a census censuses, which is the same verb, and `census-probe` above it was the narrower half of a word that should always have been whole. Kept as the bare word rather than the versioned string, and the generic clients walking beside it (node, curl, python-httpx, the bare no-user-agent row) are still deliberately out, for the reason this register keeps repeating: a generic string promoted here is misclassified forever.",
    effect:
      "The organic 402 count falls by this client's asks. Its input refusals move off the avoidable-400s desk's agents column into the machinery column published beside it — that desk counted machinery as buyers until today and its prior figures are withdrawn rather than restated, which is recorded in the correction of the same date. No settle moved: it never paid.",
    house_wallets: 12,
    crawler_names: 74,
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
