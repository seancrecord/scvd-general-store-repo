import { inferChannel, isHouseAgent } from "@/lib/channel";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { MetricEvent } from "@/lib/metrics";
import type { Channel, Env } from "@/types";
import { kvList } from "@/lib/kv-retry";
import { WALK_MIN_ITEMS, WALK_WINDOW_MS, widestWalk } from "@/lib/walkers";

/**
 * THE CENSUS and THE WALK DETECTOR: two questions, one row walk.
 *
 * 1. THE CENSUS. Of everything that has ever knocked, how many ever
 *    presented a payment signature, and how many only ever saw the 402
 *    and left? Answered by hand for July 2026 and the answer was zero,
 *    across the whole month's challenges, with no declines either. Made
 *    a standing number rather than an afternoon's work, because it is
 *    the line that moves first when anything changes.
 *
 *    IT MOVED ON 2026-07-30: the first organic settle. The count is
 *    computed, so this comment is history and not a claim — and the
 *    original figure is deliberately not restated here, because a
 *    number written into a comment is the same lie with a timer on it
 *    that the skill bundle and llms.txt both carried this week.
 *
 * 2. THE WALK DETECTOR. The crawler table in channel.ts only catches
 *    machines that admit what they are — it reads the user-agent and
 *    believes it. A catalog walk is a behaviour, and behaviour cannot
 *    lie: one client touching many distinct items inside a minute is
 *    indexing us, whatever it calls itself. July's per-item counts show
 *    the fingerprint plainly (eight items at 132-141, then two at the
 *    end of the list at 2).
 *
 * THE HONEST LIMIT, stated here because every number below inherits it:
 * we keep no cookies and no IPs, so **a "client" is a distinct
 * user-agent string.** Two agents behind the same default SDK string
 * count once; one agent that rotates its string counts many times. The
 * census is therefore a shape, not a headcount, and the only exact
 * column is the settle column, which has an outside witness on chain.
 */

const SCAN_CAP = 3000;
const LIST_PAGE = 1000;

/** A walk is N distinct items inside this window from one user-agent. */
// The rule itself lives in lib/walkers.ts, shared with the
// reclassification walk and the funnel, so the three cannot disagree.

const NO_UA = "(no user-agent)";

export interface CensusClient {
  user_agent: string;
  /** 402s issued to it. */
  challenges: number;
  /** Signed payments it offered that were turned away. */
  declines: number;
  /** Payments that settled. */
  settles: number;
  /** Distinct paid items it has ever been shown a price for. */
  distinct_items: number;
  first_seen: string;
  last_seen: string;
  house: boolean;
  /** What today's table calls it, not what the row was stored as. */
  channel: Channel;
  /**
   * The widest catalog walk it ever ran: distinct items touched inside
   * one WALK_WINDOW_MS window. 0 when it never walked.
   */
  widest_walk: number;
}

export interface CensusResult {
  rows_scanned: number;
  capped: boolean;
  oldest_row?: string;
  newest_row?: string;

  /** Distinct user-agents seen at a priced door, house included. */
  clients_total: number;
  /** …of those, the ones that are not the keeper testing. */
  clients_outside: number;

  /**
   * THE CENSUS LINE. Outside clients that ever presented a payment
   * signature — settled or declined, both count, because both mean a
   * wallet was opened at our door.
   */
  presented_signature: CensusClient[];
  /** Outside clients that only ever saw the 402 and left. */
  looked_and_left: number;
  /** …restricted to the ones today's table does not call machinery. */
  looked_and_left_organic: number;

  /** Every client whose behaviour is a catalog walk, widest first. */
  walkers: CensusClient[];
  /**
   * THE FIND: walkers today's table still calls organic. These are the
   * rows inflating the headline, and the candidates for channel.ts.
   */
  undeclared_walkers: CensusClient[];
}

interface Tally {
  client: CensusClient;
  /** challenge (ms, item) pairs, for the sliding window. */
  touches: { at: number; item: string }[];
  items: Set<string>;
}


/**
 * Walks the raw rows newest-first and takes the census. Bounded the
 * same way the recount is: the scan stops at a cap and reports how far
 * back it actually got, because a window that covers four days honestly
 * beats a month that times out.
 */
