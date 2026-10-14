import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const ROOT = "/api/bounties/contributions";
const ADMIN = "/admin/bounties/contributions";
const auth = { Authorization: `Basic ${btoa(`keeper:${(env as unknown as Env).ADMIN_PASSWORD}`)}` };
const wallet = `0x${"3".repeat(40)}`;
const evidence = { attempted: "Read the advertised instructions", environment: "Test model, test harness, fresh context", expected: "One documented request", observed: "The example used a retired argument", evidence: "Version 1; request and error reproduced twice", suggestion: "Update the example and retain its regression check" };
async function post(path: string, body: object, admin = false, headers: Record<string, string> = {}) {
  return SELF.fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...(admin ? auth : {}), ...headers }, body: JSON.stringify(body) });
}
async function task(extra: object = {}) {
  const id = `test-${crypto.randomUUID()}`;
  const response = await post(ADMIN, { id, kind: "package", title: "Check a public example", target: "https://github.com/seancrecord/scvd-general-store-repo/tree/main/tab", brief: "Attempt the documented free workflow and preserve your steps.", acceptance: "A reproducible attempt with version, steps and result, including success. Praise and finding a defect are not conditions.", reward_usd: 1, slots: 1, expires_at: new Date(Date.now() + 86400000).toISOString(), review_days: 3, payment_days: 3, ...extra }, true);
  expect(response.status, await response.clone().text()).toBe(201);
  return id;
}
function key() { return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""); }
async function reserve(id: string, reservation_key = key(), ip = "192.0.2.11") {
  return { key: reservation_key, response: await post(`${ROOT}/${id}/reserve`, { reservation_key }, false, { "CF-Connecting-IP": ip }) };
}

