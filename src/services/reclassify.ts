import { inferChannel } from "@/lib/channel";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

/**
 * THE STANDING CORRECTION — how much of the recorded organic column is
 * machinery, computed over the WHOLE month rather than a window.
 *
 * WHY THE RECOUNT PAGE COULD NOT DO THIS. /admin/recount scans newest
 * -first and stops at a cap, because it runs inside a page load and a
 * page that times out is worse than a page that says how far it got.
 * That makes its figure a window, not a month — which is exactly the
 * mismatch that had it accusing a counter of drifting when the counter
 * was fine. A correction published from a capped scan would be a NEW
 * wrong number wearing a correction's authority, which is worse than
 * the number it replaced.
 *
 * SO THE WALK MOVED TO THE CLOCK. Nothing renders while this runs, so
 * it can read every row there is. bulkGetJson fetches 100 keys per
 * subrequest, so twenty thousand rows cost about two hundred — well
 * inside the budget of a scheduled invocation.
 *
 * WHY IT RECURS INSTEAD OF RUNNING ONCE. The fix for a stale number is
 * never "run the script and move on"; that is how three weeks pass and
 * a new pile of rows nobody re-walked is sitting there. The crawler
 * table gains entries — that is the whole point of it — and every
 * entry retroactively changes what old rows mean. A correction that
 * only knows about the table as it stood the day somebody ran a script
 * is a correction with an expiry date nobody wrote down.
 *
 * WHAT IT CANNOT SEE, stated because the number is published: rows
 * classified as infrastructure AT WRITE TIME carry no row at all (the
 * infrastructure diet), so this walk can only find machinery that was
 * recorded as organic and is known to be machinery TODAY. A crawler
 * nobody has identified yet is invisible here exactly as it is
 * invisible everywhere else, and the corrected figure is therefore an
 * upper bound on organic rather than a certified one.
 *
 * TIME-SENSITIVE BY CONSTRUCTION. Event rows carry a 90-day TTL. Every
 * row this correction depends on ages out eventually, and once it does
 * the exact figure stops being computable for that month — the caveat
 * becomes the only honest option. Running on the clock is what keeps
 * the answer from expiring quietly.
 */

/** Bounded far above any real month, so a runaway list cannot spin. */
const MAX_PAGES = 200;
const LIST_PAGE = 1000;

export interface MonthCorrection {
  month: string;
  /** Challenge rows the books recorded as organic. */
  recorded_organic: number;
  /** The same rows, re-read with today's crawler table. */
  corrected_organic: number;
  /** recorded − corrected: rows that were machinery all along. */
  moved_to_infrastructure: number;
  /** The user-agents behind the move, commonest first. */
  movers: { user_agent: string; rows: number }[];
  /** Rows read for this month. */
  rows_read: number;
  /** ISO timestamp of the walk that produced this. */
  computed_at: string;
  /**
   * False when the walk stopped early. A partial correction is never
   * published as a correction — this is the flag that decides.
   */
  complete: boolean;
}

/**
 * ONE DOCUMENT FOR EVERY MONTH, not one key per month.
 *
 * The first draft wrote a key per month inside a loop and the
 * scalability audit caught it — correctly, even though the loop is
 * bounded by months-since-opening and could never be large. Fixing it
 * rather than raising the budget turned out to be the better design
 * anyway: /pulse reads this ONCE for the whole trailing window instead
 * of once per month in a loop of its own, so the public endpoint got
 * cheaper as a side effect of satisfying a guard about writes.
 */
const CORRECTIONS_KEY = "metric:corrections";

export interface CorrectionSet {
  computed_at: string;
  /** ISO month -> correction. */
  months: Record<string, MonthCorrection>;
}

/** Every stored correction, one read. Null before the first walk. */
export async function readCorrections(
  env: Env,
): Promise<CorrectionSet | null> {
  return env.COUNTERS.get<CorrectionSet>(CORRECTIONS_KEY, "json");
}

/** The stored correction for one month, or null if none exists yet. */
export async function readCorrection(
  env: Env,
  month: string,
): Promise<MonthCorrection | null> {
  const set = await readCorrections(env);
  return set?.months[month] ?? null;
}

/**
 * Walks every event row, groups by month, and stores one correction
 * per month. Returns what it wrote, newest month first.
 */
