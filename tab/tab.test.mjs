import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvent,
  closestCategory,
  derive,
  readEvents,
  validateEvent,
} from "./store.mjs";
import {
  burnRollup,
  captureToolEvent,
  checkBeforeSignup,
  confirmEntry,
  needsAttention,
  recordCoverage,
  contributeDelta,
  exportTab,
  logToolEvent,
  setConsent,
  stackAudit,
  trialsConverting,
} from "./tools.mjs";

/**
 * THE TAB's tests, on Node's own runner — the vitest pool runs
 * inside a Worker with no filesystem, and the tab IS a filesystem
 * product. Each test gets a fresh file in a temp dir; nothing here
 * touches ~/.scvd or the network.
 */

function freshPath() {
  return join(mkdtempSync(join(tmpdir(), "tab-test-")), "tab.jsonl");
}

const soon = (days) =>
  new Date(Date.now() + days * 24 * 3600_000).toISOString().slice(0, 10);

const BASE = {
  tool_name: "ahrefs",
  problem_solved: "keyword research",
  category: "seo",
};

test("validation rejects with useful errors, not silence", () => {
  assert.ok(
    validateEvent({ ...BASE, event: "trial_started" })
      .join(" ")
      .includes("trial_ends"),
  );
  assert.ok(
    validateEvent({ ...BASE, event: "paid_started" })
      .join(" ")
      .includes("price"),
  );
  assert.ok(
    validateEvent({
      ...BASE,
      event: "price_changed",
      price: { amount: 25, currency: "USD", period: "month" },
    })
      .join(" ")
      .includes("previous_price"),
  );
  assert.ok(
    validateEvent({ ...BASE, event: "replaced" })
      .join(" ")
      .includes("replaced_with"),
  );
  // occurred_at is a claim, and claims must be marked.
  assert.ok(
    validateEvent({
      ...BASE,
      event: "trial_started",
      trial_ends: soon(7),
      occurred_at: "2026-03-01",
    })
      .join(" ")
      .includes("retroactive"),
  );
  // A category miss names the closest real one.
  const problems = validateEvent({
    ...BASE,
    category: "so",
    event: "trial_started",
    trial_ends: soon(7),
  });
  assert.ok(problems.join(" ").includes(`"${closestCategory("so")}"`));
});

test("the server stamps time; the caller cannot", () => {
  const path = freshPath();
  const result = appendEvent(path, {
    ...BASE,
    event: "trial_started",
    trial_ends: soon(7),
    server_timestamp: "1999-01-01T00:00:00Z", // an attempted lie
  });
  assert.equal(result.logged, true);
  const { events } = readEvents(path);
  assert.notEqual(events[0].server_timestamp, "1999-01-01T00:00:00Z");
  assert.ok(Date.parse(events[0].server_timestamp) > Date.parse("2026-01-01"));
});

test("replay derives burn, active set, and drift — never stores them", () => {
  const path = freshPath();
  appendEvent(path, { ...BASE, event: "trial_started", trial_ends: soon(7) });
  appendEvent(path, {
    ...BASE,
    event: "paid_started",
    price: { amount: 29, currency: "USD", period: "month" },
  });
  appendEvent(path, {
    tool_name: "vercel",
    problem_solved: "hosting the store",
    category: "hosting",
    event: "paid_started",
    price: { amount: 240, currency: "USD", period: "year" },
  });
  appendEvent(path, {
    tool_name: "vercel",
    problem_solved: "hosting the store",
    category: "hosting",
    event: "price_changed",
    previous_price: { amount: 240, currency: "USD", period: "year" },
    price: { amount: 300, currency: "USD", period: "year" },
  });
  const state = derive(readEvents(path).events);
  // 29 + 300/12 = 54, to the cent.
  assert.equal(state.monthly_burn.amount, 54);
  assert.equal(state.active_paid.length, 2);
  assert.equal(state.drift.length, 1);
  assert.equal(state.drift[0].previous_price.amount, 240);
});

test("canceled and replaced leave the active set; the successor arrives on its own feet", () => {
  const path = freshPath();
  appendEvent(path, {
    tool_name: "deepseek-v4",
    problem_solved: "agent reasoning",
    category: "llm",
    event: "paid_started",
    price: { amount: 10, currency: "USD", period: "month" },
  });
  appendEvent(path, {
    tool_name: "deepseek-v4",
    problem_solved: "agent reasoning",
    category: "llm",
    event: "replaced",
    replaced_with: "kimi-k3",
  });
  const state = derive(readEvents(path).events);
  assert.equal(state.active.length, 0);
  assert.equal(state.tools.get("deepseek-v4").status, "inactive");
});

