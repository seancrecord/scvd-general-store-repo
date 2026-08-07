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
  checkBeforeSignup,
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

test("the delta never carries what the privacy sentence forbids", () => {
  const path = freshPath();
  setConsent({ contribute: true }, path);
  const rejected = contributeDelta(
    {
      kind: "outcome",
      tool_name: "ahrefs",
      category: "seo",
      outcome: "canceled_pre_conversion",
      weeks_held: 2,
      price: { amount: 29, currency: "USD", period: "month" },
    },
    path,
  );
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.problems.join(" ").includes("price must never ride a delta"));
  // And friction is a signup-time fact: opened only.
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
  assert.ok(wrongKind.problems.join(" ").includes("opened deltas only"));
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

test("a corrupt line is counted, not fatal, and the audit says so", () => {
  const path = freshPath();
  logToolEvent({ ...BASE, event: "trial_started", trial_ends: soon(7) }, path);
  // Somebody edited the file by hand. Their right; our resilience.
  appendFileSync(path, "not json at all\n");
  const audit = stackAudit({}, path);
  assert.equal(audit.bad_lines, 1);
  assert.ok(audit.bad_lines_note.includes("yours"));
});
