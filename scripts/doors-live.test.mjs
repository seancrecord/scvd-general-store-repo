import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compareAnswers, renderRows } from "./lib/doors-live.mjs";

const answer = (over = {}) => ({
  status: 402,
  payment_required: "eyJ4NDAyVmVyc2lvbiI6Mn0=",
  content_type: "application/json; charset=utf-8",
  body: JSON.stringify({ error: "Payment required", item_id: "hello", archive_depth: { rounds: 3 } }),
  ...over,
});

test("the same answer agrees, whatever the archive depth said", () => {
  const a = answer();
  const b = answer({ body: JSON.stringify({ error: "Payment required", item_id: "hello", archive_depth: { rounds: 4 } }) });
  assert.deepEqual(compareAnswers(a, b), { verdict: "agrees", field: null });
});

test("a different status is named first, then the payment header, then the body", () => {
  assert.equal(compareAnswers(answer(), answer({ status: 404 })).field, "status 402 vs 404");
  assert.equal(compareAnswers(answer(), answer({ payment_required: "eyJ4NDAyVmVyc2lvbiI6MX0=" })).field, "PAYMENT-REQUIRED");
  assert.equal(compareAnswers(answer(), answer({ body: JSON.stringify({ error: "Payment required", item_id: "hullo" }) })).field, "body");
});

test("an unreachable side is not called a difference", () => {
  assert.deepEqual(compareAnswers({ error: "timeout" }, answer()), { verdict: "unreachable", field: "store: timeout" });
  assert.equal(compareAnswers(answer(), { error: "ECONNRESET" }).verdict, "unreachable");
});

test("a body that is not JSON is compared as text", () => {
  assert.equal(compareAnswers(answer({ body: "<html>" }), answer({ body: "<html>" })).verdict, "agrees");
  assert.equal(compareAnswers(answer({ body: "<html>" }), answer({ body: "<html/>" })).verdict, "differs");
});

test("the table names the Worker that answered when they differ", () => {
  const text = renderRows([
    { path: "/api/buy/hello", verdict: "agrees", field: null, doors: null },
    { path: "/api/buy/luckies", verdict: "differs", field: "body", doors: "not-ready" },
  ]);
  assert.match(text, /\/api\/buy\/hello\s+agrees/);
  assert.match(text, /\/api\/buy\/luckies\s+differs\s+body\s+\(doors→not-ready\)/);
});

const offer = (network, overrides = {}) => ({
  network, scheme: "exact", amount: "4000", asset: "0xabcdef", payTo: "0x123abc", ...overrides,
});
const quoted = (accepts) => answer({ payment_required: Buffer.from(JSON.stringify({ x402Version: 2, accepts })).toString("base64") });

test("identical purchase responses cannot hide a rail advertised only by discovery", () => {
  const base = offer("eip155:8453");
  const polygon = offer("eip155:137");
  const response = quoted([base]);
  const result = compareAnswers(response, response, [base, polygon]);
  assert.equal(result.verdict, "differs");
  assert.match(result.field, /discovery.*eip155:137/);
});

test("discovery comparison respects amount and destination, normalizes EVM casing only", () => {
  const base = offer("eip155:8453");
  const response = quoted([offer(base.network, { asset: "0xABCDEF", payTo: "0x123ABC", maxTimeoutSeconds: 60, extra: { name: "USDC" } })]);
  assert.equal(compareAnswers(response, response, [base]).verdict, "agrees");
  for (const change of [{ amount: "5000" }, { asset: "0x987def" }, { payTo: "0x987abc" }]) {
    assert.equal(compareAnswers(response, response, [{ ...base, ...change }]).verdict, "differs");
  }
  const solana = offer("solana:mainnet", { asset: "AbC", payTo: "DeF" });
  const sol = quoted([solana]);
  assert.equal(compareAnswers(sol, sol, [{ ...solana, payTo: "def" }]).verdict, "differs");
});

test("missing discovery terms or malformed challenges cannot count as agreement", () => {
  const response = quoted([offer("eip155:8453")]);
  assert.equal(compareAnswers(response, response, []).verdict, "differs");
  const malformed = answer({ payment_required: "not-json" });
  assert.equal(compareAnswers(malformed, malformed, [offer("eip155:8453")]).verdict, "differs");
  for (const body of [null, [], {}, { x402Version: 1, accepts: [offer("eip155:8453")] }]) {
    const bad = answer({ payment_required: Buffer.from(JSON.stringify(body)).toString("base64") });
    assert.equal(compareAnswers(bad, bad, [offer("eip155:8453")]).verdict, "differs");
  }
});

function runReader(resources) {
  const payment = quoted([offer("eip155:8453")]);
  const preload = `globalThis.fetch = async (url) => String(url).includes('/.well-known/')
    ? Response.json({resources:${JSON.stringify(resources)}})
    : new Response(${JSON.stringify(payment.body)}, {status:402,headers:{'content-type':'application/json','payment-required':${JSON.stringify(payment.payment_required)}}});`;
  return spawnSync(process.execPath, [
    "--import", `data:text/javascript,${encodeURIComponent(preload)}`,
    fileURLToPath(new URL("./doors-live.mjs", import.meta.url)),
    "--store=https://store.example", "--doors=https://same-edge.example", "--json",
  ], { encoding: "utf8", timeout: 10_000 });
}

test("the actual CLI detects discovery drift even when both hosts return the same quote", () => {
  const run = runReader([{ resource: "https://store.example/api/buy/hello", accepts: [offer("eip155:8453"), offer("eip155:137")] }]);
  assert.equal(run.status, 1, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.rows.length, 1);
  assert.match(report.rows[0].field, /discovery.*eip155:137/);
});

test("an empty discovery document is a failed instrument, not zero mismatches", () => {
  const run = runReader([]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /no paid doors/);
});
