import type { Channel, Env } from "@/types";

/**
 * Channel inference + house-traffic detection, for the 90-day
 * falsification instrument. Documented heuristics, applied in order:
 *
 *   1. mcp     — definitive, not inferred: the /mcp handler tags its
 *                own traffic when it runs a payment or a free tool.
 *   2. bazaar  — referrer host or user-agent mentions x402scan, bazaar,
 *                or an x402 catalog crawler.
 *   3. skill   — referrer host mentions agentskills.io / skills.sh, or
 *                the user-agent self-identifies as a skill runner.
 *   4. direct  — a user-agent showed up with no referrer: somebody
 *                typed the address, more or less.
 *   5. unknown — none of the above earned a name.
 *
 * A declared ?source= param is recorded verbatim alongside (see
 * metrics.ts) but never overrides inference for the channel column —
 * claims are claims.
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

const BAZAAR_HINTS = ["x402scan", "bazaar", "x402-catalog", "x402index"];
const SKILL_HINTS = ["agentskills", "skills.sh", "skill-runner", "skillrunner"];

export interface ChannelSignals {
  referrer?: string;
  userAgent?: string;
  /** Set by the /mcp handler; definitive. */
  viaMcp?: boolean;
}

export function inferChannel(signals: ChannelSignals): Channel {
  if (signals.viaMcp) {
    return "mcp";
  }
  const referrer = (signals.referrer ?? "").toLowerCase();
  const userAgent = (signals.userAgent ?? "").toLowerCase();
  const haystack = `${referrer} ${userAgent}`;
  if (BAZAAR_HINTS.some((hint) => haystack.includes(hint))) {
    return "bazaar";
  }
  if (SKILL_HINTS.some((hint) => haystack.includes(hint))) {
    return "skill";
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
