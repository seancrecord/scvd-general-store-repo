import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const API = "/api/bounties/contributions";
const ADMIN = "/admin/bounties/contributions";
const auth = {Authorization: `Basic ${btoa(`keeper:${(env as unknown as Env).ADMIN_PASSWORD}`)}`};
const wallet = `0x${"3".repeat(40)}`;
const report = {attempted: "Run the example", environment: "Local, fresh context", expected: "Example succeeds", observed: "An old option is refused", evidence: "Package v1; steps and error reproduced", suggestion: "Correct the option"};
const now = Date.parse("2026-10-13T12:00:00Z");
const key = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
async function post(path: string, body: object, admin = false, headers: Record<string, string> = {}) {
  return SELF.fetch(BASE + path, {method: "POST", headers: {"Content-Type": "application/json", ...(admin ? auth : {}), ...headers}, body: JSON.stringify(body)});
}
async function fixture(arrival?: object) {
  const id = `follow-${crypto.randomUUID()}`;
  const store = (env as unknown as Env).CONTRIBUTION_TASKS!.getByName(id);
  const terms = {id, kind: "docs", title: "Try free instructions", target: "https://scvd.store/what", brief: "Follow the named example", acceptance: "Reproducible attempt, including success", reward_usd: 2.5, slots: 2, expires_at: "2026-10-16T12:00:00Z", review_days: 2, payment_days: 3};
  await store.create(terms, now);
  const reservation_key = key();
  const reserved = await store.act("reserve", {reservation_key}, "visitor-one", now);
  const submission_id = reserved.data.submission_id!;
  const body = {reservation_key, payout_to: wallet, report, ...(arrival ? {arrival} : {})};
  return {id, store, terms, body, reservation_key, submission_id};
}
const decision = (submission_id: string) => ({submission_id, decision: "accepted", reason: "Reproduced the stated attempt", outcome: "fix_planned", reference: "https://scvd.store/what"});
const update = (submission_id: string, update_id = crypto.randomUUID()) => ({submission_id, update_id, outcome: "fixed", note: "Corrected the example and checked the new instructions", reference: "https://scvd.store/developers"});

