import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { getMenuItem } from "@/store/menu";
import { getTradePartner } from "@/store/trade-counter";
import { recordTradeDelivery, tradeSettlementFor, utcMonth } from "@/services/trade-counter";
import type { Env } from "@/types";

/**
 * The homepage keeps the trade invitation without reading account
 * counters on every visit. Deliveries still update the financial
 * counters; retiring the decorative gauge must not retire the books.
 */
const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

async function frontPage(): Promise<string> {
  const response = await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } });
  expect(response.status).toBe(200);
  return response.text();
}

async function clearPrefix(prefix: string): Promise<void> {
  const rows = await testEnv.COUNTERS.list({ prefix });
  for (const key of rows.keys) await testEnv.COUNTERS.delete(key.name);
}

describe("the trade invitation without a live gauge", () => {
  beforeEach(async () => {
    await clearPrefix("trade_month:");
    await clearPrefix("trade_account:");
  });

  it("links to the trade counter without inventing a monthly figure", async () => {
    const html = await frontPage();
    expect(html).toContain("On account");
    expect(html).not.toContain("on account this month");
    expect(html).toContain('<a href="/trade">the counter is open</a>');
  });

  it("keeps counting deliveries without adding a live homepage gauge", async () => {
    const hal = getTradePartner("hal")!;
    const item = getMenuItem("certificate_of_patronage")!;
    const settlement = tradeSettlementFor(hal, item, "c".repeat(64));
    await recordTradeDelivery(testEnv, hal, item, settlement, "cert_gauge_1", {});
    await recordTradeDelivery(testEnv, hal, item, settlement, "cert_gauge_2", {});
    const counted = await testEnv.COUNTERS.get(KV_KEYS.tradeMonth(hal.id, utcMonth()));
    expect(counted).toBe("2");
    const html = await frontPage();
    expect(html).not.toContain("on account this month");
    expect(html).toContain('<a href="/trade">the counter is open</a>');
  });
});