export async function takeCensus(
  env: Env,
  scanCap = SCAN_CAP,
): Promise<CensusResult> {
  const result: CensusResult = {
    rows_scanned: 0,
    capped: false,
    clients_total: 0,
    clients_outside: 0,
    presented_signature: [],
    looked_and_left: 0,
    looked_and_left_organic: 0,
    walkers: [],
    undeclared_walkers: [],
  };
  const tallies = new Map<string, Tally>();

  let cursor: string | undefined;
  while (result.rows_scanned < scanCap) {
    const listed = await kvList(env.COUNTERS, {
      prefix: "evt:",
      limit: LIST_PAGE,
      ...(cursor ? { cursor } : {}),
    });
    const names = listed.keys.map((key) => key.name);
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      if (result.rows_scanned >= scanCap) {
        result.capped = true;
        break;
      }
      const event = values.get(name);
      if (!event) continue;
      result.rows_scanned += 1;
      // Keys sort newest-first, so the last row seen is the oldest.
      result.newest_row ??= event.at;
      result.oldest_row = event.at;

      // The census counts doors with a price on them. A porch visit is
      // not a knock at the register, and a verify call is someone
      // checking our work, which is free and always will be.
      if (
        event.kind !== "challenge" &&
        event.kind !== "settle" &&
        event.kind !== "decline"
      ) {
        continue;
      }

      const ua = event.user_agent ?? NO_UA;
      // Stamped at write time OR named today: a client added to
      // HOUSE_AGENTS after its rows were written is still the house.
      const house = event.house || isHouseAgent(event.user_agent);
      /**
       * KEYED BY USER-AGENT **AND** HOUSE FLAG, fixed 2026-07-30 the day
       * the first organic settle landed and this page still said zero.
       *
       * Clients were keyed by user-agent alone, and `house ||= ...` below
       * meant ONE house-flagged event anywhere in the window marked the
       * whole bucket as house — after which it was skipped entirely. The
       * intent was right ("the keeper testing from a crawler string is
       * still the keeper") and the identity model was wrong: a
       * user-agent is not a person, it is a BUCKET, and the emptiest
       * bucket of all is "(no user-agent)" — which the keeper's own
       * scripted tests and a real hand-rolled buyer both fall into.
       *
       * So one house test poisoned every outside client sharing a
       * string, and the number this store exists to watch read zero on
       * the day it stopped being zero. Splitting the key keeps the
       * original rule exactly — a house event still counts as house —
       * while stopping it from swallowing everyone standing nearby.
       */
      const key = `${ua}\u0000${house ? "house" : "outside"}`;
      let tally = tallies.get(key);
      if (!tally) {
        tally = {
          client: {
            user_agent: ua,
            challenges: 0,
            declines: 0,
            settles: 0,
            distinct_items: 0,
            first_seen: event.at,
            last_seen: event.at,
            house,
            channel: inferChannel({
              userAgent: event.user_agent,
              referrer: event.referrer,
              declaredSource: event.declared_source,
            }),
            widest_walk: 0,
          },
          touches: [],
          items: new Set(),
        };
        tallies.set(key, tally);
      }
      // House wins once seen: the keeper testing from a crawler string
      // is still the keeper, the same rule the counters use.
      // Within a bucket the flag is now constant by construction; kept
      // as an assignment rather than an assertion so the invariant is
      // visible at the point it is relied on.
      tally.client.house = house;
      if (event.at > tally.client.last_seen) tally.client.last_seen = event.at;
      if (event.at < tally.client.first_seen)
        tally.client.first_seen = event.at;
      tally.items.add(event.item);

      if (event.kind === "challenge") {
        tally.client.challenges += 1;
        tally.touches.push({ at: Date.parse(event.at), item: event.item });
      } else if (event.kind === "decline") {
        tally.client.declines += 1;
      } else {
        tally.client.settles += 1;
      }
    }
    if (listed.list_complete || result.rows_scanned >= scanCap) {
      result.capped = result.capped || !listed.list_complete;
      break;
    }
    cursor = listed.cursor;
  }

  for (const tally of tallies.values()) {
    const client = tally.client;
    client.distinct_items = tally.items.size;
    client.widest_walk = widestWalk(tally.touches);
    result.clients_total += 1;
    if (client.house) continue;
    result.clients_outside += 1;
    if (client.settles > 0 || client.declines > 0) {
      result.presented_signature.push(client);
    } else {
      result.looked_and_left += 1;
      if (client.channel !== "infrastructure") {
        result.looked_and_left_organic += 1;
      }
    }
    if (client.widest_walk >= WALK_MIN_ITEMS) {
      result.walkers.push(client);
      if (client.channel !== "infrastructure") {
        result.undeclared_walkers.push(client);
      }
    }
  }

  const byWalk = (a: CensusClient, b: CensusClient): number =>
    b.widest_walk - a.widest_walk || b.challenges - a.challenges;
  result.presented_signature.sort((a, b) => b.settles - a.settles);
  result.walkers.sort(byWalk);
  result.undeclared_walkers.sort(byWalk);

  return result;
}

export const CENSUS_WALK_RULE = {
  window_ms: WALK_WINDOW_MS,
  min_items: WALK_MIN_ITEMS,
} as const;
