#!/usr/bin/env node
/**
 * THE AGENTIC MARKET RECONCILIATION — why does our listing show fewer
 * doors than the shelf holds?
 *
 * Logged 2026-08-01: agentic.market/services/scvd-store showed 15
 * endpoints against a 23-item menu. Registration, ingestion, filtering
 * and query completeness are candidate explanations, not conclusions
 * licensed by a missing row.
 *
 * September 23: search returned 20 endpoints while service detail returned
 * 30. Read detail and report response-set differences. An optional CDP
 * comparison adds another observation; it does not establish eligibility,
 * complete-index coverage or the cause of an omission.
 *
 * Read-only. Prints a three-way diff (menu / CDP discovery / Agentic
 * Market). Never writes, never spends.
 *
 * Usage, from the repo root:
 *
 *   npm run agentic:check                       # menu vs Agentic Market only
 *   CDP_KEY_FILE=~/Downloads/cdp_api_key.json npm run agentic:check
 *                                               # adds the CDP response for comparison
 */

import { readFileSync } from "node:fs";
import { INDEX_URLS, readAgenticMarket } from "./lib/listing-versions.mjs";

const STORE = "https://scvd.store";
const CDP_HOST = "api.cdp.coinbase.com";

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
    // No .dev.vars is fine.
  }
}

function loadKeyFile() {
  const path = process.env.CDP_KEY_FILE;
  if (!path) return;
  const resolved = path.replace(/^~/, process.env.HOME ?? "~");
  const raw = readFileSync(resolved, "utf8");
  if (raw.trimStart().startsWith("{")) {
    const parsed = JSON.parse(raw);
    const id = parsed.id ?? parsed.name ?? parsed.apiKeyId;
    const secret = parsed.privateKey ?? parsed.privateKeySecret ?? parsed.secret;
    if (id) process.env.CDP_API_KEY_ID ||= String(id);
    if (secret) process.env.CDP_API_KEY_SECRET ||= String(secret);
  }
}

loadDevVars();
loadKeyFile();

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.json();
}

// ── Side 1: the shelf ────────────────────────────────────────────────
const menu = await getJson(`${STORE}/menu.json`);
// The catalog's items ride the top-level `items` array (src/routes/catalog.ts).
const menuItems = Array.isArray(menu.items) ? menu.items : [];
if (menuItems.length === 0) {
  console.error("Could not read items out of menu.json — its shape moved. Fix me before trusting anything below.");
  process.exit(1);
}
const menuIds = menuItems.map((item) => item.id);
console.log(`The shelf: ${menuIds.length} items on ${STORE}/menu.json`);

// ── Side 2: Agentic Market ───────────────────────────────────────────
let marketEndpoints = null;
try {
  const service = await getJson(INDEX_URLS.agentic_market);
  const reading = readAgenticMarket(service, new URL(STORE).host);
  if (reading.state !== "read") {
    console.log(`Agentic Market: unknown (${reading.note}); no absence claim.`);
  } else {
    marketEndpoints = service.endpoints.map((endpoint) => endpoint.url);
    console.log(`Agentic Market detail: "${service.name}" returned ${reading.endpoint_count} endpoints (category ${service.category ?? "?"}, networks ${JSON.stringify(service.networks ?? [])})`);
  }
} catch (error) {
  console.log(`Agentic Market: unreachable (${String(error)}) — rerun where the network allows it.`);
}

// ── Side 3: CDP discovery (optional, needs keys) ─────────────────────
let cdpUrls = null;
if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
  const { generateJwt } = await import("@coinbase/cdp-sdk/auth");
  const path = "/platform/v2/x402/discovery/search";
  for (const param of ["q", "query"]) {
    try {
      const token = await generateJwt({
        apiKeyId: process.env.CDP_API_KEY_ID,
        apiKeySecret: process.env.CDP_API_KEY_SECRET,
        requestMethod: "GET",
        requestHost: CDP_HOST,
        requestPath: path,
      });
      const body = await getJson(
        `https://${CDP_HOST}${path}?${param}=scvd.store`,
        { Authorization: `Bearer ${token}` },
      );
      const rows = body.items ?? body.resources ?? body.results ?? [];
      if (Array.isArray(rows)) {
        cdpUrls = rows
          .map((row) => row.resource ?? row.resourceUrl ?? row.url ?? "")
          .filter(Boolean);
        console.log(`CDP discovery: ${cdpUrls.length} resources for scvd.store (?${param}=)`);
        // INSTRUMENT HONESTY: the first run showed small_blessing ON
        // the mirror but "missing" from the source it mirrors — an
        // impossibility that means this extraction read the wrong
        // field. DEBUG=1 prints raw rows so the real shape can be
        // seen instead of guessed at.
        if (process.env.DEBUG) {
          console.log("First raw CDP rows:");
          for (const row of rows.slice(0, 3)) {
            console.log(JSON.stringify(row, null, 2));
          }
        }
        break;
      }
    } catch {
      // Try the next parameter spelling; report only if both fail.
    }
  }
  if (cdpUrls === null) {
    console.log("CDP discovery: both query spellings failed — check bazaar:check still works, the API may have moved.");
  }
} else {
  console.log("CDP discovery: skipped (no CDP keys — pass CDP_KEY_FILE to split registration gaps from sync gaps).");
}

// ── The diff, per menu item ──────────────────────────────────────────
const included = (urls, id) =>
  urls === null ? null : urls.some((url) => url.includes(`/api/buy/${id}`));

console.log("");
console.log("| item | on Agentic Market | in CDP discovery | verdict |");
console.log("|---|---|---|---|");
const missing = [];
for (const id of menuIds) {
  const onMarket = included(marketEndpoints, id);
  const onCdp = included(cdpUrls, id);
  const verdict =
    onMarket === true
      ? "in returned detail"
      : onMarket === null
        ? "market detail unread; no absence claim"
        : onCdp === false
          ? "not observed in either response; registration, eligibility and query completeness need checking"
          : onCdp === true
            ? "observed in source response, absent from market detail; sync/filtering needs checking"
            : "not in returned detail; cause and eligibility unverified";
  if (onMarket !== true) missing.push(id);
  console.log(`| ${id} | ${onMarket === null ? "?" : onMarket ? "yes" : "NO"} | ${onCdp === null ? "not checked" : onCdp ? "yes" : "NO"} | ${verdict} |`);
}

console.log("");
if (marketEndpoints !== null) {
  console.log(`${missing.length} of ${menuIds.length} menu items absent from the returned Agentic Market detail: ${missing.join(", ") || "none"}`);
}
console.log("");
console.log("Agent guide: https://agentic.market/llms.txt. Confirm publisher eligibility, source completeness and update mechanics before any external change.");
