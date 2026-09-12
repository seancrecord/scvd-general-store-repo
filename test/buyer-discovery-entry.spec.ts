import { env, SELF } from "cloudflare:test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { app } from "@/index";
import { checkPurchaseArgs, toolArgs } from "@/lib/purchase-args";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
beforeAll(() => {
  installFacilitatorMock();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());

async function rpc(path: string, method: string, params: Record<string, unknown> = {}) {
  const response = await app.request(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }, env as Env);
  return response.json() as Promise<{
    result?: {
      tools?: Array<{ name: string; itemIds?: string[]; inputSchema: { examples: Record<string, unknown>[] } }>;
      structuredContent?: { accepts?: unknown[] };
    };
    error?: { code: number; data?: { "x402/payment-required"?: { accepts: unknown[] } } };
  }>;
}

it("a newcomer follows the llms key-registry link to current and historical keys", async () => {
  const guide = await (await SELF.fetch(BASE + "/llms.txt")).text();
  const link = guide.match(/\[key registry\]\(([^)]+)\)/)?.[1];
  expect(link).toBeTruthy();
  const response = await SELF.fetch(link!);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  const registry = await response.json() as { public_key: string; key_history: { current: { public_key: string }; retired: unknown[] } };
  expect(registry.public_key).toMatch(/^[0-9a-f]{64}$/);
  expect(registry.key_history.current.public_key).toBe(registry.public_key);
  expect(Array.isArray(registry.key_history.retired)).toBe(true);
});

it("the previously published /keys link still resolves to the key registry", async () => {
  const old = await SELF.fetch(BASE + "/keys", { redirect: "manual" });
  expect(old.status).toBe(308);
  const target = new URL(old.headers.get("location")!, BASE);
  expect(target.origin).toBe(BASE);
  const response = await SELF.fetch(target.href);
  expect(response.status).toBe(200);
  expect(await response.json()).toHaveProperty("key_history");
});

it("every published shelf example passes the purchase input checks unchanged", async () => {
  const listing = await rpc("/mcp", "tools/list");
  const shelves = listing.result!.tools!.filter(tool => tool.itemIds);
  expect(shelves.length).toBeGreaterThan(0);
  for (const tool of shelves) {
    for (const item of tool.itemIds!) {
      const example = tool.inputSchema.examples.find(example => example.item_id === item);
      expect(example, `${tool.name}/${item}`).toBeTruthy();
      // This broad check covers syntax and meaning of inputs. External A2A
      // readiness and inventory are separate from whether the example is valid.
      // Disposable fixture key: validation only; this test submits no payment.
      const validationEnv = { ...env, FIELD_WALLET_KEY: `0x${"01".repeat(32)}` } as Env;
      const refusal = await checkPurchaseArgs(validationEnv, getMenuItem(item)!, toolArgs(example!), { deferAvailability: true });
      expect(refusal, `${tool.name}/${item}`).toBeUndefined();
    }
  }
});

// Copy exactly what tools/list gives a stranger. Presence/type checks alone
// accepted "tx hashes" as a string, despite the purchase rejecting it.
for (const item of ["attestation_bundle", "bitcoin_anchor"]) {
  for (const catalog of ["shelf", "item"]) {
    for (const profile of ["legacy", "tool-result"]) {
      it(`${item}: literal ${catalog} example reaches a ${profile} payment quote`, async () => {
        const query = new URLSearchParams();
        if (catalog === "item") query.set("item_id", item);
        if (profile === "tool-result") query.set("payment", profile);
        const path = "/mcp?" + query;
        const listing = await rpc(path, "tools/list");
        const tool = listing.result!.tools!.find(tool => catalog === "item"
          ? tool.name === `buy_${item}` : tool.itemIds?.includes(item));
        expect(tool).toBeTruthy();
        const example = tool!.inputSchema.examples.find(example => catalog === "item" || example.item_id === item);
        expect(example).toBeTruthy();
        const quote = await rpc(path, "tools/call", { name: tool!.name, arguments: example });
        if (profile === "legacy") expect(quote.error?.code, JSON.stringify(quote)).toBe(402);
        else expect(quote.error).toBeUndefined();
        const accepts = profile === "legacy"
          ? quote.error?.data?.["x402/payment-required"]?.accepts
          : quote.result?.structuredContent?.accepts;
        expect(accepts?.length).toBeGreaterThan(0);
      });
    }
  }
}
