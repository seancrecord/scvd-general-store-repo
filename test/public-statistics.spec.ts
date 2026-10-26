import { REQUEST_KV_POLICY } from "@/lib/kv-retry";
import { env, createScheduledController, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "@/index";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pulseRoutes } from "@/routes/pulse";
import { statsRoutes } from "@/routes/stats";
import { storefrontRoutes } from "@/routes/storefront";
import { catalogRoutes } from "@/routes/catalog";
import { skillRoutes } from "@/routes/skill";
import {
  PUBLIC_STATISTICS_CRON,
  PUBLIC_STATISTICS_KEY,
  PUBLIC_STATISTICS_INTERVAL_SECONDS,
  readPublicStatistics,
  refreshPublicStatistics,
} from "@/services/public-statistics";
import { computeStatsDiagnosed } from "@/services/stats";
import { computePulse } from "@/services/pulse";
import type { Env, HonoEnv } from "@/types";

const bindings = env as unknown as Env;
const NOW = new Date("2026-10-23T12:30:00.000Z");
const paidKey = "metric:2026-10:paid:hello";
const challengeKey = "metric:2026-10:402:hello";
const app = new Hono<HonoEnv>()
  .route("/", pulseRoutes).route("/", statsRoutes)
  .route("/", storefrontRoutes).route("/", catalogRoutes).route("/", skillRoutes);

