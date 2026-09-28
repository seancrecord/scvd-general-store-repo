import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS, currentWeekKey, isWeekKey } from "@/lib/kv-keys";
import { ledgerShardName } from "@/lib/counter-ledger";
import { metricsMonth, readMonthLedger, readPorchLedger, recordChallengeIssued, recordPorchVisit, recordSettlement, recordVerifyCall } from "@/lib/metrics";
import { readBuyerSignals, recordInputRefusal, recordSettleSignal } from "@/services/buyer-signals";
import { readDisclosureCensus, recordDisclosure } from "@/services/disclosure-census";
import { readMcpClients, recordMcpClient } from "@/services/mcp-clients";
import { signalStore } from "@/services/signal-store";
import { getMenuItem } from "@/store";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE WEEK TWINS (2026-09-28). Every counter Open for Business reads
 * kept one key per month, so the weekly read a month to date. Each of
 * those writers now bumps the ISO week beside the month: same store,
 * same caps, a second period key. These tests go through the
 * recorders and read the wall clock's week back, which is the one
 * question a fixed date cannot ask: does the writer land the twin.
 */
describe("the week twins", () => {
  const week = currentWeekKey();
  const month = metricsMonth();

  beforeEach(async () => {
    installFacilitatorMock();
    await signalStore(testEnv)?.reset();
    for (const prefix of [`metricw:${week}:`, `metric:${month}:signals:`, `metric:${month}:verifyage:`, `metric:${month}:src:`, `metric:${month}:src402:`, `metric:${month}:porch:`, `metric:${month}:mcpclient:`, `metric:${month}:disclosure:`]) {
      const listed = await testEnv.COUNTERS.list({ prefix });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
    }
  });

  it("a week period gets its own prefix and shards the ledger by week and kind", () => {
    expect(isWeekKey("2026-W40")).toBe(true);
    expect(isWeekKey("2026-09")).toBe(false);
    expect(KV_KEYS.metric("2026-W40", "src", "direct")).toBe("metricw:2026-W40:src:direct");
    expect(KV_KEYS.metric("2026-09", "src", "direct")).toBe("metric:2026-09:src:direct");
    expect(KV_KEYS.metricMonthPrefix("2026-W40")).toBe("metricw:2026-W40:");
    expect(ledgerShardName("metricw:2026-W40:src:direct")).toBe("2026-W40/src");
  });

  it("buyer signals land on the month and on the week: refusals, rails and purposes", async () => {
    await recordInputRefusal(testEnv, getMenuItem("spot_check"), "spot_check", { code: "bad_request", input_field: "host" }, "https://x.example/api", { userAgent: "python-httpx/0.27" });
    await recordSettleSignal(testEnv, { door: "http", network: "eip155:8453", item: "hello", purpose: "a weekly test", house: false });
    const weekly = await readBuyerSignals(testEnv, week);
    expect(weekly.refusal["spot_check:host:malformed"]).toBe(1);
    expect(weekly.rail["http:eip155:8453"]).toBe(1);
    expect(weekly.purposes.map((row) => row.purpose)).toEqual(["a weekly test"]);
    const monthly = await readBuyerSignals(testEnv, month);
    expect(monthly.refusal["spot_check:host:malformed"]).toBe(1);
    expect(monthly.purposes.map((row) => row.purpose)).toEqual(["a weekly test"]);
  });

  it("the verify age, the 402s, the settles and the porch land on the week", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await recordVerifyCall(testEnv, "hello", { userAgent: "a-stranger/1.0" }, eightDaysAgo);
    expect((await readBuyerSignals(testEnv, week)).verify_age["over_1w"]).toBe(1);
    await recordChallengeIssued(testEnv, "/api/buy/hello", { userAgent: "python-httpx/0.27" });
    await recordSettlement(testEnv, "/api/buy/hello", { paidUsdc: 0.01, minimumUsdc: 0.01, userAgent: "python-httpx/0.27" });
    const ledger = await readMonthLedger(testEnv, week);
    expect(Object.values(ledger.channels402).reduce((a, b) => a + b, 0)).toBe(1);
    expect(Object.values(ledger.channels).reduce((a, b) => a + b, 0)).toBe(1);
    await recordPorchVisit(testEnv, "/llms.txt", { userAgent: "python-httpx/0.27" });
    const porch = await readPorchLedger(testEnv, week);
    expect(porch.organicVisits).toBe(1);
    expect(porch.surfaces["/llms.txt"]?.["organic"]).toBe(1);
    // House and machinery are not twinned: the weekly reads organic surfaces and nothing else from the porch.
    await recordPorchVisit(testEnv, "/llms.txt", { userAgent: "census-probe/1.0" });
    expect((await readPorchLedger(testEnv, week)).surfaces["/llms.txt"]?.["infrastructure"]).toBeUndefined();
    expect((await readPorchLedger(testEnv, month)).surfaces["/llms.txt"]?.["infrastructure"]).toBe(1);
  });

  it("the MCP client census and the disclosure census land on the week", async () => {
    await recordMcpClient(testEnv, "claude-code", "1.0");
    expect((await readMcpClients(testEnv, week))["claude-code"]).toBe(1);
    expect((await readMcpClients(testEnv, month))["claude-code"]).toBe(1);
    await recordDisclosure(testEnv, "paid", { model: "claude-opus-5" });
    await recordDisclosure(testEnv, "paid", {});
    const weekly = await readDisclosureCensus(testEnv, "paid", week);
    expect(weekly.offered).toBe(2);
    expect(weekly.disclosed).toBe(1);
    expect((await readDisclosureCensus(testEnv, "paid", month)).offered).toBe(2);
  });

  it("the signal store reaps old weeks with old months and keeps the current ones", async () => {
    const store = signalStore(testEnv)!;
    await store.bump({ month: "2025-W01", kind: "pages", entry: "x" });
    await store.bump({ month: "2025-01", kind: "pages", entry: "x" });
    await store.bump({ month: "2026-W38", kind: "pages", entry: "x" });
    await store.bump({ month: "2026-09", kind: "pages", entry: "x" });
    expect(await store.reap(new Date("2026-09-21T00:00:00Z"))).toBe(2);
    expect(await store.readMonth("2025-W01")).toEqual({});
    expect(await store.readMonth("2025-01")).toEqual({});
    expect((await store.readMonth("2026-W38"))["pages"]).toEqual({ x: 1 });
    expect((await store.readMonth("2026-09"))["pages"]).toEqual({ x: 1 });
  });
});