describe("posted contribution work without an upfront purchase", () => {
  it("advertises real terms and templates without presenting templates as open jobs", async () => {
    const id = await task();
    const board = await SELF.fetch(BASE + ROOT);
    expect(board.status).toBe(200);
    const data = await board.json() as { tasks: Array<{id: string; reward_usd: number; maximum_reward_usd: number; purchase_required: boolean}>; templates: Array<{kind: string}> };
    expect(data.tasks.find(t => t.id === id)).toMatchObject({reward_usd: 1, maximum_reward_usd: 1, purchase_required: false});
    expect(data.templates.map(t => t.kind)).toEqual(expect.arrayContaining(["aura", "census", "package", "docs", "discovery"]));
    const page = await (await SELF.fetch(BASE + "/bounties", {headers: {Accept: "text/html"}})).text();
    expect(page).toContain(ROOT);
  });
  it("reserves the last slot atomically, replays the same reservation and keeps it private", async () => {
    const id = await task();
    const keys = [key(), key()];
    const results = await Promise.all(keys.map((k, i) => reserve(id, k, `192.0.2.${20+i}`)));
    expect(results.map(r => r.response.status).sort()).toEqual([200, 409]);
    const won = results.find(r => r.response.status === 200)!;
    const first = await won.response.json();
    const again = await reserve(id, won.key);
    expect(await again.response.json()).toEqual(first);
    const text = await (await SELF.fetch(BASE + `${ROOT}/${id}`)).text();
    expect(text).not.toContain(won.key);
    expect(text).not.toContain("192.0.2.");
    expect(text).toContain('"available_slots":0');
  });
  it("keeps reservations valid when new reservations are closed and supports a private review handoff", async () => {
    const id = await task(); const held = await reserve(id);
    expect(held.response.status).toBe(200);
    expect((await post(`${ADMIN}/${id}/close`, {}, true)).status).toBe(200);
    const submitted = await post(`${ROOT}/${id}/submit`, {reservation_key: held.key, payout_to: wallet, report: evidence});
    expect(submitted.status).toBe(200);
    const data = await submitted.json() as { submission_id: string; status: string };
    expect(data.status).toBe("submitted");
    const decision = {submission_id: data.submission_id, decision: "accepted", reason: "Reproduced the example failure and retained the supplied steps.", outcome: "fix_planned", reference: "https://github.com/seancrecord/scvd-general-store-repo/issues/1"};
    const accepted = await post(`${ADMIN}/${id}/review`, decision, true);
    expect(accepted.status).toBe(200);
    const own = await post(`${ROOT}/${id}/status`, {reservation_key: held.key});
    const ownData = await own.json() as { status: string; completion: {reward_state: string; free_next_steps: unknown[]}; review: {outcome: string} };
    expect(ownData).toMatchObject({status: "accepted", review: {outcome: "fix_planned"}, completion: {reward_state: "accepted_pending_payment"}});
    expect(ownData.completion.free_next_steps).toHaveLength(2);
    expect((await post(`${ROOT}/${id}/status`, {reservation_key: key()})).status).toBe(404);
    const publicText = await (await SELF.fetch(BASE + ROOT)).text();
    for (const privateValue of [wallet, evidence.observed, held.key, data.submission_id]) expect(publicText).not.toContain(privateValue);
  });
  it("rejects changed replays and cannot mark an unaccepted report paid", async () => {
    const id = await task(); const held = await reserve(id);
    const body = {reservation_key: held.key, payout_to: wallet, report: evidence};
    const first = await post(`${ROOT}/${id}/submit`, body);
    const record = await first.json() as {submission_id: string};
    expect((await post(`${ROOT}/${id}/submit`, body)).status).toBe(200);
    expect((await post(`${ROOT}/${id}/submit`, {...body, payout_to: `0x${"4".repeat(40)}`})).status).toBe(409);
    expect((await post(`${ADMIN}/${id}/payment`, {submission_id: record.submission_id, tx_hash: `0x${"ab".repeat(32)}`}, true)).status).toBe(409);
  });
  it("records keeper-reported payment without claiming chain verification or sending money", async () => {
    const id = await task(); const held = await reserve(id);
    const data = await (await post(`${ROOT}/${id}/submit`, {reservation_key: held.key, payout_to: wallet, report: evidence})).json() as {submission_id: string};
    expect((await post(`${ADMIN}/${id}/review`, {submission_id: data.submission_id, decision: "accepted", reason: "Complete, reproducible attempt", outcome: "no_change", reference: "https://scvd.store/developers"}, true)).status).toBe(200);
    const payment = {submission_id: data.submission_id, tx_hash: `0x${"ab".repeat(32)}`};
    const response = await post(`${ADMIN}/${id}/payment`, payment, true);
    expect(response.status).toBe(200);
    expect((await post(`${ADMIN}/${id}/payment`, payment, true)).status).toBe(200);
    expect((await post(`${ADMIN}/${id}/payment`, {...payment, tx_hash: `0x${"cd".repeat(32)}`}, true)).status).toBe(409);
    const own = await (await post(`${ROOT}/${id}/status`, {reservation_key: held.key})).json();
    expect(own).toMatchObject({status: "payment_reported", payment: {verification: "not_checked", tx_hash: payment.tx_hash}, completion: {reward_state: "payment_reported"}});
  });
  it("allows releasing a reservation, rejects incomplete evidence and refuses public or cross-site admin writes", async () => {
    const id = await task(); const held = await reserve(id);
    expect((await post(`${ROOT}/${id}/submit`, {reservation_key: held.key, payout_to: wallet, report: {observed: "great"}})).status).toBe(400);
    expect((await post(`${ROOT}/${id}/release`, {reservation_key: held.key})).status).toBe(200);
    expect((await reserve(id, key(), "192.0.2.80")).response.status).toBe(200);
    expect((await post(`${ADMIN}/${id}/close`, {})).status).toBe(401);
    expect((await post(`${ADMIN}/${id}/close`, {}, true, {Origin: "https://evil.example"})).status).toBe(403);
    expect((await post(`${ROOT}/${id}/reserve`, {reservation_key: "short"})).status).toBe(400);
  });
  it("rejects unknown fields and immutable-term changes instead of silently dropping them", async () => {
    const id = await task();
    const update = await post(ADMIN, {id, reward_usd: 100}, true);
    expect(update.status).toBe(400);
    const bad = await post(`${ROOT}/${id}/reserve`, {reservation_key: key(), wallet_secret: "never-store-this"});
    expect(bad.status).toBe(400);
  });
});

