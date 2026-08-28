import { KV_KEYS } from "@/lib/kv-keys";
import { cachedPublicKeyHex, signMessage } from "@/lib/signing";
import { readObserverStatus } from "@/lib/observer-control";
import type { ObserverStatus } from "@/lib/observer-control";
import { PREFLIGHT_BATTERY, probeOnce, runChecks } from "@/services/preflight";
import { ProbeTargetRefused } from "@/lib/probe-target";
import { REFUSED_CHECK } from "@/services/standing-watch";
import { sweepWatches } from "@/services/watch-sweep";
import { WHO_PAYS_AND_WHAT_IT_BUYS } from "@/store/copy/who-pays";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE CONFORMANCE WATCH — the Night Watch's shape pointed at
 * conformance drift (MARKETPLACE_AUDIT Part 6 step 4; the keeper's
 * approval 2026-08-07: seven days, five dollars, daily, "The
 * Conformance Watch").
 *
 * WHAT IT ANSWERS that neither neighbour does: the Once-Over says
 * whether your door was shaped right at ONE moment; the Night Watch
 * says whether it ANSWERED every hour. This says whether it STAYED
 * conformant across a week — the drift a Tuesday deploy introduces
 * and nobody notices until a buyer's client chokes. One pass a day,
 * the full preflight battery (including the structural JWS check on
 * any signed offers the 402 carries), every check and advisory named
 * on the record, each day's readout signed alone.
 *
 * RULE 23a BY THE CODIFIED CARVE-OUT, deliberately: bounded (seven
 * days, then done), prepaid (no ongoing billing relationship,
 * renewable by the buyer's choice only), gaps published (days WE
 * missed are derived at read time and counted against us). Same
 * consent shape as the Night Watch: the buyer names their own door;
 * no leaderboard, no strangers, nobody probed who did not pay to be.
 *
 * CADENCE IS THE DESIGN, not a cost dodge: conformance drifts at
 * deploy speed, not at minute speed. A daily pass catches the deploy;
 * an hourly one would mostly re-sign yesterday's answer 24 times.
 * Buyers who want liveness at hour granularity want the Night Watch,
 * and both listings say so.
 */

export const CONFORMANCE_WATCH_DURATION_DAYS = 7;

/** Cap on watches one sweep reads — kv-list's law: a cap has a name. */
const CWATCH_SCAN_CAP = 500;

/** A doubled cron tick must not double-bill the day. */
const MIN_PASS_SPACING_MS = 23 * 3600_000;

export interface ConformancePass {
  at: string;
  /**
   * `refused` is OURS, not theirs — see standing-watch. No request was
   * made, so there is nothing to say about the endpoint.
   */
  verdict: "ready" | "not_ready" | "unreachable" | "refused";
  /** HTTP status seen, absent when unreachable. */
  status?: number;
  /** Names of failed checks, empty when ready. */
  failed: string[];
  /** Names of advisories raised — true, never folded into the verdict. */
  advisories: string[];
  /**
   * WHICH BATTERY PRODUCED THE VERDICT (D6), inside the signed bytes
   * — the one paid artifact class the D6 fix skipped, found by the
   * instrument audit 2026-08-28 in the month the battery moved
   * twice. Absent on legacy rows and on rows where no battery ran
   * (unreachable, refused); citing a battery that did not run is the
   * standing watch's own words for the lie this avoids.
   */
  battery?: string;
  /**
   * WHOSE FAILURE A FAILED PASS WAS (B6) — the standing watch's
   * accounting, adopted here 2026-08-28. "degraded" means our own
   * control beacon failed in the same tick: our vantage was blind,
   * and the day must not book against the endpoint. Absent on legacy
   * rows and on refused rows.
   */
  observer_status?: ObserverStatus;
  /** ed25519 over canonicalizeConformancePass(); each day quotable alone. */
  signature: string;
  public_key: string;
}

export interface ConformanceWatchRecord {
  watch_id: string;
  /** The buyer's own endpoint. Consent is the purchase itself. */
  url: string;
  started_at: string;
  ends_at: string;
  /** The wallet that paid — see standing-watch.ts for why this
   * arrived late and what it cost to find out. */
  payer?: string;
  passes: ConformancePass[];
}

function newWatchId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `cwatch_${[...bytes].map((b) => b.toString(36)).join("").slice(0, 12)}`;
}