describe("contribution follow-through", () => {
  it("appends private progress without rewriting acceptance or its payment deadline", async () => {
    const f = await fixture();
    await f.store.act("submit", f.body, "", now);
    await f.store.act("review", decision(f.submission_id), "", now);
    const before = await f.store.act("status", {reservation_key: f.reservation_key}, "", now);
    const progress = update(f.submission_id);
    const saved = await post(`${ADMIN}/${f.id}/progress`, progress, true);
    expect(saved.status).toBe(200);
    expect((await post(`${ADMIN}/${f.id}/progress`, progress, true)).status).toBe(200);
    const after = await (await post(`${API}/${f.id}/status`, {reservation_key: f.reservation_key})).json() as Record<string, unknown>;
    expect(after.review).toEqual(before.data.review);
    expect(after.payment_due_at).toEqual(before.data.payment_due_at);
    expect(after.status).toBe("accepted");
    expect(after.updates).toEqual([expect.objectContaining(progressWithoutSubmission(progress))]);
    expect((await post(`${ADMIN}/${f.id}/progress`, {...progress, note: "Replace the original note"}, true)).status).toBe(409);
    const publicText = await (await SELF.fetch(BASE + `${API}/${f.id}`)).text();
    expect(publicText).not.toContain(progress.note);
    expect(publicText).not.toContain(f.submission_id);
    expect((await post(`${ADMIN}/${f.id}/progress`, progress)).status).toBe(401);
    expect((await post(`${ADMIN}/${f.id}/progress`, progress, true, {Origin: "https://other.example"})).status).toBe(403);
  });
  it("refuses premature progress and bounds its append-only history, including concurrent retries", async () => {
    const f = await fixture();
    expect((await f.store.act("progress", update(f.submission_id), "", now)).status).toBe(409);
    await f.store.act("submit", f.body, "", now);
    await f.store.act("review", decision(f.submission_id), "", now);
    const {CONTRIBUTION_UPDATE_CAP} = await import("@/store/contribution-tasks");
    const progress = update(f.submission_id);
    const results = await Promise.all([f.store.act("progress", progress, "", now), f.store.act("progress", progress, "", now)]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    for (let n = 1; n < CONTRIBUTION_UPDATE_CAP; n++) expect((await f.store.act("progress", update(f.submission_id), "", now + n)).status).toBe(200);
    expect((await f.store.act("progress", update(f.submission_id), "", now)).status).toBe(409);
    expect((await f.store.act("progress", progress, "", now)).status).toBe(200);
    const state = await f.store.adminView();
    expect(state!.reservations[0]!.updates).toHaveLength(CONTRIBUTION_UPDATE_CAP);
  });
  it("captures optional self-reported arrival context privately and treats it as part of an immutable submission", async () => {
    const arrival = {goal: "track_expenses", found_via: '<script>private-query</script> Agent search result for local expense tracking'};
    const f = await fixture(arrival);
    expect((await f.store.act("submit", f.body, "", now)).status).toBe(200);
    expect((await f.store.act("submit", f.body, "", now)).status).toBe(200);
    expect((await f.store.act("submit", {...f.body, arrival: {...arrival, goal: "earn_money"}}, "", now)).status).toBe(409);
    const html = await (await SELF.fetch(BASE + `${ADMIN}/${f.id}`, {headers: auth})).text();
    expect(html).toContain("Self-reported arrival");
    expect(html).toContain("&lt;script&gt;private-query&lt;/script&gt;");
    expect(html).not.toContain(arrival.found_via);
    expect(await (await SELF.fetch(BASE + `${API}/${f.id}`)).text()).not.toContain("private-query");
    const stored = await f.store.adminView();
    expect(stored!.reservations[0]!.arrival).toEqual(arrival);
    const omitted = await fixture();
    expect((await omitted.store.act("submit", omitted.body, "", now)).status).toBe(200);
    expect((await omitted.store.act("submit", omitted.body, "", now)).status).toBe(200);
  });
  it("rejects unknown or excessive arrival data without consuming the reservation", async () => {
    const f = await fixture();
    for (const arrival of [{goal: "invented", found_via: "Search"}, {goal: "earn_money", found_via: "x".repeat(1001)}, {goal: "earn_money", found_via: "Search", prompt: "private user prompt"}, null]) {
      expect((await f.store.act("submit", {...f.body, arrival}, "", now)).status).toBe(400);
    }
    expect((await f.store.act("submit", f.body, "", now)).status).toBe(200);
  });
  it("derives overdue work and research denominators from retained state with one injected clock", async () => {
    const f = await fixture({goal: "earn_money", found_via: "Bounty search"});
    await f.store.act("submit", f.body, "", now);
    const {contributionWork} = await import("@/services/contribution-follow-through");
    let state = (await f.store.adminView())!;
    expect(contributionWork(state, now + 2 * 86400000 - 1)).toMatchObject({review_pending: 1, review_overdue: 0, payment_pending: 0, learning: {submissions: 1, provided: 1, goals: {earn_money: 1}}});
    expect(contributionWork(state, now + 2 * 86400000)).toMatchObject({review_overdue: 1});
    await f.store.act("review", decision(f.submission_id), "", now);
    state = (await f.store.adminView())!;
    expect(contributionWork(state, now + 3 * 86400000)).toMatchObject({review_pending: 0, payment_pending: 1, payment_overdue: 1, accepted_unpaid_usd: 2.5, follow_up_pending: 1});
    await f.store.act("payment", {submission_id: f.submission_id, tx_hash: `0x${"ab".repeat(32)}`}, "", now);
    state = (await f.store.adminView())!;
    expect(contributionWork(state, now)).toMatchObject({payment_pending: 0, accepted_unpaid_usd: 0, follow_up_pending: 1});
    await f.store.act("progress", update(f.submission_id), "", now);
    state = (await f.store.adminView())!;
    expect(contributionWork(state, now).follow_up_pending).toBe(0);
  });
  it("shows an authenticated page-scoped action queue and counts omitted arrival answers", async () => {
    const f = await fixture();
    await f.store.act("submit", f.body, "", now);
    await (env as unknown as Env).COUNTERS.put(`contribution_task:${f.id}`, "1");
    const html = await (await SELF.fetch(BASE + ADMIN, {headers: auth})).text();
    expect(html).toContain("Work awaiting your hand");
    expect(html).toContain(`${ADMIN}/${f.id}#submission-${f.submission_id}`);
    expect(html).toContain("Self-reported arrival");
    expect(html).toContain("on this page");
    expect(html).toContain("Not provided");
    expect((await SELF.fetch(BASE + ADMIN)).status).toBe(401);
  });
});
function progressWithoutSubmission(value: ReturnType<typeof update>) {const {submission_id, ...rest} = value; return rest;}

it("refuses a reward commitment whose total cannot be represented in whole safe cents", async () => {
  const {contributionTerms} = await import("@/services/contribution-task");
  const f = await fixture();
  expect(() => contributionTerms({...f.terms, reward_usd: 90_000_000_000_000, slots: 2}, now)).toThrow(/maximum reward/);
  expect(contributionTerms({...f.terms, reward_usd: 0.29, slots: 3}, now).reward_usd).toBe(0.29);
});

it("accepts the keeper progress form, escapes its note and leaves reported payment unchanged", async () => {
  const f = await fixture();
  await f.store.act("submit", f.body, "", now);
  await f.store.act("review", decision(f.submission_id), "", now);
  const paid = await f.store.act("payment", {submission_id: f.submission_id, tx_hash: `0x${"cd".repeat(32)}`}, "", now);
  const html = await (await SELF.fetch(BASE + `${ADMIN}/${f.id}`, {headers: auth})).text();
  const update_id = /name="update_id" value="([^"]+)"/.exec(html)?.[1];
  expect(update_id).toBeTruthy();
  const note = '<img src=x onerror="alert(1)"> Corrected the stale example.';
  const form = new URLSearchParams({...update(f.submission_id, update_id), note});
  const saved = await SELF.fetch(BASE + `${ADMIN}/${f.id}/progress`, {method: "POST", headers: {...auth, Origin: BASE, "Content-Type": "application/x-www-form-urlencoded"}, body: form.toString(), redirect: "manual"});
  expect(saved.status).toBe(303);
  const after = await f.store.act("status", {reservation_key: f.reservation_key}, "", now);
  expect(after.data.payment).toEqual(paid.data.payment);
  expect(after.data.status).toBe("payment_reported");
  expect(after.data.updates![0]!.note).toBe(note);
  const page = await (await SELF.fetch(BASE + `${ADMIN}/${f.id}`, {headers: auth})).text();
  expect(page).toContain("&lt;img");
  expect(page).not.toContain(note);
});

