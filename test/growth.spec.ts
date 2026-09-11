import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth, monthsSinceOpening, readMonthLedger, recordPorchVisit, type PorchLedger } from "@/lib/metrics";
import { REFERRER_HOST_CAP, readReferrerHosts, recordReferrerHost } from "@/lib/referrer-census";
import { readBellRings, ringBell } from "@/services/bell";
import {
  computeGrowth,
  deriveGrowthMonth,
  logClosedMonth,
  monthBefore,
  readGrowthLog,
  type MonthInputs,
} from "@/services/growth";
import type { Env } from "@/types";

/**
 * THE GROWTH LEDGER (2026-09-11; docs/GROWTH_LEDGER_2026-09.md). What
 * this file holds:
 *
 *   - the bell's monthly line moves on a ring that counted and not on
 *     a refused repeat;
 *   - the referring-host census records an outside host, ignores our
 *     own, and past its cap counts to "other" rather than dropping;
 *   - the derivation finds a NEW surface only when no earlier month
 *     had it, and the funnel's three counts come off the counters
 *     they name;
 *   - the page and the JSON render for the keeper, newest month first;
 *   - the press freezes a closed month once and leaves it alone after.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };

const NOW = new Date("2026-09-11T12:00:00.000Z");
const MONTH = "2026-09";

function porch(surfaces: Record<string, Record<string, number>>): PorchLedger {
  let organic = 0;
  for (const buckets of Object.values(surfaces)) organic += buckets["organic"] ?? 0;
  return { surfaces, organicVisits: organic, porchToPurchase: null, truncated: false };
}

async function ledgerFor(month: string) {
  return readMonthLedger(testEnv, month);
}

function inputs(over: Partial<MonthInputs>, ledger: Awaited<ReturnType<typeof ledgerFor>>): MonthInputs {
  return {
    month: MONTH,
    now: NOW,
    porch: porch({}),
    ledger,
    clients: {},
    bounty: { paid: 0 },
    verifyAge: {},
    referrers: {},
    bellRings: 0,
    rail: null,
    pulse: null,
    state: null,
    logged: null,
    seenBefore: new Set(),
    previous: null,
    ...over,
  };
}

describe("the two counters that were missing", () => {
  it("counts a ring that counted, and not the refused repeat", async () => {
    const before = await readBellRings(testEnv);
    await ringBell(testEnv, "growth-ringer");
    await ringBell(testEnv, "growth-ringer");
    expect(await readBellRings(testEnv)).toBe(before + 1);
  });

  it("records an outside referring host off a porch visit and never our own", async () => {
    await recordPorchVisit(testEnv, "corpus", { referrer: "https://www.x402scan.com/resources/123?q=1" });
    await recordPorchVisit(testEnv, "corpus", { referrer: "https://scvd.store/menu" });
    await recordPorchVisit(testEnv, "corpus", { referrer: "not a url" });
    const census = await readReferrerHosts(testEnv, metricsMonth());
    expect(census["www.x402scan.com"]).toBeGreaterThanOrEqual(1);
    expect(Object.keys(census).some((host) => host.includes("scvd.store"))).toBe(false);
    // The host, never the path: the query string is not ours to keep.
    expect(JSON.stringify(census)).not.toContain("resources");
  });

  it("counts past the cap as other rather than dropping it", async () => {
    const month = "2026-01";
    for (let i = 0; i < REFERRER_HOST_CAP; i += 1) {
      expect(await recordReferrerHost(testEnv, `https://host-${i}.example/`, month)).toBe(true);
    }
    expect(await recordReferrerHost(testEnv, "https://one-too-many.example/", month)).toBe(true);
    const census = await readReferrerHosts(testEnv, month);
    expect(Object.keys(census)).toHaveLength(REFERRER_HOST_CAP + 1);
    expect(census["other"]).toBe(1);
    expect(census["one-too-many.example"]).toBeUndefined();
  });
});

describe("one month, derived", () => {
  it("finds a surface new only when no earlier month had it, and the largest moves against the month before", async () => {
    const ledger = await ledgerFor("2026-01");
    const month = deriveGrowthMonth(
      inputs(
        {
          porch: porch({
            "mcp:tool:preflight_endpoint": { organic: 12, "organic:mcp": 12 },
            "catalog-search": { organic: 3, "organic:direct": 3 },
            corpus: { organic: 40, "organic:direct": 40, infrastructure: 9 },
            storefront: { organic: 2, "organic:direct": 2 },
          }),
          seenBefore: new Set(["corpus", "storefront", "gazette"]),
          previous: new Map([
            ["corpus", 50],
            ["storefront", 1],
          ]),
        },
        ledger,
      ),
    );
    expect(month.demand.new_surfaces.map((row) => row.surface)).toEqual(["mcp:tool:preflight_endpoint", "catalog-search"]);
    expect(month.demand.new_surfaces[0]?.kind).toBe("instrument");
    expect(month.demand.risers[0]).toMatchObject({ surface: "mcp:tool:preflight_endpoint", previous: 0, organic: 12, delta: 12 });
    expect(month.demand.fallers[0]).toMatchObject({ surface: "corpus", previous: 50, organic: 40, delta: -10 });
    expect(month.store.visits_by_kind).toMatchObject({ instrument: 12, storefront: 5, evidence: 40 });
  });

  it("has no new surfaces and no deltas in the first month read, by construction", async () => {
    const ledger = await ledgerFor("2026-01");
    const month = deriveGrowthMonth(
      inputs({ porch: porch({ corpus: { organic: 4, "organic:direct": 4 } }), previous: null }, ledger),
    );
    expect(month.demand.new_surfaces).toEqual([]);
    expect(month.demand.risers).toEqual([]);
    expect(month.free_instruments.by_instrument[0]?.delta).toBeNull();
  });

  it("reads the funnel's three counts off the counters they name, argument-carrying uses only", async () => {
    const month = "2026-02";
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "402", "hello"), "8");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "paid", "hello"), "2");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "402", "the_case_file"), "1");
    const ledger = await ledgerFor(month);
    const derived = deriveGrowthMonth(
      inputs(
        {
          month,
          porch: porch({
            "mcp:tool:preflight_endpoint": { organic: 10, "organic:mcp": 10 },
            "mcp:tool:read_store_guide": { organic: 30, "organic:mcp": 30 },
            "mcp:initialize": { organic: 100, "organic:mcp": 100 },
            "mcp:tools/list": { organic: 90, "organic:mcp": 90 },
            "mcp-verifier:initialize": { organic: 5, "organic:mcp": 5 },
            "mcp:tool:buy_simple": { organic: 4, "organic:mcp": 4 },
          }),
        },
        ledger,
      ),
    );
    expect(derived.free_instruments.funnel).toEqual({
      free_argument_uses: 10,
      organic_402s: 9,
      organic_settles: 2,
      asks_per_hundred_checks: 90,
      settles_per_hundred_checks: 20,
    });
    expect(derived.free_instruments.total).toBe(40);
    expect(derived.free_instruments.read_uses).toBe(30);
    expect(derived.store.settles_per_hundred_402s).toBe(22.2);
    expect(derived.agents.mcp_handshakes).toBe(105);
    expect(derived.agents.tools_listed).toBe(90);
    // Free and paid alike, and neither handshake nor catalogue read.
    expect(derived.agents.tool_calls).toBe(44);
    expect(derived.demand.items_asked_for[0]).toEqual({ item: "hello", organic_402s: 8, organic_settles: 2 });
  });

  it("keeps the counter kinds that are not shelf items off the shelf", async () => {
    const month = "2026-03";
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "verifyage", "over_1w"), "3");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "bell", "rings"), "2");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "refhost", "census"), "{}");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "402", "hello"), "1");
    const ledger = await ledgerFor(month);
    expect(Object.keys(ledger.items)).toEqual(["hello"]);
  });
});

describe("every month since opening, side by side", () => {
  it("reads newest first, sees this month's seeds, and serves the keeper a page and a JSON", async () => {
    const current = metricsMonth(NOW);
    const before = monthBefore(NOW);
    await testEnv.COUNTERS.put(KV_KEYS.metric(before, "porch", "corpus:direct"), "7");
    await testEnv.COUNTERS.put(KV_KEYS.metric(current, "porch", "corpus:direct"), "9");
    await testEnv.COUNTERS.put(KV_KEYS.metric(current, "porch", "mcp:tool:check_conformance:mcp"), "6");
    await testEnv.COUNTERS.put(KV_KEYS.metric(current, "402", "hello"), "3");
    await testEnv.COUNTERS.put(KV_KEYS.metric(current, "mcpclient", "census"), JSON.stringify({ "claude-code": 4, unnamed: 1 }));

    const ledger = await computeGrowth(testEnv, { now: NOW });
    expect(ledger.months.map((m) => m.month)).toEqual([...monthsSinceOpening(NOW)].reverse());
    const month = ledger.months[0]!;
    expect(month.month).toBe(current);
    expect(month.store.organic_visits).toBeGreaterThanOrEqual(15);
    expect(month.free_instruments.by_instrument.find((r) => r.surface === "mcp:tool:check_conformance")?.organic).toBe(6);
    expect(month.demand.new_surfaces.map((r) => r.surface)).toContain("mcp:tool:check_conformance");
    expect(month.demand.new_surfaces.map((r) => r.surface)).not.toContain("corpus");
    expect(month.agents.distinct_mcp_clients).toBe(2);
    expect(month.agents.mcp_clients[0]).toEqual({ name: "claude-code", handshakes: 4 });
    expect(month.x402_economy).toBeNull();
    expect(month.logged).toBeNull();

    const page = await SELF.fetch(`${BASE}/admin/growth`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("The free instruments, and the funnel under them");
    expect(html).toContain(`<th>${metricsMonth()}`);
    expect(html).toContain('href="/admin/growth.json"');

    const json = await SELF.fetch(`${BASE}/admin/growth.json`, { headers: AUTH });
    expect(json.status).toBe(200);
    const body = (await json.json()) as { months: { month: string }[] };
    expect(body.months[0]?.month).toBe(metricsMonth());
  });

  it("turns the keeper away without the password", async () => {
    const response = await SELF.fetch(`${BASE}/admin/growth.json`);
    expect(response.status).toBe(401);
  });
});

describe("the press", () => {
  it("freezes the closed month once and leaves it alone after", async () => {
    const afterClose = new Date("2026-10-01T00:30:00.000Z");
    await testEnv.COUNTERS.put(KV_KEYS.metric("2026-09", "402", "hello"), "5");
    expect(await logClosedMonth(testEnv, afterClose)).toBe("2026-09");
    const held = await readGrowthLog(testEnv, "2026-09");
    expect(held?.logged?.at).toBe(afterClose.toISOString());
    expect(held?.store.organic_402s).toBe(5);

    // The books move after close; the log does not.
    await testEnv.COUNTERS.put(KV_KEYS.metric("2026-09", "402", "hello"), "9");
    expect(await logClosedMonth(testEnv, afterClose)).toBeNull();
    expect((await readGrowthLog(testEnv, "2026-09"))?.store.organic_402s).toBe(5);

    // ...and the page prints both.
    const ledger = await computeGrowth(testEnv, { now: afterClose });
    const september = ledger.months.find((m) => m.month === "2026-09")!;
    expect(september.logged).toMatchObject({ organic_402s: 5 });
    expect(september.store.organic_402s).toBe(9);
  });

  it("has nothing to do before the store opened", async () => {
    expect(await logClosedMonth(testEnv, new Date("2026-07-02T00:00:00.000Z"))).toBeNull();
  });
});
