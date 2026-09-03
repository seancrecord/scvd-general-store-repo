#!/usr/bin/env node
/**
 * THE PREFLIGHT ACTION'S ONE FILE (roadmap L7, 2026-09-02).
 *
 * Reads the doors from the environment the composite action sets,
 * POSTs each one to /api/preflight/v2 — one call per door, one probe
 * per call, metered like any caller — prints every check by name,
 * writes the store's own JSON to a file, sets the job outputs and
 * the step summary, and exits per the CLI's law:
 *
 *   0  every door answered on the ready side, or was unreachable and
 *      unreachable is not in fail_on;
 *   1  a door's verdict is in fail_on (not_ready by default);
 *   2  the caller asked for something malformed, or the store refused
 *      a URL before probing (http, a custom port, a private address,
 *      the store's own host) — nothing was probed, so the job fails
 *      loudly rather than passing on a door nobody looked at;
 *   3  the store itself, or the network between the runner and it,
 *      did not answer, including the probe-budget refusal (429).
 *
 * `unreachable` exits 0 by default and says so in the summary. The
 * store is explicit that it describes the network path from its
 * vantage at one moment and says nothing about the endpoint; a deploy
 * gate that failed on it would be drawing a conclusion the evidence
 * refuses. Choosing `fail_on: not_ready,unreachable` is the caller's
 * decision, made in writing in their workflow.
 *
 * Node builtins and global fetch only. Nothing installed.
 */
import { appendFileSync, writeFileSync } from "node:fs";

const EXIT = { ok: 0, verdictNegative: 1, usage: 2, unreachable: 3 };
const BATTERY = "v2";
const USER_AGENT = "scvd-preflight-action (+https://scvd.store/api/preflight/v2)";
const TIMEOUT_MS = 30_000;

/** The order the worst verdict is chosen in; higher index is worse. */
const SEVERITY = ["ready", "refused", "unreachable", "not_ready"];

function readInputs(env) {
  const urls = String(env.SCVD_PREFLIGHT_URLS ?? "")
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const failOn = new Set(
    String(env.SCVD_PREFLIGHT_FAIL_ON ?? "not_ready")
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean),
  );
  const base = String(env.SCVD_PREFLIGHT_BASE ?? "https://scvd.store").replace(/\/+$/, "");
  const reportPath = String(env.SCVD_PREFLIGHT_REPORT ?? "scvd-preflight.json");
  return { urls, failOn, base, reportPath };
}

/** One probe, through the store, with the response kept whole. */
export async function preflightOne(base, url, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${base}/api/preflight/${BATTERY}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT, accept: "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
    return {
      url,
      outcome: "store_unreachable",
      detail: `the store's probe budget refused this call (429${response.headers.get("retry-after") ? `, retry after ${response.headers.get("retry-after")}s` : ""}); nothing was probed`,
      status: 429,
      body,
    };
  }
  if (response.status !== 200 || !body || typeof body !== "object" || !("verdict" in body)) {
    return {
      url,
      outcome: "refused",
      detail: body && typeof body === "object" && body.error ? String(body.error) : `the store answered ${response.status} without a verdict`,
      status: response.status,
      body,
    };
  }
  return { url, outcome: body.verdict, detail: null, status: 200, body };
}

function checkLines(report) {
  const lines = [];
  for (const check of report.checks ?? []) {
    lines.push(`  ${check.ok ? "ok  " : "FAIL"}  ${check.name}: ${check.detail}`);
  }
  for (const advisory of report.advisories ?? []) {
    lines.push(`  NOTE  ${advisory.name}: ${advisory.detail}`);
  }
  return lines;
}

