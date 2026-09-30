import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "@/types";
import { houseWallets } from "@/lib/channel";
import { readMppSaleEvidence, readMppSales } from "@/services/mpp-sales";
import { renderMppSalesPage } from "@/pages/admin/mpp-sales-page";
import { renderProtocolsPage } from "@/pages/admin/protocols-page";
import { PURCHASE_DOORS } from "@/services/purchase-intent";
import { computeGrowth } from "@/services/growth";
import { computePulse } from "@/services/pulse";
const bindings = env as unknown as Env;
const now = new Date("2026-09-29T12:00:00Z");
const month = "2026-09";
const ledger = () => bindings.COUNTER_LEDGER!.get(bindings.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
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
it("a corrected MPP sale should agree with the aggregate house classification", async () => {
  const payer = houseWallets(bindings).find(address => /^0x[0-9a-f]{40}$/.test(address))!;
  const sale = { id: "d".repeat(64), month, payer, transaction: `0x${"a1".repeat(32)}`, amount: "1000", house: false, item: "spot_check" };
  await ledger().recordMppSale(sale);
  await ledger().correctMppHouseSale(sale, "review fixture house correction");
  expect((await readMppSales(bindings)).organic).toBe(0);
  const html = renderMppSalesPage(await readMppSaleEvidence(bindings, now));
  expect(html).toContain("0 organic, 1 house");
});
it("failed till data should not render a zero-sale total", () => {
  const html = renderProtocolsPage({ month, read_at: now.toISOString(), arrivals: [], arrivals_total: 0,
    arrivals_truncated: false, till: PURCHASE_DOORS.map(door => ({ door, settles: 0, networks: {} })), till_total: null,
    operations: null, market: null, surfaces: [], unreadable: ["buyer signals (who paid, by door)"], notes: [] });
  expect(html).toContain("is therefore not a zero");
  expect(html).not.toContain("Total across doors: 0");
  expect(html).toContain("Sales by door unavailable");
});
it("a native MPP sale should appear in a report labelled organic settles", async () => {
  await ledger().recordMppSale({ id: "e".repeat(64), month, payer: `0x${"7e".repeat(20)}`,
    transaction: `0x${"a2".repeat(32)}`, amount: "1000", house: false, item: "spot_check" });
  expect((await readMppSales(bindings)).organic).toBe(1);
  const growth = await computeGrowth(bindings, { now, months: [month] });
  expect.soft(growth.months[0]!.store.organic_settles).toBe(1);
  const pulse = await computePulse(bindings);
  expect.soft(pulse.months.find(row => row.month === month)).toMatchObject({ organic_settled: 0, total_organic_settled: 1, mpp_organic_settled: 1 });
});

// Shared navigation must help on every report without loading other reports.
it("names the browser tab and puts the reading before the full report directory", async () => {
  const { renderAdminShell } = await import("@/pages/admin/layout");
  const html = renderAdminShell("growth", '<h2>Sales</h2><p>One.</p><h2>Visits</h2><p>Two.</p>');
  expect(html).toContain("<title>Growth · Keep's Office</title>");
  expect(html).toContain('<details class="report-directory">');
  expect(html.indexOf('<h1>Growth</h1>')).toBeLessThan(html.indexOf('class="report-directory"'));
  expect(html).toContain('aria-label="On this page"');
  expect(html).toContain('href="#admin-section-1"');
  expect(html).toContain('<h2 id="admin-section-1">Sales</h2>');
});

it("keeps months, retries, pilot rows and corrected house amounts separate", async () => {
  const { readMppSalesMonth } = await import("@/services/mpp-sales");
  const { readCommerceMonthLedger, commerceMonthTotals } = await import("@/services/commerce-month");
  const publicSale = { id: "1".repeat(64), month, payer: `0x${"7e".repeat(20)}`, transaction: `0x${"a3".repeat(32)}`, amount: "2500000", house: false };
  const houseSale = { ...publicSale, id: "2".repeat(64), payer: houseWallets(bindings).find(address => /^0x[0-9a-f]{40}$/.test(address))!, item: "spot_check" };
  await ledger().recordMppSale(publicSale);
  await ledger().recordMppSale(publicSale);
  await ledger().recordMppSale(houseSale);
  await ledger().correctMppHouseSale(houseSale, "keeper correction");
  await ledger().correctMppHouseSale(houseSale, "keeper correction");
  expect(await readMppSalesMonth(bindings, "2026-08")).toMatchObject({ organic: 0, house: 0 });
  expect(await readMppSalesMonth(bindings, month)).toMatchObject({ organic: 1, house: 1, organic_amount_atomic: "2500000", house_amount_atomic: "2500000" });
  expect(await readMppSales(bindings)).toMatchObject({ organic: 1, house: 1, reclassified_house: 1 });
  const combined = await readCommerceMonthLedger(bindings, month);
  expect(commerceMonthTotals(combined)).toMatchObject({ organic: 1, house: 1, revenue_usdc: 2.5, house_revenue_usdc: 2.5 });
  expect(Object.values(combined.items)).toHaveLength(0); // legacy funnel is not rewritten
});

it("shows corrupt corrections as unavailable and never leaks arbitrary stored fields", async () => {
  const sale = { id: "3".repeat(64), month, payer: houseWallets(bindings).find(address => /^0x[0-9a-f]{40}$/.test(address))!, transaction: `0x${"a4".repeat(32)}`, amount: "1000", house: false, item: "spot_check" };
  await ledger().recordMppSale(sale);
  await ledger().correctMppHouseSale(sale, "keeper correction");
  await runInDurableObject(ledger(), async (_instance, state) => {
    state.storage.sql.exec("UPDATE mpp_house_corrections SET evidence = ? WHERE id = ?", JSON.stringify({ ...sale, amount: "9999", at: now.toISOString(), reason: "tampered" }), sale.id);
    state.storage.sql.exec("UPDATE mpp_sales SET evidence = ? WHERE id = ?", JSON.stringify({ ...sale, extra: "must-not-escape" }), sale.id);
  });
  const listing = await readMppSaleEvidence(bindings, now);
  expect(listing.rows[0]).toMatchObject({ house: false, effective_house: null, classification: "unavailable" });
  const html = renderMppSalesPage(listing);
  expect(html).toContain("0 organic, 0 house, 1 unclassified");
  expect(JSON.stringify(listing)).not.toContain("must-not-escape");
});

it("does not call unreadable months read or claim no retained sales anywhere", async () => {
  const listing = await readMppSaleEvidence({ ...bindings, COUNTER_LEDGER: undefined }, now);
  const html = renderMppSalesPage(listing);
  expect(html).toContain("Months read: none");
  expect(listing.months_unreadable).toEqual(listing.months);
});

it("keeps unavailable arrivals separate from a measured zero in the till", async () => {
  const metrics = await import("@/lib/metrics");
  vi.spyOn(metrics, "readPorchLedger").mockRejectedValue(new Error("fixture"));
  const { readProtocols } = await import("@/services/protocol-reading");
  const reading = await readProtocols(bindings);
  expect(reading.arrivals_total).toBeNull();
  expect(reading.till_total).toBe(0);
  const html = renderProtocolsPage(reading);
  expect(html).toContain("Arrival reading unavailable");
  expect(html).not.toContain("No organic arrivals recorded");
  expect(html).toContain("Total across doors: 0");
});

it("does not display zero when buyer signals fail", async () => {
  const signals = await import("@/services/buyer-signals");
  vi.spyOn(signals, "readBuyerSignals").mockRejectedValue(new Error("fixture"));
  const { readProtocols } = await import("@/services/protocol-reading");
  const reading = await readProtocols(bindings);
  expect(reading.till_total).toBeNull();
  const html = renderProtocolsPage(reading);
  expect(html).toContain("Sales by door unavailable");
  expect(html).not.toContain("Total across doors: 0");
  expect(html).toContain("No organic arrivals recorded");
});

it("shows capability configuration even with no usage and respects disabled native checkout", async () => {
  const { readProtocols } = await import("@/services/protocol-reading");
  const reading = await readProtocols({ ...bindings, MPP_CHECKOUT_ENABLED: "false", UCP_CHECKOUT_ENABLED: "false" });
  const html = renderProtocolsPage(reading);
  for (const label of ["A2A", "UCP", "MPP", "MCP", "WebMCP"]) expect(html).toContain(label);
  expect(html).toContain("Native checkout disabled");
  expect(html).toContain("0 shelf items enabled");
});

it("growth reads each month's ledger once, shared with pulse", async () => {
  const metrics = await import("@/lib/metrics");
  const list = vi.spyOn(metrics, "readMonthLedger");
  await computeGrowth(bindings, { now, months: [month] });
  const reads = list.mock.calls.filter(([, requestedMonth]) => requestedMonth === month);
  expect(reads).toHaveLength(1);
});

it("keeps existing anchors and escaped heading text in page navigation", async () => {
  const { renderAdminShell } = await import("@/pages/admin/layout");
  const html = renderAdminShell("growth", '<h2 id="admin-section-1">Existing</h2><h2>&lt;img src=x onerror=bad&gt;</h2>');
  expect(html).toContain('href="#admin-section-1"');
  expect(html).toContain('href="#admin-section-2"');
  expect(html).not.toContain('<img');
  expect((html.match(/id="admin-section-1"/g) ?? []).length).toBe(1);
});

it("the glance includes native money and rejects pre-fix cached monthly totals", async () => {
  const { writeGlance, readGlance, GLANCE_KEY } = await import("@/services/glance");
  const field = await import("@/services/field-wallet");
  vi.spyOn(field, "readFieldWallet").mockRejectedValue(new Error("fixture: wallet not read"));
  await ledger().recordMppSale({ id: "4".repeat(64), month, payer: `0x${"7e".repeat(20)}`, transaction: `0x${"a5".repeat(32)}`, amount: "2500000", house: false, item: "spot_check" });
  const glance = await writeGlance(bindings);
  expect(glance).toMatchObject({ organic_settlements: 1, take_usdc: 2.5 });
  delete glance.desk!.month_ledger.native_mpp;
  await bindings.COUNTERS.put(GLANCE_KEY, JSON.stringify(glance));
  expect(await readGlance(bindings)).toMatchObject({ organic_settlements: null, take_usdc: null });
});

it("does not present an unreadable market as no ward round yet", async () => {
  const ward = await import("@/services/ward-round");
  vi.spyOn(ward, "latestWardRound").mockRejectedValue(new Error("fixture"));
  const { readProtocols } = await import("@/services/protocol-reading");
  const html = renderProtocolsPage(await readProtocols(bindings));
  expect(html).toContain("Market reading unavailable");
  expect(html).not.toContain("No ward round on the books yet");
});

it("keeps all-time native sales after their month leaves the displayed pulse window", async () => {
  await ledger().recordMppSale({ id: "5".repeat(64), month, payer: `0x${"7e".repeat(20)}`, transaction: `0x${"a6".repeat(32)}`, amount: "1000", house: false, item: "spot_check" });
  const later = new Date("2027-05-01T12:00:00Z");
  vi.setSystemTime(later);
  const pulse = await computePulse(bindings, { now: later });
  expect(pulse.months.some(row => row.month === month)).toBe(false);
  expect(pulse.all_time).toMatchObject({ total_organic_settled: 1, mpp_organic_settled: 1 });
});
