import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { computeStatsDiagnosed } from "@/services/stats";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const auth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * "THE TAKE SAYS 21, ORGANIC SAYS 23 — WHY WOULDN'T WE SHOW BOTH"
 * (the keeper, 2026-09-02). The storefront counts settles at the
 * till, penny pages included; the take counts certificates, which
 * penny pages never mint. The page used to explain the gap in a
 * footnote. Now it lists the no-certificate settles by item and adds
 * the two counts back together in front of the reader.
 */
describe("the take shows both counts", () => {
  const month = new Date().toISOString().slice(0, 7);
  const page = "almanac:notes-from-a-tuesday-in-oak-city";

  it("keeps the till's per-item counters beside the summed books", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "paid", page), "2");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "paidh", page), "1");
    const books = await computeStatsDiagnosed(testEnv);
    expect(books.till_by_item[page]).toEqual({ organic: 2, house: 1 });
    // The public shape is untouched: aggregates only.
    expect("till_by_item" in books.stats).toBe(false);
  });

  it("lists the penny-page settles by item and reconciles to the storefront figure", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "paid", page), "2");
    const html = await (
      await SELF.fetch(`${BASE}/admin/take`, { headers: auth })
    ).text();
    expect(html).toContain('id="no-certificate"');
    expect(html).toContain(`<code>${page}</code>`);
    // Two organic penny settles at the $0.01 list price.
    // Two organic penny settles, no certificates: the organic-today
    // column carries them at the $0.01 list price. The booked total may
    // also hold a house settle left by the test above; the regex reads
    // the organic column, which is the one that means money.
    expect(html).toMatch(
      new RegExp(
        `${page}</code></td>\\s*<td>\\d+</td>\\s*<td>0</td>\\s*<td><strong>\\d+</strong> \\(\\$0\\.0\\d at list\\)</td>\\s*<td><strong>\\$0\\.02</strong> \\(2\\)`,
      ),
    );
    expect(html).toContain("penny page at $0.01 list");
    // The arithmetic is on the page: certificates + no-certificate = storefront.
    expect(html).toMatch(/\d+ on certificates \+ 2 with no certificate = \d+/);
    expect(html).toContain("The books reconcile.");
  });
});

describe("the ledger is not missing money (2026-09-02)", () => {
  it("takes the difference on the total per item and names what moved to house since booking", async () => {
    const { noCertificateRows } = await import("@/pages/admin/office-page");
    const take = {
      items: [
        // Three hello settles booked organic at the till; today's wallet
        // list classes two of their certificates as house.
        { item: "hello", organic_sales: 1, house_sales: 2, organic_usdc: 0.5, house_usdc: 1 },
        { item: "the_collab", organic_sales: 0, house_sales: 0, organic_usdc: 0, house_usdc: 0 },
      ],
    } as unknown as Parameters<typeof noCertificateRows>[0];
    const rows = noCertificateRows(take, {
      hello: { organic: 3, house: 0 },
      the_collab: { organic: 0, house: 1 },
      daily_fortune: { organic: 2, house: 0 },
    });
    const byItem = new Map(rows.map((row) => [row.item, row]));
    // hello: 3 booked, 3 certificates — nothing missing, and the two
    // moved settles are named rather than counted as absent money.
    expect(byItem.get("hello")).toBeUndefined();
    // the_collab: a house test with no certificate behind it.
    expect(byItem.get("the_collab")).toMatchObject({
      no_certificate: 1,
      organic_no_certificate: 0,
      house_no_certificate: 1,
      moved_to_house_since_booking: 0,
    });
    // daily_fortune: two organic settles, no certificates at all — the
    // one shape that is money with nothing behind it.
    expect(byItem.get("daily_fortune")).toMatchObject({
      no_certificate: 2,
      organic_no_certificate: 2,
    });
    expect(rows[0]?.item).toBe("daily_fortune");
  });
});
