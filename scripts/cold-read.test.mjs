import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deployLanded,
  median,
  parseServerTiming,
  renderBurst,
  renderSummary,
  summarize,
  summarizeBurst,
  summarizeControl,
} from "./lib/cold-read.mjs";

test("the store's Server-Timing line parses into the three figures", () => {
  assert.deepEqual(parseServerTiming("isolate;desc=cold, age;dur=0, req;dur=3"), {
    isolate: "cold",
    age: 0,
    req: 3,
  });
  assert.deepEqual(parseServerTiming("isolate;desc=warm, age;dur=673, req;dur=8"), {
    isolate: "warm",
    age: 673,
    req: 8,
  });
});

test("a missing or foreign line is unmarked, never guessed", () => {
  assert.deepEqual(parseServerTiming(undefined), {});
  assert.deepEqual(parseServerTiming(""), {});
  assert.deepEqual(parseServerTiming("cdn-cache;desc=HIT, edge;dur=1"), {});
});

test("median is the middle knock, or the mean of the two middles", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 3);
  assert.equal(median([]), null);
  assert.equal(median([NaN, 7]), 7);
});

test("the cold penalty is the cold first knock minus the warm median", () => {
  const s = summarize([
    { ms: 900, status: 402, timing: { isolate: "cold", age: 0, req: 3 } },
    { ms: 120, status: 402, timing: { isolate: "warm", age: 1, req: 0 } },
    { ms: 100, status: 402, timing: { isolate: "warm", age: 1, req: 0 } },
    { ms: 140, status: 402, timing: { isolate: "warm", age: 2, req: 0 } },
  ]);
  assert.equal(s.first_ms, 900);
  assert.equal(s.first_isolate, "cold");
  assert.equal(s.warm_median_ms, 120);
  assert.equal(s.warm_max_ms, 140);
  assert.equal(s.cold_penalty_ms, 780);
  assert.deepEqual(s.statuses, [402]);
});

test("a warm first knock has no penalty to report", () => {
  const s = summarize([
    { ms: 130, status: 402, timing: { isolate: "warm", age: 40, req: 0 } },
    { ms: 110, status: 402, timing: { isolate: "warm", age: 40, req: 0 } },
  ]);
  assert.equal(s.cold_penalty_ms, null);
  assert.match(renderSummary("https://x/", s, { known: false }), /was not cold/);
});

test("later cold, unmarked and failed requests cannot become the warm comparison", () => {
  const s = summarize([
    { ms: 900, status: 402, timing: { isolate: "cold" } },
    { ms: 800, status: 402, timing: { isolate: "cold" } },
    { ms: 30, status: 503, timing: { isolate: "warm" } },
    { ms: 100, status: 402, timing: { isolate: "warm" } },
    { ms: 1, status: 200, timing: {} },
    { ms: NaN, status: null, timing: {}, error: "timeout" },
  ]);
  assert.equal(s.warm_knocks, 1);
  assert.equal(s.warm_median_ms, 100);
  assert.equal(s.warm_max_ms, 100);
  assert.equal(s.cold_penalty_ms, 800);
  assert.deepEqual(s.coverage, {
    attempted: 6, answered: 5, failed: 1, http_errors: 1,
    subsequent: 5, comparable_warm: 1, excluded_from_warm: 4,
  });
  assert.match(renderSummary("https://x/", s, { known: false }), /answered 5\/6.*failed 1.*HTTP errors \(5xx\) 1/);
});

test("a fast HTTP failure or absent warm baseline never reports a cold penalty", () => {
  for (const first of [
    { ms: 5, status: 503, timing: { isolate: "cold" } },
    { ms: NaN, status: null, timing: {}, error: "timeout" },
  ]) {
    const s = summarize([first, { ms: 100, status: 402, timing: { isolate: "warm" } }]);
    assert.equal(s.cold_penalty_ms, null);
  }
  const s = summarize([
    { ms: 900, status: 402, timing: { isolate: "cold" } },
    { ms: 800, status: 402, timing: { isolate: "cold" } },
  ]);
  assert.equal(s.warm_median_ms, null);
  assert.equal(s.warm_max_ms, null);
  assert.equal(s.cold_penalty_ms, null);
  assert.match(renderSummary("https://x/", s, { known: false }), /no comparable warm response/);
});

