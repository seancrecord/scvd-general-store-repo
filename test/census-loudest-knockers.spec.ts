import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { CENSUS_WALK_RULE, LOUDEST_SHOWN, takeCensus } from "@/lib/census";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

/**
 * THE LOUDEST KNOCKERS (2026-09-28). The recount read 2,456 organic
 * 402s in 52 minutes; the census's walk detector named one client
 * with 94 of them. The rest came from clients touching too few doors
 * to be a walk, and no page named them. The census now lists the
 * outside, still-organic, never-signed clients loudest first.
 */

const testEnv = env as unknown as Env;

let seq = 0;
async function seedRow(event: MetricEvent): Promise<void> {
  const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(14, "0");
  seq += 1;
  await testEnv.COUNTERS.put(
    `evt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
    JSON.stringify(event),
  );
}

const T0 = Date.parse("2026-09-28T17:00:00.000Z");
function row(partial: Partial<MetricEvent>): MetricEvent {
  return {
    kind: "challenge",
    item: "hello",
    channel: "direct",
    house: false,
    at: new Date(T0 + seq * 1000).toISOString(),
    ...partial,
  };
}

const POLLER = "python-requests/2.31.0";
const WALKER = "node";
const CRAWLER = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const SIGNER = "cv-x402-client/1.0";

describe("the loudest knockers", () => {
  beforeEach(async () => {
    let cursor: string | undefined;
    do {
      const listed = await testEnv.COUNTERS.list({ prefix: "evt:", cursor });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
      cursor = listed.list_complete ? undefined : listed.cursor;
    } while (cursor);
    // One door, thirty knocks, never a walk.
    for (let i = 0; i < 30; i += 1) await seedRow(row({ user_agent: POLLER }));
    // A walker: five doors inside a minute, five knocks.
    for (const item of ["hello", "spot_check", "the_statement", "attestation_bundle", "settlement_attestation"]) {
      await seedRow(row({ user_agent: WALKER, item }));
    }
    // Machinery, louder than both, stays off the list.
    for (let i = 0; i < 40; i += 1) await seedRow(row({ user_agent: CRAWLER, channel: "infrastructure" }));
    // A client that opened a wallet is on the census line, not here.
    for (let i = 0; i < 50; i += 1) await seedRow(row({ user_agent: SIGNER }));
    await seedRow(row({ user_agent: SIGNER, kind: "decline", note: "local:input_missing:name" }));
  });

  it("names the poller the walk detector cannot see, loudest first, and only the organic never-signed set", async () => {
    const census = await takeCensus(testEnv);
    expect(census.walkers.map((c) => c.user_agent)).toEqual([WALKER]);
    expect(census.loudest.map((c) => c.user_agent)).toEqual([POLLER, WALKER]);
    expect(census.loudest[0]!.challenges).toBe(30);
    expect(census.loudest[0]!.distinct_items).toBe(1);
    // One door is never a walk, whatever the window says.
    expect(census.loudest[0]!.widest_walk).toBeLessThan(CENSUS_WALK_RULE.min_items);
    expect(census.loudest.length).toBeLessThanOrEqual(LOUDEST_SHOWN);
    expect(census.looked_and_left_organic).toBe(2);
  });

  it("puts the table on the page with the poller's string escaped", async () => {
    const page = await SELF.fetch("https://scvd.store/admin/census", {
      headers: { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` },
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    const section = html.slice(html.indexOf("The loudest knockers"), html.indexOf("<h2>The walk detector</h2>"));
    expect(section).toContain("python-requests/2.31.0");
    expect(section).toContain("<td>30</td>");
    expect(section).not.toContain("Googlebot");
    expect(section).not.toContain("cv-x402-client");
  });
});
