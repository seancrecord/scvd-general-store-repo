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
    expect(html).toMatch(new RegExp(`${page}</code></td>\\s*<td><strong>\\$0\\.02</strong> \\(2\\)`));
    expect(html).toContain("penny page at $0.01 list");
    // The arithmetic is on the page: certificates + no-certificate = storefront.
    expect(html).toMatch(/\d+ on certificates \+ 2 with no certificate = \d+/);
    expect(html).toContain("The books reconcile.");
  });
});