function summaryFor(results, failOn) {
  const rows = results.map((result) => {
    const verdict = result.outcome === "store_unreachable" ? "store unreachable" : result.outcome;
    const failed =
      result.body && result.body.checks
        ? result.body.checks.filter((check) => !check.ok).map((check) => `\`${check.name}\``).join(", ")
        : "";
    return `| ${result.url} | **${verdict}** | ${failed || (result.detail ?? "")} |`;
  });
  const caveat = failOn.has("unreachable")
    ? "This workflow chose to fail on `unreachable`. The store's own reading of that verdict: a fact about the network path from its vantage at one moment, not a finding about the endpoint."
    : "`unreachable` does not fail this job: it is a fact about the network path from the store's vantage at one moment, not a finding about the endpoint.";
  /*
   * WHAT TO DO ABOUT IT: the store's own remediation rows, one per
   * failed check or advisory a vocabulary class explains, with the
   * operator's half (this is a deploy gate; the operator is the
   * reader) and the definition URL. Printed, never derived here.
   */
  const fixes = results.flatMap((result) =>
    Array.isArray(result.body?.remediation)
      ? result.body.remediation
          .filter((row) => row.kind === "check")
          .map((row) => `- ${result.url}: \`${row.signal}\` is [${row.defect_class}](${row.definition_url}). ${row.operator}`)
      : [],
  );
  return [
    "## scvd preflight",
    "",
    "One probe per door against `/api/preflight/v2`, the free x402 door check at [scvd.store](https://scvd.store/api/preflight/v2). A pass says the door served a well-formed, payable 402 to one request at one moment. It is not an uptime claim and says nothing about delivery after payment.",
    "",
    "| door | verdict | failed checks / reason |",
    "| --- | --- | --- |",
    ...rows,
    "",
    ...(fixes.length > 0 ? ["### What to do", "", ...fixes, ""] : []),
    caveat,
    "",
    "Every check's name is in the store's [defect vocabulary](https://scvd.store/defects). The store's own JSON for each door is in the report file this step wrote.",
  ].join("\n");
}

function setOutput(env, name, value) {
  if (env.GITHUB_OUTPUT) {
    // Multi-line safe delimiter form.
    const delimiter = `scvd_${Math.random().toString(36).slice(2)}`;
    appendFileSync(env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
}

export async function main(env = process.env, fetchImpl = fetch, out = process.stdout) {
  const { urls, failOn, base, reportPath } = readInputs(env);
  if (urls.length === 0) {
    out.write("scvd preflight: no doors named. Set `urls` to one or more https URLs, one per line.\n");
    return EXIT.usage;
  }
  const results = [];
  for (const url of urls) {
    const result = await preflightOne(base, url, fetchImpl);
    results.push(result);
    out.write(`${url}\n  verdict: ${result.outcome === "store_unreachable" ? "store unreachable" : result.outcome}\n`);
    if (result.detail) out.write(`  ${result.detail}\n`);
    if (result.body && result.body.checks) out.write(`${checkLines(result.body).join("\n")}\n`);
    out.write("\n");
  }

  try {
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          what_this_is: `The store's own JSON for each door, verbatim, from POST ${base}/api/preflight/${BATTERY}. One probe per door at one moment; never an uptime claim.`,
          battery: BATTERY,
          checked_at: new Date().toISOString(),
          doors: results.map((result) => ({ url: result.url, outcome: result.outcome, detail: result.detail, status: result.status, report: result.body })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    out.write(`could not write ${reportPath}: ${String(error)}\n`);
  }

  const verdicts = Object.fromEntries(results.map((result) => [result.url, result.outcome]));
  const worst = results
    .map((result) => (result.outcome === "store_unreachable" ? "refused" : result.outcome))
    .sort((a, b) => SEVERITY.indexOf(b) - SEVERITY.indexOf(a))[0];
  setOutput(env, "verdicts", JSON.stringify(verdicts));
  setOutput(env, "worst", worst);
  setOutput(env, "report_path", reportPath);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summaryFor(results, failOn)}\n`);

  if (results.some((result) => result.outcome === "store_unreachable")) return EXIT.unreachable;
  if (results.some((result) => result.outcome === "refused")) return EXIT.usage;
  if (results.some((result) => failOn.has(result.outcome))) return EXIT.verdictNegative;
  return EXIT.ok;
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(EXIT.unreachable);
    },
  );
}
