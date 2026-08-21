import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import type { Channel, Env } from "@/types";

/**
 * Channel inference + house-traffic detection, for the 90-day
 * falsification instrument. Documented heuristics, applied in order:
 *
 *   1. mcp            — definitive, not inferred: the /mcp handler
 *                       tags its own traffic.
 *   2. skill          — the designed self-identification: the skill's
 *                       example calls carry ?src=clawhub-skill (query
 *                       param chosen over a header because it survives
 *                       copy-paste and minimal HTTP clients); also
 *                       referrer/UA mentioning a skill registry.
 *   3. infrastructure, known-crawler UA table (search bots, security
 *                       scanners, registry mirrors, uptime probes):
 *                       the noise floor made visible. Separate from
 *                       organic AND house. UA-based only.
 *   4. bazaar         — REFERRER mentions x402scan/bazaar catalog
 *                       pages: a client that arrived FROM a listing.
 *                       (The x402scan crawler itself matches the UA
 *                       table above, crawler visits are
 *                       infrastructure; listing-referred visits are
 *                       bazaar.)
 *   5. direct         — a user-agent with no referrer.
 *   6. unknown        — none of the above earned a name.
 *
 * Other declared ?source=/?src= values are recorded verbatim
 * alongside but never override inference, claims are claims; the
 * skill marker is the one designed exception.
 *
 * HOUSE TRAFFIC: an event is house when any of
 *   - the payer wallet is in the exclusion set (src/store/
 *     house-wallets.json + comma-separated env.HOUSE_WALLETS),
 *   - the request carried X-House: <HOUSE_SECRET> or ?house=<secret>.
 * House events are stored, counted separately, and excluded from all
 * organic counts. The flag never appears in a public response, and IP
 * is deliberately not a signal.
 */

/**
 * The house's own wallets, listed once in src/store/house-wallets.json
 * so the store and the shopping run cannot disagree about who counts
 * as family. On-chain public, none of it secret. env.HOUSE_WALLETS
 * still adds to this at deploy time, for a wallet that arrives faster
 * than a deploy can.
 */
const KNOWN_HOUSE_WALLETS: string[] = HOUSE_WALLET_FILE.wallets.map((entry) =>
  entry.address.toLowerCase(),
);

const BAZAAR_REFERRER_HINTS = ["x402scan", "bazaar", "x402-catalog", "x402index"];
const SKILL_HINTS = ["agentskills", "skills.sh", "skill-runner", "skillrunner", "clawhub"];

/** Conservative known-crawler table. Real agents using curl are customers. */
const INFRASTRUCTURE_UA_HINTS = [
  "googlebot", "bingbot", "duckduckbot", "yandexbot", "baiduspider",
  "gptbot", "ccbot", "claudebot", "perplexitybot", "bytespider",
  "x402scan", "x402-crawler", "clawhub-scanner",
  // The x402 indexing economy, observed on our own porch 2026-07-23:
  // trust indexes and censuses probing settled routes on a loop.
  "census-probe", "trust-index", "x402-observer", "402explorer",
  "carbonmonitor", "healthcheck", "uptime",
  "censysinspect", "shodan", "expanse", "paloaltonetworks", "qualys",
  "nuclei", "zgrab", "masscan", "nmap",
  "uptimerobot", "pingdom", "statuscake", "site24x7", "betteruptime",
  "headlesschrome", "phantomjs", "crawler", "spider", "scrapy",
  // Machinery that names its own job, observed in the first reading of
  // the books (2026-07-26): mako-pulse-prober walked the catalog and
  // landed in ORGANIC DIRECT, because "a user-agent with no referrer"
  // describes an indexer exactly as well as it describes a customer.
  // These are names for looking, not for buying. Kept as whole words a
  // machine chose for itself; nothing here matches a plain agent on
  // curl, and "bot" stays off the list on purpose (clawdbots are
  // customers).
  "prober", "monitor", "watchdog", "checker", "scanner", "inspector",
  "sentinel", "canary", "heartbeat", "synthetics",
  // Second pass, 2026-07-27: "prober" missed the ones that call
  // themselves a probe. x402-reliability-probe/1.0 and
  // nohumans.directory-probe/1.0 both spent a day in the organic
  // column. A directory's own liveness probe is the noise floor by
  // definition — we submitted to it.
  "probe", "qos", "liveness", "nohumans.directory",
  /**
   * Third pass, 2026-08-19: the census's walkers-still-organic table,
   * read by the keeper's own hand off the live page. Eleven clients
   * whose names say LOOKING — surveys, indexes, discovery crawlers —
   * were sitting in the organic column and inflating every conversion
   * denominator the store reasons from (the funnel's flat-profile
   * caveat, proven). Promoted: the self-identifying machinery only.
   * The generic strings walking beside them (node, axios, curl, Deno,
   * python-httpx, bare Chrome) are deliberately NOT here — those are
   * what a real buyer's SDK looks like, the behavioural walk detector
   * already flags them per-window, and a string promoted here is
   * misclassified forever.
   */
  "entropy-daemon", "apistrust", "coinbasebazaardiscovery", "radar-x402",
  "indexer", "mpp32", "trustindex", "x402stats", "brick.blue",
  "healthbot", "contact-discovery",
];

