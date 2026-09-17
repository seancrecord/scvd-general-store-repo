import { env, SELF } from "cloudflare:test";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { computeStats } from "@/services/stats";
import { readMcpResource } from "@/lib/mcp-resources";
import { recordSettlement } from "@/lib/metrics";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const base = "https://scvd.store";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
  for (const prefix of ["metric:", "house_reclass:", "mpp:", KV_KEYS.saleEventPrefix]) {
    const keys = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(keys.keys.map(key => testEnv.COUNTERS.delete(key.name)));
  }
  await testEnv.COUNTERS.delete(KV_KEYS.railSplit);
  await testEnv.COUNTERS.put(KV_KEYS.railMeterStart, "2026-09-01T00:00:00Z");
  await Promise.all([
    testEnv.COUNTERS.put("metric:2026-09:paid:small_blessing", "101"),
    testEnv.COUNTERS.put("metric:2026-09:paidh:small_blessing", "9"),
    testEnv.COUNTERS.put("metric:2026-09:rail:base", "80"),
    testEnv.COUNTERS.put("metric:2026-09:rail:solana", "21"),
  ]);
});
afterEach(() => vi.useRealTimers());

async function json(path: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${base}${path}`, { headers: { Accept: "application/json" } });
  expect(response.status).toBe(200);
  return response.json();
}

describe("one purchase, three payment dimensions", () => {
  it("publishes protocol and currency separately from networks, with the same denominator", async () => {
    const stats = await json("/stats");
    expect(stats.payments).toMatchObject({
      organic_purchases: 101,
      by_protocol: [{ name: "x402", purchases: 101 }],
      by_currency: [{ name: "USDC", purchases: 101 }],
      by_network: expect.arrayContaining([{ name: "Base", purchases: 80 }, { name: "Solana", purchases: 21 }]),
    });
    expect((await json("/rails")).payments).toEqual(stats.payments);
  });

  it("keeps the homepage compact and links the detailed rollup", async () => {
    const html = await (await SELF.fetch(`${base}/`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("101 organic purchases via x402");
    expect(html).not.toContain("101 organic sales — 80 on Base");
    expect(html).toContain('href="/rails">Payment breakdown</a>');
  });

  it("renders all three dimensions on the existing rollup page", async () => {
    const html = await (await SELF.fetch(`${base}/rails`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("Purchases by protocol");
    expect(html).toContain("Purchases by currency");
    expect(html).toContain("The same purchases, grouped three ways");
    expect(html).not.toContain("0 via MPP");
    expect(html).toContain('"name":"organic purchases via x402 (all time)","value":101');
    expect(html).toContain('"name":"organic purchases paid in USDC (all time)","value":101');
  });

  it("gives MCP the same public totals without private payment records", async () => {
    const resource = await readMcpResource(testEnv, base, "scvd://payments");
    expect(resource).not.toBeNull();
    const body = JSON.parse(resource!.text) as Record<string, unknown>;
    expect(body.payments).toEqual((await json("/stats")).payments);
    expect(resource!.text).not.toContain("payer");
  });

  it("shows the same organic counts and a separate house table in admin", async () => {
    const response = await SELF.fetch(`${base}/admin/take`, { headers: {
      Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
    } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("101 organic purchases via x402");
    expect(html).toContain("House purchases by protocol and currency");
    expect(html).toContain("<td>x402</td><td>USDC</td><td>9</td>");
    expect((await json("/menu.json")).payments).toEqual((await json("/stats")).payments);
  });

  it("applies house reclassification before dividing the public total", async () => {
    await testEnv.COUNTERS.put("house_reclass:test", JSON.stringify({ address: "test", settles: 3, at: "2026-09-16T00:00:00Z", reason: "fixture" }));
    const stats = await json("/stats");
    expect(stats.payments).toMatchObject({
      organic_purchases: 98,
      by_protocol: [{ name: "x402", purchases: 98 }],
      by_currency: [{ name: "USDC", purchases: 98 }],
      by_network: null,
    });
    expect(stats.house_settlements).toBe(12);
  });

  it("identifies payment facts on new settle events from the checkout, not the network", async () => {
    await recordSettlement(testEnv, "/api/buy/small_blessing", {
      paidUsdc: 0.005, minimumUsdc: 0.005, network: "eip155:8453",
    });
    const keys = await testEnv.COUNTERS.list({ prefix: KV_KEYS.saleEventPrefix });
    const values = await Promise.all(keys.keys.map(key => testEnv.COUNTERS.get(key.name, "json")));
    expect(values).toEqual(expect.arrayContaining([expect.objectContaining({
      payment_protocol: "x402", payment_currency: "USDC", payment_network: "eip155:8453",
    })]));
    expect((await computeStats(testEnv)).organic_settlements).toBe(102);
  });
});

it("applies native corrections only to their source while preserving all gross totals", async () => {
  await testEnv.COUNTERS.put("mpp:sales:2026-09", JSON.stringify({ organic: 2, house: 1, organic_amount_atomic: "2000000", house_amount_atomic: "1000000", reclassified_house: 1, reclassified_amount_atomic: "1000000" }));
  const stats = await computeStats(testEnv);
  expect(stats.payment_sources).toEqual(expect.arrayContaining([
    expect.objectContaining({ protocol: "x402", organic: 101, house: 9 }),
    expect.objectContaining({ protocol: "mpp", organic: 1, house: 2, house_correction: { purchases: 1, amount_atomic: "1000000" },
      amounts: expect.objectContaining({ organic_atomic: "1000000", house_atomic: "2000000" }) }),
  ]));
  expect(stats.payments?.organic_purchases).toBe(102);
  expect(stats.house_settlements).toBe(11); expect(stats.reclassified_house).toBe(1);
});
