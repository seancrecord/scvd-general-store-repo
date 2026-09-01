import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { listKeys } from "@/lib/kv-list";
import { cachedPublicKeyHex, signMessage } from "@/lib/signing";
import { readObserverStatus } from "@/lib/observer-control";
import type { ObserverStatus } from "@/lib/observer-control";
import { PREFLIGHT_BATTERY, runChecks } from "@/services/preflight";
import { checkProbeTarget } from "@/lib/probe-target";
import { webBotAuthHeaders } from "@/lib/web-bot-auth";
import { sweepWatches } from "@/services/watch-sweep";
import {
  captureWatchEvidenceKeepingBody,
  recipientsFromChallenge,
  recipientSetKey,
  type ChallengeRecipient,
  type WatchEvidenceCapture,
} from "@/services/watch-evidence";
import { evmChainOf } from "@/lib/base-rpc";
import { STATEMENT_MAX_HOURS } from "@/services/wallet-statement";
import { WHO_PAYS_AND_WHAT_IT_BUYS } from "@/store/copy/who-pays";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

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
 * THE INTRA-TICK BURST (ledger B5; the keeper's ruling 2026-08-28,
 * "yes paid").
 *
 * Every observation this store took was ONE GET, from one vantage,
 * on a predictable cron phase, wearing one signed identity. A door
 * that flaps between probes, or that answers differently per backend,
 * read as a clean hour — 168 identical looks a week, none of which
 * could disagree with another because there was never another.
 *
 * PAID WATCHES ONLY, by the ruling. Consent is already in hand here
 * — the buyer named their own door — where bursting 750 strangers in
 * the census is a different question, gated on the etiquette ceiling
 * (Observatory 12.3) and deliberately not taken.
 *
 * WHAT IT CAN AND CANNOT SEE, because the gap matters: two extra
 * probes staggered inside the same tick catch a door that is
 * inconsistent ACROSS BACKENDS or flapping on a scale of seconds.
 * They do not catch a door that flaps on a scale of minutes, and
 * they say nothing about the 59 minutes this watch is not looking.
 * The tick is still a moment; it is now a moment with width.
 */
export const BURST_PROBES = 3;

/** Stagger between burst probes. The three are launched together
 * with offset starts, so a tick costs one gap-span of wall time
 * rather than three round trips end to end. */
export const BURST_GAP_MS = 1200;

/**
 * How many watches in one sweep get a burst. The sweep walks watches
 * sequentially, so an unbounded burst multiplies wall time by the
 * watch count and would eventually eat the cron. Past the budget a
 * watch still gets its ordinary single probe, and the row says which
 * it got — a cap nobody can see in the output is the exact defect
 * this store keeps finding in other people's instruments.
 */
export const BURST_BUDGET_PER_SWEEP = 25;

