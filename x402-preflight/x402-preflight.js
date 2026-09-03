/**
 * x402-preflight — scvd.store's free x402 door check, as a library.
 *
 * One POST per door to /api/preflight/v2: the same single probe, the
 * same battery, the same limiter every caller gets. The store answers
 * with a verdict (ready / not_ready / unreachable), every check by
 * name, the advisories outside the verdict, and `remediation` rows —
 * the defect class, its definition URL, what the operator does, what
 * the buyer does — for each failed check or advisory the vocabulary
 * explains. This file keeps the response whole and adds the deploy
 * gate's law on top: which verdicts fail, and why unreachable does not
 * by default (it is a fact about the network path from the store's
 * vantage at one moment, never a finding about the door).
 *
 * Node builtins and global fetch only. Nothing installed. It holds no
 * key and cannot spend money.
 */

export const DEFAULT_BASE = "https://scvd.store";
export const BATTERY = "v2";
export const EXIT = Object.freeze({ ok: 0, verdictNegative: 1, usage: 2, unreachable: 3 });

/** The order the worst outcome is chosen in; higher index is worse. */
export const SEVERITY = Object.freeze(["ready", "refused", "unreachable", "not_ready"]);

const USER_AGENT = "x402-preflight (+https://scvd.store/api/preflight/v2)";

/**
 * One probe, through the store, with the response kept whole.
 * Never throws: a store that did not answer is `store_unreachable`, a
 * refusal before probing is `refused`, and everything else is the
 * store's own verdict with its body beside it.
 */
export async function preflightOne(url, { base = DEFAULT_BASE, fetch: fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  let response;
  try {
    response = await fetchImpl(`${base.replace(/\/+$/, "")}/api/preflight/${BATTERY}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT, accept: "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { url, outcome: "store_unreachable", detail: String(error), status: null, body: null };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status === 429) {
    const retry = response.headers.get("retry-after");
    return { url, outcome: "store_unreachable", detail: `the store's probe budget refused this call (429${retry ? `, retry after ${retry}s` : ""}); nothing was probed`, status: 429, body };
  }
  if (response.status !== 200 || !body || typeof body !== "object" || !("verdict" in body)) {
    const detail = body && typeof body === "object" && body.error ? String(body.error) : `the store answered ${response.status} without a verdict`;
    return { url, outcome: "refused", detail, status: response.status, body, next_action: body && typeof body === "object" ? body.next_action ?? null : null };
  }
  return { url, outcome: body.verdict, detail: null, status: 200, body };
}

/** Every door, in order, one probe each. */
export async function preflightMany(urls, options = {}) {
  const results = [];
  for (const url of urls) results.push(await preflightOne(url, options));
  return results;
}

/** The failed checks by name, from the store's own report. */
export function failedChecks(report) {
  return (report?.checks ?? []).filter((check) => check && check.ok === false).map((check) => check.name);
}

/** The store's remediation rows, whole — never derived here. */
export function remediation(report) {
  return Array.isArray(report?.remediation) ? report.remediation : [];
}

/**
 * The deploy gate's law, as one function: which exit code these
 * results earn under a `failOn` set. `refused` is EXIT.usage (nothing
 * was probed, so a gate must not pass on a door nobody looked at);
 * `store_unreachable` is EXIT.unreachable; a verdict in failOn is
 * EXIT.verdictNegative; everything else EXIT.ok.
 */
export function exitCodeFor(results, failOn = new Set(["not_ready"])) {
  const wanted = failOn instanceof Set ? failOn : new Set(failOn);
  if (results.some((result) => result.outcome === "refused")) return EXIT.usage;
  if (results.some((result) => result.outcome === "store_unreachable")) return EXIT.unreachable;
  if (results.some((result) => wanted.has(result.outcome))) return EXIT.verdictNegative;
  return EXIT.ok;
}

/** The worst outcome across doors, by SEVERITY; store_unreachable counts as unreachable. */
export function worstOutcome(results) {
  let worst = "ready";
  for (const result of results) {
    const outcome = result.outcome === "store_unreachable" ? "unreachable" : result.outcome;
    if (SEVERITY.indexOf(outcome) > SEVERITY.indexOf(worst)) worst = outcome;
  }
  return worst;
}

/** One door's reading as lines a person reads: the verdict, every check, the advisories, the remediation. */
export function renderLines(result) {
  const lines = [`${result.url}: ${result.outcome}${result.detail ? ` — ${result.detail}` : ""}`];
  if (result.next_action) lines.push(`  next: ${result.next_action}`);
  const report = result.body;
  if (!report || typeof report !== "object" || !("verdict" in report)) return lines;
  for (const check of report.checks ?? []) lines.push(`  ${check.ok ? "ok  " : "FAIL"}  ${check.name}: ${check.detail}`);
  for (const advisory of report.advisories ?? []) lines.push(`  NOTE  ${advisory.name}: ${advisory.detail}`);
  for (const row of remediation(report)) {
    lines.push(`  FIX   ${row.signal} → ${row.defect_class} (${row.definition_url})`);
    if (row.operator) lines.push(`        operator: ${row.operator}`);
    if (row.buyer) lines.push(`        buyer:    ${row.buyer}`);
  }
  return lines;
}
