import { readObserverStatus } from "@/lib/observer-control";
import { createAuthHeader } from "@coinbase/x402";
import { runChecks } from "@/services/preflight";
import { signerKidsFromChallenge } from "@/services/watch-evidence";
import { sendAlert } from "@/lib/alerts";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { takeCensus, type PopulationCensus, type SourceResult } from "@/services/population";
import { readFuchssProviders, UNREAD_DIRECTORIES } from "@/services/ward-sources";
import { checkRailReceivable } from "@/services/rail-receivable";
import {
  BATTERY_ADDS,
  PREFLIGHT_BATTERY_NEXT,
  PREFLIGHT_VERSION_NEXT,
} from "@/services/preflight";

/**
 * WHICH BATTERY THE CENSUS ACTUALLY RUNS (2.5, 2026-08-26).
 *
 * Every row wrote `battery: "preflight-v1"` — the field that exists
 * (1.3) to say which criteria produced the verdict. But since 0.14 on
 * 2026-08-24 this round FOLDS the Solana rail read into its verdict,
 * a v2 rule that v1 explicitly does not apply, ruled deliberately so
 * the corpus would stop contradicting /api/preflight/v2 in public.
 * Then 2.1c gave v2 the L3b consistency trio, which this round did
 * not fold. The census matched NEITHER published battery: v1-cited,
 * rail-folded like v2, trio-unfolded like v1 — and those rows ride
 * verbatim into the hash-chained, Bitcoin-anchored corpus.
 *
 * 0.14's own comment named the stakes: an observatory that anchors a
 * false verdict has published a durable lie with a proof of
 * authorship attached. Here the LABEL was the lie, not the verdict.
 *
 * The fix finishes the decision 0.14 already made — this round must
 * not contradict the published v2 verdict — by applying v2 in full
 * and citing v2. Old rows keep their bytes; the correction is dated
 * and public at /corrections.
 */
export const CENSUS_BATTERY = PREFLIGHT_BATTERY_NEXT;

/**
 * The check names this round can actually fail a door on. Exported so
 * a test can hold the citation to account: every check the cited
 * battery adds must appear here, or the row is citing criteria it
 * does not apply — which is the whole defect above.
 */