test("trials_converting_soon is the headline: horizon respected, days counted", () => {
  const path = freshPath();
  logToolEvent(
    { ...BASE, tool_name: "midjourney", category: "image-gen", event: "trial_started", trial_ends: soon(3) },
    path,
  );
  logToolEvent(
    { ...BASE, tool_name: "jasper", category: "design", event: "trial_started", trial_ends: soon(30) },
    path,
  );
  const inWeek = trialsConverting({ days: 7 }, path);
  assert.equal(inWeek.converting.length, 1);
  assert.equal(inWeek.converting[0].tool_name, "midjourney");
  assert.ok(inWeek.converting[0].days_left <= 3);
});

test("a trial past its end leaves the warning list and lands in unresolved, honestly framed", () => {
  const path = freshPath();
  // Test-plan item 11, fixed rather than left as a soft spot: a
  // warning that never resolves teaches the reader to ignore
  // warnings, so ended-and-silent trials get their own list.
  logToolEvent(
    {
      ...BASE,
      tool_name: "midjourney",
      category: "image-gen",
      event: "trial_started",
      trial_ends: "2026-08-14",
      retroactive: true,
      occurred_at: "2026-08-07",
    },
    path,
  );
  // Rewind the end into the past by logging with a past trial_ends.
  const path2 = freshPath();
  logToolEvent(
    {
      ...BASE,
      tool_name: "jasper",
      category: "design",
      event: "trial_started",
      trial_ends: "2026-01-10",
      retroactive: true,
      occurred_at: "2026-01-03",
    },
    path2,
  );
  const result = trialsConverting({}, path2);
  assert.equal(result.converting.length, 0);
  assert.equal(result.past_end_unresolved.length, 1);
  assert.equal(result.past_end_unresolved[0].tool_name, "jasper");
  assert.ok(result.past_end_unresolved[0].days_since_end > 100);
  assert.ok(result.past_end_note.includes("does not know what happened"));
});

test("check_before_signup states facts, renders no verdict, remembers the wall", () => {
  const path = freshPath();
  logToolEvent(
    {
      tool_name: "twitter-api",
      problem_solved: "posting for the store",
      category: "social-scheduling",
      event: "trial_started",
      trial_ends: soon(7),
      signup_friction: "phone_required",
    },
    path,
  );
  const answer = checkBeforeSignup({ tool_name: "twitter-api" }, path);
  assert.equal(answer.seen_before, true);
  assert.ok(answer.summary.includes("phone_required"));
  assert.ok(answer.summary.includes("a human was needed at the door"));
  // Facts only: none of the judgment words the spec banned.
  for (const banned of ["risk", "should", "recommend", "avoid"]) {
    assert.ok(!answer.summary.toLowerCase().includes(banned), banned);
  }
});

test("stack_audit counts the stack's friction and labels 'unused' honestly", () => {
  const path = freshPath();
  logToolEvent(
    { ...BASE, event: "paid_started", price: { amount: 29, currency: "USD", period: "month" }, signup_friction: "agent_native" },
    path,
  );
  logToolEvent(
    {
      tool_name: "twitter-api",
      problem_solved: "posting",
      category: "social-scheduling",
      event: "trial_started",
      trial_ends: soon(7),
      signup_friction: "phone_required",
    },
    path,
  );
  const audit = stackAudit({}, path);
  assert.equal(audit.signup_friction.counts.agent_native, 1);
  assert.equal(audit.signup_friction.counts.phone_required, 1);
  assert.equal(audit.signup_friction.human_required[0].tool_name, "twitter-api");
  assert.ok(audit.unused_note.includes("commitment silence"));
});

test("consent is an event; contribution refuses without it and explains exactly what would be shared", () => {
  const path = freshPath();
  const refused = contributeDelta(
    { kind: "opened", tool_name: "ahrefs", category: "seo", week: "2026-W32" },
    path,
  );
  assert.equal(refused.accepted, false);
  assert.ok(refused.error.includes("EXACTLY"));
  assert.ok(refused.error.includes("Never sent"));

  setConsent({ contribute: true }, path);
  const { events } = readEvents(path);
  assert.equal(events[events.length - 1].event, "consent_changed");

  // Consent on, endpoint not live: validates, sends nothing, says so.
  const notLive = contributeDelta(
    { kind: "opened", tool_name: "ahrefs", category: "seo", week: "2026-W32" },
    path,
  );
  assert.equal(notLive.accepted, false);
  assert.ok(notLive.error.includes("not live"));
});

