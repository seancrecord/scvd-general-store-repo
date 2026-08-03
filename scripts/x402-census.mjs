#!/usr/bin/env node
/**
 * THE X402 CENSUS — probe the discovery list's declared endpoints
 * through our own public preflight, and report the ecosystem's state
 * IN AGGREGATE.
 *
 * WHY THIS EXISTS. The standing watch and the preflight are products
 * waiting for buyers who don't know they exist. Independent research
 * put "57% of one directory's listings answer no x402 data at all" —
 * a number that got quoted everywhere, with somebody else's name on
 * it. This script produces OUR version of that number, first-party,
 * dated, and reproducible by anyone: every probe goes through the
 * public POST /api/preflight/v1, so a skeptic can re-run the entire
 * census against the same free endpoint without trusting us.
 *
 * THE CONSENT LINE, drawn before the first probe rather than after a
 * complaint (PROBLEMS.md 2026-08-03, the declined-leaderboard ruling):
 *
 *   - Probing a DECLARED x402 resource once is what every indexer and
 *     every prospective buyer does; declaring an endpoint in a public
 *     discovery document is an invitation to GET it expecting a 402.
 *   - What we PUBLISH is aggregate only: counts, percentages, failure
 *     modes. No per-service names, no ranking, no leaderboard.
 *   - The per-row results land in a GITIGNORED file for the keeper's
 *     eyes: private outreach to a failing operator ("your listing
 *     fails X; here's the free check") is help; publishing their name
 *     is a verdict nobody asked us for.
 *
 * Usage, from the repo root (keeper's machine; needs CDP keys the
 * same way bazaar-check does, and outbound network):
 *
 *   node scripts/x402-census.mjs                # whole list
 *   TOP=50 node scripts/x402-census.mjs         # cap the sample
 *   DRY_RUN=1 node scripts/x402-census.mjs      # fetch list, probe nothing
 *
 * Output: x402-census-results.json (gitignored, per-row, private) and
 * an aggregate summary on stdout, ready for the keeper's pen.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const HOST = "api.cdp.coinbase.com";
const DISCOVERY_PATH =
  process.env.DISCOVERY_PATH ?? "/platform/v2/x402/discovery/resources";
const STORE_URL = process.env.STORE_URL ?? "https://scvd.store";
const OWN_HOST = new URL(STORE_URL).host;
const RESULTS_FILE = "x402-census-results.json";
/**
 * Pace WELL under the preflight's 30/minute budget: this census must
 * never be the reason a real caller's probe gets a 429.
 */
const PROBE_INTERVAL_MS = 4000;

function loadDevVars() {
  try {
    const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Fine; the environment may already carry the keys.
  }
}
loadDevVars();

const apiKeyId = process.env.CDP_API_KEY_ID;
const apiKeySecret = process.env.CDP_API_KEY_SECRET;
if (!apiKeyId || !apiKeySecret) {
  console.error(
    "CDP_API_KEY_ID / CDP_API_KEY_SECRET required (env or .dev.vars) — same keys bazaar-check uses.",
  );
  process.exit(2);
}

async function getPage(requestPath) {
  const token = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: "GET",
    requestHost: HOST,
    requestPath: requestPath.split("?")[0],
  });
  const response = await fetch(`https://${HOST}${requestPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${requestPath} answered ${response.status}`);
  }
  return response.json();
}

/**
 * EVERY page, not the first one — this repo's bazaar-check once
 * printed ABSENT off a single page of a paginated list, and a census
 * that silently samples is the same instrument with a bigger claim.
 */
async function fetchAllResources() {
  const rows = [];
  let cursor;
  for (let page = 0; page < 100; page += 1) {
    const path = cursor
      ? `${DISCOVERY_PATH}?pageToken=${encodeURIComponent(cursor)}`
      : DISCOVERY_PATH;
    const body = await getPage(path);
    const items = body.items ?? body.resources ?? body.data ?? [];
    rows.push(...items);
    cursor = body.nextPageToken ?? body.next_page_token ?? body.cursor;
    if (!cursor || items.length === 0) {
      return { rows, complete: !cursor };
    }
  }
  return { rows, complete: false };
}