export function censusFoldedCheckNames(): string[] {
  return [...BATTERY_ADDS[PREFLIGHT_VERSION_NEXT]];
}
import {
  captureWatchEvidenceKeepingBody,
  type WatchEvidenceCapture,
} from "@/services/watch-evidence";
import { webBotAuthHeaders, type WbaEnv } from "@/lib/web-bot-auth";
import { marketAggregates, offerFacts, type MarketAggregates, type OfferFacts } from "@/services/market";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE WARD ROUND — the weekly in-Worker census of the x402 discovery
 * list, so the ecosystem picture the outreach and the writeups stand
 * on cannot go stale by nobody remembering to run a script.
 *
 * Named to stay OUT of two other instruments' way: /admin/census is
 * the VISITOR census (who walked into our store), and the Night Watch
 * is per-customer paid monitoring. This is the ward — the whole
 * neighbourhood, walked once a week, aggregate.
 *
 * WHAT IT DOES with each host is exactly what the hand-run census
 * script did, from the same one law (services/preflight.ts runChecks):
 * one GET per declared host per week — indexer-cadence, the same
 * consent shape as any crawler reading a public discovery document.
 *
 * WHAT IT PUBLISHES: nothing, on its own. Results land in KV; the
 * keeper reads them at /admin/ward with the week-over-week delta.
 * Anything public stays a hand's decision (rule 30). The delta is the
 * point: NEW hosts (nobody gets missed as they appear), NEWLY FAILING
 * (fresh outreach leads), NEWLY FIXED (outreach that worked, or the
 * market healing), and FLAPPERS (verdict changed week to week — the
 * Night Watch's natural prospects, found mechanically).
 *
 * PLUS ONE CHECK ABOUT US: our own presence in the discovery SEARCH
 * index — the authoritative surface per bazaar-check's recorded
 * lesson (a list-page miss says nothing; search decides). Absent =
 * an alert, because silently falling out of the index is a channel
 * dying with no symptom on any surface we watch.
 */

const CDP_HOST = "api.cdp.coinbase.com";
const DISCOVERY_PATH = "/platform/v2/x402/discovery/resources";
const SEARCH_PATH = "/platform/v2/x402/discovery/search";
/**
 * Hosts per round. 200 → 750, keeper's ruling 2026-08-19, the day the
 * repaired feed read 6,000 declared resources and the old cap bound
 * for the first time. 750 is the honest ONE-INVOCATION maximum, set
 * by the Workers subrequest budget (1,000 per invocation, hard):
 * ~60 discovery pages + up to 750 probes + the census's directory
 * reads + RPC leaves ~10% headroom. Anything past this is not a
 * bigger number, it is a different architecture — the long walk
 * (hourly batches on a cursor, R2-stored snapshots), greenlit as its
 * own build. The round still says when this cap binds.
 */
const WARD_CAP = 750;
const PROBE_TIMEOUT_MS = 8000;
/**
 * Probes in flight at once. Sequential probing at an 8s timeout puts
 * a 750-door round's worst case near 100 minutes — far past the
 * cron's budget — so the walk is pooled. Twenty at a time puts the
 * worst case near five minutes and the typical round well under two,
 * while staying far below any host's idea of a crawl: each HOST
 * still gets exactly one GET a week.
 */
const PROBE_CONCURRENCY = 20;

/**
 * A VOLUME CLAIM, labeled as one. The agent402.tools leaderboard
 * ranks sellers by chain-scanned Base USDC volume — the good kind of
 * source mechanically, BUT Artemis classified ~78% of the ecosystem's
 * peak transactions and ~98% of volume as non-organic (recorded
 * 2026-08-04), so in this ecosystem a volume ranking largely ranks
 * wash. The ward uses the feed for POPULATION (who exists, who to
 * probe) and records volume as testimony with its source and window
 * attached — never as importance. Our conformance probe is the till.
 */
export interface WardVolumeClaim {
  calls: number;
  usd: number;
  unique_buyers: number;
  window: string;
  source: "agent402.tools";
}

export interface WardHostResult {
  host: string;
  url: string;
  /**
   * "not_probed" (2026-08-04, the first two-feed round's lesson): a
   * leaderboard row's origin is a HOMEPAGE, not a paid resource URL —
   * probing it for a 402 manufactured ~160 false not_readys in one
   * round. Leaderboard-only hosts are population, listed with their
   * claims, excluded from the ready arithmetic and the delta until
   * discovery hands us a real door to knock on.
   */
  verdict: "ready" | "not_ready" | "unreachable" | "not_probed";
  failed: string[];
  advisories: string[];
  /**
   * Which feed(s) named this host. Absent on pre-feed rounds =
   * discovery. "revisit" (2026-08-18, the door bank): no feed named it
   * THIS round — the probe walked a resource URL a past discovery
   * round declared, to keep observation breadth when the feed's own
   * coverage is suspect. Revisit rows carry real verdicts and stay out
   * of the listed/gone delta.
   */
  source?: "discovery" | "leaderboard" | "both" | "revisit";
  /**
   * RAW EVIDENCE (roadmap 1.2, B9/G1): the verbatim PAYMENT-REQUIRED
   * bytes, curated headers, and a bounded complete-body sha256 from
   * the one fetch this probe already made. The weekly snapshot
   * freezes rows verbatim and signs them, so a verdict here stops
   * being reproducible-only-by-trusting-us: the challenge that
   * produced it rides inside the same signed bytes. Absent on rounds
   * before 2026-08-26 and on unreachable doors — a legacy row keeps
   * its exact original preimage, the standing-watch lesson.
   */
  evidence?: WatchEvidenceCapture;
  /**
   * 3.1 (ledger G3) — every did:web signer this door presented, read
   * from the offers' JWS headers without verifying anything. An
   * observation about what was shown, never a claim the signature is
   * good. Present (possibly empty) on every answered door: a door
   * with no signed offers and a door we did not look at are
   * different facts. THIS IS THE ONE THAT CANNOT BE BACKFILLED — a
   * key that rotated on Tuesday leaves no trace by Sunday, so the
   * ecosystem's only key-rotation history exists only if it is
   * written down at the moment of the knock.
   */
  signer_kids?: string[];
  /** How long this door took to answer, in ms. Free; the probe timed itself anyway. */
  latency_ms?: number;
  /**
   * WHICH BATTERY PRODUCED THE VERDICT (roadmap 1.3 / D6), riding
   * verbatim into the signed weekly snapshot like everything else on
   * this row. Absent on rounds before 2026-08-26 and on unreachable
   * doors — no response, no battery, no citation.
   */
  battery?: string;
  /**
   * 3.4/B6, the census's copy of the watch's law: whose failure an
   * unreachable verdict was. "ok" = the control beacon answered in
   * the same tick, so the outage is the subject's, confirmed.
   * "degraded" = our vantage was blind; consumers must not count
   * this row against the host or as coverage. "unchecked" = no
   * beacon provisioned. Present only on unreachable rows — an
   * answered door proved the vantage by answering.
   */
  observer_status?: "ok" | "degraded" | "unchecked";
  volume_claim?: WardVolumeClaim;
  /**
   * What the door's own 402 OFFERED, read from the header the probe
   * already fetched (2026-08-19, the market desk): rails, schemes,
   * cheapest USDC ask. Zero extra contact — keeping what was paid
   * for. Absent on rounds before the desk and on doors whose
   * challenge did not parse.
   */
  offer?: OfferFacts;
}

export interface WardRound {
  week: string;
  at: string;
  listed_resources: number;
  /** True when a full page arrived with no recognizable cursor. */
  coverage_suspect: boolean;
  /**
   * Recorded only when coverage is suspect: the key names the feed's
   * last page actually carried (top level, plus one level under the
   * usual pagination containers). The 2026-08-05 collapse took weeks
   * to even diagnose because the shape that broke us was never
   * written down anywhere — the next cursor-spelling fix should come
   * from reading the corpus, not from guessing again.
   */
  pagination_shape?: string[];
  /**
   * The door bank's contribution this round (absent before
   * 2026-08-18): how many declared doors the bank holds, how many
   * spare cap slots were filled with re-probes, and how many hosts
   * eviction dropped to keep the bank bounded (absent when none).
   */
  door_bank?: { known: number; revisited: number; evicted?: number };
  /**
   * Set when this round probed under 60% of the last one's hosts:
   * the loud version of coverage_suspect, with the numbers.
   */
  coverage_drop?: {
    previous_hosts: number;
    this_round: number;
    previous_at: string;
  };
  capped: boolean;
  our_search_presence: boolean | null;
  /**
   * Leaderboard feed health, could-not-check kept distinct from
   * absent: sellers null = the FEED was unreachable this round (say
   * nothing about anybody); sellers set with our rank null = the feed
   * answered and we are not on it (expected at our volume; recorded,
   * never alarmed).
   */
  leaderboard_sellers?: number | null;
  leaderboard_window?: string | null;
  our_leaderboard_rank?: number | null;
  /**
   * THE DENOMINATOR. Enumeration is nearly free and probing is not, so
   * the round counts every host its feeds NAME and probes as many as
   * the cap allows. Absent on rounds recorded before the population
   * layer existed — a reader must treat missing as "not measured",
   * never as 100% coverage.
   */
  population?: PopulationCensus;
  /**
   * The directories the round knows exist and could not read, each
   * with the reason (2026-08-10, the widening ruling). The roster is
   * only uniform if its gaps are published on the same artifact as
   * its findings. Absent on pre-widening rounds.
   */
  directories_unread?: { source: string; why: string }[];
  /**
   * THE MARKET DESK's aggregate block (2026-08-19): the ecosystem's
   * shape derived from this round's own rows — rot, rails, prices,
   * signed-offers rate, seller concentration. Plain arithmetic anyone
   * can recompute from `hosts`; stored so the corpus carries the
   * market's weekly shape without a reader needing our code.
   */
  market?: MarketAggregates;
  /**
   * Present when this round was ASSEMBLED from the long walk rather
   * than probed in one shot (2026-08-19): the week's hourly batches
   * did the knocking, and Sunday only collected. roster counts the
   * probeable doors the walk froze at start; walked counts real
   * verdicts; a walked < roster round means the week ended before
   * the cursor did, and capped says so.
   */
  walk?: {
    roster: number;
    walked: number;
    batches: number;
    started_at: string;
  };
  hosts: WardHostResult[];
}

export interface WardDelta {
  new_hosts: string[];
  gone_hosts: string[];
  newly_failing: string[];
  newly_fixed: string[];
  /** Verdict changed in any direction — the intermittency signal. */
  flappers: string[];
}

async function cdpGet(env: Env, path: string, query = ""): Promise<unknown> {
  const token = await createAuthHeader(
    env.CDP_API_KEY_ID,
    env.CDP_API_KEY_SECRET,
    "GET",
    CDP_HOST,
    path,
  );
  const response = await fetch(`https://${CDP_HOST}${path}${query}`, {
    headers: { Authorization: token, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`);
  }
  return response.json();
}

export interface DiscoveryRead {
  hosts: { host: string; url: string }[];
  listed: number;
  coverageSuspect: boolean;
  /** Set only when coverageSuspect: what the last page's body offered. */
  paginationShape?: string[];
  /**
   * The union of key names the feed's rows actually carried (capped),
   * so the market desk's next mining pass reads reality instead of
   * guessing which metadata fields exist. Same self-diagnosis habit
   * as pagination_shape.
   */
  fieldsSeen?: string[];
}

/**
 * The key names a suspect page actually carried — the diagnosis the
 * 2026-08-05 collapse never wrote down. Top-level names plus one level
 * under the containers a cursor usually hides in.
 */
function describePaginationShape(body: Record<string, unknown>): string[] {
  const shape = Object.keys(body).slice(0, 30);
  for (const container of ["pagination", "meta", "paging", "links"]) {
    const nested = body[container];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      shape.push(
        ...Object.keys(nested as Record<string, unknown>)
          .slice(0, 10)
          .map((key) => `${container}.${key}`),
      );
    }
  }
  return shape;
}

/**
 * Pages the reader will walk in one round. Raised from 20 on
 * 2026-08-19 when offset paging landed: at 100 rows a page this reads
 * up to 6,000 declared resources — comfortably past the arXiv-scale
 * listing — and each page is one subrequest, far inside the budget.
 * A declared total beyond it leaves coverage_suspect true, which is
 * the honest answer at any cap.
 */
const DISCOVERY_PAGE_CAP = 60;

export async function readDiscoveryList(env: Env): Promise<DiscoveryRead> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const rows: Record<string, unknown>[] = [];
  const fieldsSeen = new Set<string>();
  let cursor: string | undefined;
  let offset: number | undefined;
  let coverageSuspect = false;
  let paginationShape: string[] | undefined;
  let previousFirstRow: string | undefined;
  for (let page = 0; page < DISCOVERY_PAGE_CAP; page += 1) {
    const params = new URLSearchParams({ pageSize: "100" });
    if (cursor) params.set("pageToken", cursor);
    if (offset !== undefined) params.set("offset", String(offset));
    const body = (await cdpGet(env, DISCOVERY_PATH, `?${params}`)) as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    const items = (body["items"] ?? body["resources"] ?? body["data"] ?? []) as Record<string, unknown>[];
    /**
     * A SERVER THAT IGNORES OUR OFFSET SERVES PAGE ONE FOREVER, and a
     * reader that keeps counting it would invent a population 60x the
     * truth. Same first row twice = the pagination is not doing what
     * its shape declares; stop, keep what page one gave, say suspect.
     */
    const firstRow = items.length ? JSON.stringify(items[0]) : undefined;
    if (page > 0 && firstRow !== undefined && firstRow === previousFirstRow) {
      coverageSuspect = true;
      paginationShape = describePaginationShape(body);
      break;
    }
    previousFirstRow = firstRow;
    rows.push(...items);
    // The market desk's self-diagnosis: which metadata fields do the
    // feed's rows actually carry? Capped; names only, never values.
    if (fieldsSeen.size < 30) {
      for (const item of items.slice(0, 5)) {
        for (const key of Object.keys(item)) fieldsSeen.add(key);
      }
    }
    // Every cursor spelling seen or plausible in the wild. The
    // 2026-08-05 round read exactly one page (100 resources, 38
    // hosts) after weeks of several hundred — the feed's pagination
    // shape moved and the old three spellings stopped matching.
    cursor =
      body["nextPageToken"] ?? body["next_page_token"] ?? body["cursor"] ??
      body["nextCursor"] ?? body["next_cursor"] ?? body["nextPage"] ??
      body["pagination"]?.nextPageToken ?? body["pagination"]?.cursor ??
      body["pagination"]?.nextCursor ?? body["pagination"]?.next_cursor ??
      body["meta"]?.nextCursor ?? body["meta"]?.next_cursor ??
      body["paging"]?.cursor ?? body["paging"]?.next;
    // A links.next full URL counts too: take its pageToken/cursor.
    if (!cursor) {
      const nextUrl = body["links"]?.next ?? body["next"];
      if (typeof nextUrl === "string" && nextUrl.includes("=")) {
        try {
          const parsed = new URL(nextUrl, "https://api.cdp.coinbase.com");
          cursor =
            parsed.searchParams.get("pageToken") ??
            parsed.searchParams.get("cursor") ??
            undefined;
        } catch {
          /* not a URL; fall through to the offset check */
        }
      }
    }
    if (!cursor) {
      /**
       * OFFSET PAGING (2026-08-19). The 08-05 collapse is solved: the
       * instrument's own pagination_shape capture, on the first
       * hand-run round after it shipped, read `pagination.limit /
       * pagination.offset / pagination.total` off the live feed —
       * the feed moved to OFFSET pagination, and there was never a
       * cursor to find. The declared shape is followed literally:
       * advance by the served limit until the served total, and
       * anything else (no numbers, nonsense numbers) falls through
       * to the suspect check exactly as before.
       */
      const pg = body["pagination"];
      const limit = Number(pg?.limit);
      const total = Number(pg?.total);
      const served = Number.isFinite(Number(pg?.offset))
        ? Number(pg?.offset)
        : (offset ?? 0);
      if (
        items.length > 0 &&
        Number.isFinite(limit) &&
        limit > 0 &&
        Number.isFinite(total) &&
        served + items.length < total
      ) {
        offset = served + items.length;
        continue;
      }
      if (Number.isFinite(total) && total >= 0 && rows.length >= total) {
        // The feed declared its total and we read all of it: the one
        // case a full last page is NOT a cap wearing completeness.
        break;
      }
      // A full page and no recognized way forward is a page cap
      // wearing completeness — the hand-run census's own lesson.
      coverageSuspect = items.length > 0 && items.length % 100 === 0;
      if (coverageSuspect) paginationShape = describePaginationShape(body);
      break;
    }
    if (items.length === 0) break;
  }
  // The page cap binding is a coverage statement too.
  if (rows.length >= DISCOVERY_PAGE_CAP * 100) coverageSuspect = true;
  const seen = new Set<string>();
  const hosts: { host: string; url: string }[] = [];
  for (const row of rows) {
    const url = (row["resourceUrl"] ?? row["resource_url"] ?? row["resource"] ?? row["url"]) as unknown;
    if (typeof url !== "string" || !url.startsWith("https://")) continue;
    let host: string;
    try {
      host = new URL(url).host.toLowerCase();
    } catch {
      continue;
    }
    if (host === ownHost || seen.has(host)) continue;
    seen.add(host);
    hosts.push({ host, url });
  }
  return {
    hosts,
    listed: rows.length,
    coverageSuspect,
    ...(paginationShape ? { paginationShape } : {}),
    ...(fieldsSeen.size ? { fieldsSeen: [...fieldsSeen].slice(0, 30).sort() } : {}),
  };
}

/**
 * Run one worker per entry, at most `limit` in flight, results in the
 * callers' order. Plain enough to not need a library and small enough
 * to read whole.
 */
export async function pooled<T, R>(
  entries: T[],
  limit: number,
  worker: (entry: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(entries.length);
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, entries.length) },
    async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= entries.length) return;
        results[index] = await worker(entries[index]!);
      }
    },
  );
  await Promise.all(lanes);
  return results;
}

/**
 * ROADMAP 0.14 — THE ROUND CONSUMES THE RAIL READ (2026-08-24).
 *
 * Until this date the census scored every door with `runChecks` alone,
 * which is synchronous and offline by design so CI can aim it at this
 * store's own 402 on every build. The Solana receivability read needs
 * the network, so it was built to live outside that battery — correct
 * reasoning whose consequence was never followed through. The result
 * was two of our own surfaces contradicting each other in public: the
 * corpus published `ready` for a door `/api/preflight/v2` published
 * `not_ready`, because its payTo owned no USDC token account.
 *
 * That the wrong one was the SIGNED, hash-chained, anchored artifact
 * is what made it worth stopping for. An observatory that anchors a
 * false verdict has published a durable lie with a proof of authorship
 * attached.
 *
 * `runChecks` already handed back `accepts` for exactly this caller.
 * The seam existed; nothing was plugged into it.
 *
 * THREE OUTCOMES, AND THE THIRD IS THE POINT. Cannot receive is a
 * FAILURE. Can receive is a pass. Could not read the ledger is OUR
 * GAP, recorded as an advisory and never folded into the verdict — a
 * missing answer rendered as a clean one is the defect this item
 * exists to remove. The RPC path already falls back four deep
 * (SOLANA_RPC_URL, PublicNode, dRPC, mainnet-beta), so that branch is
 * rare. Rare is not never.
 */
export async function probeHost(
  env: Env,
  url: string,
): Promise<Omit<WardHostResult, "host" | "url">> {
  try {
    /*
     * 3.1: the probe times itself. Not writing the number down was
     * the one loss here that was pure carelessness — every other
     * dimension at least had a reason.
     */
    const startedAt = Date.now();
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      // The census knocks on strangers' doors weekly; since
      // 2026-08-11 the knock is signed (Web Bot Auth) where the
      // egress key allows, so a host reading its logs can verify who
      // asked rather than trust a spoofable user-agent string.
      headers: await webBotAuthHeaders(env, url, {
        Accept: "application/json",
      }),
    });
    /*
     * READ, NOT CANCELLED (1.2). This body used to be thrown away and
     * runChecks told `false` about truncation it could not have known.
     * The capture is bounded — a seller-chosen body cannot become an
     * unbounded allocation — and what it keeps is exactly what a
     * dispute needs: the challenge bytes and the body digest, signed.
     */
    const latencyMs = Date.now() - startedAt;
    // KeepingBody (the instrument audit, 2026-08-28): the battery and
    // the market desk read both offer placements; the text rides
    // beside the capture and never enters the signed row.
    const { evidence, bodyText } = await captureWatchEvidenceKeepingBody(response);
    const { checks, advisories, accepts, l3b } = runChecks(
      response,
      evidence.body_truncated,
      bodyText,
    );
    const failed = checks.filter((check) => !check.ok).map((check) => check.name);
    const advisoryNames = advisories.map((advisory) => advisory.name);

    /*
     * The one check in this battery that cannot be synchronous. It is
     * best-effort by construction: a throw here must not turn a door
     * we did reach into an `unreachable`, because that would book our
     * own RPC trouble as the subject's outage.
     */
    const rail = accepts
      ? await checkRailReceivable(env, accepts).catch(() => ({
          check: null,
          advisory: {
            name: "solana-rail-unread",
            detail:
              "the Solana rail read did not complete, so whether that payTo can be credited is unknown. Our gap, not a finding about this endpoint.",
          },
        }))
      : { check: null, advisory: null };

    if (rail.check && !rail.check.ok) failed.push(rail.check.name);
    if (rail.advisory) advisoryNames.push(rail.advisory.name);

    /*
     * 2.5: the L3b consistency trio, folded because the citation says
     * v2 and v2 folds it. A door whose payTo is an unresolvable name,
     * whose amount carries a decimal point, or whose network is a
     * testnet is not ready by any reading a buyer would accept — and
     * until today this round called such doors ready and the free
     * preflight called them not_ready, about the same door, on the
     * same day, in public.
     */
    for (const check of l3b ?? []) {
      if (!check.ok) failed.push(check.name);
    }

    // The market desk keeps what this fetch already paid for — both
    // placements of it, since 2026-08-28.
    const offer = offerFacts(response, bodyText);
    return {
      verdict: failed.length === 0 ? "ready" : "not_ready",
      failed,
      advisories: advisoryNames,
      ...(offer ? { offer } : {}),
      evidence,
      signer_kids: signerKidsFromChallenge(evidence.challenge_bytes),
      latency_ms: latencyMs,
      battery: CENSUS_BATTERY,
    };
  } catch {
    /*
     * 3.4/B6: the moment we could not reach them is the moment to ask
     * whether we could reach anything. Rail reads already refused to
     * book our RPC trouble as the subject's outage (the advisory
     * above); the outer catch was the last place our blindness still
     * billed to somebody else's uptime.
     */
    return {
      verdict: "unreachable",
      failed: [],
      advisories: [],
      observer_status: await readObserverStatus(env),
    };
  }
}

const LEADERBOARD_URL = "https://agent402.tools/api/leaderboard";

export interface LeaderboardRead {
  sellers: number;
  window: string;
  ourRank: number | null;
  /** host -> claim + example origin URL, for probing and labeling. */
  byHost: Map<string, { url: string; claim: WardVolumeClaim }>;
}

/**
 * Shape verified against a live response 2026-08-04 (spec
 * "x402-leaderboard/1"): rows carry name, origins[], rank,
 * callsSettled, totalUsd, uniqueBuyers; top-level windowServed admits
 * when the cache served a wider window than asked. Pure so tests can
 * feed it captured bodies.
 */
export function mapLeaderboard(
  body: unknown,
  ownHost: string,
): LeaderboardRead | null {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)["spec"] !== "string" ||
    !String((body as Record<string, unknown>)["spec"]).startsWith(
      "x402-leaderboard/",
    )
  ) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const rows = Array.isArray(record["leaderboard"])
    ? (record["leaderboard"] as Record<string, unknown>[])
    : [];
  const window = String(record["windowServed"] ?? record["windowLabel"] ?? "?");
  const byHost = new Map<string, { url: string; claim: WardVolumeClaim }>();
  let ourRank: number | null = null;
  for (const row of rows) {
    const origins = Array.isArray(row["origins"]) ? row["origins"] : [];
    const claim: WardVolumeClaim = {
      calls: Number(row["callsSettled"] ?? 0),
      usd: Number(row["totalUsd"] ?? 0),
      unique_buyers: Number(row["uniqueBuyers"] ?? 0),
      window,
      source: "agent402.tools",
    };
    /**
     * ONE ORIGIN PER SELLER (the first round's other lesson): rows
     * list every origin a seller ever settled from — Vercel preview
     * deploys, a ninety-subdomain farm — all sharing one claim.
     * Walking them all repeated the same claim ninety times and told
     * us nothing the first origin didn't. Our own host anywhere in
     * the row still claims the rank.
     */
    let taken = false;
    for (const origin of origins) {
      if (typeof origin !== "string" || !origin.startsWith("https://")) {
        continue;
      }
      let host: string;
      try {
        host = new URL(origin).host.toLowerCase();
      } catch {
        continue;
      }
      if (host === ownHost) {
        ourRank = typeof row["rank"] === "number" ? row["rank"] : ourRank;
        continue;
      }
      if (!taken && !byHost.has(host)) {
        byHost.set(host, { url: origin, claim });
        taken = true;
      }
    }
  }
  return {
    sellers: Number(record["totalSellers"] ?? rows.length),
    window,
    ourRank,
    byHost,
  };
}

/** Best-effort read; an unreachable feed is null, never an empty world. */
export async function readAgent402Leaderboard(
  ownHost: string,
): Promise<LeaderboardRead | null> {
  try {
    const response = await fetch(LEADERBOARD_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return mapLeaderboard(await response.json(), ownHost);
  } catch {
    return null;
  }
}

/** Search decides presence; a list miss says nothing (bazaar-check's law). */
async function ourSearchPresence(env: Env): Promise<boolean | null> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  try {
    const body = (await cdpGet(
      env,
      SEARCH_PATH,
      `?query=${encodeURIComponent(ownHost)}`,
    )) as Record<string, unknown>;
    const text = JSON.stringify(body).toLowerCase();
    return text.includes(ownHost);
  } catch {
    // An unreadable search is "could not check", never "absent".
    return null;
  }
}

/**
 * The shared tail of every round, walked or one-shot: the coverage
 * drop check, the KV writes, and the one alarm. Extracted 2026-08-19
 * so the two paths cannot drift on how a round is sealed.
 */
async function sealRound(
  env: Env,
  round: WardRound,
  walked: number,
  presence: boolean | null,
  discoveryFieldsSeen?: string[],
): Promise<WardRound> {
  // The market desk's block rides every sealed round: plain
  // arithmetic over the round's own rows, recomputable by anyone.
  round.market = marketAggregates(round.hosts, discoveryFieldsSeen);
  const previous = await latestWardRound(env);
  /**
   * COVERAGE DROP, said out loud (2026-08-05: the keeper caught a
   * round of ~100 hosts shrinking to 38 by memory — a page's job,
   * not his). If this round probed less than 60% of what the last
   * one did, the round records the drop so the page can lead with
   * it: week-over-week comparisons are unsafe until coverage is
   * back, and the likely cause is the list feed changing shape.
   */
  const previousProbed = previous
    ? previous.hosts.filter((h) => h.verdict !== "not_probed").length
    : 0;
  if (previousProbed >= 10 && walked < previousProbed * 0.6) {
    round.coverage_drop = {
      previous_hosts: previousProbed,
      this_round: walked,
      previous_at: previous?.at ?? "",
    };
  }
  await kvPut(env.COUNTERS, KV_KEYS.wardRound(round.week), JSON.stringify(round));
  await kvPut(env.COUNTERS, KV_KEYS.wardRoundLatest, JSON.stringify(round));
  if (previous && previous.week !== round.week) {
    await kvPut(env.COUNTERS, 
      KV_KEYS.wardRoundPrevious,
      JSON.stringify(previous),
    );
  }
  /**
   * The one alarm: WE fell out of the search index. Everything else
   * on the round is a reading for the keeper's eyes on his own time;
   * this one is a channel dying with no symptom anywhere else.
   */
  if (presence === false) {
    await sendAlert(env, {
      condition: "worker_health",
      detail:
        "The ward round could not find this store in the CDP discovery SEARCH index. Search is the authoritative surface — if this repeats next week, the Bazaar channel is quietly gone. Check /admin/ward and re-run bazaar:check by hand.",
    }).catch(() => undefined);
  }
  return round;
}

/**
 * ASSEMBLE FROM THE LONG WALK: the week's hourly batches already
 * knocked on every door the roster froze; this collects their
 * verdicts into a round, takes the census and the presence check
 * fresh (those are about NOW, not about the week), and seals. No
 * probe fires here — assembling is not walking, and a host the walk
 * visited Tuesday is not visited again on Sunday.
 */
async function assembleWalkRound(
  env: Env,
  walk: import("@/services/long-walk").LongWalkState,
): Promise<WardRound> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const presence = await ourSearchPresence(env);
  const walked = walk.results.filter(
    (entry) => entry.verdict !== "not_probed",
  ).length;
  const fuchssHosts = await readFuchssProviders(ownHost);
  const sources: SourceResult[] = [
    {
      source: "discovery",
      // Same law as the one-shot path: a page-capped listing is
      // UNREADABLE to the census, not a short answer.
      hosts: walk.coverage_suspect
        ? null
        : walk.roster.map((entry) => entry.host),
    },
    { source: "leaderboard", hosts: walk.leaderboard?.hosts ?? null },
    { source: "fuchss", hosts: fuchssHosts },
  ];
  const population = await takeCensus(env, sources, walked).catch(() => null);
  const round: WardRound = {
    week: walk.week,
    at: new Date().toISOString(),
    listed_resources: walk.listed_resources,
    coverage_suspect: walk.coverage_suspect,
    ...(walk.pagination_shape
      ? { pagination_shape: walk.pagination_shape }
      : {}),
    // The tail the week never reached is the cap that bound here.
    capped: walk.cursor < walk.roster.length,
    our_search_presence: presence,
    leaderboard_sellers: walk.leaderboard ? walk.leaderboard.sellers : null,
    leaderboard_window: walk.leaderboard ? walk.leaderboard.window : null,
    our_leaderboard_rank: walk.leaderboard ? walk.leaderboard.our_rank : null,
    ...(population ? { population } : {}),
    directories_unread: [...UNREAD_DIRECTORIES],
    walk: {
      roster: walk.roster.length,
      walked,
      batches: walk.batches,
      started_at: walk.started_at,
    },
    hosts: walk.results,
  };
  return sealRound(env, round, walked, presence, walk.discovery_fields_seen);
}

export async function runWardRound(env: Env): Promise<WardRound> {
  /**
   * THE LONG WALK TAKES PRECEDENCE (2026-08-19): if this week's
   * hourly batches have been walking, the round is an assembly of
   * their verdicts, not a second knock on every door. The one-shot
   * path below survives untouched for the weeks the walk has not
   * started (a fresh deploy, a broken feed at walk start) — a
   * missing walk degrades to the old behaviour, never to silence.
   */
  try {
    const { readLongWalk } = await import("@/services/long-walk");
    const walk = await readLongWalk(env);
    if (
      walk &&
      walk.week === currentWeekKey() &&
      walk.results.length > 0
    ) {
      return await assembleWalkRound(env, walk);
    }
  } catch {
    // The walk state being unreadable is not a reason to skip the
    // round; fall through to the one-shot.
  }
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const { hosts, listed, coverageSuspect, paginationShape, fieldsSeen } =
    await readDiscoveryList(env);
  /**
   * THE SECOND FEED (2026-08-04): the agent402 leaderboard, used for
   * POPULATION — a host it names that discovery does not is still a
   * live door worth a probe. Its volume figures ride each host as a
   * labeled claim, never as a ranking we repeat (see WardVolumeClaim
   * on why: ~98% of ecosystem volume measured non-organic).
   */
  const leaderboard = await readAgent402Leaderboard(ownHost);
  const discoveryHosts = new Set(hosts.map((entry) => entry.host));
  const probeList: { host: string; url: string; source: "discovery" | "leaderboard" | "both" }[] =
    hosts.map((entry) => ({
      ...entry,
      source: leaderboard?.byHost.has(entry.host) ? "both" : "discovery",
    }));
  if (leaderboard) {
    for (const [host, entry] of leaderboard.byHost) {
      if (!discoveryHosts.has(host)) {
        probeList.push({ host, url: entry.url, source: "leaderboard" });
      }
    }
  }
  const capped = probeList.length > WARD_CAP;
  /**
   * THE DOOR BANK FILL (2026-08-18, task #22): remember every door
   * discovery declared this round, then spend whatever the cap has
   * left over on re-probing banked doors the broken feed no longer
   * names. The 2026-W33 arithmetic that demanded it: 60 of 200 slots
   * used, coverage suspect, 0.7% of the known population walked. The
   * bank read/write is fenced so a KV hiccup degrades to today's
   * behaviour instead of taking the round down.
   */
  let revisits: { host: string; url: string }[] = [];
  let doorBankNote: { known: number; revisited: number; evicted?: number } | null =
    null;
  try {
    const { readDoorBank, writeDoorBank, mergeDoors, pickRevisits } =
      await import("@/services/door-bank");
    const merged = mergeDoors(
      await readDoorBank(env),
      hosts,
      currentWeekKey(),
    );
    const taken = new Set(probeList.map((entry) => entry.host));
    taken.add(ownHost);
    const slots = WARD_CAP - Math.min(probeList.length, WARD_CAP);
    const picked = pickRevisits(merged.bank, taken, slots);
    revisits = picked.picks;
    await writeDoorBank(env, { ...merged.bank, cursor: picked.cursor });
    doorBankNote = {
      known: Object.keys(merged.bank.doors).length,
      revisited: revisits.length,
      ...(merged.evicted ? { evicted: merged.evicted } : {}),
    };
  } catch {
    // No bank this round; the walk is what the feeds gave us.
  }
  const walkList: {
    host: string;
    url: string;
    source: "discovery" | "leaderboard" | "both" | "revisit";
  }[] = [
    ...probeList.slice(0, WARD_CAP),
    ...revisits.map((entry) => ({ ...entry, source: "revisit" as const })),
  ];
  const results = await pooled(walkList, PROBE_CONCURRENCY, async (entry) => {
    const claim = leaderboard?.byHost.get(entry.host)?.claim;
    // A leaderboard origin is a homepage, not a door — listed with
    // its claim, never knocked on for a 402 it was never built to give.
    const probe =
      entry.source === "leaderboard"
        ? { verdict: "not_probed" as const, failed: [], advisories: [] }
        : await probeHost(env, entry.url);
    return {
      host: entry.host,
      url: entry.url,
      source: entry.source,
      ...(claim ? { volume_claim: claim } : {}),
      ...probe,
    } satisfies WardHostResult;
  });
  const presence = await ourSearchPresence(env);
  const walked = results.filter((entry) => entry.verdict !== "not_probed").length;
  /**
   * THE CENSUS RIDES THE FEEDS THIS ROUND ALREADY READ — no extra
   * fetches, so counting the population costs nothing on top of
   * walking it.
   *
   * A discovery read that looked page-capped is handed over as
   * UNREADABLE rather than as a short answer. A truncated listing
   * cannot tell "gone" from "on page two", and writing that guess into
   * an append-only record is the exact failure the population layer
   * exists to refuse.
   *
   * The leaderboard contributes ONE host per seller, not per origin —
   * mapLeaderboard's deliberate choice, kept here. So this counts
   * sellers on that feed and hosts on discovery, which is the honest
   * reading of what each feed actually enumerates.
   */
  /**
   * THE WIDENING (2026-08-10, the keeper's ruling: every public
   * directory, uniform, no favourites). The fuchss provider directory
   * is the largest free full enumeration in the ecosystem (~10k
   * hosts), and it joins as POPULATION ONLY: it names hosts, not
   * resource URLs, and the leaderboard already taught this round what
   * probing a homepage for a 402 manufactures. Its hosts widen the
   * denominator; the probe list is untouched. The directories that
   * cannot be read ride the round beside it, with reasons — see
   * UNREAD_DIRECTORIES for why each one is named instead of read.
   */
  const fuchssHosts = await readFuchssProviders(ownHost);
  const sources: SourceResult[] = [
    {
      source: "discovery",
      hosts: coverageSuspect ? null : hosts.map((entry) => entry.host),
    },
    {
      source: "leaderboard",
      hosts: leaderboard ? [...leaderboard.byHost.keys()] : null,
    },
    { source: "fuchss", hosts: fuchssHosts },
  ];
  // The probe results are the expensive part of this round; a census
  // that cannot write must not take them down with it.
  const population = await takeCensus(env, sources, walked).catch(() => null);
  const round: WardRound = {
    week: currentWeekKey(),
    at: new Date().toISOString(),
    listed_resources: listed,
    coverage_suspect: coverageSuspect,
    ...(paginationShape ? { pagination_shape: paginationShape } : {}),
    ...(doorBankNote ? { door_bank: doorBankNote } : {}),
    capped,
    our_search_presence: presence,
    leaderboard_sellers: leaderboard ? leaderboard.sellers : null,
    leaderboard_window: leaderboard ? leaderboard.window : null,
    our_leaderboard_rank: leaderboard ? leaderboard.ourRank : null,
    ...(population ? { population } : {}),
    directories_unread: [...UNREAD_DIRECTORIES],
    hosts: results,
  };
  return sealRound(env, round, walked, presence, fieldsSeen);
}

export async function latestWardRound(env: Env): Promise<WardRound | null> {
  return kvGetJson<WardRound>(env.COUNTERS, KV_KEYS.wardRoundLatest, "json");
}

export async function previousWardRound(env: Env): Promise<WardRound | null> {
  return kvGetJson<WardRound>(env.COUNTERS, KV_KEYS.wardRoundPrevious, "json");
}

export function wardDelta(
  current: WardRound,
  previous: WardRound | null,
): WardDelta {
  if (!previous) {
    return {
      new_hosts: current.hosts
        .filter((entry) => entry.source !== "revisit")
        .map((entry) => entry.host),
      gone_hosts: [],
      newly_failing: [],
      newly_fixed: [],
      flappers: [],
    };
  }
  const before = new Map(previous.hosts.map((entry) => [entry.host, entry]));
  const after = new Map(current.hosts.map((entry) => [entry.host, entry]));
  /**
   * Presence is a LISTING question, so revisit rows sit it out: a
   * door bank re-probe proves our memory reaches back, not that a
   * directory listed or dropped anybody. Without this filter every
   * rotation slice would read as a wave of "new" hosts and the next
   * slice as them all "gone" — the instrument's own cursor motion
   * reported as the ecosystem churning.
   */
  const listedBefore = new Set(
    previous.hosts
      .filter((entry) => entry.source !== "revisit")
      .map((entry) => entry.host),
  );
  const listedAfter = new Set(
    current.hosts
      .filter((entry) => entry.source !== "revisit")
      .map((entry) => entry.host),
  );
  const delta: WardDelta = {
    new_hosts: [...listedAfter].filter((host) => !listedBefore.has(host)),
    gone_hosts: [...listedBefore].filter((host) => !listedAfter.has(host)),
    newly_failing: [],
    newly_fixed: [],
    flappers: [],
  };
  for (const [host, now] of after) {
    const was = before.get(host);
    if (!was) continue;
    // A host that was or is merely listed-not-probed has no verdict
    // to change; feeding those pairs into the delta would report the
    // instrument's coverage changing as the ecosystem changing.
    if (was.verdict === "not_probed" || now.verdict === "not_probed") {
      continue;
    }
    if (was.verdict !== now.verdict) {
      delta.flappers.push(host);
      if (now.verdict === "ready") {
        delta.newly_fixed.push(host);
      } else if (was.verdict === "ready") {
        delta.newly_failing.push(host);
      }
    }
  }
  return delta;
}