export interface ChannelSignals {
  referrer?: string;
  userAgent?: string;
  /** Set by the /mcp handler; definitive. */
  viaMcp?: boolean;
  /** The skill's designed self-identification (?src=clawhub-skill). */
  declaredSource?: string;
}

export function inferChannel(signals: ChannelSignals): Channel {
  if (signals.viaMcp) {
    return "mcp";
  }
  const referrer = (signals.referrer ?? "").toLowerCase();
  const userAgent = (signals.userAgent ?? "").toLowerCase();
  const declared = (signals.declaredSource ?? "").toLowerCase();
  if (declared === "clawhub-skill" || declared === "skill") {
    return "skill";
  }
  if (SKILL_HINTS.some((hint) => `${referrer} ${userAgent}`.includes(hint))) {
    return "skill";
  }
  if (INFRASTRUCTURE_UA_HINTS.some((hint) => userAgent.includes(hint))) {
    return "infrastructure";
  }
  if (BAZAAR_REFERRER_HINTS.some((hint) => referrer.includes(hint))) {
    return "bazaar";
  }
  if (!referrer && userAgent) {
    return "direct";
  }
  return "unknown";
}

/** Exported 2026-08-20 for the trust panel's gallery: the sample
 * artifacts shown publicly are HOUSE purchases only — a stranger's
 * cert id is a capability URL and never gets published by us. */
export function houseWallets(env: Env): string[] {
  const extra = (env.HOUSE_WALLETS ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address.length > 0);
  return [...KNOWN_HOUSE_WALLETS, ...extra];
}

export interface HouseSignals {
  payer?: string;
  houseHeader?: string;
  houseParam?: string;
  /** The caller's user-agent, for the house AGENTS test below. */
  userAgent?: string;
}

/**
 * THE STORE'S OWN AGENTS, BY NAME — the third house test, added
 * 2026-08-20 after the first two both missed one.
 *
 * What happened: CV's field-run script (research/field-run-2026-08-18)
 * walks every endpoint the Bazaar lists, and the Bazaar lists US. It
 * hand-rolls its x402 envelopes, so its five attempts at the half-cent
 * door died at the envelope — `payload_not_an_object`,
 * `payload_missing_accepted` — before any payer address existed to
 * read. And it must NOT carry the house secret, because it knocks on
 * strangers' doors and a secret sent abroad is a secret spent.
 *
 * So both existing house tests were blind at once: no payer to match
 * against the wallet list, no secret to match against the header. Five
 * family declines booked as ORGANIC, paged the keeper four times at
 * nine at night, and read on the desk as the strongest outside intent
 * this store had ever seen. Family made the paper, in the one column
 * where the store watches hardest.
 *
 * THE DIRECTION OF THE ERROR IS THE WHOLE ARGUMENT for matching on a
 * spoofable string. A stranger who copies this agent name gets counted
 * as house, which REMOVES them from the organic figures — understating
 * the store. The bug this replaces did the opposite, and inflating
 * organic is the failure the house rules exist to prevent. When only
 * two directions are available, take the one that flatters nobody.
 */
const HOUSE_AGENTS = ["scvd-walkabout"] as const;

/** Family doesn't make the paper: true when a wallet is the house's own. */
export function isHouseWallet(env: Env, address: string): boolean {
  return houseWallets(env).includes(address.toLowerCase());
}

export function isHouseTraffic(env: Env, signals: HouseSignals): boolean {
  if (signals.payer && houseWallets(env).includes(signals.payer.toLowerCase())) {
    return true;
  }
  // The agent test runs BEFORE the secret, and needs neither a payer
  // nor a header — which is the point: it is the only one of the three
  // that still works when the envelope was too malformed to carry a
  // wallet address. See HOUSE_AGENTS.
  const agent = signals.userAgent?.toLowerCase() ?? "";
  if (agent && HOUSE_AGENTS.some((name) => agent.includes(name))) {
    return true;
  }
  const secret = env.HOUSE_SECRET;
  if (!secret) {
    return false;
  }
  return signals.houseHeader === secret || signals.houseParam === secret;
}
