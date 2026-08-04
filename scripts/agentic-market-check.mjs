#!/usr/bin/env node
/**
 * THE AGENTIC MARKET RECONCILIATION — why does our listing show fewer
 * doors than the shelf holds?
 *
 * Logged 2026-08-01: agentic.market/services/scvd-store showed 15
 * endpoints against a 23-item menu. The consumer skill.md (reviewed
 * 2026-08-04) supplied the exact schema their side parses, so the gap
 * can now be diagnosed instead of guessed at. Two candidate causes,
 * distinguishable by where an item is missing:
 *
 *   1. REGISTRATION: Bazaar discovery declarations ride every 402,
 *      but the facilitator catalogs an item only when a client ECHOES
 *      the declaration at settle (src/lib/bazaar-discovery.ts). An
 *      item nobody has bought with an extension-echoing v2 client
 *      since declaration never enters CDP's list — and a mirror
 *      cannot mirror what the source never held. Missing from BOTH
 *      CDP discovery and Agentic Market → this.
 *   2. SYNC/SCHEMA: present in CDP discovery but absent from Agentic
 *      Market → their ingest dropped it; check their publisher doc
 *      (agentic.market/llms.txt names the full agent guide).
 *
 * Read-only. Prints a three-way diff (menu / CDP discovery / Agentic
 * Market) and a per-missing-item verdict. Never writes, never spends.
 *
 * Usage, from the repo root:
 *
 *   npm run agentic:check                       # menu vs Agentic Market only
 *   CDP_KEY_FILE=~/Downloads/cdp_api_key.json npm run agentic:check
 *                                               # adds the CDP side, splits cause 1 from 2
 */

import { readFileSync } from "node:fs";

const STORE = "https://scvd.store";
const MARKET_SEARCH = "https://api.agentic.market/v1/services/search?q=scvd";
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
  const found = await getJson(MARKET_SEARCH);
  const service = (found.services ?? []).find(
    (entry) =>
      (entry.domain ?? "").includes("scvd") ||
      (entry.name ?? "").toLowerCase().includes("scvd"),
  );
  if (!service) {
    console.log("Agentic Market: NO service matched 'scvd' — the listing itself is gone, which is bigger news than any endpoint gap.");
  } else {
    marketEndpoints = (service.endpoints ?? []).map((endpoint) => endpoint.url);
    console.log(`Agentic Market: "${service.name}" with ${marketEndpoints.length} endpoints (category ${service.category ?? "?"}, networks ${JSON.stringify(service.networks ?? [])})`);
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
      ? "listed"
      : onCdp === false
        ? "REGISTRATION: never cataloged at the source — needs one settle from an extension-echoing v2 client (or a manual submission path, see their llms.txt)"
        : onCdp === true
          ? "SYNC: the source has it, their mirror dropped it — publisher-doc territory"
          : "missing from the market; run with CDP keys to name the cause";
  if (onMarket !== true) missing.push(id);
  console.log(`| ${id} | ${onMarket === null ? "?" : onMarket ? "yes" : "NO"} | ${onCdp === null ? "not checked" : onCdp ? "yes" : "NO"} | ${verdict} |`);
}

console.log("");
if (marketEndpoints !== null) {
  console.log(`${missing.length} of ${menuIds.length} menu items missing from the Agentic Market listing: ${missing.join(", ") || "none"}`);
}
console.log("");
console.log("Next doc to pull before any fix: https://agentic.market/llms.txt (their skill.md names it as the full agent guide; the publisher/update API is not in the buyer doc).");
