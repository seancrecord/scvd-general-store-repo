import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createPaymentGate } from "@/lib/payment-gate";
import { readPaymentOperations, recordPaymentOperation } from "@/lib/payment-operations";
import type { Env, HonoEnv } from "@/types";
const bindings = env as unknown as Env;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
  const keys = await bindings.COUNTERS.list({ prefix: "metric:" });
  for (const key of keys.keys.filter(key => key.name.includes(":payment-http:"))) await bindings.COUNTERS.delete(key.name);
});
afterEach(() => vi.useRealTimers());
it("counts credential-bearing MPP outcomes and mixed declarations without treating retries as sales", async () => {
  const app = new Hono<HonoEnv>();
  app.use('*', createPaymentGate(async () => ({ runMppCheckout: async c => c.json({ charged: false }, 409), attachMppChallenge: async () => {} })));
  const attempts: Record<string, string>[] = [{ Authorization: "Payment private-material" }, { Authorization: "Payment private-material", "PAYMENT-SIGNATURE": "private-x402" }];
  for (const headers of attempts) {
    const ctx = createExecutionContext();
    expect((await app.fetch(new Request('https://scvd.store/api/buy/context_anchor', { headers }), bindings, ctx)).status).toBe(409);
    await waitOnExecutionContext(ctx);
  }
  const result = await readPaymentOperations(bindings);
  expect(result.rows).toEqual(expect.arrayContaining([expect.objectContaining({ protocol: "mpp", client_error: 1 }), expect.objectContaining({ protocol: "mixed", client_error: 1 })]));
  expect(JSON.stringify(result)).not.toContain('private-');
});
it("keeps an unobserved instrument distinct from zero successful purchases", async () => {
  expect((await readPaymentOperations(bindings)).rows.every(row => row.observed === false)).toBe(true);
});

it("counts thrown and server-error responses, and a broken instrument cannot change checkout", async () => {
  for (const throws of [false, true]) {
    const app = new Hono<HonoEnv>();
    app.use('*', createPaymentGate(async () => ({ runMppCheckout: async c => {
      if (throws) throw new Error("fixture failure");
      return c.json({ charged: false }, 503);
    }, attachMppChallenge: async () => {} })));
    app.onError((_err, c) => c.json({ code: "fixed failure" }, 500));
    const ctx = createExecutionContext();
    expect((await app.fetch(new Request('https://scvd.store/api/buy/context_anchor', { headers: { Authorization: "Payment fixture" } }), bindings, ctx)).status).toBe(throws ? 500 : 503);
    await waitOnExecutionContext(ctx);
  }
  expect((await readPaymentOperations(bindings)).rows.find(row => row.protocol === "mpp")).toMatchObject({ server_error: 1, threw: 1 });
  const app = new Hono<HonoEnv>();
  app.use('*', createPaymentGate(async () => ({ runMppCheckout: async c => c.json({ same: true }), attachMppChallenge: async () => {} })));
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request('https://scvd.store/api/buy/context_anchor', { headers: { Authorization: "Payment fixture" } }), { ...bindings, COUNTER_LEDGER: undefined }, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200); expect(await res.json()).toEqual({ same: true });
});

it("refuses malformed counters instead of reporting a measured zero", async () => {
  await bindings.COUNTERS.put("metric:2026-09:payment-http:mpp:success", "");
  await expect(readPaymentOperations(bindings)).rejects.toThrow("unreadable");
});

it("attributes both x402 header names, including empty malformed credentials, without storing their contents", async () => {
  const app = new Hono<HonoEnv>();
  app.get('*', c => { recordPaymentOperation(c, 400); return c.json({ code: "fixture_refusal" }, 400); });
  for (const headers of [new Headers({ "PAYMENT-SIGNATURE": "fixture" }), new Headers({ "X-PAYMENT": "fixture" }), new Headers({ "X-PAYMENT": "" })]) {
    const ctx = createExecutionContext();
    await app.fetch(new Request('https://scvd.store/api/buy/context_anchor', { headers }), bindings, ctx);
    await waitOnExecutionContext(ctx);
  }
  expect((await readPaymentOperations(bindings)).rows.find(row => row.protocol === "x402")).toMatchObject({ observed: true, client_error: 3 });
});
