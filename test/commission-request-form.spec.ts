import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { app } from "@/index";
import { listCommissions } from "@/services/requests";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const bindings = env as unknown as Env;
const BASE = "https://scvd.store";
const NOW = new Date("2026-10-10T12:00:00Z");
const facilitator = installFacilitatorMock();
async function request(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`${BASE}${path}`, init), bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
function submit(fields: Record<string, string>, origin = BASE) {
  return request("/api/request", { method: "POST", headers: {
    "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html", Origin: origin,
  }, body: new URLSearchParams(fields) });
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  facilitator.settleCalls = 0;
  for (const key of (await bindings.ORDERS.list({ prefix: KV_KEYS.requestPrefix })).keys) await bindings.ORDERS.delete(key.name);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("offers a script-free brief form on the larger-work path", async () => {
  const html = await (await request("/operators", { headers: { Accept: "text/html" } })).text();
  expect(html).toContain('action="/api/request"');
  for (const name of ["description", "offer_usdc", "contact"]) expect(html).toContain(`name="${name}"`);
  expect(html).toContain("Send brief — free");
  expect(html).toContain("Proposed budget");
  expect(html).toContain("brief excerpt");
});

it("records a free brief in the existing queue and redirects to a readable status without exposing contact", async () => {
  const response = await submit({ description: "Compare our public shopping paths", contact: "private-contact@example.com", offer_usdc: "" });
  expect(response.status).toBe(303);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const rows = await listCommissions(bindings);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ description: "Compare our public shopping paths", contact: "private-contact@example.com", offer_usdc: 0 });
  expect(rows[0]?.quote_usdc).toBeUndefined();
  const location = response.headers.get("Location")!;
  expect(location).toBe(`/api/commission/${rows[0]!.id}`);
  for (let refresh = 0; refresh < 2; refresh++) {
    const page = await request(location, { headers: { Accept: "text/html" } });
    expect(page.headers.get("Cache-Control")).toBe("no-store");
    expect(page.headers.get("X-Robots-Tag")).toContain("noindex");
    const html = await page.text();
    expect(html).toContain("Awaiting keeper review");
    expect(html).not.toContain("private-contact@example.com");
    expect(html).not.toContain("/api/commission/pay/");
  }
  expect(await listCommissions(bindings)).toHaveLength(1);
  expect(facilitator.settleCalls).toBe(0);
});

it("keeps invalid drafts escaped and refuses cross-origin, duplicate and overlong form values before writing", async () => {
  const fields = { description: '<script>alert("draft")</script>', contact: "contact@example.com", offer_usdc: "-1" };
  const invalid = await submit(fields);
  expect(invalid.status).toBe(400);
  const html = await invalid.text();
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain('<script>alert("draft")');
  expect((await submit({ ...fields, offer_usdc: "50" }, "https://elsewhere.example")).status).toBe(403);
  expect((await submit({ ...fields, offer_usdc: "50", description: "x".repeat(1001) })).status).toBe(400);
  const duplicate = new URLSearchParams({ ...fields, offer_usdc: "50" }); duplicate.append("contact", "second@example.com");
  expect((await request("/api/request", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE }, body: duplicate })).status).toBe(400);
  expect(await listCommissions(bindings)).toEqual([]);
});

it("keeps quote state, expiration and the payment link aligned with the existing JSON status", async () => {
  await submit({ description: "A bounded review", contact: "private@example.com", offer_usdc: "50" });
  const row = (await listCommissions(bindings))[0]!;
  const path = `/api/commission/${row.id}`;
  await bindings.ORDERS.put(KV_KEYS.commissionRequest(row.id), JSON.stringify({ ...row, status: "quoted", quote_usdc: 50,
    quote_window_hours: 48, quote_expires_at: "2026-10-11T12:00:00Z", quote_note: '<script>scope</script>' }));
  const json = await (await request(path)).json() as { quote: { pay_url: string } };
  const html = await (await request(path, { headers: { Accept: "text/html" } })).text();
  expect(html).toContain("Quote ready");
  expect(html).toContain(json.quote.pay_url.replaceAll("&", "&amp;"));
  expect(html).toContain("&lt;script&gt;scope&lt;/script&gt;");
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
  const expired = await (await request(path, { headers: { Accept: "text/html" } })).text();
  expect(expired).toContain("Quote expired");
  expect(expired).not.toContain("/api/commission/pay/");
  expect(facilitator.settleCalls).toBe(0);
});

it("renders declined and accepted results without revealing the contact or leaving a payment link", async () => {
  await submit({ description: "Review a public integration", contact: "never-publish@example.com", offer_usdc: "25" });
  const row = (await listCommissions(bindings))[0]!;
  const path = `/api/commission/${row.id}`;
  for (const state of [
    { status: "declined", decline_reply: '<img src=x onerror="alert(1)">Not in scope', title: "Request declined" },
    { status: "accepted", order_id: "order_fixture", title: "Commission accepted" },
  ]) {
    await bindings.ORDERS.put(KV_KEYS.commissionRequest(row.id), JSON.stringify({ ...row, ...state }));
    const page = await request(path, { headers: { Accept: "text/html" } });
    const html = await page.text();
    expect(html).toContain(state.title);
    expect(html).not.toContain("never-publish@example.com");
    expect(html).not.toContain("/api/commission/pay/");
    expect(html).not.toContain('<img src=x onerror=');
    if (state.status === "accepted") expect(html).toContain("/api/order/order_fixture");
    else expect(html).toContain("&lt;img src=x");
  }
});

it("bounds form bodies, requires the browser origin and retains JSON requests", async () => {
  const fields = { description: "Review a public integration", contact: "private@example.com", offer_usdc: "25" };
  expect((await submit(fields, "null")).status).toBe(403);
  const headers = { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE };
  expect((await request("/api/request", { method: "POST", headers, body: `description=${"x".repeat(40_000)}` })).status).toBe(413);
  expect((await submit({ ...fields, offer_usdc: "Infinity" })).status).toBe(400);
  expect((await submit({ ...fields, contact: "" })).status).toBe(400);
  expect(await listCommissions(bindings)).toHaveLength(0);
  const response = await request("/api/request", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...fields, offer_usdc: 25 }) });
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const json = await response.json() as { request: { id: string }; status_url: string };
  expect(json.status_url).toBe(`${BASE}/api/commission/${json.request.id}`);
  expect(await listCommissions(bindings)).toHaveLength(1);
});

it("describes the existing JSON request types accurately for agents", async () => {
  const spec = await (await request("/openapi.json")).json() as { paths: Record<string, { post: {
    requestBody: { content: Record<string, { schema: { properties: Record<string, { type: string }> } }> }
  } }> };
  const fields = spec.paths["/api/request"]!.post.requestBody.content["application/json"]!.schema.properties;
  expect(fields["offer_usdc"]?.type).toBe("number");
  expect(fields["suggest_listing"]?.type).toBe("string");
});
