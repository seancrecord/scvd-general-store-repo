import { describe, expect, it } from "vitest";
import { renderReconciliationPage, type ReconciliationPageData } from "@/pages/admin/reconciliation-page";
import type { SettleReconciliation } from "@/lib/metrics";

function settleSection(unexplained: number, truncated: string[]): string {
  const settles: SettleReconciliation = {
    counter_settles: 12 + unexplained, payer_purchases: 11, settle_records: 11,
    founding: 1, unattributed: 0, unexplained, truncated,
    reading: truncated.length ? "INCOMPLETE: metric counters hit their cap." : "Every list was read to its end.",
    does_not_cover: "", delivery_audit: "",
  };
  const data: ReconciliationPageData = {
    settles, chain: { baseCursor: null, polygonCursor: null, polygonLastResult: null,
      solanaLastOk: null, solanaLastResult: null, baseSkipped: null },
    deliveries: null, alerts: [], alertsLastRead: null, loadNotes: [],
  };
  const html = renderReconciliationPage(data, new Date("2026-10-01T12:00:00Z"));
  const section = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/g)?.find((part) => /<h2\b[^>]*>Settle counters/.test(part));
  expect(section).toBeDefined();
  return section!;
}

describe("admin settlement verdicts follow the reading's coverage", () => {
  it.each([0, 1, -1])("never clears an incomplete comparison with difference %i", (difference) => {
    const section = settleSection(difference, ["metric counters"]);
    expect(section).toContain("INCOMPLETE");
    expect(section).not.toContain(">PASS<");
    expect(section).not.toContain("should read zero after the next raise");
  });

  it.each([1, -1])("asks for attention to a complete disagreement of %i", (difference) => {
    const section = settleSection(difference, []);
    expect(section).toContain(">ATTENTION<");
    expect(section).not.toContain(">PASS<");
  });

  it("passes a complete comparison whose totals agree", () => {
    expect(settleSection(0, [])).toContain(">PASS<");
  });
});