/** The exact bytes a pass signature covers. Order is the contract. */
export function canonicalizeConformancePass(
  watchId: string,
  url: string,
  pass: Pick<
    ConformancePass,
    "at" | "verdict" | "failed" | "advisories" | "battery" | "observer_status"
  > & {
    status?: number;
  },
): string {
  const payload: Record<string, unknown> = {
    watch_id: watchId,
    url,
    at: pass.at,
    verdict: pass.verdict,
    status: pass.status ?? null,
    failed: pass.failed,
    advisories: pass.advisories,
  };
  // The append-law (standing-watch's canonicalizeProbe, twice
  // demonstrated): legacy rows keep their exact original preimage;
  // rows recorded from 2026-08-28 append battery, then
  // observer_status, when present — the order is the contract.
  if (pass.battery) payload["battery"] = pass.battery;
  if (pass.observer_status) payload["observer_status"] = pass.observer_status;
  return JSON.stringify(payload);
}

export async function startConformanceWatch(
  env: Env,
  url: string,
  payer?: string,
): Promise<{ record: ConformanceWatchRecord; historyUrl: string }> {
  const now = new Date();
  const record: ConformanceWatchRecord = {
    watch_id: newWatchId(),
    url,
    started_at: now.toISOString(),
    ends_at: new Date(
      now.getTime() + CONFORMANCE_WATCH_DURATION_DAYS * 24 * 3600_000,
    ).toISOString(),
    ...(payer ? { payer: payer.toLowerCase() } : {}),
    passes: [],
  };
  await kvPut(env.ORDERS, 
    KV_KEYS.conformanceWatch(record.watch_id),
    JSON.stringify(record),
  );
  return {
    record,
    historyUrl: `${env.STORE_BASE_URL}/api/conformance-watch/${record.watch_id}`,
  };
}

/**
 * One pass: the shared guarded fetch (the same probeOnce the free
 * preflight and the paid audit run — one battery, three doors), the
 * full check battery, everything named. The guards stay up on every
 * pass: a week is long and a host can change hands.
 */
async function passOnce(
  env: Env,
  record: ConformanceWatchRecord,
): Promise<ConformancePass> {
  const at = new Date().toISOString();
  let verdict: ConformancePass["verdict"];
  let status: number | undefined;
  let failed: string[] = [];
  let advisories: string[] = [];
  let battery: string | undefined;
  let observerStatus: ObserverStatus | undefined;
  try {
    const outcome = await probeOnce(record.url, fetch, "", env);
    status = outcome.response.status;
    const ran = runChecks(outcome.response, outcome.bodyOverLimit, outcome.body, record.url);
    failed = ran.checks.filter((check) => !check.ok).map((check) => check.name);
    advisories = ran.advisories.map((advisory) => advisory.name);
    verdict = failed.length === 0 ? "ready" : "not_ready";
    battery = PREFLIGHT_BATTERY;
  } catch (error) {
    /*
     * REFUSED IS NOT UNREACHABLE. probeOnce carries this store's own
     * probe-target law and throws before dialling a private, loopback
     * or link-local target. Filing that under "unreachable" would
     * print our policy as a fact about the buyer's endpoint, on a row
     * we then sign and they may show to somebody.
     */
    if (error instanceof ProbeTargetRefused) {
      verdict = "refused";
      failed = [REFUSED_CHECK];
    } else {
      verdict = "unreachable";
      // B6: could WE see anything that tick? A blind vantage must
      // not book a paying customer's day as their outage.
      observerStatus = await readObserverStatus(env);
    }
  }
  const body: Pick<
    ConformancePass,
    "at" | "verdict" | "failed" | "advisories" | "battery" | "observer_status"
  > & { status?: number } = { at, verdict, failed, advisories };
  if (status !== undefined) {
    body.status = status;
  }
  if (battery) body.battery = battery;
  if (observerStatus) body.observer_status = observerStatus;
  const { signature } = await signMessage(
    canonicalizeConformancePass(record.watch_id, record.url, body),
    env.SIGNING_KEY,
  );
  return {
    ...body,
    signature,
    public_key: await cachedPublicKeyHex(env.SIGNING_KEY),
  };
}

/**
 * Rides the hourly rounds; passes daily. The 23-hour floor keeps a
 * doubled tick from double-billing the day and lets the pass drift to
 * whatever hour the cron actually fires — a day with two passes would
 * be over-delivering into a record whose honesty is its cadence. The
 * walk itself is the store's one shared watch sweep (2026-08-07):
 * this file supplies the shelf, the spacing and the observation.
 */
export async function sweepConformanceWatches(env: Env): Promise<number> {
  return sweepWatches<ConformanceWatchRecord, ConformancePass>({
    kv: env.ORDERS,
    prefix: KV_KEYS.conformanceWatchPrefix,
    scanCap: CWATCH_SCAN_CAP,
    minSpacingMs: MIN_PASS_SPACING_MS,
    entriesOf: (record) => record.passes,
    observe: (record) => passOnce(env, record),
  });
}