export async function recomputeCorrections(
  env: Env,
  now: Date = new Date(),
): Promise<MonthCorrection[]> {
  const months = new Map<
    string,
    {
      recorded: number;
      corrected: number;
      rows: number;
      movers: Map<string, number>;
    }
  >();

  let cursor: string | undefined;
  let pages = 0;
  let complete = false;
  while (pages < MAX_PAGES) {
    const listed = await env.COUNTERS.list({
      prefix: "evt:",
      limit: LIST_PAGE,
      ...(cursor ? { cursor } : {}),
    });
    pages += 1;
    const names = listed.keys.map((k) => k.name);
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      const event = values.get(name);
      if (!event || event.kind !== "challenge" || event.house) {
        continue;
      }
      const month = event.at.slice(0, 7);
      const bucket = months.get(month) ?? {
        recorded: 0,
        corrected: 0,
        rows: 0,
        movers: new Map<string, number>(),
      };
      bucket.rows += 1;
      // Only rows the books CALLED organic are in scope: this measures
      // the organic column, and a row already filed as machinery was
      // never in the number being corrected.
      if (event.channel !== "infrastructure") {
        bucket.recorded += 1;
        const today = inferChannel({
          userAgent: event.user_agent,
          referrer: event.referrer,
          declaredSource: event.declared_source,
        });
        if (today === "infrastructure") {
          const ua = event.user_agent ?? "(no user-agent)";
          bucket.movers.set(ua, (bucket.movers.get(ua) ?? 0) + 1);
        } else {
          bucket.corrected += 1;
        }
      }
      months.set(month, bucket);
    }
    if (listed.list_complete) {
      complete = true;
      break;
    }
    cursor = listed.cursor;
  }

  const computedAt = now.toISOString();
  const written: MonthCorrection[] = [];
  const set: CorrectionSet = { computed_at: computedAt, months: {} };
  for (const [month, bucket] of months) {
    const correction: MonthCorrection = {
      month,
      recorded_organic: bucket.recorded,
      corrected_organic: bucket.corrected,
      moved_to_infrastructure: bucket.recorded - bucket.corrected,
      movers: [...bucket.movers.entries()]
        .map(([user_agent, rows]) => ({ user_agent, rows }))
        .sort((a, b) => b.rows - a.rows)
        .slice(0, 10),
      rows_read: bucket.rows,
      computed_at: computedAt,
      complete,
    };
    set.months[month] = correction;
    written.push(correction);
  }
  // One write, outside the loop: the whole set at once.
  await env.COUNTERS.put(CORRECTIONS_KEY, JSON.stringify(set));
  return written.sort((a, b) => b.month.localeCompare(a.month));
}


/**
 * HOUSE RECLASSIFICATION — the correction mechanism for family money
 * that booked as organic, built 2026-08-04 after the cross-model UX
 * walkers spent ~19 settles from unlisted test wallets and the
 * store's proudest number (organic settlements, honestly 3) read 22.
 *
 * Same rules as every correction here: raw counters are NEVER edited
 * (the adjustment rides beside them and computeStats applies it at
 * read — an edited counter is an erasure, an adjustment row is a
 * record); the lever refuses any address not already in
 * house-wallets.json (family is the register's word to give); the
 * snapshot freezes the payer's settle count at reclassification time
 * (purchases after listing book house at the till, so a live count
 * would double-correct); and it publishes — in the stats field it
 * creates and in /corrections prose. A correction nobody can see is
 * an edit wearing a correction's name.
 */

export interface HouseReclassification {
  address: string;
  /** Settles reclassified: the payer's count frozen at this moment. */
  settles: number;
  at: string;
  reason: string;
}

const RECLASS_PREFIX = "house_reclass:";
const RECLASS_CAP = 100;

/**
 * THE EXPLICIT COUNT, added the day the first manifest arrived and
 * before the lever ever ran: the original design froze the payer's
 * ENTIRE purchase count, which is correct for a never-listed walker
 * (every settle misbooked) and catastrophically wrong for a wallet
 * like CV's — listed for weeks, dozens of settles correctly booked
 * house at the till. Reclassifying that wallet would have subtracted
 * its whole history from organic. The rows do not carry payers, so
 * the split cannot be derived; the keeper states the misbooked count
 * explicitly, the payer record caps it, and the number is in the
 * frozen row for anyone to audit against the manifest.
 */
export async function reclassifyHousePayer(
  env: Env,
  rawAddress: string,
  reason: string,
  explicitSettles?: number,
): Promise<
  | { ok: true; record: HouseReclassification }
  | { ok: false; refusal: string }
