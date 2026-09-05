import assert from "node:assert/strict";
import { test } from "node:test";
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