test("a first knock slower than warm but unmarked is not called a cold penalty", () => {
  const s = summarize([
    { ms: 500, status: 200, timing: {} },
    { ms: 100, status: 200, timing: {} },
  ]);
  assert.equal(s.first_isolate, "unmarked");
  assert.equal(s.cold_penalty_ms, null);
});

test("an isolate older than the push means the deploy had not landed here", () => {
  const now = Date.parse("2026-09-05T12:20:00Z");
  const since = "2026-09-05T12:10:00Z"; // 600s before now
  assert.deepEqual(deployLanded(30, since, now), {
    known: true,
    landed: true,
    isolate_age_s: 30,
    seconds_since_push: 600,
  });
  assert.equal(deployLanded(900, since, now).landed, false);
  assert.equal(deployLanded(null, since, now).known, false);
  assert.equal(deployLanded(30, "", now).known, false);
  assert.equal(deployLanded(30, "not a date", now).known, false);
});

test("the burst counts isolates and 402s and names the slowest doors", () => {
  const b = summarizeBurst([
    { path: "/api/buy/a", ms: 90, status: 402, timing: { isolate: "warm" } },
    { path: "/api/buy/b", ms: 1200, status: 402, timing: { isolate: "cold" } },
    { path: "/api/buy/c", ms: 800, status: 402, timing: { isolate: "cold" } },
    { path: "/api/buy/d", ms: 95, status: 402, timing: {} },
    { path: "/api/buy/e", ms: NaN, status: null, timing: {}, error: "timeout" },
  ]);
  assert.equal(b.doors, 5);
  assert.equal(b.answered, 4);
  assert.equal(b.challenged_402, 4);
  assert.equal(b.cold_isolates, 2);
  assert.equal(b.warm_isolates, 1);
  assert.equal(b.unmarked, 1);
  assert.equal(b.max_ms, 1200);
  assert.deepEqual(
    b.slowest.map((s) => s.path),
    ["/api/buy/b", "/api/buy/c", "/api/buy/d"],
  );
  const text = renderBurst("https://scvd.store", b);
  assert.match(text, /answered 4\/5, 402 on 4; isolates: 2 cold, 1 warm, 1 unmarked/);
});

test("the summary line says NOT YET when the isolate predates the push", () => {
  const s = summarize([
    { ms: 300, status: 402, timing: { isolate: "warm", age: 5000, req: 0 } },
    { ms: 100, status: 402, timing: { isolate: "warm", age: 5000, req: 0 } },
  ]);
  const text = renderSummary("https://x/", s, {
    known: true,
    landed: false,
    isolate_age_s: 5000,
    seconds_since_push: 300,
  });
  assert.match(text, /NOT YET/);
});


test("the control uses the middle pair, not the upper middle, for an even sample", () => {
  const control = summarizeControl([
    { ms: 300, status: 200, timing: {} },
    { ms: 80, status: 200, timing: {} },
    { ms: 120, status: 200, timing: {} },
  ]);
  assert.equal(control.warm_median_ms, 100);
  assert.equal(control.vantage_floor_ms, 200);
});

test("control failures, changed statuses and marked cold responses do not become the baseline", () => {
  const control = summarizeControl([
    { ms: 300, status: 200, timing: {} },
    { ms: 1, status: 503, timing: {} },
    { ms: 100, status: 200, timing: {} },
    { ms: NaN, status: null, timing: {}, error: "timeout" },
    { ms: 140, status: 200, timing: {} },
    { ms: 900, status: 200, timing: { isolate: "cold" } },
  ]);
  assert.equal(control.warm_median_ms, 120);
  assert.equal(control.vantage_floor_ms, 180);
  assert.deepEqual(control.coverage, {
    attempted: 6, answered: 5, failed: 1, http_errors: 1,
    subsequent: 5, comparable_repeats: 2, excluded_from_comparison: 3,
  });
});

test("a failed, explicitly cold or missing first control has no comparison", () => {
  for (const first of [
    { ms: 5, status: 503, timing: {} },
    { ms: NaN, status: null, timing: {} },
    { ms: 300, status: 200, timing: { isolate: "cold" } },
  ]) {
    assert.equal(summarizeControl([first, { ms: 100, status: 200, timing: {} }]).vantage_floor_ms, null);
  }
  assert.equal(summarizeControl([]), null);
});