> {
  const { isHouseWallet } = await import("@/lib/channel");
  const { KV_KEYS } = await import("@/lib/kv-keys");
  const address = String(rawAddress ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return { ok: false, refusal: "That is not a full 0x address." };
  }
  if (!isHouseWallet(env, address)) {
    return {
      ok: false,
      refusal:
        "This wallet is not in house-wallets.json. List it there FIRST — reclassification records that family money was misbooked, and family is the register's word to give, not this lever's.",
    };
  }
  const key = `${RECLASS_PREFIX}${address}`;
  if (await env.COUNTERS.get(key)) {
    return {
      ok: false,
      refusal:
        "Already reclassified. The snapshot is frozen on purpose — purchases after listing book house at the till, and correcting twice is over-correcting.",
    };
  }
  const payer = await env.COUNTERS.get<import("@/types").PayerRecord>(
    KV_KEYS.payer(address),
    "json",
  );
  if (!payer || payer.purchases === 0) {
    return {
      ok: false,
      refusal:
        "No payer record for this address — nothing was booked, so there is nothing to reclassify.",
    };
  }
  const settles = explicitSettles ?? payer.purchases;
  if (!Number.isInteger(settles) || settles <= 0) {
    return { ok: false, refusal: "settles must be a positive integer." };
  }
  if (settles > payer.purchases) {
    return {
      ok: false,
      refusal: `The payer record shows ${payer.purchases} total purchases; reclassifying ${settles} would correct more than ever happened.`,
    };
  }
  const record: HouseReclassification = {
    address,
    settles,
    at: new Date().toISOString(),
    reason: reason.trim() || "family wallet misbooked organic before listing",
  };
  await env.COUNTERS.put(key, JSON.stringify(record));
  return { ok: true, record };
}

export async function listReclassifications(
  env: Env,
): Promise<HouseReclassification[]> {
  const { listKeys } = await import("@/lib/kv-list");
  const listed = await listKeys(env.COUNTERS, {
    prefix: RECLASS_PREFIX,
    cap: RECLASS_CAP,
  });
  const rows = await bulkGetJson<HouseReclassification>(
    env.COUNTERS,
    listed.names,
  );
  return listed.names
    .map((name) => rows.get(name))
    .filter((row): row is HouseReclassification => Boolean(row));
}

/** The total computeStats subtracts from organic and adds to house. */
export async function totalReclassified(env: Env): Promise<number> {
  const rows = await listReclassifications(env);
  return rows.reduce((sum, row) => sum + row.settles, 0);
}

export interface MonthReclassAdjustment {
  settles: number;
  usdc: number;
}

/**
 * THE MONTH LINE'S SHARE OF THE CORRECTION, derived from certificates.
 *
 * The ledger rows freeze a COUNT per wallet and nothing else — no
 * dollars, no dates — because that is all the lever needed. But the
 * office's "month so far" line reads the raw monthly counters, which
 * still carry the misbooked settles as organic revenue in whatever
 * month they landed. The honest source for the split is the artifacts
 * themselves: every paid certificate names its payer, its date, and
 * its settled amount. A reclassified wallet's misbooked settles are
 * its EARLIEST ones (the listing postdates them by construction —
 * purchases after listing book house at the till and were never in
 * the correction), so: take each reclassified wallet's certs oldest
 * first, count off the frozen number, and group what they paid by
 * month. Applied at read, beside the raw counters, like every other
 * correction in this file.
 *
 * Bounded by the same cap as the chain reconciliation's cert scan; if
 * the shelf ever outgrows it, the walk truncates VISIBLY via the
 * returned flag rather than quietly under-adjusting.
 */
export async function monthReclassAdjustments(
  env: Env,
): Promise<{ months: Record<string, MonthReclassAdjustment>; truncated: boolean }> {
  const rows = await listReclassifications(env);
  const months: Record<string, MonthReclassAdjustment> = {};
  if (rows.length === 0) {
    return { months, truncated: false };
  }
  const { listKeys } = await import("@/lib/kv-list");
  const { KV_KEYS } = await import("@/lib/kv-keys");
  const CAP = 2000;
  const listed = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.certPrefix,
    cap: CAP,
  });
  const values = await bulkGetJson<import("@/types").CertificateRecord>(
    env.PATRONS,
    listed.names,
  );
  const byPayer = new Map<
    string,
    { date: string; usdc: number }[]
  >();
  for (const record of values.values()) {
    const cert = record?.certificate;
    const payer = cert?.payer?.toLowerCase();
    if (!cert || !payer) continue;
    const bucket = byPayer.get(payer) ?? [];
    bucket.push({ date: cert.date, usdc: cert.paid_usdc ?? 0 });
    byPayer.set(payer, bucket);
  }
  for (const row of rows) {
    const certs = (byPayer.get(row.address) ?? []).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    for (const cert of certs.slice(0, row.settles)) {
      const month = cert.date.slice(0, 7);
      const entry = months[month] ?? { settles: 0, usdc: 0 };
      entry.settles += 1;
      entry.usdc += cert.usdc;
      months[month] = entry;
    }
  }
  return { months, truncated: listed.names.length >= CAP };
}
