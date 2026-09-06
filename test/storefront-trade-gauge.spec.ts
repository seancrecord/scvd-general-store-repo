import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { getMenuItem } from "@/store/menu";
import { getTradePartner } from "@/store/trade-counter";
import { recordTradeDelivery, tradeSettlementFor, utcMonth } from "@/services/trade-counter";
import type { Env } from "@/types";

/**
 * THE TRADE GAUGE ON THE FRONT OF THE STORE (2026-09-05, the keeper:
 * "how do we display any trades on the home page"). Live deliveries
 * on account this month, counted from the door's own month counters,
 * one KV get per live account. Zero is a number; no live account is
 * an open door.
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

describe("the trade gauge", () => {
  beforeEach(async () => {
    await clearPrefix("trade_month:");
    await clearPrefix("trade_account:");
  });

  it("reads zero on account this month when the live account has sold nothing", async () => {
    const html = await frontPage();
    expect(html).toContain("On account");
    expect(html).toContain('<em class="led-num">0</em> on account this month');
    expect(html).toContain('<a href="/trade">1 marketplace</a>');
    expect(html).toContain('<a href="/api/trade/ledger">the books</a>');
  });

  it("counts a live delivery from the door's own month counter, never a typed figure", async () => {
    const hal = getTradePartner("hal")!;
    const item = getMenuItem("certificate_of_patronage")!;
    const settlement = tradeSettlementFor(hal, item, "c".repeat(64));
    await recordTradeDelivery(testEnv, hal, item, settlement, "cert_gauge_1", {});
    await recordTradeDelivery(testEnv, hal, item, settlement, "cert_gauge_2", {});
    const counted = await testEnv.COUNTERS.get(KV_KEYS.tradeMonth(hal.id, utcMonth()));
    expect(counted).toBe("2");
    const html = await frontPage();
    expect(html).toContain('<em class="led-num">2</em> on account this month');
  });
});