it("rejects oversized review and progress records without partially changing the task", async () => {
  const f = await fixture();
  await f.store.act("submit", f.body, "", now);
  expect((await f.store.act("review", {...decision(f.submission_id), reason: "界".repeat(3000)}, "", now)).status).toBe(400);
  expect((await f.store.adminView())!.reservations[0]!.review).toBeUndefined();
  await f.store.act("review", decision(f.submission_id), "", now);
  for (const change of [{note: "界".repeat(1000)}, {reference: "https://user:secret@example.com"}, {outcome: "unlisted"}, {extra: "silently discarded?"}]) {
    expect((await f.store.act("progress", {...update(f.submission_id), ...change}, "", now)).status).toBe(400);
  }
  expect((await f.store.adminView())!.reservations[0]!.updates).toBeUndefined();
  expect((await f.store.act("progress", update(f.submission_id), "", now)).status).toBe(200);
});

it("retains a full task of large reports and progress histories below the documented record bound", async () => {
  const {CONTRIBUTION_ATTEMPT_CAP, contributionTerms} = await import("@/services/contribution-task");
  const limits = await import("@/store/contribution-tasks");
  const f = await fixture();
  const id = `large-${crypto.randomUUID()}`;
  const store = (env as unknown as Env).CONTRIBUTION_TASKS!.getByName(id);
  const terms = contributionTerms({...f.terms, id, brief: "\u0001".repeat(4000), acceptance: "\u0001".repeat(4000)}, now);
  await store.create(terms, now);
  const report = Object.fromEntries(Object.keys(limits.CONTRIBUTION_REPORT_FIELDS).map(field => [field, "a"]));
  const bytes = (value: object) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  report.evidence = "界".repeat(3900);
  report.observed = "界".repeat(3900);
  report.suggestion = "x".repeat(limits.CONTRIBUTION_REPORT_BYTES - bytes(report) + 1);
  expect(bytes(report)).toBe(limits.CONTRIBUTION_REPORT_BYTES);
  for (let n = 0; n < CONTRIBUTION_ATTEMPT_CAP; n++) {
    const reservation_key = key();
    const reserved = await store.act("reserve", {reservation_key}, `large-visitor-${n}`, now);
    expect(reserved.status).toBe(200);
    const submission_id = reserved.data.submission_id!;
    const arrival = {goal: "other", found_via: "界".repeat(600)};
    expect((await store.act("submit", {reservation_key, payout_to: wallet, report, arrival}, "", now)).status).toBe(200);
    const review = {...decision(submission_id), decision: "rejected", reason: "界".repeat(2600)};
    expect((await store.act("review", review, "", now)).status).toBe(200);
    for (let i = 0; i < limits.CONTRIBUTION_UPDATE_CAP; i++) {
      const progress = {...update(submission_id), note: "界".repeat(600)};
      expect((await store.act("progress", progress, "", now)).status).toBe(200);
    }
  }
  const state = (await store.adminView())!;
  expect(state.reservations).toHaveLength(CONTRIBUTION_ATTEMPT_CAP);
  expect(bytes(state)).toBeLessThan(1024 * 1024);
  expect((await store.publicView(now))!.available_slots).toBe(0);
  expect((await store.act("reserve", {reservation_key: key()}, "beyond-cap", now)).status).toBe(409);
});
