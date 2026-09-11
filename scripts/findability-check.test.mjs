import assert from "node:assert/strict";
import test from "node:test";
import { SIGNALS, readAll, readSignal, render, summarize } from "./lib/findability.mjs";

test("the table names each signal once, with a reader for every row", () => {
  const ids = SIGNALS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate signal id");
  for (const s of SIGNALS) {
    assert.ok(["repo", "site"].includes(s.where), s.id);
    assert.ok(s.readers.trim(), `${s.id} names nobody who reads it`);
    if (s.where === "site") assert.ok(s.path.startsWith("/"), `${s.id} site path must be absolute`);
    if (s.where === "repo") assert.ok(!s.path.startsWith("/"), `${s.id} repo path must be relative`);
  }
});

test("a repo signal is present or missing; a site signal is present on 2xx, missing otherwise, unreachable on a thrown read", async () => {
  const readers = {
    readRepo: async (path) => path === "server.json",
    readSite: async (path) => {
      if (path === "/robots.txt") return 200;
      if (path === "/ai.txt") return 404;
      throw new Error("dns");
    },
  };
  assert.equal((await readSignal({ id: "a", where: "repo", path: "server.json", readers: "x" }, readers)).state, "present");
  assert.equal((await readSignal({ id: "b", where: "repo", path: "nope.json", readers: "x" }, readers)).state, "missing");
  assert.equal((await readSignal({ id: "c", where: "site", path: "/robots.txt", readers: "x" }, readers)).state, "present");
  assert.equal((await readSignal({ id: "d", where: "site", path: "/ai.txt", readers: "x" }, readers)).state, "missing");
  assert.equal((await readSignal({ id: "e", where: "site", path: "/gone", readers: "x" }, readers)).state, "unreachable");
});

test("unreachable is never counted as missing, and the rendering says a missing row is a decision", async () => {
  const rows = await readAll(
    [
      { id: "a", where: "site", path: "/x", readers: "r" },
      { id: "b", where: "site", path: "/y", readers: "r" },
      { id: "c", where: "repo", path: "z", readers: "r" },
    ],
    { readRepo: async () => false, readSite: async (p) => { if (p === "/x") return 200; throw new Error("down"); } },
  );
  assert.deepEqual(summarize(rows), { present: 1, missing: 1, unreachable: 1, total: 3 });
  const text = render(rows);
  assert.match(text, /1 present, 1 missing, 1 unreachable, of 3 signals/);
  assert.match(text, /A missing row is a decision, not a defect/);
});