describe("contribution boundaries", () => {
  it("expires reservations on the injected clock and never accepts a late report", async () => {
    const bindings = env as unknown as Env;
    const store = bindings.CONTRIBUTION_TASKS!.getByName(`clock-${crypto.randomUUID()}`);
    const now = Date.parse("2026-10-13T12:00:00Z");
    const terms = {id: "clock-test", kind: "aura", title: "Free run", target: "https://scvd.store/what", brief: "Read the page", acceptance: "Retain the attempt", reward_usd: 1, slots: 1, expires_at: "2026-10-16T12:00:00Z", review_days: 2, payment_days: 3};
    expect(store).toBeDefined();
    expect((await store.create(terms, now)).status).toBe(201);
    const reservation_key = key();
    const reserved = await store.act("reserve", {reservation_key}, "clock-visitor", now);
    expect(reserved.data.submit_by).toBe("2026-10-14T12:00:00.000Z");
    const deadline = now + 86400000;
    expect((await store.publicView(deadline - 1))!.available_slots).toBe(0);
    expect((await store.publicView(deadline))!.available_slots).toBe(1);
    expect((await store.act("submit", {reservation_key, payout_to: wallet, report: evidence}, "", deadline)).status).toBe(409);
    expect((await store.act("status", {reservation_key}, "", deadline)).data.status).toBe("expired");
    expect((await store.act("reserve", {reservation_key: key()}, "next-visitor", deadline)).status).toBe(200);
    expect((await store.act("reserve", {reservation_key: key()}, "late-visitor", Date.parse(terms.expires_at))).status).toBe(409);
  });
  it("refuses changed terms and preserves a negative finding verbatim behind the admin gate", async () => {
    const id = await task(); const held = await reserve(id);
    const report = {...evidence, observed: '<script>alert("never run evidence")</script> The task could not be completed.'};
    const stored = await post(`${ROOT}/${id}/submit`, {reservation_key: held.key, payout_to: wallet, report});
    expect(stored.status).toBe(200);
    const reordered = Object.fromEntries(Object.entries(report).reverse());
    expect((await post(`${ROOT}/${id}/submit`, {report: reordered, payout_to: wallet, reservation_key: held.key})).status).toBe(200);
    const desk = await SELF.fetch(BASE + `${ADMIN}/${id}`, {headers: auth});
    expect(desk.status).toBe(200);
    const html = await desk.text();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain(report.observed);
    expect(html).not.toContain(held.key);
    expect((await SELF.fetch(BASE + `${ADMIN}/${id}`)).status).toBe(401);
    const terms = (await (await SELF.fetch(BASE + `${ROOT}/${id}`)).json() as {task: Record<string, unknown>}).task;
    const copy = Object.fromEntries(["id", "kind", "title", "target", "brief", "acceptance", "reward_usd", "slots", "expires_at", "review_days", "payment_days"].map(k => [k, terms[k]]));
    expect((await post(ADMIN, {...copy, reward_usd: 2}, true)).status).toBe(409);
    expect((await post(ADMIN, copy, true)).status).toBe(201);
  });
  it("fails closed without its authoritative store and returns a bounded, noncached contract", async () => {
    const {contributionRoutes} = await import("@/routes/contribution-tasks");
    const response = await contributionRoutes.request(BASE + ROOT, {}, {...env, CONTRIBUTION_TASKS: undefined} as unknown as Env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('"tasks":[]');
    const board = await SELF.fetch(BASE + ROOT);
    expect(board.headers.get("Cache-Control")).toBe("no-store");
    const body = await board.json() as {tasks: unknown[]; truncated: boolean; cursor: string | null};
    expect(body.tasks.length).toBeLessThanOrEqual(20);
    if (body.truncated) expect(body.cursor).toBeTruthy();
    const id = await task();
    const oversized = await post(`${ROOT}/${id}/submit`, {reservation_key: key(), report: {evidence: "x".repeat(33000)}});
    expect(oversized.status).toBe(413);
  });
});


describe("bounded contribution retention and review", () => {
  it("clears a visitor digest at UTC midnight without changing the reserved work", async () => {
    const {expireContributionVisitorDigests} = await import("@/services/contribution-task");
    const rows: import("@/services/contribution-task").ContributionReservation[] = [{id: "held-work", key_hash: "private-token-hash", visitor_hash: "private-daily-digest", reserved_at: "2026-10-13T12:00:00Z", submit_by: "2026-10-14T12:00:00Z", status: "reserved"}];
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(expireContributionVisitorDigests(rows, now)).toBe(Date.parse("2026-10-14T00:00:00Z"));
    expect(rows[0]!.visitor_hash).toBe("private-daily-digest");
    expect(expireContributionVisitorDigests(rows, Date.parse("2026-10-14T00:00:00Z"))).toBeNull();
    expect(rows[0]).toMatchObject({id: "held-work", key_hash: "private-token-hash", visitor_hash: "", status: "reserved", submit_by: "2026-10-14T12:00:00Z"});
  });
  it("bounds report bytes as well as characters and leaves a refused reservation usable", async () => {
    const id = await task(); const held = await reserve(id);
    const large = Object.fromEntries(Object.keys(evidence).map(k => [k, "界".repeat(1600)]));
    const response = await post(`${ROOT}/${id}/submit`, {reservation_key: held.key, payout_to: wallet, report: large});
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("UTF-8 bytes");
    expect((await post(`${ROOT}/${id}/submit`, {reservation_key: held.key, payout_to: wallet, report: evidence})).status).toBe(200);
  });
  it("cannot record two contradictory reviews of the same submission", async () => {
    const id = await task(); const held = await reserve(id);
    const submitted = await (await post(`${ROOT}/${id}/submit`, {reservation_key: held.key, payout_to: wallet, report: evidence})).json() as {submission_id: string};
    const reviews = await Promise.all(["accepted", "rejected"].map(decision => post(`${ADMIN}/${id}/review`, {submission_id: submitted.submission_id, decision, reason: "Reviewed the stated acceptance criteria", outcome: "no_change", reference: "https://scvd.store/what"}, true)));
    expect(reviews.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = await reviews.find(r => r.status === 200)!.json() as {status: string};
    const status = await (await post(`${ROOT}/${id}/status`, {reservation_key: held.key})).json() as {status: string};
    expect(status.status).toBe(winner.status);
  });
});


it("posts the actual keeper form with numeric terms and an explicit UTC deadline", async () => {
  const page = await (await SELF.fetch(BASE + ADMIN, {headers: auth})).text();
  expect(page).toContain('type="datetime-local"');
  const generated = /name="id" value="(aura-[^"]+)"/.exec(page)?.[1];
  expect(generated).toBeTruthy();
  const expires = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  const form = new URLSearchParams({id: generated!, kind: "aura", title: "Free workflow attempt", target: "https://scvd.store/what", brief: "Try the named free workflow", acceptance: "Complete attempt and evidence, whether successful or blocked", reward_usd: "1", slots: "1", expires_at: expires, review_days: "2", payment_days: "3"});
  const response = await SELF.fetch(BASE + ADMIN, {method: "POST", headers: {...auth, "Content-Type": "application/x-www-form-urlencoded", Origin: BASE}, body: form.toString(), redirect: "manual"});
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe(`${ADMIN}/${generated}`);
  const task = (await (await SELF.fetch(BASE + `${ROOT}/${generated}`)).json() as {task: {expires_at: string; reward_usd: number}}).task;
  expect(task.expires_at).toBe(`${expires}:00.000Z`);
  expect(task.reward_usd).toBe(1);
});
