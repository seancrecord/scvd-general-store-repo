import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "@/types";
import { railsRoutes } from "@/routes/rails";
import { pulseRoutes } from "@/routes/pulse";
import { statsRoutes } from "@/routes/stats";
import { storeMonthRoutes } from "@/routes/store-month";
import { trustRoutes } from "@/routes/trust";
import { computeStatsDiagnosed } from "@/services/stats";
import { sealStoreMonth, canonicalizeStoreMonth } from "@/services/store-month";
import { KV_KEYS } from "@/lib/kv-keys";
import { escapeHtml } from "@/lib/sanitize";
import { registeredCount } from "@/store/published-counts";

const bindings = env as unknown as Env;
const now = new Date("2026-09-30T12:00:00Z");
const month = "2026-08";
const base = "https://scvd.store";
const html = { headers: { Accept: "text/html" } };
const ledger = () => bindings.COUNTER_LEDGER!.get(bindings.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
async function nativeSale() {
  await ledger().recordMppSale({ id: "b".repeat(64), month, payer: `0x${"7e".repeat(20)}`,
    transaction: `0x${"b1".repeat(32)}`, amount: "1000", house: false, item: "spot_check" });
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
  let cursor: string | undefined;
  do {
    const page = await bindings.COUNTERS.list({ cursor });
    await Promise.all(page.keys.map(({ name }) => bindings.COUNTERS.delete(name)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("keeps an inconsistent network split withheld even when native MPP has sales", async () => {
  await bindings.COUNTERS.put(`metric:${month}:rail:base`, "9999");
  await nativeSale();
  const { stats, rail_overshoot } = await computeStatsDiagnosed(bindings);
  expect(rail_overshoot).not.toBeNull();
  expect(stats.payment_sources?.find(row => row.protocol === "mpp")?.organic).toBe(1);
  expect(stats.organic_by_rail).toBeUndefined();
  expect(stats.payments?.by_network).toBeNull();
});

it("draws every monthly network counted in the total, including other", async () => {
  await bindings.COUNTERS.put(`metric:${month}:rail:other`, "2");
  const page = await (await railsRoutes.request(`${base}/rails`, html, bindings)).text();
  expect(page).toContain("Other recorded network: 2 organic settlements");
  expect(page).toContain("<th>Other recorded network</th>");
  expect(page).toContain(`<td>${month}</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>2</td><td>2</td>`);
});

it("states monthly x402 coverage separately from combined all-time rails in both twins", async () => {
  await nativeSale();
  const response = await railsRoutes.request(`${base}/rails`, { headers: { Accept: "application/json" } }, bindings);
  const body = await response.json() as { method: string };
  expect(body.method).toContain("monthly series covers x402 only");
  expect(body.method).toContain("native MPP");
  const page = await (await railsRoutes.request(`${base}/rails`, html, bindings)).text();
  expect(page).toContain(escapeHtml(body.method));
});

it("uses the recorded denominator for both parts of the displayed pulse rate", async () => {
  await bindings.COUNTERS.put(`metric:${month}:402:hello`, "100");
  await bindings.COUNTERS.put(`metric:${month}:paid:hello`, "1");
  await bindings.COUNTERS.put("metric:corrections", JSON.stringify({ computed_at: now.toISOString(), months: {
    [month]: { month, recorded_organic: 100, corrected_organic: 50, moved_to_infrastructure: 50,
      movers: [], rows_read: 100, computed_at: now.toISOString(), complete: true }
  } }));
  const page = await (await pulseRoutes.request(`${base}/pulse`, html, bindings)).text();
  expect(page).toContain("1.0% (1 in 100)");
  expect(page).not.toContain("1.0% (1 in 50)");
});

it("seals combined monthly sales without changing the x402 funnel fields", async () => {
  await nativeSale();
  const sealed = await sealStoreMonth(bindings, month, { now, anchor: false });
  expect(sealed.sealed).toBe(true);
  if (!sealed.sealed) throw new Error(sealed.reason);
  expect(sealed.record.document.figures).toMatchObject({ organic_settled: 0, total_organic_settled: 1, mpp_organic_settled: 1 });
  for (const field of ["total_organic_settled", "mpp_organic_settled"]) {
    expect(registeredCount("/store-month", `entries[].document.figures.${field}`)).toBeDefined();
  }
  const page = await (await storeMonthRoutes.request(`${base}/store-month`, html, bindings)).text();
  expect(page).toContain("all-protocol sales (x402 + native MPP)");
  expect(page).toContain("x402 settled");
});

it("describes native checkout as well as inspection on both trust twins", async () => {
  const body = await (await trustRoutes.request(`${base}/trust`, { headers: { Accept: "application/json" } }, bindings)).json() as {
    discovery_by_protocol: { id: string; status: string; scope: string }[];
  };
  const mpp = body.discovery_by_protocol.find(row => row.id === "mpp")!;
  expect(mpp.status).toBe("available");
  expect(mpp.scope).toContain("native MPP checkout for enabled items");
  const page = await (await trustRoutes.request(`${base}/trust`, html, bindings)).text();
  expect(page).toContain(escapeHtml(mpp.scope));
});

it("labels historical signed months without inventing missing totals or changing their bytes", async () => {
  const sealed = await sealStoreMonth(bindings, month, { now, anchor: false });
  if (!sealed.sealed) throw new Error(sealed.reason);
  // Recreate the pre-extension shape; this fixture checks rendering, not its signature.
  const figures = sealed.record.document.figures as unknown as Record<string, unknown>;
  delete figures.total_organic_settled; delete figures.mpp_organic_settled;
  const canonical = canonicalizeStoreMonth(sealed.record.document);
  await bindings.COUNTERS.put(`${KV_KEYS.storeMonthPrefix}000000001`, JSON.stringify(sealed.record));
  const page = await (await storeMonthRoutes.request(`${base}/store-month`, html, bindings)).text();
  expect(page).toContain("Combined monthly sales were not retained in this signed record");
  const response = await storeMonthRoutes.request(`${base}/store-month/${month}.json`, undefined, bindings);
  expect(response.status).toBe(200);
  const twin = await response.json() as { signed_payload: string; reporting_scope: string };
  expect(twin.signed_payload).toBe(canonical);
  expect(twin.reporting_scope).toContain("Combined monthly sales were not retained");
});

it("describes native corrections and every recorded network in the public stats method", async () => {
  await nativeSale();
  const response = await statsRoutes.request(`${base}/stats`, undefined, bindings);
  const body = await response.json() as { rail_split_method: string; till_by_item_note: string };
  expect(body.till_by_item_note).toContain("native MPP rows include their per-item house corrections");
  expect(body.rail_split_method).toContain("arbitrum");
  expect(body.rail_split_method).toContain("world");
  expect(body.rail_split_method).toContain("native MPP");
});
