import { CONFLICT } from "@/services/conformance";
import { storeIdentity } from "@/lib/identity";
import { ProbeTargetRefused, checkProbeTarget } from "@/lib/probe-target";
import { webBotAuthHeaders, type WbaEnv } from "@/lib/web-bot-auth";
import {
  ONPAGE_VERSION,
  readPageFacts,
  runOnpageChecks,
} from "@/services/onpage-checks";
import type {
  OnpageAdvisory,
  OnpageCheck,
} from "@/services/onpage-checks";
import type { Env } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";

/**
 * THE FREE ON-PAGE DESK — /api/onpage.
 *
 * The preflight's posture pointed at a PAGE instead of a payment
 * door: free, no account, works on anyone, one guarded GET, conflict
 * declared in the response. The battery itself lives in
 * services/onpage-checks.ts along with the honest boundary that
 * governs everything here — the HTML is read AS SERVED, and what a
 * script renders afterward is named as unseen, never guessed at.
 *
 * THE FETCH IS A REQUEST TO AN ADDRESS A STRANGER CHOSE, so it wears
 * the preflight's exact guards: https-only via the shared probe-target
 * law, no redirects, a hard timeout, a bounded read, per-isolate and
 * global per-minute budgets, and EXACTLY ONE outbound request per
 * call. That last rule is why robots.txt is a stated blind spot
 * rather than a check — reading it would be a second request made in
 * the caller's name.
 */

const PROBE_TIMEOUT_MS = 8000;
/** Pages run heavier than 402 challenges; double the preflight's cap. */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * The preflight's two ceilings, replayed: a strict per-isolate bucket
 * for the common case, and an approximate global KV bucket so spread
 * across isolates cannot turn a free desk into an unmetered relay.
 * Separate budget from the preflight's on purpose — one desk being
 * hammered should not starve the other.
 */
const PROBES_PER_MINUTE = 30;
const GLOBAL_PROBES_PER_MINUTE = 60;
let probeMinute = "";
let probesUsed = 0;

function takeProbeBudget(): boolean {
  const minute = new Date().toISOString().slice(0, 16);
  if (minute !== probeMinute) {
    probeMinute = minute;
    probesUsed = 0;
  }
  if (probesUsed >= PROBES_PER_MINUTE) {
    return false;
  }
  probesUsed += 1;
  return true;
}

async function takeGlobalProbeBudget(env: Env): Promise<boolean> {
  const minute = new Date().toISOString().slice(0, 16);
  const key = `onpage_budget:${minute}`;
  const used = parseInt((await kvGet(env.COUNTERS, key)) ?? "0", 10);
  if (used >= GLOBAL_PROBES_PER_MINUTE) {
    return false;
  }
  await kvPut(env.COUNTERS, key, String(used + 1), { expirationTtl: 120 });
  return true;
}

export interface OnpageReport {
  version: string;
  verdict: "ready" | "not_ready" | "unreachable";
  checks: OnpageCheck[];
  advisories: OnpageAdvisory[];
  single_probe_note: string;
  what_this_cannot_tell_you: string[];
  our_conflict_of_interest: string;
  store_identity: ReturnType<typeof storeIdentity>;
  next_steps: Record<string, string>;
}

/**
 * The blind spots, published on every report — free and paid alike —
 * because an instrument that does not state what it cannot see is
 * selling the gap. Exported so the signed audit serves the same list
 * and the two can never quietly diverge.
 */
export const ONPAGE_BLIND_SPOTS: readonly string[] = [
  "Anything a script renders. The battery reads the HTML as served; a page built client-side can be nearly empty in this reading and rich in a browser, and this report cannot tell those apart. If the page is a JavaScript app, this describes the server's answer, not a user's screen.",
  "robots.txt. This probe makes exactly one request, and fetching the site's robots.txt would be a second one made in your name — the page's own meta robots directive was read; the site-wide file was not.",
  "How the page looks or performs. Nothing here rendered anything: layout, images, speed, and everything visual are outside this instrument entirely.",
  "Any other moment. One GET, once. The page may have changed while you read this sentence.",
] as const;

