import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CENSUS_WALK_RULE, takeCensus } from "@/lib/census";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/** Rows sort newest-first by inverted timestamp; seed them the same way. */
let seq = 0;
async function seedRow(event: MetricEvent): Promise<void> {
  const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(
    14,
    "0",
  );
  seq += 1;
  await testEnv.COUNTERS.put(
    `evt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
    JSON.stringify(event),
  );
}

/** A fixed clock, so "inside a minute" means something in a test. */
const T0 = Date.parse("2026-07-27T12:00:00.000Z");
function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

function row(partial: Partial<MetricEvent>): MetricEvent {
  return {
    kind: "challenge",
    item: "hello",
    channel: "direct",
    house: false,
    at: at(0),
    ...partial,
  };
}

/**
 * The census counts distinct clients by user-agent, so every test here
 * uses a string nothing else in the suite uses. The rows are shared KV
 * across the file; the assertions are therefore about these agents, not
 * about the totals.
 */
describe("the census", () => {
  it("separates clients that opened a wallet from clients that only read the price", async () => {
    // Looked and left: four 402s, never a signature.
    for (let i = 0; i < 4; i += 1) {
      await seedRow(row({ user_agent: "census-window-shopper/1", at: at(i) }));
    }
    // Offered a signature and was turned away. A decline still counts:
    // a wallet was opened at our door.
    await seedRow(row({ user_agent: "census-decliner/1" }));
    await seedRow(row({ kind: "decline", user_agent: "census-decliner/1" }));
    // Paid.
    await seedRow(row({ user_agent: "census-buyer/1" }));
    await seedRow(row({ kind: "settle", user_agent: "census-buyer/1" }));
    // The keeper testing is not a customer, however it behaves.
    await seedRow(
      row({ kind: "settle", user_agent: "census-keeper/1", house: true }),
    );

    const census = await takeCensus(testEnv);
    const find = (ua: string) =>
      census.presented_signature.find((client) => client.user_agent === ua);

    expect(find("census-buyer/1")?.settles).toBe(1);
    expect(find("census-decliner/1")?.declines).toBe(1);
    expect(find("census-decliner/1")?.settles).toBe(0);
    // The one that only ever read the price is not on the list.
    expect(find("census-window-shopper/1")).toBeUndefined();
    // Nor is the house, on either side of the line.
    expect(find("census-keeper/1")).toBeUndefined();
    expect(census.clients_outside).toBeLessThan(census.clients_total);
    expect(census.looked_and_left).toBeGreaterThanOrEqual(1);
  });

  it("counts a client once however many times it knocks", async () => {
    for (let i = 0; i < 12; i += 1) {
      await seedRow(
        row({ user_agent: "census-repeat/1", item: "hello", at: at(i * 5000) }),
      );
    }
    const census = await takeCensus(testEnv);
    const matches = [...census.walkers, ...census.presented_signature].filter(
      (client) => client.user_agent === "census-repeat/1",
    );
    // Twelve knocks at one door is not a walk, and it is one client.
    expect(matches).toHaveLength(0);
  });
});

describe("the walk detector", () => {
  it("catches a catalog walk by behaviour, whatever the client calls itself", async () => {
    // Six distinct items in twelve seconds, from a user-agent the
    // crawler table has never heard of and would happily call organic.
    const items = [
      "hello",
      "lucky",
      "phantom_check",
      "anchor",
      "closer",
      "stamp",
    ];
    for (const [index, item] of items.entries()) {
      await seedRow(
        row({
          user_agent: "PolitePersonalAssistant/2.0",
          item,
          at: at(index * 2000),
        }),
      );
    }

    const census = await takeCensus(testEnv);
    const walker = census.walkers.find(
      (client) => client.user_agent === "PolitePersonalAssistant/2.0",
    );
    expect(walker, "the walk was not detected").toBeDefined();
    expect(walker?.widest_walk).toBe(6);
    expect(walker?.distinct_items).toBe(6);

    // And because the UA table calls it organic, it lands on the list
    // that is worth acting on.
    expect(
      census.undeclared_walkers.some(
        (client) => client.user_agent === "PolitePersonalAssistant/2.0",
      ),
      "an undeclared walker should be surfaced for the crawler table",
    ).toBe(true);
  });

  it("does not call a slow shopper a walk", async () => {
    // The same six items, but one every five minutes: someone reading.
    const items = [
      "hello",
      "lucky",
      "phantom_check",
      "anchor",
      "closer",
      "stamp",
    ];
    for (const [index, item] of items.entries()) {
      await seedRow(
        row({
          user_agent: "census-slow-reader/1",
          item,
          at: at(index * 300_000),
        }),
      );
    }
    const census = await takeCensus(testEnv);
    expect(
      census.walkers.some(
        (client) => client.user_agent === "census-slow-reader/1",
      ),
    ).toBe(false);
  });

  it("keeps an admitted crawler off the action list, since the table has it", async () => {
    const items = ["hello", "lucky", "phantom_check", "anchor", "closer"];
    for (const [index, item] of items.entries()) {
      await seedRow(
        row({
          user_agent: "Googlebot/2.1",
          item,
          channel: "infrastructure",
          at: at(index * 1000),
        }),
      );
    }
    const census = await takeCensus(testEnv);
    expect(
      census.walkers.some((client) => client.user_agent === "Googlebot/2.1"),
      "a crawler walking the catalog is still a walk",
    ).toBe(true);
    expect(
      census.undeclared_walkers.some(
        (client) => client.user_agent === "Googlebot/2.1",
      ),
      "the table already knows this one; it is not a finding",
    ).toBe(false);
  });

  it("states the rule it applied, so the number can be argued with", () => {
    expect(CENSUS_WALK_RULE.window_ms).toBe(60_000);
    expect(CENSUS_WALK_RULE.min_items).toBeGreaterThanOrEqual(3);
  });
});

describe("the scan", () => {
  it("says so when it is capped instead of implying it read everything", async () => {
    const census = await takeCensus(testEnv, 2);
    expect(census.rows_scanned).toBe(2);
    expect(census.capped).toBe(true);
  });

  it("renders on its own page, behind the keeper's door", async () => {
    const shut = await SELF.fetch("https://scvd.store/admin/census");
    expect(shut.status).toBe(401);

    const page = await SELF.fetch("https://scvd.store/admin/census", {
      headers: {
        Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
      },
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("The census");
    expect(html).toContain("The walk detector");
    // The limit is on the page, not just in the source comment.
    expect(html).toContain("no cookies and no IPs");
  });
});
