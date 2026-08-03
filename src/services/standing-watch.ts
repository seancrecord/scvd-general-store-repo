import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { cachedPublicKeyHex, signMessage } from "@/lib/signing";
import { runChecks } from "@/services/preflight";
import type { Env } from "@/types";

/**
 * THE STANDING WATCH — seller-pays monitoring as an artifact, not as
 * infrastructure.
 *
 * WHY THIS EXISTS AND WHY THIS SHAPE. The buyer's-journey research
 * found the majority of one directory's x402 listings "listed but
 * functionally absent," and its top-ranked ask was a reliability
 * badge inside the directory's own UI. That form was DECLINED
 * (PROBLEMS.md, 2026-08-03): a scoring feed a directory renders is
 * uptime-critical infrastructure, scores strangers unasked, and
 * breaks an ecosystem when one keeper naps. THIS is the inversion
 * that survives every one of those objections: the SELLER buys a
 * watch on THEIR OWN endpoint. Same probes, inverted consent — no
 * defamation surface because they asked, and if the store stops, one
 * customer's history pauses; nobody's directory breaks. A thing sold,
 * not a dependency operated. phantom_check's grown-up sibling: one
 * look became a week of looks.
 *
 * WHAT A PROBE IS: the endpoint preflight's own checks
 * (services/preflight.ts — the same law the store's till lives
 * under), run hourly for seven days, each observation SIGNED
 * individually so any single row survives being quoted alone.
 *
 * THE GAPS ARE THE PRODUCT'S HONESTY (rule 5b). A missed cron tick is
 * OUR failure, and the history derives it rather than hiding it:
 * expected hours minus recorded probes, computed at read time so it
 * cannot be edited into politeness. A watch history that only showed
 * the probes that ran would be a green tick wearing a coverage it
 * does not have — the exact instrument-failure shape this store keeps
 * finding in its own tests.
 *
 * WHAT IT NEVER SAYS: anything about strangers. Every watch is on a
 * URL its buyer supplied about themselves; there is no leaderboard,
 * no ranking, no cross-customer comparison, and no probe of anybody
 * who did not pay to be probed.
 */

export const WATCH_DURATION_HOURS = 168;
export const WATCH_PROBE_TIMEOUT_MS = 8000;

/**
 * The cap on watches one sweep will even read. Far above plausible
 * sales; named so the day it binds, the sweep says so instead of
 * silently probing a subset (kv-list's law).
 */
const WATCH_SCAN_CAP = 500;

export interface WatchProbe {
  at: string;
  /** The preflight verdict this probe produced. */
  verdict: "ready" | "not_ready" | "unreachable";
  /** HTTP status seen, absent when unreachable. */
  status?: number;
  latency_ms?: number;
  /** Names of failed checks, empty when ready. */
  failed: string[];
  /** ed25519 over canonicalizeProbe(); each row quotable alone. */
  signature: string;
  public_key: string;
}

export interface StandingWatchRecord {
  watch_id: string;
  /** The buyer's own endpoint. Consent is the purchase itself. */
  url: string;
  started_at: string;
  ends_at: string;
  probes: WatchProbe[];
}

function newWatchId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `watch_${[...bytes].map((b) => b.toString(36)).join("").slice(0, 12)}`;
}

/** The exact bytes a probe signature covers. Order is the contract. */
export function canonicalizeProbe(
  watchId: string,
  url: string,
  probe: Pick<WatchProbe, "at" | "verdict" | "failed"> & {
    status?: number;
    latency_ms?: number;
  },
): string {
  return JSON.stringify({
    watch_id: watchId,
    url,
    at: probe.at,
    verdict: probe.verdict,
    status: probe.status ?? null,
    latency_ms: probe.latency_ms ?? null,
    failed: probe.failed,
  });
}

export async function startWatch(
  env: Env,
  url: string,
): Promise<{ record: StandingWatchRecord; historyUrl: string }> {
  const now = new Date();
  const record: StandingWatchRecord = {
    watch_id: newWatchId(),
    url,
    started_at: now.toISOString(),
    ends_at: new Date(
      now.getTime() + WATCH_DURATION_HOURS * 3600_000,
    ).toISOString(),
    probes: [],
  };
  await env.ORDERS.put(
    KV_KEYS.standingWatch(record.watch_id),
    JSON.stringify(record),
  );
  return {
    record,
    historyUrl: `${env.STORE_BASE_URL}/api/watch/${record.watch_id}`,
  };
}

/**
 * One probe, wearing the same guards every stranger-chosen fetch in
 * this store wears. The buyer named the URL at purchase, but a week
 * is long: the host can change hands, so the guards stay up on every
 * probe, not just the first.
 */
