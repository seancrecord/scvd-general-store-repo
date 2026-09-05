#!/usr/bin/env node
/**
 * npm run doors:live — do the doors and the store give the same answer
 * to the same unpaid knock, on the live wire?
 *
 * The parity test (test/doors-parity.spec.ts) proves it for the code;
 * this proves it for the deployment — the secrets, the KV ids, the
 * vars, the route — which no test in the tree can see. Two hosts, one
 * shelf: every paid door from the store's discovery document is
 * knocked on at both, unpaid, and the answers are compared on the
 * three things a buyer's client reads: the status, the
 * PAYMENT-REQUIRED header, and the JSON body. One row per door:
 * agrees, differs (the first differing field named), unreachable.
 *
 * BEFORE THE ROUTE IS FLIPPED the doors Worker answers only on its
 * workers.dev name, so:
 *
 *   npm run doors:live -- --doors=https://scvd-doors.<account>.workers.dev
 *
 * AFTER, the same command reads the pair through the route (the store
 * side is then reached over the doors' own hand-over, marked by the
 * X-Scvd-Doors header, and the table says which Worker answered).
 *
 * READ-ONLY: unpaid GETs and nothing else. Exit 0 when every door
 * agrees, 1 when any differs, 2 when the shelf could not be read.
 */
import { compareAnswers, renderRows } from "./lib/doors-live.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const STORE = value("store", "https://scvd.store").replace(/\/$/, "");
const DOORS = value("doors", "").replace(/\/$/, "");
const json = args.includes("--json");
const TIMEOUT_MS = 20_000;

if (!DOORS) {
  console.error("Say which host is the doors: npm run doors:live -- --doors=https://scvd-doors.<account>.workers.dev");
  process.exit(2);
}

async function paidDoors() {
  const res = await fetch(`${STORE}/.well-known/x402`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`discovery answered ${res.status}`);
  const doc = await res.json();
  const paths = [];
  for (const r of doc.resources ?? []) {
    const url = typeof r.resource === "string" ? r.resource : (r.resourceUrl ?? r.resource?.url);
    if (typeof url !== "string" || (r.method ?? "GET").toUpperCase() !== "GET") continue;
    const path = new URL(url).pathname;
    if (path.startsWith("/api/buy/")) paths.push(path);
  }
  return [...new Set(paths)];
}

async function knock(base, path) {
  try {
    const res = await fetch(base + path, {
      headers: { Accept: "application/json", "User-Agent": "scvd-doors-live/1 (+https://scvd.store)" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    return {
      status: res.status,
      payment_required: res.headers.get("payment-required"),
      content_type: res.headers.get("content-type"),
      handed: res.headers.get("x-scvd-doors"),
      body,
    };
  } catch (error) {
    return { error: error.message };
  }
}

let paths;
try {
  paths = await paidDoors();
} catch (error) {
  console.error(`could not read the shelf at ${STORE}: ${error.message}`);
  process.exit(2);
}
const rows = [];
for (const path of paths) {
  const [a, b] = await Promise.all([knock(STORE, path), knock(DOORS, path)]);
  rows.push({ path, ...compareAnswers(a, b), store: a.handed ?? null, doors: b.handed ?? null });
}
const differs = rows.filter((r) => r.verdict !== "agrees").length;
if (json) {
  console.log(JSON.stringify({ read_at: new Date().toISOString(), store: STORE, doors: DOORS, rows }, null, 2));
} else {
  console.log(`doors live, ${new Date().toISOString()}`);
  console.log(`  store ${STORE}\n  doors ${DOORS}\n`);
  console.log(renderRows(rows));
  console.log(`\n${rows.length - differs} of ${rows.length} doors agree`);
}
process.exit(differs ? 1 : 0);