export interface ConformanceWatchHistory {
  watch_id: string;
  url: string;
  started_at: string;
  ends_at: string;
  complete: boolean;
  summary: {
    days_elapsed: number;
    passes_recorded: number;
    /**
     * Rows that actually observed the endpoint: refused rows are our
     * policy and degraded-unreachable rows are our blind vantage
     * (B11, adopted 2026-08-28). The denominator to judge the door
     * by; passes_recorded keeps counting every row.
     */
    passes_observed: number;
    /**
     * Elapsed days nobody checked. OUR gaps — derived at read time,
     * never stored, so they cannot be edited into politeness.
     */
    days_unchecked: number;
    ready: number;
    not_ready: number;
    unreachable: number;
    /** Passes this store declined to make. Ours, not theirs. */
    refused: number;
    /**
     * The product's one derived judgment, and it is arithmetic, not
     * opinion: did the set of failed checks CHANGE between reachable
     * passes? A break mid-week and a fix mid-week both flip this —
     * both are the week's story, and drift is the thing a week of
     * dated readouts can show that one readout cannot.
     */
    drift_detected: boolean;
  };
  passes: ConformancePass[];
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

export async function readConformanceWatch(
  env: Env,
  watchId: string,
): Promise<ConformanceWatchHistory | null> {
  const record = await kvGetJson<ConformanceWatchRecord>(env.ORDERS, 
    KV_KEYS.conformanceWatch(watchId),
    "json",
  );
  if (!record) {
    return null;
  }
  const now = Date.now();
  const end = Math.min(now, Date.parse(record.ends_at));
  const daysElapsed = Math.max(
    0,
    Math.floor((end - Date.parse(record.started_at)) / (24 * 3600_000)),
  );
  const tally = { ready: 0, not_ready: 0, unreachable: 0, refused: 0 };
  // Drift is plain set arithmetic over the signed rows — a reader can
  // recompute it without trusting this summary: sort each reachable
  // pass's failed names and compare across the week. Unreachable
  // passes are excluded; a network moment is not a conformance change.
  const readouts = new Set<string>();
  let observed = 0;
  for (const pass of record.passes) {
    tally[pass.verdict] += 1;
    // B11's arithmetic, adopted from the standing watch 2026-08-28:
    // a refused row is our policy and a degraded-unreachable row is
    // our blindness; neither is an observation of the endpoint.
    if (
      pass.verdict !== "refused" &&
      !(pass.verdict === "unreachable" && pass.observer_status === "degraded")
    ) {
      observed += 1;
    }
    if (pass.verdict !== "unreachable" && pass.verdict !== "refused") {
      readouts.add(JSON.stringify([...pass.failed].sort()));
    }
  }
  const drift = readouts.size > 1;
  return {
    watch_id: record.watch_id,
    url: record.url,
    started_at: record.started_at,
    ends_at: record.ends_at,
    complete: now > Date.parse(record.ends_at),
    summary: {
      days_elapsed: daysElapsed,
      passes_recorded: record.passes.length,
      /**
       * Rows that actually OBSERVED the endpoint: refused rows are
       * our policy, degraded-unreachable rows are our blind vantage,
       * and neither says anything about the door. passes_recorded
       * keeps its historical meaning (every row); this is the
       * denominator a reader should judge the endpoint by (B11).
       */
      passes_observed: observed,
      days_unchecked: Math.max(0, daysElapsed - record.passes.length),
      ...tally,
      drift_detected: drift,
    },
    passes: record.passes,
    how_to_verify:
      "Each pass is signed on its own: ed25519_verify over JSON with keys watch_id, url, at, verdict, status, failed, advisories (exactly that order, null for an absent status) against the pass's public_key. Rows recorded from 2026-08-28 append battery, then observer_status, after advisories when present — legacy rows keep their exact original preimage. A single day survives being quoted alone; the key's continuity policy is at /.well-known/scvd-signing-key.",
    what_this_is_not:
      "Not a ranking, not a badge, not uptime (one pass a day cannot be — the hourly product is the Night Watch), and not a claim about anyone but the endpoint its buyer asked us to check. days_unchecked counts the days WE missed — our gaps, stated; passes_observed excludes our refusals and our blind days, so nobody's outage is booked to this endpoint. drift_detected is arithmetic over the signed rows — the sorted failed-check sets of reachable passes compared across the week — recomputable without us.",
    who_pays_and_what_it_buys: WHO_PAYS_AND_WHAT_IT_BUYS,
  };
}
