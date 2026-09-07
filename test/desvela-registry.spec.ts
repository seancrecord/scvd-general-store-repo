import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { app } from "@/index";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const PATH = "/webhooks/desvela-registry";
const PREFIX = "desvela_registry:";
const SECRET = "test-only-desvela-registry-secret";
const UA = "Desvela-Registry/0.1 (+https://desvela.dev/bot)";
const testEnv = env as Env;
const payload = {
  watch_id: 42,
  domain: "scvd.store",
  events: [
    { type: "surface_changed", kind: "llms_txt", status: "present", content_hash: "a".repeat(64), platform_template: false, at: "2026-09-06T05:12:44.000Z" },
    { type: "entry_gone", urn: "urn:air:scvd.store:mcp:retired", at: "2026-09-06T05:12:44.000Z" },
  ],
  observed_at: "2026-09-06T06:00:01.000Z",
};
const body = JSON.stringify(payload, null, 2) + "\n";
function signature(raw: string | Uint8Array, secret = SECRET) {
  return `hmac-sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}
async function request(raw: string | Uint8Array = body, headers: Record<string, string> = {}, secret: string | undefined = SECRET) {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(BASE + PATH, {
    method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, "X-Desvela-Signature": signature(raw), ...headers }, body: raw,
  }), { ...testEnv, DESVELA_REGISTRY_SECRET: secret }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
async function rows() {
  const keys = await testEnv.ORDERS.list({ prefix: PREFIX });
  return Promise.all(keys.keys.map((key) => testEnv.ORDERS.get(key.name, "json")));
}
beforeEach(async () => {
  const keys = await testEnv.ORDERS.list({ prefix: PREFIX });
  await Promise.all(keys.keys.map((key) => testEnv.ORDERS.delete(key.name)));
});
afterEach(() => vi.restoreAllMocks());

describe("Desvela Registry Watch's signed receipt door", () => {
  it("accepts the documented payload and makes the full report reviewable behind the admin password", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true });
    const ctx = createExecutionContext();
    const reading = await app.fetch(new Request(BASE + "/admin/desvela-registry.json", {
      headers: { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` },
    }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(reading.status).toBe(200);
    expect(reading.headers.get("cache-control")).toBe("no-store");
    expect(await reading.json()).toMatchObject({ truncated: false, rows: [{ payload, raw_body: body, user_agent_matches: true }] });
  });
  it.each(["", "hmac-sha256=bad", `hmac-sha256=${"00".repeat(32)}`, signature(body, "wrong-secret")])("rejects missing or invalid signature %s before storing", async (header) => {
    expect((await request(body, { "X-Desvela-Signature": header })).status).toBe(401);
    expect(await rows()).toEqual([]);
  });
  it("rejects a missing configured secret", async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request(BASE + PATH, { method: "POST", body, headers: { "X-Desvela-Signature": signature(body) } }), { ...testEnv, DESVELA_REGISTRY_SECRET: undefined }, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
    expect(await rows()).toEqual([]);
  });
  it("rejects tampering and even whitespace changes to the signed bytes", async () => {
    for (const changed of [body.replace('"watch_id": 42', '"watch_id": 43'), JSON.stringify(payload)]) {
      expect((await request(changed, { "X-Desvela-Signature": signature(body) })).status).toBe(401);
    }
    expect(await rows()).toEqual([]);
  });
  it("checks the signature before parsing an invalid JSON body", async () => {
    expect((await request("{", { "X-Desvela-Signature": signature(body) })).status).toBe(401);
    expect((await request("{")).status).toBe(400);
    expect(await rows()).toEqual([]);
  });
  it("logs an unexpected User-Agent but still accepts a verified report", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await request(body, { "User-Agent": "another-client" })).status).toBe(200);
    expect(warn).toHaveBeenCalledWith("desvela_registry_user_agent_mismatch");
    expect(await rows()).toEqual([expect.objectContaining({ user_agent_matches: false, payload })]);
  });
  it("accepts all documented event types and preserves Unicode and optional fields", async () => {
    const report = { ...payload, events: [
      ...["surface_appeared", "surface_changed", "surface_gone"].map((type, index) => ({
        type, kind: ["ai_catalog", "agents_md", "robots_ai"][index], at: payload.observed_at,
      })),
      ...["entry_added", "entry_changed", "entry_gone"].map((type) => ({
        type, urn: "urn:air:scvd.store:feed:corrections", at: payload.observed_at,
      })),
    ], note: "The keeper’s record — unchanged bytes." };
    const raw = JSON.stringify(report, null, 2);
    expect((await request(raw)).status).toBe(200);
    expect(await rows()).toEqual([expect.objectContaining({ payload: report, raw_body: raw })]);
  });
  it("refuses invalid UTF-8 even when its raw bytes have a valid signature", async () => {
    expect((await request(new Uint8Array([0xff, 0xfe]))).status).toBe(400);
    expect(await rows()).toEqual([]);
  });
  it("keeps one receipt when the identical signed delivery is retried", async () => {
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect(await rows()).toHaveLength(1);
  });
  it.each([
    { ...payload, domain: "someone-else.example" },
    { ...payload, watch_id: "42" },
    { ...payload, events: [] },
    { ...payload, events: [{ type: "do_something", at: payload.observed_at }] },
    { ...payload, events: [{ type: "surface_changed", kind: "unknown", at: payload.observed_at }] },
    { ...payload, observed_at: "not-a-date" },
  ])("refuses a verified but invalid or wrong-domain report", async (value) => {
    expect((await request(JSON.stringify(value))).status).toBe(400);
    expect(await rows()).toEqual([]);
  });
  it("does not acknowledge a failed ledger write", async () => {
    vi.spyOn(testEnv.ORDERS, "put").mockRejectedValue(new Error("storage unavailable"));
    expect((await request()).status).toBe(503);
    expect(await rows()).toEqual([]);
  });
  it("bounds an incoming body even without Content-Length", async () => {
    expect((await request(" ".repeat(128 * 1024 + 1))).status).toBe(413);
    expect(await rows()).toEqual([]);
  });
  it("requires the keeper's password to read the receipts", async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request(BASE + "/admin/desvela-registry.json", { headers: { "CF-Connecting-IP": "198.51.100.41" } }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });
});
