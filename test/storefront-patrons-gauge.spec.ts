import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { countDistinctOrganicBuyers } from "@/services/stats";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE PATRON TUBE COUNTS PATRONS (2026-09-13, the keeper: "should we
 * change patrons served to the actual organic number of customers").
 *
 * The gauge read the patron counter, which is every artifact ever
 * minted — free stamps, free certificates, and the house's own test
 * purchases all in it. On the day this was written the front of the
 * building said 375 under the words "Patrons served", two rows below
 * a ledger line, on the same page, from the same books, reading "100
 * organic sales". The identity fix of 2026-08-05 had already named
 * that counter for what it is (artifacts_issued) everywhere except
 * the one surface a person actually looks at.
 *
 * What hangs there now is the customer list: one `payer:` key per
 * wallet that has ever settled here, house wallets struck out. Sales
 * are not patrons and artifacts are not patrons; wallets are the only
 * reading of "served" that has a denominator.
 */

/** A house wallet from the published list — family never makes the paper. */
const HOUSE = "0x137ae5e3c7ed176744226f67223de50ca3a19e5a";

async function payerRow(address: string): Promise<void> {
  await testEnv.COUNTERS.put(
    KV_KEYS.payer(address),
    JSON.stringify({
      address,
      first_seen: "2026-08-01T00:00:00.000Z",
      last_seen: "2026-09-01T00:00:00.000Z",
      purchases: 9,
    }),
  );
}

async function clearPayers(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.payerPrefix });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
}

async function frontPage(): Promise<string> {
  const response = await SELF.fetch("https://scvd.store/", {
    headers: { Accept: "text/html" },
  });
  expect(response.status).toBe(200);
  return response.text();
}

describe("the patrons gauge", () => {
  beforeEach(async () => {
    await clearPayers();
    // The counter the gauge USED to read: a big number with the free
    // shelf and the house tests in it, exactly the shape of the bug.
    await testEnv.COUNTERS.put(KV_KEYS.patronNumber, "375");
  });

  it("shows distinct organic wallets, not the artifact counter", async () => {
    await payerRow("0x1111111111111111111111111111111111111111");
    await payerRow("0x2222222222222222222222222222222222222222");
    await payerRow("0x3333333333333333333333333333333333333333");

    const html = await frontPage();
    expect(html).toContain("Patrons served");
    /*
     * Three lit tubes reading 0003. Asserted as the whole nixie so a
     * regression that reintroduces the counter cannot pass on a
     * substring: 0375 and 0003 share no digit run.
     */
    expect(html).toContain(
      '<span class="nx nx-dim">0</span><span class="nx nx-dim">0</span><span class="nx nx-dim">0</span><span class="nx">3</span>',
    );
    expect(html).not.toContain(
      '<span class="nx nx-dim">0</span><span class="nx">3</span><span class="nx">7</span><span class="nx">5</span>',
    );
  });

  it("strikes the house out of the count", async () => {
    await payerRow("0x1111111111111111111111111111111111111111");
    await payerRow(HOUSE);

    expect(await countDistinctOrganicBuyers(testEnv)).toBe(1);
  });

  it("counts one wallet once, however its row was cased", async () => {
    /*
     * Rows written before the canonical-address fix live under a
     * lowercased key. recordPayerSeen folds those as it meets them;
     * until it does, a base58 wallet has two rows and one buyer must
     * not read as two patrons.
     */
    const wallet = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    await payerRow(wallet);
    await testEnv.COUNTERS.put(
      `${KV_KEYS.payerPrefix}${wallet.toLowerCase()}`,
      JSON.stringify({
        address: wallet.toLowerCase(),
        first_seen: "2026-08-01T00:00:00.000Z",
        last_seen: "2026-08-02T00:00:00.000Z",
        purchases: 2,
      }),
    );

    expect(await countDistinctOrganicBuyers(testEnv)).toBe(1);
  });

  it("publishes the figure in the books, beside the artifact count", async () => {
    await payerRow("0x1111111111111111111111111111111111111111");
    await payerRow("0x2222222222222222222222222222222222222222");

    const stats = (await (
      await SELF.fetch("https://scvd.store/stats", {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      distinct_organic_buyers: number | null;
      artifacts_issued: number;
    };
    /*
     * The two numbers published side by side is the point of the fix:
     * they were never the same quantity, and the page that showed one
     * under the other's name is the reason this spec exists.
     */
    expect(stats.distinct_organic_buyers).toBe(2);
    expect(stats.artifacts_issued).toBe(375);
  });

  it("takes the gauge off the wall rather than publishing an unmeasured zero", async () => {
    /*
     * No payer rows at all is a real zero and renders as one; a count
     * that could not be TAKEN is not zero patrons. The renderer's null
     * path is the one asserted here, because a KV failure on a free
     * page must read as a missing instrument, never as "nobody has
     * ever bought anything" under the neon.
     */
    const { renderStorefront } = await import("@/pages/storefront-page");
    const html = renderStorefront({
      weekNote: "quiet week",
      bellCount: 0,
      guestbook: [],
      recordWeeks: 0,
      recordTruncated: false,
      patronCount: null,
    });
    expect(html).not.toContain("Patrons served");
    expect(html).toContain("The record");
  });
});