/** One probe inside a burst: what it saw, nothing signed on its own. */
export interface BurstProbe {
  verdict: "ready" | "not_ready" | "unreachable";
  status?: number;
  latency_ms?: number;
}

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
  /**
   * WHOSE FAILURE A FAILED PROBE WAS (3.4/B6). "ok": the control
   * beacon answered in the same tick, so an unreachable verdict is
   * the subject's outage, confirmed rather than assumed. "degraded":
   * the beacon failed too — OUR vantage was blind, and the tick is
   * excluded from the subject's stats and from coverage. "unchecked":
   * no beacon was provisioned; the verdict books as it always did and
   * this field says the attribution was never verified. Absent on
   * legacy rows and on refused rows (a refusal is policy, not an
   * observation to attribute).
   */
  observer_status?: ObserverStatus;
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
   * THE BURST (B5, 2026-08-28): the extra probes this tick took,
   * INCLUDING the primary one, so `burst[0]` is the probe the rest
   * of this row describes. Absent on legacy rows, on refused rows,
   * and on ticks past the sweep's burst budget — a row without it
   * is a single-probe row and does not pretend otherwise.
   *
   * `burst_agreed` false is the finding: the same door answered two
   * different ways inside one tick, which a single probe per hour
   * could never have seen.
   */
  burst?: BurstProbe[];
  burst_agreed?: boolean;
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
  probe: Pick<
    WatchProbe,
    | "at"
    | "verdict"
    | "failed"
    | "evidence"
    | "battery"
    | "observer_status"
    | "burst"
    | "burst_agreed"
  > & {
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
  // 3.4: appended after battery, same law as every addition — new
  // rows carry it inside the signed bytes; legacy rows keep their
  // exact original preimage forever.
  if (probe.observer_status) payload["observer_status"] = probe.observer_status;
  // B5 (2026-08-28), appended after observer_status by the same law.
  // The burst rides INSIDE the signature: a disagreement a buyer can
  // show somebody has to be as un-editable as the verdict it
  // qualifies.
  if (probe.burst) {
    payload["burst"] = probe.burst;
    payload["burst_agreed"] = probe.burst_agreed === true;
  }
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
/**
 * One extra look inside the same tick, for the burst. Deliberately
 * thinner than the primary probe: a verdict, a status, a latency,
 * and nothing else. It captures no evidence and signs nothing on its
 * own — the row's evidence is the primary probe's, and three copies
 * of a 402 body inside one signed row would balloon the artifact to
 * say what one copy already says.
 */
async function burstProbe(
  env: Env,
  record: StandingWatchRecord,
  delayMs: number,
): Promise<BurstProbe> {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  const started = Date.now();
  try {
    const response = await fetch(record.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(WATCH_PROBE_TIMEOUT_MS),
      headers: await webBotAuthHeaders(env, record.url, {
        Accept: "application/json",
      }),
    });
    const latency = Date.now() - started;
    const kept = await captureWatchEvidenceKeepingBody(response);
    const { checks } = runChecks(
      response,
      kept.evidence.body_truncated,
      kept.bodyText,
      record.url,
    );
    return {
      verdict: checks.every((check) => check.ok) ? "ready" : "not_ready",
      status: response.status,
      latency_ms: latency,
    };
  } catch {
    return { verdict: "unreachable" };
  }
}

