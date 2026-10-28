import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readReferrerHosts } from "@/lib/referrals";
import { renderReferralsPage } from "@/pages/admin/referrals-page";
import { renderOutreachPage } from "@/pages/admin/outreach-page";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const auth = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };
async function page(path: string): Promise<string> {
  const response = await SELF.fetch(`https://scvd.store${path}`, { headers: auth });
  expect(response.status).toBe(200);
  return response.text();
}

describe("admin reporting after optional visitor detail stopped", () => {
  it("does not infer no browser arrivals from an empty retained log", async () => {
    const report = await readReferrerHosts(testEnv);
    expect(report.hosts).toEqual([]);
    expect(report.honest_limit).toContain("does not establish that nobody arrived");
    const html = await page("/admin/referrals");
    expect(html).toContain("No referring hosts in the retained rows scanned");
    expect(html).not.toContain("clicks are not happening");
  });

  it("keeps retained host counts and paid referral counts visible", () => {
    const html = renderReferralsPage({
      month: "2026-10", rows: [{ marker: 26, arrived: 4, settled: 2 }],
      total_arrived: 4, total_settled: 2, honest_limit: "Declared markers only.",
    }, { rows_scanned: 3, with_referrer: 3, hosts: [{ host: "retained.example", count: 3 }], honest_limit: "Retained rows only." });
    expect(html).toContain("Arrived: 4 · Settled: 2");
    expect(html).toContain("<td>retained.example</td><td>3</td>");
    expect(html).toContain("New free visits do not add referring-host detail");
  });

  it("separates retained growth detail from continuing aggregate and MCP counts", async () => {
    const html = await page("/admin/growth");
    expect(html).toContain("free uses, organic");
    expect(html).toContain("MCP sessions opened");
    expect(html).toContain("retained referring visits (collection stopped)");
    expect(html).toContain("No retained client detail");
    expect(html).not.toContain("No client census for");
  });

  it("labels free-call joins and daily samples as historical", async () => {
    const html = await page("/admin/instruments");
    expect(html).toContain("Historical free-visit detail");
    expect(html).toContain("The handoff — historical rows");
    expect(html).toContain("Who called — retained detail");
    expect(html).toContain('name="day"');
    expect(html).toContain("Free instruments:");
  });

  it("does not describe an empty client trace as a free-only journey", async () => {
    const html = await page("/admin/trace?ua=unrecorded-client");
    expect(html).toContain("Retained events for this client");
    expect(html).toContain("New free visits are not recorded here");
    expect(html).not.toContain("free doors only");
    expect(await page("/admin/trace")).not.toContain("get everything it did");
  });

  it("keeps the manual scout action and states that contacts need a press", () => {
    const html = renderOutreachPage({
      week: "2026-W43", at: "2026-10-23T12:00:00.000Z", listed_resources: 0,
      coverage_suspect: false, capped: false, our_search_presence: true, hosts: [],
    }, [], [], { version: 1, hosts: {} }, "https://scvd.store");
    expect(html).toContain('action="/admin/outreach/scout"');
    expect(html).toContain("Scouting runs only when you press Scout contacts");
  });
});
