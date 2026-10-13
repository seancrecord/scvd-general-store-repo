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
    // The difference stays a count, with a separately labelled list-price estimate.
    expect(html).toMatch(
      new RegExp(
        `${page}</code></td>\\s*<td>\\d+</td>\\s*<td>0</td>\\s*<td><strong>\\d+</strong> \\(\\$0\\.0\\d at list\\)</td>\\s*<td><strong>2</strong> \\(\\$0\\.02 at list\\)`,
      ),
    );
    expect(html).toContain("penny page at $0.01 list");
    // Matching aggregate arithmetic is not transaction reconciliation.
    expect(html).toMatch(/\d+ certificate counts \+ 2 positive count differences = \d+/);
    expect(html).toContain("The aggregate counts agree");
    expect(html).not.toContain("The books reconcile.");
    expect(html).toContain("not amounts paid or missing money");
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
    // positive aggregate difference; not a proven missing payment.
    expect(byItem.get("daily_fortune")).toMatchObject({
      no_certificate: 2,
      organic_no_certificate: 2,
    });
    expect(rows[0]?.item).toBe("daily_fortune");
  });
});

// No transaction IDs are supplied here: no branch may claim a transaction match.
describe("aggregate differences stay aggregate", () => {
  const take = {
    lines: [], items: [],
    total: { kind: "other" as const, label: "Total", organic_usdc: 0, house_usdc: 0, organic_sales: 0, house_sales: 0 },
    rails: { base: { sales: 0, usdc: 0 }, solana: { sales: 0, usdc: 0 }, unknown: { sales: 0, usdc: 0 } },
    refund_usdc: 0, unknown_wallet_sales: 0, truncated: false,
  };
  it.each([0, 1, 2])("qualifies the comparison against storefront count %i", async organic => {
    const { takeSectionHtml } = await import("@/pages/admin/office-page");
    const html = takeSectionHtml(take, { organic, house: 0 }, { daily_fortune: { organic: 1, house: 0 } });
    expect(html).not.toContain("a mint that failed");
    expect(html).not.toContain("The books reconcile");
    expect(html).not.toContain("unaccounted for");
    expect(html).toContain("no missing transaction or failed delivery identified");
    expect(html).toContain(organic === 1 ? "The aggregate counts agree" : "aggregate difference, not identified missing sales");
  });
  it("does not turn equal totals or a capped certificate scan into verified books", async () => {
    const { takeSectionHtml } = await import("@/pages/admin/office-page");
    const complete = takeSectionHtml(take, { organic: 0, house: 0 }, {});
    expect(complete).not.toContain("Every settle on the till has a certificate");
    expect(complete).toContain("No positive count difference");
    const partial = takeSectionHtml({ ...take, truncated: true }, { organic: 0, house: 0 }, {});
    expect(partial).toContain("Partial certificate reading");
    expect(partial).not.toContain("The aggregate counts agree");
    expect(partial).not.toContain("matches this table exactly");
  });
});
