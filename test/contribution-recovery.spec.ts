import { SELF, env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "@/types";
import { adminContributionRoutes } from "@/routes/contribution-tasks";

const BASE = "https://scvd.store";
const ADMIN = "/admin/bounties/contributions";
const bindings = env as unknown as Env;
const auth = {Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`};
const clock = Date.parse("2030-01-12T12:00:00Z");
function terms(id = `recovery-${crypto.randomUUID()}`) {
  return {id, kind: "docs", title: "Check the public instructions", target: "https://scvd.store/what", brief: "Retain the attempted steps", acceptance: "A reproducible attempt, including success", reward_usd: 1, slots: 1, expires_at: new Date(Date.now() + 86400000).toISOString(), review_days: 2, payment_days: 3};
}
function form(value: Record<string, unknown>) {return new URLSearchParams(Object.entries(value).map(([k,v])=>[k,String(v)]));}

describe("contribution request recovery", () => {
  it("does not retain a reservation when its privacy alarm cannot be scheduled", async () => {
    const t = {...terms(), expires_at: "2030-01-15T12:00:00Z"};
    const store = bindings.CONTRIBUTION_TASKS!.getByName(t.id);
    await store.create(t, clock);
    const body = {reservation_key: "a".repeat(64)};
    await runInDurableObject(store, async (instance, state) => {
      const alarm = vi.spyOn(state.storage, "setAlarm").mockRejectedValueOnce(new Error("injected alarm failure"));
      try {await expect(instance.act("reserve", body, "daily-digest", clock)).rejects.toThrow("injected alarm failure");}
      finally {alarm.mockRestore();}
      expect(instance.adminView()!.reservations).toHaveLength(0);
      expect(await state.storage.getAlarm()).toBeNull();
      expect((await instance.act("reserve", body, "daily-digest", clock)).status).toBe(200);
      expect(await state.storage.getAlarm()).toBe(Date.parse("2030-01-13T00:00:00Z"));
      expect(instance.adminView()!.reservations).toHaveLength(1);
    });
  });
  it("clears an overdue daily digest when a reservation is retried on a later day", async () => {
    const t = {...terms(), expires_at: "2030-01-15T12:00:00Z"};
    const store = bindings.CONTRIBUTION_TASKS!.getByName(t.id);
    await store.create(t, clock);
    const body = {reservation_key: "b".repeat(64)};
    const first = await store.act("reserve", body, "old-digest", clock);
    const retry = await store.act("reserve", body, "new-digest", clock + 13 * 3600000);
    expect(retry.data.submission_id).toBe(first.data.submission_id);
    expect((await store.adminView())!.reservations[0]!.visitor_hash).toBe("");
  });
  it("returns an editable escaped form with the same brief id after invalid input", async () => {
    const t = {...terms(), target: "http://example.com", brief: '<script>retain these steps</script>'};
    const response = await SELF.fetch(BASE + ADMIN, {method:"POST", headers:auth, body:form(t)});
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain(`name="id" value="${t.id}"`);
    expect(html).toContain("&lt;script&gt;retain these steps&lt;/script&gt;");
    expect(html).not.toContain(t.brief);
    expect(html).toContain("Retry this same action");
    expect(await bindings.CONTRIBUTION_TASKS!.getByName(t.id).adminView()).toBeNull();
    expect((await SELF.fetch(BASE + ADMIN, {method:"POST", headers:auth, body:form({...t, target:"https://example.com"}), redirect:"manual"})).status).toBe(303);
  });
  it("keeps the original id available after an interrupted directory write and repairs it on retry", async () => {
    const t = terms();
    const broken = {...bindings, COUNTERS: new Proxy(bindings.COUNTERS, {get(target, prop) {if (prop === "put") return async () => {throw new Error("private infrastructure error");}; const value = Reflect.get(target,prop); return typeof value === "function" ? value.bind(target) : value;}})};
    const response = await adminContributionRoutes.request(BASE + "/", {method:"POST", body:form(t)}, broken);
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain(`name="id" value="${t.id}"`);
    expect(html).toContain("may already have been saved");
    expect(html).not.toContain("private infrastructure error");
    expect((await bindings.CONTRIBUTION_TASKS!.getByName(t.id).adminView())!.terms).toEqual(t);
    const retry = await SELF.fetch(BASE + ADMIN, {method:"POST", headers:auth, body:form(t), redirect:"manual"});
    expect(retry.status).toBe(303);
    expect(await bindings.COUNTERS.get(`contribution_task:${t.id}`)).toBe("1");
  });
});

it("preserves a failed review and progress identity while keeping retries idempotent", async () => {
  const t = terms(), now = Date.now();
  const store = bindings.CONTRIBUTION_TASKS!.getByName(t.id);
  await store.create(t, now);
  const reservation_key = "d".repeat(64);
  const reserved = await store.act("reserve", {reservation_key}, "review-visitor", now);
  const submission_id = reserved.data.submission_id!;
  const report = {attempted:"Local fixture", environment:"Test harness", expected:"Example works", observed:"Missing option", evidence:"Saved test output", suggestion:"Correct the example"};
  await store.act("submit", {reservation_key, payout_to:`0x${"3".repeat(40)}`, report}, "", now);
  const review = {submission_id, decision:"accepted", outcome:"fix_planned", reason:"Retain this review reason", reference:"http://example.com"};
  const failed = await SELF.fetch(BASE + `${ADMIN}/${t.id}/review`, {method:"POST", headers:auth, body:form(review)});
  expect(failed.status).toBe(400);
  const html = await failed.text();
  expect(html).toContain(`name="submission_id" value="${submission_id}"`);
  expect(html).toContain(review.reason);
  expect((await store.adminView())!.reservations[0]!.status).toBe("submitted");
  expect((await store.act("review", {...review, reference:"https://example.com"}, "", now)).status).toBe(200);
  const progress = {submission_id, update_id:"stable-progress", outcome:"fixed", note:"Retain this progress note", reference:"http://example.com"};
  const retry = await SELF.fetch(BASE + `${ADMIN}/${t.id}/progress`, {method:"POST", headers:auth, body:form(progress)});
  expect(retry.status).toBe(400);
  expect(await retry.text()).toContain('name="update_id" value="stable-progress"');
  for (let i=0;i<2;i++) expect((await SELF.fetch(BASE + `${ADMIN}/${t.id}/progress`, {method:"POST", headers:auth, body:form({...progress, reference:"https://example.com"}), redirect:"manual"})).status).toBe(303);
  expect((await store.adminView())!.reservations[0]!.updates).toHaveLength(1);
});

it("keeps JSON errors machine-readable and refuses to reflect unknown form fields", async () => {
  const t = {...terms(), target:"http://example.com"};
  const json = await SELF.fetch(BASE + ADMIN, {method:"POST", headers:{...auth,"Content-Type":"application/json"}, body:JSON.stringify(t)});
  expect(json.status).toBe(400);
  expect(json.headers.get("Content-Type")).toContain("application/json");
  expect(await json.json()).toMatchObject({code:"invalid_input"});
  const response = await SELF.fetch(BASE + ADMIN, {method:"POST", headers:auth, body:form({...t, unexpected:"do-not-reflect-this-value"})});
  const html = await response.text();
  expect(response.status).toBe(400);
  expect(html).not.toContain("do-not-reflect-this-value");
  expect(html).not.toContain("Retry this same action");
});

it("does not create storage or an alarm for a nonexistent brief", async () => {
  const store = bindings.CONTRIBUTION_TASKS!.getByName(`missing-${crypto.randomUUID()}`);
  expect((await store.act("reserve", {reservation_key:"e".repeat(64)}, "visitor", clock)).status).toBe(404);
  await runInDurableObject(store, async (_instance, state) => {
    expect(await state.storage.getAlarm()).toBeNull();
    expect(state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='task'").toArray()).toHaveLength(0);
  });
});

it("preserves the browser form origin on admin pages and retries without exposing public referrers", async () => {
  const desk = await SELF.fetch(BASE + ADMIN, {headers:auth});
  expect(desk.headers.get("Referrer-Policy")).toBe("same-origin");
  const invalid = await SELF.fetch(BASE + ADMIN, {method:"POST", headers:auth, body:form({...terms(), target:"http://example.com"})});
  expect(invalid.status).toBe(400);
  expect(invalid.headers.get("Referrer-Policy")).toBe("same-origin");
  const publicBoard = await SELF.fetch(BASE + "/api/bounties/contributions");
  expect(publicBoard.headers.get("Referrer-Policy")).toBe("no-referrer");
});

it("accepts a same-origin browser form and still refuses null, foreign and same-site origins", async () => {
  const t = terms();
  await bindings.CONTRIBUTION_TASKS!.getByName(t.id).create(t);
  const path = BASE + `${ADMIN}/${t.id}/close`;
  for (const headers of [
    {Origin:"null", "Sec-Fetch-Site":"same-origin"},
    {Origin:"https://foreign.example", "Sec-Fetch-Site":"same-origin"},
    {Origin:BASE, "Sec-Fetch-Site":"same-site"},
    {Origin:BASE, "Sec-Fetch-Site":"cross-site"},
  ]) {
    const response = await SELF.fetch(path,{method:"POST",headers:{...auth,...headers},body:form({}),redirect:"manual"});
    expect(response.status).toBe(403);
  }
  expect((await bindings.CONTRIBUTION_TASKS!.getByName(t.id).adminView())!.closed).toBe(false);
  const saved = await SELF.fetch(path,{method:"POST",headers:{...auth,Origin:BASE,"Sec-Fetch-Site":"same-origin"},body:form({}),redirect:"manual"});
  expect(saved.status).toBe(303);
  expect((await bindings.CONTRIBUTION_TASKS!.getByName(t.id).adminView())!.closed).toBe(true);
});
