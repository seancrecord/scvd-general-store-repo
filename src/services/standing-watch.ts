import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { listKeys } from "@/lib/kv-list";
import { cachedPublicKeyHex, signMessage } from "@/lib/signing";
import { PREFLIGHT_BATTERY, runChecks } from "@/services/preflight";
import { checkProbeTarget } from "@/lib/probe-target";
import { webBotAuthHeaders } from "@/lib/web-bot-auth";
import { sweepWatches } from "@/services/watch-sweep";
import {
  captureWatchEvidence,
  type WatchEvidenceCapture,
} from "@/services/watch-evidence";
import { WHO_PAYS_AND_WHAT_IT_BUYS } from "@/store/copy/who-pays";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

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

/**
 * The one token that marks a row this store declined to dial. Inside
 * `failed`, which the signature covers, so the refusal cannot be
 * edited off the record without breaking the row.
 */
export const REFUSED_CHECK = "probe-target-refused";

export interface WatchProbe {
  at: string;
  /**
   * The preflight verdict this probe produced.
   *
   * `refused` is OURS, not theirs: the target failed this store's own
   * probe-target law (private, loopback, link-local, reserved-internal)
   * so no request was made. Recording that as `unreachable` would print
   * our policy as a fact about somebody's endpoint.
   */
  verdict: "ready" | "not_ready" | "unreachable" | "refused";
  /** HTTP status seen, absent when unreachable or refused. */
  status?: number;
  latency_ms?: number;
  /**
   * WHICH BATTERY PRODUCED THE VERDICT (roadmap 1.3, ledger D6),
   * inside the signed bytes. Absent on legacy rows and on rows where
   * no battery ran — an unreachable door was never checked, and
   * citing a battery that did not run is the same lie as hashing a
   * body we did not finish reading.
   */
  battery?: string;
  /** Names of failed checks, empty when ready. */
  failed: string[];
  /**
   * The response material this verdict came from. Absent only on
   * legacy rows and refused rows where this store made no request.
   */
  evidence?: WatchEvidenceCapture;
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
  /**
   * THE WALLET THAT PAID, so a lost watch id can be recovered by
   * proving you hold it — the claims door's whole purpose, and the
   * one record it could not reach until 2026-08-21.
   *
   * CV found this the expensive way: the watch id lives in the
   * purchase RESPONSE and nowhere else, the certificate does not name
   * it, and the store's own shopping run keeps the receipt but not
   * the body. So the only recovery path for a lost id was to buy the
   * watch a second time, which he did. A watch is seven days of
   * value delivered after the response is gone — precisely the
   * purchase most likely to outlive the context that made it.
   *
   * Absent on watches opened before this field existed; the claims
   * door says so rather than pretending they were never bought.
   */
  payer?: string;
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
  probe: Pick<WatchProbe, "at" | "verdict" | "failed" | "evidence" | "battery"> & {
    status?: number;
    latency_ms?: number;
  },
): string {
  const payload: Record<string, unknown> = {
    watch_id: watchId,
    url,
    at: probe.at,
    verdict: probe.verdict,
    status: probe.status ?? null,
    latency_ms: probe.latency_ms ?? null,
    failed: probe.failed,
  };
  // Legacy rows have no evidence or battery field and keep their
  // exact original preimage. New rows append both inside the signed
  // bytes, in this order — the order is the contract.
  if (probe.evidence) payload["evidence"] = probe.evidence;
  if (probe.battery) payload["battery"] = probe.battery;
  return JSON.stringify(payload);
}

