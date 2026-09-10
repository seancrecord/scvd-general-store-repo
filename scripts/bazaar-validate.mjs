#!/usr/bin/env node
/** Free live preflight of our menu URLs. No payment, registration, or credentials. */
import { argv } from "node:process";

const MENU_URL = "https://scvd.store/menu.json";
const VALIDATE_URL = "https://api.cdp.coinbase.com/platform/v2/x402/validate";
const asJson = argv.includes("--json");
const log = (...values) => { if (!asJson) console.log(...values); };

function verdict(body) {
  if (!body || typeof body !== "object") return { state: "unreadable", detail: "No validation object returned." };
  const failures = Array.isArray(body.preflight) ? body.preflight.filter(row => row?.passed === false) : [];
  const detail = failures.map(row => `${row.check}: ${row.detail}`).join("; ") || body.simulation?.rejectionReason || "";
  const accepted = body.valid === true && body.simulation?.outcome === "accepted" && !failures.some(row => row.severity === "required");
  const rejected = body.valid === false && body.simulation?.outcome === "rejected";
  return {
    state: accepted ? "accepted" : rejected ? "rejected" : "unreadable",
    detail: accepted || rejected ? detail : "Missing or contradictory validation verdict. " + detail,
    ...(Object.hasOwn(body, "index") ? { index: body.index } : {}),
    preflight: body.preflight ?? null,
    simulation: body.simulation ?? null,
  };
}

async function validate(resource) {
  try {
    const response = await fetch(VALIDATE_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource, method: "GET" }), signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return { state: "probe_failed", detail: `Validator HTTP ${response.status}; no conclusion about the endpoint.` };
    try { return verdict(await response.json()); }
    catch { return { state: "unreadable", detail: "Validator did not return readable JSON." }; }
  } catch { return { state: "probe_failed", detail: "Validation request failed or timed out; no conclusion about the endpoint." }; }
}

const response = await fetch(MENU_URL, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Menu HTTP ${response.status}`);
const menu = await response.json();
if (!Array.isArray(menu.items) || !menu.items.length) throw new Error("Menu contained no items; nothing was checked.");
log(`Checking ${menu.items.length} menu URLs with Coinbase's free validator.\n`);
const results = [];
for (const item of menu.items) {
  if (typeof item.id !== "string" || !/^[a-z0-9_]+$/.test(item.id)) throw new Error("Menu contained an invalid item id.");
  const url = `https://scvd.store/api/buy/${item.id}`;
  const reading = await validate(url);
  results.push({ id: item.id, url, ...reading });
  log(`${reading.state.padEnd(13)} ${item.id}: ${reading.detail || "current metadata accepted"}`);
}
if (asJson) console.log(JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2));
else {
  for (const state of ["accepted", "rejected", "probe_failed", "unreadable"]) log(`${state}: ${results.filter(row => row.state === state).length}`);
  log("\nAcceptance means the current endpoint would be eligible for indexing. It does not establish past settlement, index presence, or freshness. Reconcile existing purchase receipts and facilitator discovery responses before considering another payment. Rejections need their reported cause investigated; failed or unreadable probes establish no endpoint verdict.");
}