async function probeOnce(
  env: Env,
  record: StandingWatchRecord,
  /**
   * Whether this tick may burst. False past the sweep's budget, and
   * the row then simply carries no burst — which reads as the single
   * probe it was, rather than as three that agreed.
   */
  mayBurst = false,
  /**
   * How far apart the burst's extra looks are staggered. A PARAMETER
   * and not the constant, because CI proved why (2026-08-28): the
   * sweep sleeps this long per watch, so a suite that drives a real
   * sweep pays it in wall clock and two tests that had nothing to do
   * with the burst timed out on a loaded runner. A test should not
   * have to sleep 2.4 seconds to prove a signature verifies.
   * Production passes nothing and gets BURST_GAP_MS.
   */
  burstGapMs: number = BURST_GAP_MS,
): Promise<WatchProbe> {
  const at = new Date().toISOString();
  const started = Date.now();
  let verdict: WatchProbe["verdict"];
  let observerStatus: ObserverStatus;
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
    // KeepingBody so the battery reads BOTH offer placements (the
    // instrument audit, 2026-08-28); the text rides beside the
    // capture, never inside the signed row.
    const kept = await captureWatchEvidenceKeepingBody(response);
    evidence = kept.evidence;
    const { checks } = runChecks(response, evidence.body_truncated, kept.bodyText, record.url);
    failed = checks.filter((check) => !check.ok).map((check) => check.name);
    verdict = failed.length === 0 ? "ready" : "not_ready";
    /*
     * A tick that observed successfully proved the vantage works by
     * observing — the beacon has nothing to add and is not consulted.
     */
    observerStatus = "ok";
  } catch {
    verdict = "unreachable";
    /*
     * 3.4/B6: the moment we could not reach them is exactly the
     * moment to ask whether we could reach ANYTHING. Same tick, one
     * control read; the answer decides whose outage this row records.
     */
    observerStatus = await readObserverStatus(env);
  }
  const body: Pick<
    WatchProbe,
    | "at"
    | "verdict"
    | "failed"
    | "evidence"
    | "battery"
    | "observer_status"
    | "burst"
    | "burst_agreed"
  > & {
    status?: number;
    latency_ms?: number;
  } = { at, verdict, failed, observer_status: observerStatus };
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
  /*
   * THE BURST (B5). Two more looks inside the same tick, staggered,
   * with the primary probe as burst[0] so the array is the whole
   * tick rather than an appendix to it.
   *
   * The primary probe still decides `verdict`: this series has meant
   * "what one probe at the top of the hour saw" for its whole life,
   * and quietly redefining it would break every stored row's
   * comparability — the frozen-series law the batteries live under.
   * What the burst adds is `burst_agreed`, and a false there is the
   * finding: the same door answered two ways inside one tick, which
   * 168 single looks a week could never have caught.
   */
  // No refused guard here: a refused target returns far above this,
  // before any request is made, so a refused row can never reach the
  // burst. The compiler says so, which is better than a comment.
  if (mayBurst) {
    const extras = await Promise.all(
      Array.from({ length: BURST_PROBES - 1 }, (_, index) =>
        burstProbe(env, record, (index + 1) * burstGapMs),
      ),
    );
    const primary: BurstProbe = {
      verdict: verdict as BurstProbe["verdict"],
      ...(status !== undefined ? { status } : {}),
      ...(latency !== undefined ? { latency_ms: latency } : {}),
    };
    const burst = [primary, ...extras];
    body.burst = burst;
    body.burst_agreed = burst.every(
      (probe) => probe.verdict === burst[0]!.verdict,
    );
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
export async function sweepStandingWatches(
  env: Env,
  options: { burstGapMs?: number } = {},
): Promise<number> {
  const burstGapMs = options.burstGapMs ?? BURST_GAP_MS;
  let bursts = 0;
  return sweepWatches<StandingWatchRecord, WatchProbe>({
    kv: env.ORDERS,
    prefix: KV_KEYS.standingWatchPrefix,
    scanCap: WATCH_SCAN_CAP,
    minSpacingMs: 55 * 60_000,
    entriesOf: (record) => record.probes,
    /*
     * B5's budget, spent in order. The sweep walks watches
     * sequentially, so bursting every one multiplies wall time by
     * the watch count; past the budget a watch gets its ordinary
     * single probe and its row carries no burst, which is the honest
     * rendering of what happened rather than a silent downgrade.
     */
    observe: (record) => {
      const mayBurst = bursts < BURST_BUDGET_PER_SWEEP;
      if (mayBurst) bursts += 1;
      return probeOnce(env, record, mayBurst, burstGapMs);
    },
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

/**
 * THE PAYTO MOVED (2026-09-01) — one change, as the signed rows show it.
 *
 * Derived at read time from evidence every row already carried inside
 * its signature (challenge_bytes), so nothing about the preimage
 * changed and a reader recomputes this without trusting the summary:
 * decode each reachable row's challenge, take its accepts[].payTo set
 * per network, compare in order. The row where the set first differs
 * is the change.
 *
 * WHAT IT SAYS AND DOES NOT SAY. It says the door PRESENTED a
 * different recipient than the last time this watch looked. It does
 * not say why. A deliberate rotation and a hijacked deploy are the
 * same observation from outside; the reader who needs to tell them
 * apart has the new address, the moment, and a pointer to what that
 * wallet has actually done — not a verdict.
 */
export interface PayToChange {
  /** The probe that first presented the new recipients. */
  at: string;
  /** The probe before it: the last time the old set was presented. */
  previously_at: string;
  previous: ChallengeRecipient[];
  current: ChallengeRecipient[];
  /**
   * Where to read what each NEW wallet has done: a Statement over the
   * longest window the till sells, on the rail the recipient appears
   * on. A POINTER, not a reading — this watch did not read the chain
   * (an hourly cron dialling an RPC per change is a cost nobody
   * priced, and a paid reading inside a free readout is a second
   * price nobody mentioned), and it says so rather than implying it
   * looked. Recipients on a rail the Statement cannot read carry no
   * pointer, which is the honest rendering of that gap.
   */
  new_recipient_statement: Array<{
    network: string;
    pay_to: string;
    url: string;
  }>;
}

export interface WatchHistory {
  watch_id: string;
  url: string;
  started_at: string;
  ends_at: string;
  complete: boolean;
  summary: {
    hours_elapsed: number;
    /**
     * 3.4/B10: the DENOMINATOR, explicit — one probe owed per elapsed
     * hour. Never a bare percentage anywhere in this artifact: a
     * reader who wants a ratio computes it from named numbers and
     * knows exactly what was divided by what.
     */
    probes_expected: number;
    /** Genuine observations only: ready + not_ready + unreachable. */
    probes_recorded: number;
    /**
     * 3.4/B11: a refused row is this store's POLICY (the probe guard
     * declining to dial), not an observation of the subject. It used
     * to count as one, silently inflating coverage.
     */
    probes_refused: number;
    /**
     * 3.4/B6: ticks where OUR vantage was blind — the target failed
     * and the control beacon failed in the same tick. Excluded from
     * the subject's stats and from probes_recorded, because a claim
     * made while we could not see anything is not an observation.
     */
    probes_observer_degraded: number;
    /**
     * Elapsed hours nobody probed. OUR gaps — a missed cron is the
     * store's failure and it is derived here at read time, never
     * stored, so it cannot be quietly edited down.
     */
    hours_unprobed: number;
    ready: number;
    not_ready: number;
    /** Subject-attributed only: observer-degraded ticks are not here. */
    unreachable: number;
    /**
     * 3.4/B10: latency as a DISTRIBUTION, never a mean — one slow
     * outlier averaged into a comfortable number is how a flaky door
     * hides. Null when no probe carried a latency.
     */
    latency_ms: { p50: number; p90: number; max: number } | null;
    /**
     * B5 (2026-08-28): ticks that took a burst, and of those, ticks
     * where the burst DISAGREED — the same door answering two ways
     * inside one tick. Its own denominator, because a disagreement
     * count without the number of bursts is unreadable, and because
     * ticks past the sweep's burst budget took a single probe and
     * cannot be counted either way.
     */
    ticks_burst: number;
    ticks_burst_disagreed: number;
    /**
     * THE PAYTO MOVED (2026-09-01): every tick where the set of
     * (network, payTo) pairs the door presented differed from the
     * previous reachable tick. Arithmetic over the signed rows, like
     * drift on the conformance watch; recomputable without us. Empty
     * is the ordinary week. `payto_changed` is the same fact as a
     * boolean, for a reader scanning rather than reading.
     */
    payto_changed: boolean;
    payto_changes: PayToChange[];
    /** The claim boundary, on the artifact rather than in our heads. */
    nothing_claimed_between_probes: string;
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
  const record = await kvGetJson<StandingWatchRecord>(env.ORDERS, 
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
  let refused = 0;
  let degraded = 0;
  const latencies: number[] = [];
  for (const probe of record.probes) {
    if (probe.verdict === "refused") {
      refused += 1;
      continue;
    }
    if (
      probe.verdict === "unreachable" &&
      probe.observer_status === "degraded"
    ) {
      degraded += 1;
      continue;
    }
    tally[probe.verdict] += 1;
    if (typeof probe.latency_ms === "number") latencies.push(probe.latency_ms);
  }
  latencies.sort((a, b) => a - b);
  const quantile = (q: number): number =>
    latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))]!;
  const paytoChanges = payToChanges(record.probes, env.STORE_BASE_URL);
  return {
    watch_id: record.watch_id,
    url: record.url,
    started_at: record.started_at,
    ends_at: record.ends_at,
    complete: now > Date.parse(record.ends_at),
    summary: {
      hours_elapsed: hoursElapsed,
      probes_expected: hoursElapsed,
      probes_recorded: tally.ready + tally.not_ready + tally.unreachable,
      probes_refused: refused,
      probes_observer_degraded: degraded,
      // Hours with no row at ALL — the missed crons. Refused and
      // degraded rows account for their hour under their own names.
      hours_unprobed: Math.max(0, hoursElapsed - record.probes.length),
      ...tally,
      latency_ms:
        latencies.length === 0
          ? null
          : {
              p50: quantile(0.5),
              p90: quantile(0.9),
              max: latencies[latencies.length - 1]!,
            },
      ticks_burst: record.probes.filter((probe) => probe.burst).length,
      ticks_burst_disagreed: record.probes.filter(
        (probe) => probe.burst && probe.burst_agreed === false,
      ).length,
      payto_changed: paytoChanges.length > 0,
      payto_changes: paytoChanges,
      nothing_claimed_between_probes:
        "One probe per hour — three inside the tick where a burst ran — and NOTHING is claimed between probes: a door can fall and recover inside an hour without a row here. A burst widens the moment to a few seconds; it does not widen it to the hour. Every count above has its denominator beside it (probes_expected, ticks_burst); this artifact serves no ratio, because a percentage with a hidden denominator is how availability lies.",
    },
    probes: record.probes,
    how_to_verify:
      "Each probe row is signed on its own: ed25519_verify over JSON with keys watch_id, url, at, verdict, status, latency_ms, failed, then evidence, battery, observer_status, and finally burst with burst_agreed when present (exactly that order, null for absent numbers) against the row's public_key. Legacy rows omit evidence, battery and observer_status; refused rows omit all three, and unreachable rows omit evidence and battery, because no battery ran. A single row survives being quoted alone; the key's continuity policy is at /.well-known/scvd-signing-key.",
    what_this_is_not:
      "Not a ranking, not a directory badge, not a claim about anyone but the endpoint its buyer asked us to watch. hours_unprobed counts the hours WE missed — our gaps, stated, because a history that hides the watcher's absences is vouching for hours nobody watched. payto_changes is arithmetic over the signed rows — each reachable row's challenge_bytes decoded, its accepts[].payTo set per network compared with the previous reachable row's — recomputable without us; a change is the fact that the door presented a different recipient, never a claim about why, and the watch read no chain to find it.",
    who_pays_and_what_it_buys: WHO_PAYS_AND_WHAT_IT_BUYS,
  };
}

/**
 * The derivation behind summary.payto_changes. Walks the rows in the
 * order they were taken; a row that made no request, could not reach
 * the door, or carries a challenge with no readable recipient at all
 * says nothing about WHERE the money goes and is skipped rather than
 * read as "the recipient vanished" — an unreachable hour is a network
 * moment, not a rotation. The set is what is compared: a door adding
 * a second rail did change what it presents, and a reader who wants
 * only the swapped-wallet case can filter on the addresses given.
 */
function payToChanges(
  probes: readonly WatchProbe[],
  base: string,
): PayToChange[] {
  const changes: PayToChange[] = [];
  let last: { at: string; recipients: ChallengeRecipient[]; key: string } | null =
    null;
  for (const probe of probes) {
    if (probe.verdict === "refused" || probe.verdict === "unreachable") continue;
    const recipients = recipientsFromChallenge(probe.evidence?.challenge_bytes);
    if (recipients.length === 0) continue;
    const key = recipientSetKey(recipients);
    if (last && key !== last.key) {
      const known = new Set(last.recipients.map((r) => recipientSetKey([r])));
      changes.push({
        at: probe.at,
        previously_at: last.at,
        previous: last.recipients,
        current: recipients,
        new_recipient_statement: recipients
          .filter((recipient) => !known.has(recipientSetKey([recipient])))
          .flatMap((recipient) => {
            const chain = evmChainOf(recipient.network);
            if (!chain) return [];
            const query = new URLSearchParams({
              wallet: recipient.pay_to,
              hours: String(STATEMENT_MAX_HOURS),
              network: chain.caip2,
            });
            return [
              {
                network: recipient.network,
                pay_to: recipient.pay_to,
                url: `${base}/api/buy/the_statement?${query.toString()}`,
              },
            ];
          }),
      });
    }
    last = { at: probe.at, recipients, key };
  }
  return changes;
}