async function probeOnce(
  env: Env,
  record: StandingWatchRecord,
): Promise<WatchProbe> {
  const at = new Date().toISOString();
  const started = Date.now();
  let verdict: WatchProbe["verdict"];
  let status: number | undefined;
  let latency: number | undefined;
  let failed: string[] = [];
  try {
    const response = await fetch(record.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(WATCH_PROBE_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    latency = Date.now() - started;
    status = response.status;
    // Headers and status are the whole read; drop the body stream.
    await response.body?.cancel().catch(() => undefined);
    const { checks } = runChecks(response, false);
    failed = checks.filter((check) => !check.ok).map((check) => check.name);
    verdict = failed.length === 0 ? "ready" : "not_ready";
  } catch {
    verdict = "unreachable";
  }
  const body: Pick<WatchProbe, "at" | "verdict" | "failed"> & {
    status?: number;
    latency_ms?: number;
  } = { at, verdict, failed };
  if (status !== undefined) {
    body.status = status;
  }
  if (latency !== undefined) {
    body.latency_ms = latency;
  }
  const { signature } = await signMessage(
    canonicalizeProbe(record.watch_id, record.url, body),
    env.SIGNING_KEY,
  );
  return {
    ...body,
    signature,
    public_key: await cachedPublicKeyHex(env.SIGNING_KEY),
  };
}

/**
 * The hourly walk. One probe per active watch per tick, at most —
 * the 55-minute floor keeps a doubled cron tick from double-billing
 * the hour, and an ended watch is left exactly as it finished.
 */
export async function sweepStandingWatches(env: Env): Promise<number> {
  const listed = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.standingWatchPrefix,
    cap: WATCH_SCAN_CAP,
  });
  const rows = await bulkGetJson<StandingWatchRecord>(env.ORDERS, listed.names);
  const now = Date.now();
  let probed = 0;
  for (const name of listed.names) {
    const record = rows.get(name) ?? null;
    if (!record || now > Date.parse(record.ends_at)) {
      continue;
    }
    const last = record.probes[record.probes.length - 1];
    if (last && now - Date.parse(last.at) < 55 * 60_000) {
      continue;
    }
    record.probes.push(await probeOnce(env, record));
    await env.ORDERS.put(name, JSON.stringify(record));
    probed += 1;
  }
  return probed;
}

export interface WatchHistory {
  watch_id: string;
  url: string;
  started_at: string;
  ends_at: string;
  complete: boolean;
  summary: {
    hours_elapsed: number;
    probes_recorded: number;
    /**
     * Elapsed hours nobody probed. OUR gaps — a missed cron is the
     * store's failure and it is derived here at read time, never
     * stored, so it cannot be quietly edited down.
     */
    hours_unprobed: number;
    ready: number;
    not_ready: number;
    unreachable: number;
  };
  probes: WatchProbe[];
  how_to_verify: string;
  what_this_is_not: string;
}

export async function readWatch(
  env: Env,
  watchId: string,
): Promise<WatchHistory | null> {
  const record = await env.ORDERS.get<StandingWatchRecord>(
    KV_KEYS.standingWatch(watchId),
    "json",
  );
  if (!record) {
    return null;
  }
  const now = Date.now();
  const end = Math.min(now, Date.parse(record.ends_at));
  const hoursElapsed = Math.max(
    0,
    Math.floor((end - Date.parse(record.started_at)) / 3600_000),
  );
  const tally = { ready: 0, not_ready: 0, unreachable: 0 };
  for (const probe of record.probes) {
    tally[probe.verdict] += 1;
  }
  return {
    watch_id: record.watch_id,
    url: record.url,
    started_at: record.started_at,
    ends_at: record.ends_at,
    complete: now > Date.parse(record.ends_at),
    summary: {
      hours_elapsed: hoursElapsed,
      probes_recorded: record.probes.length,
      hours_unprobed: Math.max(0, hoursElapsed - record.probes.length),
      ...tally,
    },
    probes: record.probes,
    how_to_verify:
      "Each probe row is signed on its own: ed25519_verify over JSON with keys watch_id, url, at, verdict, status, latency_ms, failed (exactly that order, null for absent numbers) against the row's public_key. A single row survives being quoted alone; the key's continuity policy is at /.well-known/scvd-signing-key.",
    what_this_is_not:
      "Not a ranking, not a directory badge, not a claim about anyone but the endpoint its buyer asked us to watch. hours_unprobed counts the hours WE missed — our gaps, stated, because a history that hides the watcher's absences is vouching for hours nobody watched.",
  };
}
