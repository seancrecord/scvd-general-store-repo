import { latestCorpusEntry } from "@/services/corpus";
import { latestWardRound } from "@/services/ward-round";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE FRESH SET — the walkable set as a served, dated surface
 * (keeper-approved backlog 2026-08-19; built 2026-08-20, the day the
 * keeper's hand ran the first full walk and the material existed).
 *
 * The corpus keeps the row-level record and renders no verdicts of
 * its own — its file says it is "the substrate a future conformance
 * feed or audit report reads FROM." This is that feed: the doors that
 * answered a spec-conformant x402 challenge in the latest round,
 * named, dated, with what each door offered (rails, schemes, cheapest
 * USDC ask) read from its own challenge header. An agent deciding
 * where to spend can route on it; every row cites the signed history
 * that backs it.
 *
 * TWO LINES THIS SURFACE HOLDS, both older than it:
 *
 * NAMES APPEAR ONLY ON THE READY SIDE. The registry tally publishes
 * failure rates without names; the set names only doors that answered
 * correctly. A door that failed this round is a count here, never a
 * row — the row-level failure record exists in the corpus under its
 * own rules, and outreach handles it privately, one dated observation
 * at a time.
 *
 * DATED OBSERVATIONS, NEVER SCORES (rule 43, by name). A row says
 * "this door answered a conformant challenge in week W" — a fact
 * about a moment. It does not say the door is good, ranked, or
 * trusted, and nothing here accumulates across weeks into a judgment
 * on an operator. The exact line separating this from every
 * trust-score site.
 *
 * FREE. Routing data as a public good that markets the paid tiers —
 * the pricing rule the backlog entry left for build time, decided on
 * the funnel's own evidence (703 asks, 1 settle: the store's problem
 * is reach, not margin). The keeper can re-rule to the half-cent door.
 */

/** Ceiling on served rows. Named because an unnamed cap is a silent one. */
export const FRESH_SET_ROW_CAP = 2000;

export interface FreshSetRow {
  host: string;
  /** The resource URL the probe actually walked. */
  url: string;
  /** Networks the door's own 402 offered, e.g. eip155:8453. */
  rails?: string[];
  schemes?: string[];
  /** Cheapest recognized USDC ask across the offer's accepts, whole USDC. */
  min_usdc?: number;
  /** This host's full dated history, replayed from the signed chain. */
  history_url: string;
  /**
   * H4 (2.5) — THE CONDITIONS THAT TRAVEL WITH THE ROW.
   *
   * This is the routing surface: a shopping row, read by something
   * deciding where to spend. Without these it rendered a CONFORMANT
   * observation as a PURCHASABLE offer — rails and a price and
   * nothing attached — which is a state conversion performed by
   * presentation on the one surface built for spending decisions.
   *
   * `battery` cites the criteria; `observed_at` dates THIS row rather
   * than the round; `conditions` carries the advisories the probe
   * raised, named rather than summarised; `not_checked` states the
   * rungs this verdict does not cover, because a row that says
   * nothing about delivery will be read as promising it.
   */
  battery: string;
  observed_at: string;
  conditions: string[];
  not_checked: string[];
  /**
   * A stranger paid this door this week and the settlement was
   * verified on chain (2026-09-04). The one thing `not_checked` says
   * no probe can see — that a purchase completes — somebody else saw,
   * with their own money. Stated on the row because it is the fact a
   * routing decision most wants; the row in `crowd_walks` carries it.
   */
  settled_by_a_stranger_this_week?: true;
}

/**
 * THE CROWD'S ROWS on the routing surface: doors a stranger actually
 * paid this week, settlement verified on chain by this store when the
 * bounty was paid. Its own list, its own tier name, never merged into
 * the probe rows above — a settlement is a stronger fact than a
 * conformant 402 and a different one.
 */
export interface FreshSetCrowdRow {
  tier: "crowd-walked";
  host: string;
  url: string;
  network: string;
  settled_at: string;
  tx_hash: string;
  amount_usd: number;
  /** This store's own unpaid knock at claim time, when one was taken. */
  house_probe_verdict?: "ready" | "not_ready" | "unreachable";
  history_url: string;
}

/**
 * What a shape-conformance verdict does not cover, stated on every
 * row. Not a disclaimer: the specific rungs of the evidence ladder a
 * reader of this surface is most likely to assume were climbed.
 */
const FRESH_SET_NOT_CHECKED: readonly string[] = [
  "whether a purchase completes: nothing here was bought",
  "whether the goods are delivered after payment — no probe can see that, and this one did not spend",
  "whether the door still answers now: this is one observation, at the time in observed_at",
  "whether the signed offers (if any) verify against their issuer's key",
];