test("the delta is an allowlist: unknown fields are refused BY NAME, and the wire gets a projection", () => {
  const path = freshPath();
  setConsent({ contribute: true }, path);
  // Red team F2: the first cut blocklisted five fields and forwarded
  // everything else. Now ANY undeclared field is refused — including
  // ones no blocklist author thought of.
  const rejected = contributeDelta(
    {
      kind: "outcome",
      tool_name: "ahrefs",
      category: "seo",
      outcome: "canceled_pre_conversion",
      weeks_held: 2,
      price: { amount: 29, currency: "USD", period: "month" },
      builder_email: "keeper@example.com",
    },
    path,
  );
  assert.equal(rejected.accepted, false);
  const said = rejected.problems.join(" ");
  assert.ok(said.includes('"price"'));
  assert.ok(said.includes('"builder_email"'));
  // Friction is signup-time: not in the outcome allowlist.
  const wrongKind = contributeDelta(
    {
      kind: "outcome",
      tool_name: "ahrefs",
      category: "seo",
      outcome: "replaced",
      weeks_held: 2,
      replaced_with: "semrush",
      signup_friction: "agent_native",
    },
    path,
  );
  assert.ok(wrongKind.problems.join(" ").includes('"signup_friction"'));
  // And a clean delta's would_send is the projection, nothing more.
  const clean = contributeDelta(
    { kind: "opened", tool_name: "ahrefs", category: "seo", week: "2026-W32" },
    path,
  );
  assert.deepEqual(Object.keys(clean.would_send).sort(), [
    "category",
    "kind",
    "tool_name",
    "week",
  ]);
});

test("consent has one door: the logging tool refuses consent_changed", () => {
  const path = freshPath();
  // Red team F1: without this gate, any caller could flip consent
  // through log_tool_event and skip set_consent's explainer entirely.
  const result = logToolEvent({ event: "consent_changed", contribute: true }, path);
  assert.equal(result.logged, false);
  assert.ok(result.problems.join(" ").includes("set_consent"));
  // And nothing was written: the file stays consentless.
  const refused = contributeDelta(
    { kind: "opened", tool_name: "ahrefs", category: "seo", week: "2026-W32" },
    path,
  );
  assert.equal(refused.accepted, false);
});

test("weeks_held measures the commitment's own life, not the distance to now", () => {
  const path = freshPath();
  setConsent({ contribute: true }, path);
  // Red team F3, the backfill shape: a March trial canceled two weeks
  // later, logged retroactively months after the fact, must report
  // TWO weeks — not the months between March and today.
  logToolEvent(
    {
      ...BASE,
      event: "trial_started",
      trial_ends: "2026-03-21",
      retroactive: true,
      occurred_at: "2026-03-14",
    },
    path,
  );
  const canceled = logToolEvent(
    { ...BASE, event: "canceled", retroactive: true, occurred_at: "2026-03-28" },
    path,
  );
  assert.equal(canceled.contribution_suggestion.weeks_held, 2);
});

test("a re-trial after a cancel is a new commitment: epoch and conversion reset", () => {
  const path = freshPath();
  setConsent({ contribute: true }, path);
  // Red team F4: pay, cancel, then re-trial much later and cancel
  // fast — the second outcome must be pre-conversion and short, not
  // post-conversion and a year long.
  logToolEvent(
    {
      ...BASE,
      event: "paid_started",
      price: { amount: 29, currency: "USD", period: "month" },
      retroactive: true,
      occurred_at: "2025-08-01",
    },
    path,
  );
  logToolEvent(
    { ...BASE, event: "canceled", retroactive: true, occurred_at: "2025-09-01" },
    path,
  );
  logToolEvent(
    {
      ...BASE,
      event: "trial_started",
      trial_ends: "2026-08-14",
      retroactive: true,
      occurred_at: "2026-08-01",
    },
    path,
  );
  const second = logToolEvent(
    { ...BASE, event: "canceled", retroactive: true, occurred_at: "2026-08-08" },
    path,
  );
  assert.equal(second.contribution_suggestion.outcome, "canceled_pre_conversion");
  assert.equal(second.contribution_suggestion.weeks_held, 1);
});

