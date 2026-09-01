import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const KEEPER = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * A RETIRED CHARGE, NOT A MISSING SHELF (2026-09-01).
 *
 * The failed-item ledger tallies every 404'd /api/buy/:unknown as
 * free market research. For a month its top row was jar_of_tuesday
 * at 1196 — six times anything real — and it read like demand for
 * something never stocked. It was a shelf that closed before the
 * tombstones existed. The keeper's ruling: the count stays (it is
 * what happened), nothing is reset, and the row is accounted as a
 * retired charge, from the one register that already knows which
 * ids retired and when.
 */
describe("the failed-item ledger accounts for retired ids", () => {
  it("labels a retired id's knocks as a retired charge and leaves a real unknown alone", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.failedItem("jar_of_tuesday"), "1196");
    await testEnv.COUNTERS.put(KV_KEYS.failedItem("bucket_of_wednesday"), "3");

    const counter = await SELF.fetch(`${BASE}/admin/counter`, { headers: KEEPER });
    expect(counter.status).toBe(200);
    const html = await counter.text();
    expect(html).toContain("jar_of_tuesday, asked 1196x");
    expect(html).toMatch(/jar_of_tuesday, asked 1196x[^<]*<em>retired 2026-07-25/);
    expect(html).toContain("bucket_of_wednesday, asked 3x</li>");
  });

  it("a tombstoned id is no longer counted when knocked on", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.failedItem("smoker_blessing"));
    const gone = await SELF.fetch(`${BASE}/api/buy/smoker_blessing`);
    expect(gone.status).toBe(410);
    expect(await testEnv.COUNTERS.get(KV_KEYS.failedItem("smoker_blessing"))).toBeNull();
  });
});
