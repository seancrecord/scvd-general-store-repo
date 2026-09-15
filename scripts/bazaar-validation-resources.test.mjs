import assert from "node:assert/strict";
import { test } from "node:test";
import { validationResources } from "./lib/bazaar-validation-resources.mjs";

const menu = { items: [{ id: "hello" }] };
test("validates paid publications as well as menu goods, once each", () => {
  const rows = validationResources(menu, { paths: {
    "/api/buy/hello": { get: { "x-payment": {} } },
    "/almanac/a-page": { get: { "x-payment": {} } },
    "/gazette/issue-1": { get: { "x-payment": {} } },
    "/free": { get: {} },
  } });
  assert.deepEqual(rows.map(row => row.url), [
    "https://scvd.store/api/buy/hello",
    "https://scvd.store/almanac/a-page",
    "https://scvd.store/gazette/issue-1",
  ]);
});

test("does not report complete coverage for an unreadable contract or unresolved paid route", () => {
  assert.throws(() => validationResources(menu, {}), /paths/);
  for (const path of ["/paid/{id}", "//other.example/paid", "https://other.example/paid"]) {
    assert.throws(() => validationResources(menu, { paths: { [path]: { get: { "x-payment": {} } } } }), /concrete|origin/);
  }
});