test("field caps hold, and near-duplicate tool names are refused with the fix", () => {
  const path = freshPath();
  const tooLong = logToolEvent(
    { ...BASE, event: "trial_started", trial_ends: soon(7), problem_solved: "x".repeat(501) },
    path,
  );
  assert.equal(tooLong.logged, false);
  assert.ok(tooLong.problems.join(" ").includes("500"));
  const padded = logToolEvent(
    { ...BASE, tool_name: " Ahrefs", event: "trial_started", trial_ends: soon(7) },
    path,
  );
  assert.equal(padded.logged, false);
  assert.ok(padded.problems.join(" ").includes('"ahrefs"'));
});

test("the contribution suggestion appears with consent, carries friction, and classifies the cancel", () => {
  const path = freshPath();
  setConsent({ contribute: true }, path);
  const opened = logToolEvent(
    { ...BASE, event: "trial_started", trial_ends: soon(7), signup_friction: "email_only" },
    path,
  );
  assert.equal(opened.contribution_suggestion.kind, "opened");
  assert.equal(opened.contribution_suggestion.signup_friction, "email_only");
  assert.match(opened.contribution_suggestion.week, /^\d{4}-W\d{2}$/);

  // Canceled without ever paying: pre-conversion, and the suggestion
  // must never leak price or problem text.
  const canceled = logToolEvent({ ...BASE, event: "canceled" }, path);
  assert.equal(canceled.contribution_suggestion.outcome, "canceled_pre_conversion");
  assert.equal(canceled.contribution_suggestion.price, undefined);
  assert.equal(canceled.contribution_suggestion.problem_solved, undefined);
});

test("no suggestion without consent — the tab stays quiet by default", () => {
  const path = freshPath();
  const result = logToolEvent(
    { ...BASE, event: "trial_started", trial_ends: soon(7) },
    path,
  );
  assert.equal(result.contribution_suggestion, undefined);
});

test("retroactive backfill records real dates as marked claims", () => {
  const path = freshPath();
  logToolEvent(
    {
      ...BASE,
      event: "trial_started",
      trial_ends: "2026-03-21",
      retroactive: true,
      occurred_at: "2026-03-14",
    },
    path,
  );
  const answer = checkBeforeSignup({ tool_name: "ahrefs" }, path);
  assert.ok(answer.history[0].date.startsWith("2026-03-14"));
  assert.equal(answer.history[0].retroactive, true);
});

test("export hands the whole file back, and csv escapes the builder's own words", () => {
  const path = freshPath();
  logToolEvent(
    { ...BASE, event: "trial_started", trial_ends: soon(7), notes: 'said "maybe", we\'ll see' },
    path,
  );
  const jsonl = exportTab({ format: "jsonl" }, path);
  assert.equal(jsonl.content, readFileSync(path, "utf8"));
  const csv = exportTab({ format: "csv" }, path);
  assert.ok(csv.content.includes('"said ""maybe"", we\'ll see"'));
});

test("csv export defuses spreadsheet formulas in the builder's own text", () => {
  const path = freshPath();
  logToolEvent(
    { ...BASE, event: "trial_started", trial_ends: soon(7), notes: "=SUM(A1:A9)" },
    path,
  );
  const csv = exportTab({ format: "csv" }, path);
  // Red team F8: opens as text, never executes.
  assert.ok(csv.content.includes("\"'=SUM(A1:A9)\""));
});

test("a corrupt line is counted, not fatal, and the audit says so", () => {
  const path = freshPath();
  logToolEvent({ ...BASE, event: "trial_started", trial_ends: soon(7) }, path);
  // Somebody edited the file by hand. Their right; our resilience.
  appendFileSync(path, "not json at all\n");
  const audit = stackAudit({}, path);
  assert.equal(audit.bad_lines, 1);
  assert.ok(audit.bad_lines_note.includes("yours"));
});

/**
 * v0.3 — the gap-closing pass. Each test below is one row of the
 * coverage enumeration made mechanical.
 */

