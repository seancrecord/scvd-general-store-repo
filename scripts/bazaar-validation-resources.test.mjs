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

test("expands current finite publication slugs and leaves archives out of the active check", () => {
  const rows = validationResources(menu, { paths: {
    "/almanac/a-page": { get: { "x-payment": {} } },
    "/almanac/{slug}": { get: { "x-payment": {}, parameters: [
      { in: "path", name: "slug", required: true, schema: { type: "string", enum: ["a-page", "keeper-page"] } },
    ] } },
    "/gazette/issue-1": { get: { "x-payment": {}, deprecated: true } },
  } });
  assert.deepEqual(rows.map(row => row.url), [
    "https://scvd.store/api/buy/hello", "https://scvd.store/almanac/a-page", "https://scvd.store/almanac/keeper-page",
  ]);
});

test("refuses unsafe or unbounded path substitutions", () => {
  for (const values of [[], ["../outside"], ["a?b"], ["a/b"], ["%2e%2e"], [42], Array.from({length: 501}, (_, i) => `entry-${i}`)]) {
    assert.throws(() => validationResources(menu, { paths: {
      "/almanac/{slug}": { get: { "x-payment": {}, parameters: [
        { in: "path", name: "slug", schema: { enum: values } },
      ] } },
    } }), /concrete|bounded|safe/);
  }
});