export async function startWatch(
  env: Env,
  url: string,
  payer?: string,
): Promise<{ record: StandingWatchRecord; historyUrl: string }> {
  const now = new Date();
  const record: StandingWatchRecord = {
    watch_id: newWatchId(),
    url,
    started_at: now.toISOString(),
    ends_at: new Date(
      now.getTime() + WATCH_DURATION_HOURS * 3600_000,
    ).toISOString(),
    ...(payer ? { payer: payer.toLowerCase() } : {}),
    probes: [],
  };
  await kvPut(env.ORDERS, 
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
  let evidence: WatchEvidenceCapture | undefined;
  /*
   * THE COMMENT ABOVE USED TO BE FALSE. It promised "the guards stay
   * up on every probe, not just the first" while this function called
   * fetch straight on the stored URL with no check at all — the whole
   * guard lived at the purchase door, and that door was the weakest of
   * the three (no port check, no private-address check). A week-old
   * watch bought before this law existed would still be dialled.
   */
  const target = checkProbeTarget(new URL(record.url), "");
  if (!target.ok) {
    /*
     * THE REASON GOES IN `failed`, WHICH IS SIGNED — not into a new
     * field beside it. canonicalizeProbe's field order IS the contract
     * a verifier reproduces, so adding a key would change the bytes for
     * every row ever signed and invalidate the lot. A published field
     * outside the signature would be worse still: alterable without
     * breaking anything. One stable token, inside the signed set; the
     * prose behind it lives in lib/probe-target.ts, which is public.
     */
    const refusedBody = {
      at,
      verdict: "refused" as const,
      failed: [REFUSED_CHECK],
    };
    const { signature: refusedSignature } = await signMessage(
      canonicalizeProbe(record.watch_id, record.url, refusedBody),
      env.SIGNING_KEY,
    );
    return {
      ...refusedBody,
      signature: refusedSignature,
      public_key: await cachedPublicKeyHex(env.SIGNING_KEY),
    };
  }
  try {
    const response = await fetch(record.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(WATCH_PROBE_TIMEOUT_MS),
      // Identity, signed where the egress key allows (Web Bot Auth):
      // the party being watched consented to the watching, and the
      // least we owe them is a probe they can attribute and verify.
      headers: await webBotAuthHeaders(env, record.url, {
        Accept: "application/json",
      }),
    });
    latency = Date.now() - started;
    status = response.status;
    evidence = await captureWatchEvidence(response);
    const { checks } = runChecks(response, evidence.body_truncated);
    failed = checks.filter((check) => !check.ok).map((check) => check.name);
    verdict = failed.length === 0 ? "ready" : "not_ready";
  } catch {
    verdict = "unreachable";
  }
  const body: Pick<
    WatchProbe,
    "at" | "verdict" | "failed" | "evidence" | "battery"
  > & {
    status?: number;
    latency_ms?: number;
  } = { at, verdict, failed };
  if (status !== undefined) {
    body.status = status;
  }
  if (latency !== undefined) {
    body.latency_ms = latency;
  }
  if (evidence) {
    body.evidence = evidence;
    // Evidence exists exactly when the response arrived, which is
    // exactly when the battery ran. One condition, two facts.
    body.battery = PREFLIGHT_BATTERY;
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
 * the hour, and an ended watch is left exactly as it finished. The
 * walk itself is the store's one shared watch sweep (2026-08-07):
 * this file supplies the shelf, the spacing and the observation.
 */
export async function sweepStandingWatches(env: Env): Promise<number> {
  return sweepWatches<StandingWatchRecord, WatchProbe>({
    kv: env.ORDERS,
    prefix: KV_KEYS.standingWatchPrefix,
    scanCap: WATCH_SCAN_CAP,
    minSpacingMs: 55 * 60_000,
    entriesOf: (record) => record.probes,
    observe: (record) => probeOnce(env, record),
  });
}

/**
 * EVERY WATCH A WALLET PAID FOR — the claims door's reach extended
 * to the one record it could not see. Both kinds in one scan shape,
 * bounded like every other listing here, and the truncation is
 * reported rather than hidden: a wallet with more watches than the
 * cap gets the newest and is told so.
 */
export async function watchesForPayer(
  env: Env,
  payer: string,
): Promise<{
  watches: Array<{
    watch_id: string;
    kind: "standing_watch" | "conformance_watch";
    url: string;
    started_at: string;
    ends_at: string;
    history_path: string;
  }>;
  truncated: boolean;
}> {
  const wanted = payer.toLowerCase();
  const found: Array<{
    watch_id: string;
    kind: "standing_watch" | "conformance_watch";
    url: string;
    started_at: string;
    ends_at: string;
    history_path: string;
  }> = [];
  let truncated = false;
  const lanes = [
    {
      prefix: KV_KEYS.standingWatchPrefix,
      kind: "standing_watch" as const,
      path: "/api/watch/",
    },
    {
      prefix: KV_KEYS.conformanceWatchPrefix,
      kind: "conformance_watch" as const,
      path: "/api/conformance-watch/",
    },
  ];
  for (const lane of lanes) {
    const listed = await listKeys(env.ORDERS, {
      prefix: lane.prefix,
      cap: WATCH_SCAN_CAP,
    });
    truncated ||= listed.truncated;
    const records = await bulkGetJson<{
      watch_id?: string;
      url?: string;
      started_at?: string;
      ends_at?: string;
      payer?: string;
    }>(env.ORDERS, listed.names);
    for (const record of records.values()) {
      if (!record?.watch_id || record.payer?.toLowerCase() !== wanted) {
        continue;
      }
      found.push({
        watch_id: record.watch_id,
        kind: lane.kind,
        url: record.url ?? "",
        started_at: record.started_at ?? "",
        ends_at: record.ends_at ?? "",
        history_path: `${lane.path}${record.watch_id}`,
      });
    }
  }
  found.sort((a, b) => b.started_at.localeCompare(a.started_at));
  return { watches: found, truncated };
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
  /**
   * THE ISSUER-PAYS IMMUNITY CLAUSE (the keeper's ruling,
   * 2026-08-07), written at spec level rather than kept as an
   * intention. It rides EVERY history because the vocabulary is
   * the point: a scvd watch means unbought observation, paid for
   * by the observed, and a reader learns that from the artifact
   * rather than from us saying so somewhere else.
   */
  who_pays_and_what_it_buys: string;
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
  const tally = { ready: 0, not_ready: 0, unreachable: 0, refused: 0 };
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
      "Each probe row is signed on its own: ed25519_verify over JSON with keys watch_id, url, at, verdict, status, latency_ms, failed, then evidence and battery when present (exactly that order, null for absent numbers) against the row's public_key. Legacy rows omit evidence and battery; refused and unreachable rows omit both too, because no battery ran. A single row survives being quoted alone; the key's continuity policy is at /.well-known/scvd-signing-key.",
    what_this_is_not:
      "Not a ranking, not a directory badge, not a claim about anyone but the endpoint its buyer asked us to watch. hours_unprobed counts the hours WE missed — our gaps, stated, because a history that hides the watcher's absences is vouching for hours nobody watched.",
    who_pays_and_what_it_buys: WHO_PAYS_AND_WHAT_IT_BUYS,
  };
}