test("adopted logs a free tool, keeps it out of burn, and refuses a price", () => {
  const path = freshPath();
  const ok = logToolEvent(
    {
      tool_name: "scvd-tab",
      event: "adopted",
      problem_solved: "keeping track of every tool I sign up for",
      category: "mcp-server",
      signup_friction: "agent_native",
    },
    path,
  );
  assert.equal(ok.logged, true);
  const audit = stackAudit({}, path);
  // Free means free: no phantom conversion warning, no burn.
  assert.equal(audit.monthly_burn.amount, 0);
  assert.equal(audit.trials_converting_soon.length, 0);
  // A priced "adopted" would lie to the pooled index.
  const priced = logToolEvent(
    {
      tool_name: "notfree",
      event: "adopted",
      problem_solved: "x",
      category: "other",
      price: { amount: 9, currency: "USD", period: "month" },
    },
    path,
  );
  assert.equal(priced.logged, false);
  assert.ok(priced.problems.join(" ").includes("paid_started"));
});

test("a re-found receipt does not become a second charge", () => {
  const path = freshPath();
  const receipt = {
    tool_name: "vercel",
    event: "paid_started",
    problem_solved: "hosting",
    category: "hosting",
    price: { amount: 20, currency: "USD", period: "month" },
    source: "mail_sweep",
    dedupe_key: "<msg-abc123@mail.vercel.com>",
  };
  assert.equal(logToolEvent(receipt, path).logged, true);
  const second = logToolEvent(receipt, path);
  assert.equal(second.logged, false);
  assert.equal(second.duplicate, true);
  // The burn saw it once.
  assert.equal(stackAudit({}, path).monthly_burn.amount, 20);
});

test("capture never refuses, and names what it did not invent", () => {
  const path = freshPath();
  const bare = captureToolEvent({ tool_name: "Seedance " }, path);
  assert.equal(bare.logged, true);
  assert.deepEqual(bare.incomplete, ["event", "problem_solved", "category"]);
  // A trial with no end date cannot warn anybody — so it is not
  // recorded as a trial with an invented date.
  const noEnd = captureToolEvent(
    { tool_name: "midjourney", event: "trial_started", category: "image-gen" },
    path,
  );
  assert.ok(noEnd.incomplete.includes("trial_ends"));
  assert.equal(trialsConverting({}, path).converting.length, 0);
});

test("the rollup groups, annualizes, and replays the trajectory", () => {
  const path = freshPath();
  const old = new Date(Date.now() - 200 * 24 * 3600_000).toISOString();
  logToolEvent(
    { tool_name: "midjourney", event: "paid_started", problem_solved: "art", category: "image-gen",
      price: { amount: 30, currency: "USD", period: "month" }, retroactive: true, occurred_at: old },
    path,
  );
  logToolEvent(
    { tool_name: "leonardo", event: "paid_started", problem_solved: "art", category: "image-gen",
      price: { amount: 24, currency: "USD", period: "month" } },
    path,
  );
  logToolEvent(
    { tool_name: "vercel", event: "paid_started", problem_solved: "hosting", category: "hosting",
      price: { amount: 240, currency: "USD", period: "year" } },
    path,
  );
  const roll = burnRollup({ since_days: 90 }, path);
  // 30 + 24 + 20 = 74
  assert.equal(roll.monthly, 74);
  assert.equal(roll.annualized, 888);
  // The grouping is what stings: image-gen is 54 across two tools.
  const imageGen = roll.by_category.find((row) => row.category === "image-gen");
  assert.equal(imageGen.monthly, 54);
  assert.equal(imageGen.tools.length, 2);
  // Trajectory: 90 days ago only midjourney existed.
  assert.equal(roll.trajectory.then, 30);
  assert.equal(roll.trajectory.change, 44);
  assert.deepEqual(
    roll.trajectory.arrived_since.map((t) => t.tool_name).sort(),
    ["leonardo", "vercel"],
  );
  // The shareable form names counts, never vendors.
  assert.ok(roll.anonymized_badge.includes("$74/mo"));
  for (const vendor of ["midjourney", "leonardo", "vercel"]) {
    assert.ok(!roll.anonymized_badge.includes(vendor), vendor);
  }
});

