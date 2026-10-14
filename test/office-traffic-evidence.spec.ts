import { describe, expect, it } from "vitest";
import { emptyMonthLedger } from "@/lib/metrics";
import { renderOfficePage, type OfficePageData } from "@/pages/admin/office-page";

function fixture(): OfficePageData {
  const monthLedger = emptyMonthLedger("2026-10");
  monthLedger.items.hello = {
    challenges: 6829, challengesHouse: 7, challengesInfra: 11110,
    settled: 1, settledHouse: 2, verifies: 12, verifiesHouse: 1,
    verifiesInfra: 8, declines: 3, declinesHouse: 0, tiers: {},
  };
  monthLedger.items.passport = {
    challenges: 100, challengesHouse: 4, challengesInfra: 10,
    settled: 2, settledHouse: 0, verifies: 1, verifiesHouse: 0,
    verifiesInfra: 0, declines: 0, declinesHouse: 0, tiers: {},
  };
  // Infrastructure channel writes were retired; item counters still record them.
  monthLedger.channels402Infra = {};
  monthLedger.channels402.direct = 6929;
  monthLedger.channels.direct = 3;
  monthLedger.days["11"] = { challenges: 6829, settles: 1 };
  return {
    monthLedger, porchLedger: { surfaces: {}, organicVisits: 0, porchToPurchase: null, truncated: false },
    payers: [], recentChallenges: [], take: null, allTime: null,
    reconciliation: null, monthReclass: null, bazaarLedger: [],
    work: { orders: 0, letters: 0, reviews: 0, alerts: 0 }, almanacSlugs: [], loadNotes: [],
  };
}

function trend(html: string): string {
  return html.split('>The trend</h2>')[1]!.split('</section>')[0]!;
}

describe("traffic evidence at the desk", () => {
  it("separates monthly unknown, recognized machinery and house requests using item counters", () => {
    const html = trend(renderOfficePage(fixture()));
    expect(html).toContain('<td>Unclassified 402 requests</td><td>6929</td>');
    expect(html).toContain('<td>Recognized crawler / infrastructure 402s</td><td>11120</td>');
    expect(html).toContain('<td>House / test 402 requests</td><td>11</td>');
    expect(html).toContain('may include unrecognized crawlers');
    expect(html).toContain('Requests are not unique visitors or evidence of buying intent');
  });

  it("keeps the daily records intact and states their UTC boundary and missing crawler split", () => {
    const html = trend(renderOfficePage(fixture()));
    expect(html).toContain('<th>day (UTC)</th><th>unclassified 402 requests</th><th>outside x402 sales that day</th>');
    expect(html).toContain('<td>2026-10-11</td><td>6829</td><td>1</td>');
    expect(html).toContain('A local evening can span two UTC days');
    expect(html).toContain('Crawler and house splits are available by month, not by day');
    for (const path of ['/admin/census', '/admin/funnel', '/admin/recount']) {
      expect(html).toContain(`href="${path}"`);
    }
  });

  it("does not call independent request counts a buyer conversion funnel", () => {
    const html = renderOfficePage(fixture());
    expect(html).not.toContain('<th>conversion</th>');
    expect(html).toContain('<th>settles / 402s</th>');
    expect(html).toContain('These are event ratios, not joined buyer journeys');
    expect(html).toContain('infrastructure 402s 11120');
  });

  it("marks capped readings as floors and still shows monthly traffic without daily rows", () => {
    const data = fixture();
    data.monthLedger.truncated = true;
    data.monthLedger.days = {};
    const html = trend(renderOfficePage(data));
    expect(html).toContain('Month scan hit its cap; these counts are floors');
    expect(html).toContain('<td>Recognized crawler / infrastructure 402s</td><td>11120</td>');
    expect(html).toContain('No day-level rows');
  });
});
