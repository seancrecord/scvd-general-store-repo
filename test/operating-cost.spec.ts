import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { recordPorchVisit, recordChallengeIssued, recordPaymentDecline, readMonthLedger } from "@/lib/metrics";
import { readShopWindow } from "@/services/shop-window";
import { KV_KEYS, invertedTimestamp } from "@/lib/kv-keys";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
function metered() {
  const reads: string[] = [];
  const writes: string[] = [];
  const counters = new Proxy(bindings.COUNTERS, {
    get(target, prop) {
      if (prop === "get") return (...args: unknown[]) => {
        reads.push(...(Array.isArray(args[0]) ? args[0] : [args[0]]) as string[]);
        return Reflect.apply(target.get, target, args);
      };
      if (prop === "put") return (...args: unknown[]) => {
        writes.push(String(args[0]));
        return Reflect.apply(target.put, target, args);
      };
      const value: unknown = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  // Observe logical KV updates without the separate counter object's binding.
  return { reads, writes, env: { ...bindings, COUNTERS: counters, COUNTER_LEDGER: undefined } as Env };
}

describe("the cost of optional reporting", () => {
  it("keeps aggregate free-use counts without raw rows, referral maps or client maps", async () => {
    const meter = metered();
    await recordPorchVisit(meter.env, "preflight", {
      userAgent: "outside-cost-test", referrer: "https://outside.example/start",
    });
    expect(meter.writes).toHaveLength(2);
    expect(meter.writes.every(key => key.includes(":porch:"))).toBe(true);
    expect(meter.reads.every(key => key.includes(":porch:"))).toBe(true);
  });

  it("still retains price-quote evidence and signed-payment refusal evidence", async () => {
    const meter = metered();
    await recordChallengeIssued(meter.env, "/api/buy/hello", { userAgent: "outside-cost-test" });
    expect(meter.writes.some(key => key.startsWith("evt:"))).toBe(true);
    expect(meter.writes.some(key => key.includes(":402:"))).toBe(true);
    meter.writes.length = 0;
    // A house refusal avoids sending an alert; its retained evidence is identical in shape.
    await recordPaymentDecline(meter.env, "/api/buy/hello", "fixture", { houseHeader: "test-house-secret" });
    expect(meter.writes.some(key => key.startsWith("evt:"))).toBe(true);
    expect(meter.writes.some(key => key.startsWith("declevt:"))).toBe(true);
  });

  it("fetches only counter kinds that contribute to the monthly ledger", async () => {
    const month = "2099-01";
    const used: Record<string, string> = { "paid:hello": "7", "402:hello": "10", "rev:hello": "2000000", "dpaid:01": "7", "src:direct": "7", "tier:hello:small": "3" };
    const unused = ["porch:home:direct", "bounty:refused", "lat:challenge:fast", "uaclient:preflight", "refhost:census", "err:500"];
    for (const [key, value] of Object.entries(used)) await bindings.COUNTERS.put(`metric:${month}:${key}`, value);
    for (const key of unused) await bindings.COUNTERS.put(`metric:${month}:${key}`, "99");
    const meter = metered();
    const ledger = await readMonthLedger(meter.env, month);
    expect(ledger.items.hello).toMatchObject({ settled: 7, challenges: 10, tiers: { small: 3 } });
    expect(ledger.revenueUsdc).toBe(2);
    expect(ledger.days["01"]?.settles).toBe(7);
    expect(ledger.channels.direct).toBe(7);
    expect(meter.reads.sort()).toEqual(Object.keys(used).map(key => `metric:${month}:${key}`).sort());
  });

  it("fetches five recent outside sales instead of all 200 indexed records", async () => {
    const now = Date.parse("2098-01-01T00:00:00Z");
    for (let i = 0; i < 200; i++) {
      await bindings.COUNTERS.put(KV_KEYS.saleEvent(invertedTimestamp(now - i * 1000), `cost${i}`), JSON.stringify({ kind: "settle", item: "hello", house: false, at: new Date(now - i * 1000).toISOString() }));
    }
    const meter = metered();
    const window = await readShopWindow(meter.env, 5, now);
    expect(window.sales).toHaveLength(5);
    expect(meter.reads).toHaveLength(5);
    expect(window.sales[0]?.at).toBe(new Date(now).toISOString());
  });

  it("keeps manual scouting and sent-note audits without automatic prospect collection", async () => {
    const worker = (await import("../src/index.ts?raw")).default as string;
    const admin = (await import("../src/routes/admin.ts?raw")).default as string;
    expect(worker).not.toMatch(/\bscoutSweep\s*\(/);
    expect(worker).toMatch(/\bauditSweep\s*\(env\)/);
    expect(admin).toContain("scoutContacts");
  });

  it("leaves old cached pages with a harmless script and stops automatic sales requests", async () => {
    const script = await (await SELF.fetch("https://scvd.store/shop-window.js")).text();
    expect(script).not.toContain("setInterval");
    expect(script).not.toMatch(/\bfetch\s*\(/);
    const page = await (await SELF.fetch("https://scvd.store/", { headers: { Accept: "text/html" } })).text();
    expect(page).not.toContain('src="/shop-window.js"');
  });
});