test("the variability window divides like with like, and keeps its history", () => {
  const path = freshPath();
  logToolEvent(
    { tool_name: "vercel", event: "paid_started", problem_solved: "hosting", category: "hosting",
      price: { amount: 90, currency: "USD", period: "month" }, source: "mail_sweep" },
    path,
  );
  // Before any sweep: null, never a fabricated zero.
  const cold = burnRollup({}, path).coverage;
  assert.equal(cold.variability_pct, null);
  assert.ok(cold.variability_basis.includes("Null, not zero"));

  /**
   * RED TEAM F1: the first cut divided monthly BURN (a rate) by a sum
   * of absolute charges over an arbitrary span, and the old test hid
   * it by picking numbers that looked plausible. Both sides now come
   * from the SWEEP'S OWN WINDOW: $270 placed, $30 not, over the same
   * three months → 10%, and it means what it says.
   */
  recordCoverage(
    {
      addresses_swept: ["keeper@example.com"],
      window_from: "2026-05-01T00:00:00.000Z",
      window_to: "2026-08-01T00:00:00.000Z",
      matched: 3,
      attributed_amount: 270,
      unmatched_transactional: [{ amount: 30, currency: "USD", sender: "noreply@unknown.io" }],
    },
    path,
  );
  const coverage = burnRollup({}, path).coverage;
  assert.equal(coverage.variability_pct, 10);
  assert.ok(coverage.variability_basis.includes("Same window, same units"));
  assert.equal(coverage.unmatched_transactional_count, 1);
  assert.equal(coverage.sweep_stale, "no");
  assert.ok(coverage.what_this_cannot_see.length >= 3);

  // F2: a second sweep does not erase the first — the number has to
  // be watchable over time or it cannot be chased toward 2%.
  recordCoverage(
    {
      window_from: "2026-08-01T00:00:00.000Z",
      window_to: "2026-08-08T00:00:00.000Z",
      attributed_amount: 396,
      unmatched_transactional: [{ amount: 4, currency: "USD", sender: "noreply@unknown.io" }],
    },
    path,
  );
  const after = burnRollup({}, path).coverage;
  assert.equal(after.variability_pct, 1);
  assert.equal(after.variability_history.length, 2);
  assert.deepEqual(after.variability_history.map((h) => h.pct), [10, 1]);
});

test("coverage records on a fresh install, before anything is logged", () => {
  // F4: recordCoverage used a bare writeFileSync while appendEvent
  // made its directory — so reporting coverage first threw ENOENT.
  const path = join(mkdtempSync(join(tmpdir(), "tab-fresh-")), "nested", "tab.jsonl");
  const result = recordCoverage({ attributed_amount: 0, unmatched_transactional: [] }, path);
  assert.equal(result.recorded, true);
});

test("capture's last resort keeps every failure, distinctly", () => {
  const path = freshPath();
  // F3/F5: two unshapeable captures in one day used to collide on a
  // derived dedupe key — the second silently dropped by the lane
  // whose whole contract is that nothing is lost — and both wore the
  // same name, collapsing distinct failures into one pseudo-tool.
  const a = captureToolEvent({ tool_name: "x".repeat(200), captured_text: "first" }, path);
  const b = captureToolEvent({ tool_name: "y".repeat(200), captured_text: "second" }, path);
  assert.equal(a.logged, true);
  assert.equal(b.logged, true);
  const { events } = readEvents(path);
  const rescued = events.filter((e) => e.source === "capture" && e.captured_text);
  assert.equal(rescued.length, 2);
  assert.equal(new Set(rescued.map((e) => e.dedupe_key)).size, 2);
  assert.deepEqual(rescued.map((e) => e.captured_text), ["first", "second"]);
});

test("the escape hatch takes the coverage record too", () => {
  const path = freshPath();
  logToolEvent({ ...BASE, event: "trial_started", trial_ends: soon(7) }, path);
  recordCoverage({ attributed_amount: 1, unmatched_transactional: [] }, path);
  // F6: a partial export is a partial escape.
  const out = exportTab({ format: "jsonl" }, path);
  assert.ok(out.coverage_jsonl.includes("attributed_amount"));
});

test("silence is a question only where the heartbeat was seen first", () => {
  const path = freshPath();
  const long = new Date(Date.now() - 100 * 24 * 3600_000).toISOString();
  // Never renewed: silence says nothing, so nothing is claimed.
  logToolEvent(
    { tool_name: "quietone", event: "paid_started", problem_solved: "x", category: "other",
      price: { amount: 5, currency: "USD", period: "month" }, retroactive: true, occurred_at: long },
    path,
  );
  assert.equal(stackAudit({}, path).quiet_past_cycle.length, 0);
  // Heartbeat seen, then stopped: that is a real question.
  logToolEvent(
    { tool_name: "jasper", event: "paid_started", problem_solved: "x", category: "design",
      price: { amount: 49, currency: "USD", period: "month" }, retroactive: true, occurred_at: long },
    path,
  );
  logToolEvent(
    { tool_name: "jasper", event: "renewed", problem_solved: "x", category: "design",
      price: { amount: 49, currency: "USD", period: "month" }, retroactive: true, occurred_at: long },
    path,
  );
  const quiet = stackAudit({}, path).quiet_past_cycle;
  assert.equal(quiet.length, 1);
  assert.equal(quiet[0].tool_name, "jasper");
});

