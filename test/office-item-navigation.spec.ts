import { SELF, env } from "cloudflare:test";
import { expect, it } from "vitest";
import { emptyMonthLedger } from "@/lib/metrics";
import { renderOfficePage, type OfficePageData } from "@/pages/admin/office-page";
import type { Env } from "@/types";

it("takes the desk reader to retained events for the selected item", async () => {
  const monthLedger = emptyMonthLedger("2026-10");
  const item = "almanac:notes & questions";
  monthLedger.items[item] = {
    challenges: 1, challengesHouse: 0, challengesInfra: 0,
    settled: 0, settledHouse: 0, verifies: 0, verifiesHouse: 0,
    verifiesInfra: 0, declines: 0, declinesHouse: 0, tiers: {},
  };
  const data: OfficePageData = {
    monthLedger, porchLedger: { surfaces: {}, organicVisits: 0, porchToPurchase: null, truncated: false },
    payers: [], recentChallenges: [], take: null, allTime: null,
    reconciliation: null, monthReclass: null, bazaarLedger: [], gazetteIssues: [],
    work: { orders: 0, letters: 0, reviews: 0, alerts: 0 }, almanacSlugs: [], loadNotes: [],
  };
  const html = renderOfficePage(data);
  expect(html).toContain('href="#item-ledger"');
  expect(html).toContain('<h2 id="item-ledger">');
  const href = html.match(/href="(\/admin\/events\?item=[^"]+)"/)?.[1];
  expect(href).toBe(`/admin/events?item=${encodeURIComponent(item)}`);
  const response = await SELF.fetch(`https://scvd.store${href}`, {
    headers: { Authorization: `Basic ${btoa(`keeper:${(env as unknown as Env).ADMIN_PASSWORD}`)}` },
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("almanac:notes &amp; questions");
});