export interface FreshSet {
  version: 1;
  week: string;
  observed_at: string;
  what_this_is: string;
  what_this_is_not: string;
  rows: FreshSetRow[];
  /** True when the round held more ready doors than the cap serves. */
  truncated: boolean;
  /** Doors a stranger paid this week, settlement chain-verified. May be empty. */
  crowd_walks: FreshSetCrowdRow[];
  crowd_walks_note: string;
  /** True when the round's crowd-walk reading hit a bound: a floor, not the week. */
  crowd_walks_truncated: boolean;
  /** The round's verdict arithmetic, failures counted but never named. */
  aggregates: {
    listed_resources: number;
    probed: number;
    ready: number;
    not_ready: number;
    unreachable: number;
  };
  /** Honesty about the observation window, from the round's own flags. */
  coverage: {
    capped: boolean;
    coverage_suspect: boolean;
    /** Present on long-walk weeks: walked < roster means the week ended
     * before the cursor did. */
    walk?: { roster: number; walked: number };
  };
  /** The signed record these rows replay from. */
  evidence: {
    corpus_url: string;
    /** Set when the corpus has frozen this exact week's round. */
    corpus_sequence?: number;
    corpus_digest?: string;
  };
}

/**
 * Exported for the shape law's test: the live endpoint serves an
 * empty set until a round exists, and a loop over no rows proves
 * nothing. The builder is where the law binds.
 */
/** The crowd's rows for the routing surface, from the round's own crowd_walks. */
export function crowdRows(round: WardRound, base: string): FreshSetCrowdRow[] {
  return (round.crowd_walks ?? []).map((walk) => ({
    tier: "crowd-walked" as const,
    host: walk.host,
    url: walk.url,
    network: walk.network,
    settled_at: walk.claimed_at,
    tx_hash: walk.settlement.tx_hash,
    amount_usd: walk.settlement.amount_usd,
    ...(walk.house_probe ? { house_probe_verdict: walk.house_probe.verdict } : {}),
    history_url: `${base}/corpus/host/${walk.host}.json`,
  }));
}

export function freshRows(round: WardRound, base: string): FreshSetRow[] {
  const seen = new Set<string>();
  const rows: FreshSetRow[] = [];
  const settledHosts = new Set((round.crowd_walks ?? []).map((walk) => walk.host));
  for (const host of round.hosts) {
    if (host.verdict !== "ready") continue;
    if (seen.has(host.host)) continue;
    seen.add(host.host);
    rows.push({
      host: host.host,
      url: host.url,
      ...(settledHosts.has(host.host) ? { settled_by_a_stranger_this_week: true as const } : {}),
      ...(host.offer
        ? {
            rails: host.offer.networks,
            schemes: host.offer.schemes,
            ...(host.offer.min_usdc !== undefined
              ? { min_usdc: host.offer.min_usdc }
              : {}),
          }
        : {}),
      history_url: `${base}/corpus/host/${host.host}.json`,
      battery: host.battery ?? "unstated",
      /*
       * Per-row where the row knows it, the round's timestamp
       * otherwise — stated either way rather than left to a reader
       * to infer from the document it arrived in.
       */
      observed_at: round.at,
      conditions: [...(host.advisories ?? [])],
      not_checked: [...FRESH_SET_NOT_CHECKED],
    });
  }
  rows.sort((a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0));
  return rows;
}

export async function buildFreshSet(env: Env): Promise<FreshSet | null> {
  const round = await latestWardRound(env);
  if (!round) return null;
  const base = env.STORE_BASE_URL;

  const rows = freshRows(round, base);
  const probed = round.hosts.filter((h) => h.verdict !== "not_probed");
  const count = (verdict: string) =>
    probed.filter((h) => h.verdict === verdict).length;

  const corpus = await latestCorpusEntry(env);
  const frozen = corpus?.snapshot.week === round.week ? corpus : null;

  return {
    version: 1,
    week: round.week,
    observed_at: round.at,
    what_this_is:
      "The doors that answered a spec-conformant x402 payment challenge in this week's census, with what each door's own 402 offered. Dated observations an agent can route on; every row cites the signed per-host history that backs it.",
    what_this_is_not:
      "Not a ranking, not an endorsement, and no figure without its denominator. A row is a fact about one dated moment; nothing accumulates across weeks into a judgment on an operator. Doors that failed this round are counted in aggregates and never named here.",
    rows: rows.slice(0, FRESH_SET_ROW_CAP),
    truncated: rows.length > FRESH_SET_ROW_CAP,
    crowd_walks: crowdRows(round, base),
    crowd_walks_truncated: round.crowd_walks_truncated === true,
    crowd_walks_note:
      "Doors a stranger paid this week with their own wallet, the settlement verified on chain by this store when it paid the bounty — the one fact no probe can see. Their own tier, below the house's walks, never blended into the rows above. What the walker said about the door is their claim, kept on the bounty record and not repeated here.",
    aggregates: {
      listed_resources: round.listed_resources,
      probed: probed.length,
      ready: count("ready"),
      not_ready: count("not_ready"),
      unreachable: count("unreachable"),
    },
    coverage: {
      capped: round.capped,
      coverage_suspect: round.coverage_suspect,
      ...(round.walk
        ? { walk: { roster: round.walk.roster, walked: round.walk.walked } }
        : {}),
    },
    evidence: {
      corpus_url: `${base}/corpus`,
      ...(frozen
        ? {
            corpus_sequence: frozen.snapshot.sequence,
            corpus_digest: frozen.digest,
          }
        : {}),
    },
  };
}
