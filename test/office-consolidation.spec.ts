import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { mintCertificate } from "@/services/certificates";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};
const BROWSER = { ...AUTH, Accept: "text/html" };

/**
 * The 2026-08-05 consolidation, pinned: the desk leads with the
 * all-time take split by shelf kind (the month is a labeled slice
 * below), the books check gathers every money audit behind one door,
 * keeper's files holds the downloads, and the test levers live in
 * their own drawer off the daily shelf.
 */
describe("the consolidated office", () => {
  it("the desk leads with the all-time take, month labeled as a slice", async () => {
    await mintCertificate(testEnv, {
      itemId: "hello",
      paidUsdc: 0.5,
      payer: "0x9f0000000000000000000000000000000000take",
      settlementTx: `0xtake${"a".repeat(59)}`,
      network: "eip155:8453",
    });
    const response = await SELF.fetch(`${BASE}/admin`, { headers: BROWSER });
    expect(response.status).toBe(200);
    const html = await response.text();
    const takeAt = html.indexOf("The take — all-time");
    const monthAt = html.indexOf("This month's slice");
    expect(takeAt).toBeGreaterThan(-1);
    expect(monthAt).toBeGreaterThan(takeAt);
    expect(html).toContain("Instant shelf");
    expect(html).toContain("A window, not the total");
  });

  it("the books check renders every audit with a verdict", async () => {
    const response = await SELF.fetch(`${BASE}/admin/reconciliation`, {
      headers: BROWSER,
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Settle counters vs payer rows");
    expect(html).toContain("The chain vs the books");
    expect(html).toContain("Money in vs goods out");
    expect(html).toContain("The alarm trail");
    // Demoted readings stay reachable from here.
    expect(html).toContain('href="/admin/recount"');
    expect(html).toContain('href="/admin/census"');
    expect(html).toContain('href="/admin/bell"');
  });

  it("keeper's files holds the tax CSV; the test drawer holds the levers", async () => {
    const files = await SELF.fetch(`${BASE}/admin/files`, { headers: BROWSER });
    expect(files.status).toBe(200);
    expect(await files.text()).toContain('href="/admin/export/tax.csv"');

    const testing = await SELF.fetch(`${BASE}/admin/testing`, {
      headers: BROWSER,
    });
    expect(testing.status).toBe(200);
    const testingHtml = await testing.text();
    expect(testingHtml).toContain('action="/admin/alerts/test"');
    expect(testingHtml).toContain('action="/admin/inventory/reset"');

    // And the back shelf no longer carries either, but points at both.
    const tools = await SELF.fetch(`${BASE}/admin/tools`, { headers: BROWSER });
    const toolsHtml = await tools.text();
    expect(toolsHtml).not.toContain('action="/admin/alerts/test"');
    expect(toolsHtml).toContain('href="/admin/testing"');
    expect(toolsHtml).toContain('href="/admin/files"');
  });

  it("new pages refuse without the keeper's key", async () => {
    for (const path of ["/admin/reconciliation", "/admin/files", "/admin/testing"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, path).toBe(401);
    }
  });
});

/**
 * THE IDENTITY, pinned the day the keeper caught the front page
 * publishing 88 − 85 beside an organic 5: settled purchases must
 * equal organic + house + pre-meter EXACTLY, on the same substrate,
 * and the artifact counter is published as what it is instead of
 * masquerading as a purchase count.
 */
describe("the books identity", () => {
  it("total = organic + house + pre-meter, by construction", async () => {
    const { computeStats, trackRecordLine } = await import("@/services/stats");
    const stats = await computeStats(testEnv);
    expect(stats.settled_purchases_total).toBe(
      stats.organic_settlements +
        stats.house_settlements +
        stats.pre_meter_settlements,
    );
    expect(typeof stats.artifacts_issued).toBe("number");
    // The public sentence shows the arithmetic instead of implying it.
    const line = trackRecordLine(stats, "https://scvd.store");
    expect(line).toContain(`${stats.organic_settlements} organic`);
    expect(line).toContain("free shelf included");
  });

  it("the take splits the organic rails by certificate network", async () => {
    const { takeSummary } = await import("@/services/books-summary");
    const take = await takeSummary(testEnv);
    const railSales =
      take.rails.base.sales + take.rails.solana.sales + take.rails.unknown.sales;
    expect(railSales).toBe(take.total.organic_sales);
  });
});