test("near-duplicate names are surfaced, never merged", () => {
  const path = freshPath();
  for (const name of ["openai", "openai-llc"]) {
    logToolEvent(
      { tool_name: name, event: "paid_started", problem_solved: "models", category: "llm",
        price: { amount: 20, currency: "USD", period: "month" } },
      path,
    );
  }
  const audit = stackAudit({}, path);
  assert.equal(audit.possible_aliases.length, 1);
  // Not merged: the burn still counts both, honestly, until told.
  assert.equal(audit.monthly_burn.amount, 40);
});

test("swept entries are unconfirmed and cannot reach the corpus until a human looks", () => {
  const path = freshPath();
  setConsent({ contribute: true }, path);
  // The second stress sweep's conclusion: confirmation is the only
  // load-bearing layer — quarantine, schema checks and DKIM are all
  // filtering. So a swept entry counts toward YOUR burn and offers
  // no contribution suggestion at all.
  const swept = logToolEvent(
    { tool_name: "ahrefs", event: "paid_started", problem_solved: "seo", category: "seo",
      price: { amount: 29, currency: "USD", period: "month" }, source: "mail_sweep" },
    path,
  );
  assert.equal(swept.logged, true);
  assert.equal(swept.contribution_suggestion, undefined);
  assert.equal(stackAudit({}, path).monthly_burn.amount, 29);
  assert.equal(burnRollup({}, path).coverage.unconfirmed_tools, 1);
  assert.equal(burnRollup({}, path).coverage.unconfirmed_monthly, 29);
  // A human looks; now it may contribute.
  const ok = confirmEntry({ tool_name: "ahrefs" }, path);
  assert.equal(ok.confirmed, true);
  const after = logToolEvent(
    { tool_name: "ahrefs", event: "canceled", problem_solved: "seo", category: "seo" },
    path,
  );
  assert.ok(after.contribution_suggestion);
});

test("private never leaves the box — not in a delta, not in a count", () => {
  const path = freshPath();
  setConsent({ contribute: true }, path);
  logToolEvent(
    { tool_name: "betterhelp", event: "paid_started", problem_solved: "personal", category: "other",
      price: { amount: 60, currency: "USD", period: "month" }, private: true },
    path,
  );
  logToolEvent(
    { tool_name: "vercel", event: "paid_started", problem_solved: "hosting", category: "hosting",
      price: { amount: 20, currency: "USD", period: "month" } },
    path,
  );
  // Your own burn is complete and honest.
  assert.equal(stackAudit({}, path).monthly_burn.amount, 80);
  // The shareable badge excludes it from the COUNT, not just the name.
  const roll = burnRollup({}, path);
  assert.ok(roll.anonymized_badge.startsWith("1 tools · $20/mo"));
  assert.ok(!roll.anonymized_badge.includes("60"));
  // And no delta is ever suggested for it.
  const cancel = logToolEvent(
    { tool_name: "betterhelp", event: "canceled", problem_solved: "personal", category: "other" },
    path,
  );
  assert.equal(cancel.contribution_suggestion, undefined);
});

test("the drip asks about the dearest few, not the whole pile", () => {
  const path = freshPath();
  for (const [name, amount] of [["a", 5], ["b", 50], ["c", 500], ["d", 9]]) {
    logToolEvent(
      { tool_name: name, event: "paid_started", problem_solved: "x", category: "other",
        price: { amount, currency: "USD", period: "month" }, source: "mail_sweep" },
      path,
    );
  }
  const drip = needsAttention({ limit: 2 }, path);
  assert.equal(drip.ask_now.length, 2);
  assert.deepEqual(drip.ask_now.map((r) => r.tool_name), ["c", "b"]);
  assert.equal(drip.unconfirmed_total, 4);
  assert.equal(drip.unconfirmed_monthly, 564);
  assert.ok(drip.note.includes("rubber stamp"));
});