function report(
  base: string,
  verdict: OnpageReport["verdict"],
  checks: OnpageCheck[],
  advisories: OnpageAdvisory[],
): OnpageReport {
  return {
    version: ONPAGE_VERSION,
    verdict,
    checks,
    advisories,
    single_probe_note:
      "One request, one moment. This says what the page SERVED just now, never whether it is good, ranks anywhere, or will serve the same tomorrow.",
    what_this_cannot_tell_you: [...ONPAGE_BLIND_SPOTS],
    our_conflict_of_interest: CONFLICT,
    store_identity: storeIdentity(base),
    next_steps: {
      signed_report: `${base}/api/buy/onpage_audit — this exact readout, signed, bound into a certificate and served at a permanent URL, for when you need to hand it to somebody rather than run it yourself.`,
      x402_endpoints: `${base}/api/preflight/${ONPAGE_VERSION} — if the URL is a payment door rather than a page, that desk reads 402 challenges; this one reads HTML.`,
    },
  };
}

export interface PageProbeOutcome {
  status: number;
  contentType: string;
  body: string;
  bodyOverLimit: boolean;
}

/**
 * THE ONE GUARDED OUTBOUND REQUEST, factored out so the paid audit
 * runs EXACTLY the fetch the free desk runs — same law as
 * preflight.probeOnce, same reason: the paid door must never quietly
 * grow a longer leash than the free one. Throws on network failure;
 * the caller decides what an unreachable moment means.
 */
export async function fetchPageOnce(
  url: string,
  fetchImpl: typeof fetch = fetch,
  env?: WbaEnv,
): Promise<PageProbeOutcome> {
  const verdict = checkProbeTarget(new URL(url), "");
  if (!verdict.ok) {
    throw new ProbeTargetRefused(verdict.reason ?? "refused target");
  }
  const accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1";
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    // The probe introduces itself, verifiably, when the egress key is
    // set — decoration on the request, never a condition of it.
    headers: env
      ? await webBotAuthHeaders(env, url, { Accept: accept })
      : { Accept: accept },
  });
  const raw = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: raw.slice(0, MAX_BODY_BYTES),
    bodyOverLimit: raw.length > MAX_BODY_BYTES,
  };
}

/** Fetch, parse, judge: the whole battery over one probe outcome. */
export async function runOnpageBattery(
  outcome: PageProbeOutcome,
): Promise<{ checks: OnpageCheck[]; advisories: OnpageAdvisory[] }> {
  const facts = await readPageFacts(outcome.body);
  return runOnpageChecks(
    outcome.status,
    outcome.contentType,
    facts,
    outcome.bodyOverLimit,
  );
}

export async function onpageUrl(
  rawUrl: unknown,
  env: Env,
): Promise<{ status: number; body: OnpageReport | { error: string } }> {
  const base = env.STORE_BASE_URL;
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return {
      status: 400,
      body: {
        error:
          'Send {"url": "https://your-site.example/page"} — the public page to read.',
      },
    };
  }
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { status: 400, body: { error: "That is not a parseable URL." } };
  }
  const target = checkProbeTarget(url, "");
  if (!target.ok) {
    return { status: 400, body: { error: target.reason! } };
  }
  /**
   * OUR OWN HOST IS REFUSED WITH THE REASON, not probed — the
   * preflight's rule for the preflight's reasons: the platform kills
   * self-fetch, and a synthetic stand-in would be the instrument
   * vouching for itself.
   */
  if (url.host.toLowerCase() === new URL(base).host.toLowerCase()) {
    return {
      status: 400,
      body: {
        error:
          "That is this store's own hostname, which a Cloudflare Worker cannot fetch (the platform kills self-requests). The checks this desk runs are published — GET any page here yourself and hold it against them; your own read is as good as ours.",
      },
    };
  }
  if (!takeProbeBudget() || !(await takeGlobalProbeBudget(env))) {
    return {
      status: 429,
      body: {
        error:
          "The probe budget for this minute is spent — a cost bound on our side, not a fact about your page. Retry next minute.",
      },
    };
  }

  let outcome: PageProbeOutcome;
  try {
    outcome = await fetchPageOnce(url.toString(), fetch, env);
  } catch (error) {
    return {
      status: 200,
      body: report(base, "unreachable", [
        {
          name: "reachable",
          ok: false,
          detail: `the probe could not complete: ${String(error)}. A fact about the network path between us and that host at this moment — it does not prove the page is down, and a reader elsewhere may reach it fine.`,
        },
      ], []),
    };
  }

  const { checks, advisories } = await runOnpageBattery(outcome);
  const verdict = checks.every((check) => check.ok) ? "ready" : "not_ready";
  return { status: 200, body: report(base, verdict, checks, advisories) };
}