function meteredEnv() {
  const reads: string[] = [];
  const lists: string[] = [];
  const wrap = (kv: KVNamespace) => new Proxy(kv, {
    get(target, property) {
      if (property === "get") return (...args: unknown[]) => {
        reads.push(...(Array.isArray(args[0]) ? args[0] : [args[0]]) as string[]);
        return Reflect.apply(target.get, target, args);
      };
      if (property === "list") return (...args: unknown[]) => {
        lists.push((args[0] as { prefix?: string } | undefined)?.prefix ?? "");
        return Reflect.apply(target.list, target, args);
      };
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { reads, lists, env: { ...bindings, COUNTERS: wrap(bindings.COUNTERS), PATRONS: wrap(bindings.PATRONS) } };
}

async function request(path: string, targetEnv = bindings, accept = "application/json") {
  return app.request(`https://scvd.store${path}`, { headers: { Accept: accept } }, targetEnv);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await bindings.COUNTERS.delete(PUBLIC_STATISTICS_KEY);
  await bindings.COUNTERS.put(paidKey, "7");
  await bindings.COUNTERS.put(challengeKey, "100");
});
afterEach(() => vi.useRealTimers());

describe("public statistics publication", () => {
  it("publishes on its configured trigger without entering the payment or archive sweeps", async () => {
    const config = (await import("../wrangler.jsonc?raw")).default as string;
    expect(config).toContain(JSON.stringify(PUBLIC_STATISTICS_CRON));
    const writes: string[] = [];
    const counters = new Proxy(bindings.COUNTERS, {
      get(target, prop) {
        if (prop === "put") return (...args: unknown[]) => {
          writes.push(String(args[0]));
          if (args[0] !== PUBLIC_STATISTICS_KEY) throw new Error("Unexpected scheduled side effect");
          return Reflect.apply(target.put, target, args);
        };
        const value: unknown = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const ctx = createExecutionContext();
    await worker.scheduled!(createScheduledController({ cron: PUBLIC_STATISTICS_CRON }), { ...bindings, COUNTERS: counters }, ctx);
    await waitOnExecutionContext(ctx);
    expect(writes).toEqual([PUBLIC_STATISTICS_KEY]);
    expect(await readPublicStatistics(bindings)).not.toBeNull();
  });

  it("keeps the existing calculations, then serves both reports with one value read and no lists", async () => {
    const [books, pulse] = await Promise.all([computeStatsDiagnosed(bindings), computePulse(bindings)]);
    const summary = await refreshPublicStatistics(bindings);
    expect(summary.books).toEqual(books);
    expect(summary.pulse).toEqual(pulse);
    for (const path of ["/stats", "/pulse", "/pulse.json"]) {
      const meter = meteredEnv();
      const response = await request(path, meter.env);
      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.statistics_summary).toMatchObject({ computed_at: NOW.toISOString(), stale: false });
      expect(body).toMatchObject(path === "/stats" ? books.stats : pulse);
      expect(meter.reads).toEqual([PUBLIC_STATISTICS_KEY]);
      expect(meter.lists).toEqual([]);
    }
  });

  it("keeps dates and values until the scheduled writer refreshes, including concurrent stale reads", async () => {
    const saved = await refreshPublicStatistics(bindings);
    await bindings.COUNTERS.put(paidKey, "90");
    await bindings.COUNTERS.put(challengeKey, "900");
    vi.setSystemTime(NOW.getTime() + 2 * PUBLIC_STATISTICS_INTERVAL_SECONDS * 1000);
    const meter = meteredEnv();
    const responses = await Promise.all(Array.from({ length: 12 }, () => request("/pulse.json", meter.env)));
    for (const response of responses) {
      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({ computed_at: saved.pulse.computed_at, all_time: saved.pulse.all_time });
      expect(body.statistics_summary).toMatchObject({ computed_at: NOW.toISOString(), stale: true });
    }
    expect(meter.reads).toHaveLength(responses.length);
    expect(meter.lists).toEqual([]);
    const page = await (await request("/pulse", bindings, "text/html")).text();
    expect(page).toContain(NOW.toISOString());
    expect(page).toContain("overdue");
    const next = await refreshPublicStatistics(bindings);
    expect(next.pulse.all_time.organic_settled).toBe(saved.pulse.all_time.organic_settled + 83);
    expect(next.pulse.all_time.organic_challenges).toBe(saved.pulse.all_time.organic_challenges + 800);
    expect(next.computed_at).not.toBe(saved.computed_at);
  });

  it.each([null, "broken JSON", JSON.stringify({ version: 0 }), JSON.stringify({ version: 1 })])(
    "reports unavailable without a historical rebuild for missing or incompatible data (%s)", async raw => {
      if (raw !== null) await bindings.COUNTERS.put(PUBLIC_STATISTICS_KEY, raw);
      const meter = meteredEnv();
      for (const path of ["/stats", "/pulse", "/pulse.json"]) {
        const response = await request(path, meter.env);
        expect(response.status).toBe(503);
        expect(response.headers.get("Retry-After")).toBe(String(PUBLIC_STATISTICS_INTERVAL_SECONDS));
        expect(await response.json()).toMatchObject({ code: "statistics_unavailable" });
      }
      expect(meter.reads).toEqual(Array(3).fill(PUBLIC_STATISTICS_KEY));
      expect(meter.lists).toEqual([]);
    },
  );

  it("does not scan bounty or trade accounts just to decorate the homepage", async () => {
    const meter = meteredEnv();
    const response = await request("/", meter.env, "text/html");
    expect(response.status).toBe(200);
    expect(meter.lists).not.toContain("bounty:");
    expect(meter.reads.filter(key => /^(trade_|trade:)/.test(key))).toEqual([]);
  });

  it("retains the previous publication when a core calculation fails", async () => {
    const saved = await refreshPublicStatistics(bindings);
    const counters = new Proxy(bindings.COUNTERS, {
      get(target, prop) {
        if (prop === "list") return () => Promise.reject(new Error("source unavailable"));
        const value: unknown = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(refreshPublicStatistics({ ...bindings, COUNTERS: counters })).rejects.toThrow("source unavailable");
    expect(await readPublicStatistics(bindings)).toEqual(saved);
  });

  it("retains the previous publication when its replacement cannot be written", async () => {
    const saved = await refreshPublicStatistics(bindings);
    await bindings.COUNTERS.put(paidKey, "90");
    const counters = new Proxy(bindings.COUNTERS, {
      get(target, prop) {
        if (prop === "put") return () => Promise.reject(new Error("publication unavailable"));
        const value: unknown = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(refreshPublicStatistics({ ...bindings, COUNTERS: counters })).rejects.toThrow("publication unavailable");
    expect(await readPublicStatistics(bindings)).toEqual(saved);
  });

  it("reports a summary storage failure without leaking the error or rebuilding", async () => {
    const get = vi.fn(() => Promise.reject(new Error("private storage detail")));
    const list = vi.fn();
    const counters = new Proxy(bindings.COUNTERS, {
      get(target, prop) {
        if (prop === "get") return get;
        if (prop === "list") return list;
        const value: unknown = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const response = await request("/stats", { ...bindings, COUNTERS: counters });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private storage detail");
    expect(get).toHaveBeenCalledTimes(REQUEST_KV_POLICY.retries);
    expect(list).not.toHaveBeenCalled();
  });

  it.each(["/", "/menu.json", "/skill.md"])("keeps %s available without inventing or rebuilding missing figures", async path => {
    const meter = meteredEnv();
    const response = await request(path, meter.env, path === "/" ? "text/html" : "*/*");
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("Statistics as of");
    expect(meter.reads.filter(key => key === PUBLIC_STATISTICS_KEY)).toHaveLength(1);
    expect(meter.lists.filter(prefix => /^(metric:|payer:|mpp:|gateway:|cert:)/.test(prefix))).toEqual([]);
    expect(meter.reads.filter(key => key.startsWith("metric:"))).toEqual([]);
  });

  it.each(["/", "/menu.json", "/skill.md"])("uses dated saved figures on %s without metric or payer scans", async path => {
    const saved = await refreshPublicStatistics(bindings);
    const meter = meteredEnv();
    const response = await request(path, meter.env, path === "/" ? "text/html" : "*/*");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(saved.books.stats.computed_at);
    expect(meter.reads.filter(key => key === PUBLIC_STATISTICS_KEY)).toHaveLength(1);
    expect(meter.lists.filter(prefix => /^(metric:|payer:|mpp:|gateway:|cert:)/.test(prefix))).toEqual([]);
    expect(meter.reads.filter(key => key.startsWith("metric:"))).toEqual([]);
  });
});
