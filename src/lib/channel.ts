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
 *   - the payer wallet is in the exclusion set (founding burner +
 *     comma-separated env.HOUSE_WALLETS),
 *   - the request carried X-House: <HOUSE_SECRET> or ?house=<secret>.
 * House events are stored, counted separately, and excluded from all
 * organic counts. The flag never appears in a public response, and IP
 * is deliberately not a signal.
 */

/** The founding fifty cents came from this burner. On-chain public. */
const FOUNDING_WALLET = "0x137ae5e3c7ed176744226f67223de50ca3a19e5a";

const BAZAAR_REFERRER_HINTS = ["x402scan", "bazaar", "x402-catalog", "x402index"];
const SKILL_HINTS = ["agentskills", "skills.sh", "skill-runner", "skillrunner", "clawhub"];

/** Conservative known-crawler table. Real agents using curl are customers. */
const INFRASTRUCTURE_UA_HINTS = [
  "googlebot", "bingbot", "duckduckbot", "yandexbot", "baiduspider",
  "gptbot", "ccbot", "claudebot", "perplexitybot", "bytespider",
  "x402scan", "x402-crawler", "clawhub-scanner",
  "censysinspect", "shodan", "expanse", "paloaltonetworks", "qualys",
  "nuclei", "zgrab", "masscan", "nmap",
  "uptimerobot", "pingdom", "statuscake", "site24x7", "betteruptime",
  "headlesschrome", "phantomjs", "crawler", "spider", "scrapy",
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

function houseWallets(env: Env): string[] {
  const extra = (env.HOUSE_WALLETS ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address.length > 0);
  return [FOUNDING_WALLET, ...extra];
}

export interface HouseSignals {
  payer?: string;
  houseHeader?: string;
  houseParam?: string;
}

/** Family doesn't make the paper: true when a wallet is the house's own. */
export function isHouseWallet(env: Env, address: string): boolean {
  return houseWallets(env).includes(address.toLowerCase());
}

export function isHouseTraffic(env: Env, signals: HouseSignals): boolean {
  if (signals.payer && houseWallets(env).includes(signals.payer.toLowerCase())) {
    return true;
  }
  const secret = env.HOUSE_SECRET;
  if (!secret) {
    return false;
  }
  return signals.houseHeader === secret || signals.houseParam === secret;
}