function resourceUrlOf(row) {
  const url = row.resourceUrl ?? row.resource_url ?? row.resource ?? row.url;
  return typeof url === "string" ? url : null;
}

/** Newest activity first when the list carries a signal for it. */
function activityOf(row) {
  const at = row.lastCalledAt ?? row.last_called_at ?? row.updatedAt;
  const parsed = at ? Date.parse(String(at)) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function probe(url) {
  const response = await fetch(`${STORE_URL}/api/preflight/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await response.json();
  if (response.status === 429) {
    return { verdict: "budget", detail: body.error };
  }
  if (response.status !== 200) {
    return { verdict: "refused", detail: body.error };
  }
  return {
    verdict: body.verdict,
    failed: (body.checks ?? [])
      .filter((check) => !check.ok)
      .map((check) => check.name),
    advisories: (body.advisories ?? []).map((advisory) => advisory.name),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log("Fetching the discovery list…");
const { rows, complete } = await fetchAllResources();
console.log(
  `${rows.length} resources listed${complete ? "" : " (PAGINATION INCOMPLETE — the census must say so)"}.`,
);

const seen = new Set();
let candidates = rows
  .map((row) => ({ url: resourceUrlOf(row), activity: activityOf(row) }))
  .filter((entry) => {
    if (!entry.url || !entry.url.startsWith("https://")) return false;
    let host;
    try {
      host = new URL(entry.url).host.toLowerCase();
    } catch {
      return false;
    }
    // One row per host: a census counts services, not routes. And our
    // own host is excluded — self-grading is not a census.
    if (host === OWN_HOST || seen.has(host)) return false;
    seen.add(host);
    return true;
  })
  .sort((a, b) => b.activity - a.activity);

const top = Number(process.env.TOP ?? candidates.length);
const dropped = Math.max(0, candidates.length - top);
candidates = candidates.slice(0, top);
console.log(
  `${candidates.length} distinct hosts to probe${dropped > 0 ? ` (TOP=${top}; ${dropped} dropped — the summary must say sampled, not surveyed)` : ""}.`,
);

if (process.env.DRY_RUN) {
  console.log("DRY_RUN set: probed nothing.");
  process.exit(0);
}

const results = [];
for (const [index, entry] of candidates.entries()) {
  process.stdout.write(`[${index + 1}/${candidates.length}] ${new URL(entry.url).host} … `);
  try {
    const outcome = await probe(entry.url);
    results.push({ url: entry.url, at: new Date().toISOString(), ...outcome });
    console.log(outcome.verdict + (outcome.failed?.length ? ` (${outcome.failed.join(",")})` : ""));
  } catch (error) {
    results.push({ url: entry.url, at: new Date().toISOString(), verdict: "census_error", detail: String(error) });
    console.log(`census_error: ${String(error)}`);
  }
  await sleep(PROBE_INTERVAL_MS);
}

writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

const tally = {};
for (const row of results) {
  tally[row.verdict] = (tally[row.verdict] ?? 0) + 1;
}
const failures = {};
const advisoryTally = {};
for (const row of results) {
  for (const name of row.failed ?? []) failures[name] = (failures[name] ?? 0) + 1;
  for (const name of row.advisories ?? []) advisoryTally[name] = (advisoryTally[name] ?? 0) + 1;
}
const probed = results.length;
const pct = (n) => `${Math.round((n / probed) * 100)}%`;

console.log("\n──── AGGREGATE (the only part that publishes) ────");
console.log(`Probed: ${probed} distinct hosts, one GET each, ${new Date().toISOString().slice(0, 10)}.`);
for (const [verdict, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${verdict}: ${count} (${pct(count)})`);
}
console.log("Failure modes (per failed check):");
for (const [name, count] of Object.entries(failures).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name}: ${count}`);
}
console.log("Advisories:");
for (const [name, count] of Object.entries(advisoryTally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name}: ${count}`);
}
console.log(`
Per-host rows: ${RESULTS_FILE} (gitignored — keeper's eyes; outreach
is help, publishing names is a verdict nobody asked for).

Method line for anything published: "One GET per declared resource on
${new Date().toISOString().slice(0, 10)}, via the free public checker at
${STORE_URL}/api/preflight/v1 — reproduce it yourself with the same
endpoint, no account needed." Aggregate numbers only.`);
