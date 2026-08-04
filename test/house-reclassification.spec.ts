import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  reclassifyHousePayer,
  totalReclassified,
} from "@/services/reclassify";
import { computeStats } from "@/services/stats";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * The house-reclassification ledger: family money that booked organic
 * before its wallet was listed (the cross-model walkers, 2026-08-04).
 * What these hold: the lever refuses unlisted wallets, the snapshot
 * freezes, the correction applies at read with raw counters
 * untouched, and the whole thing is visible rather than silent.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
// The sonnet46 walker: listed in house-wallets.json on 2026-08-04.
const LISTED = "0xe582b04c02f05Ccf3C81C0e0cBbD3053312405d5";

describe("the reclassification ledger", () => {
  it("refuses a wallet that is not in the register", async () => {
    const result = await reclassifyHousePayer(
      testEnv,
      "0x1234567890123456789012345678901234567890",
      "test",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toContain("house-wallets.json");
    }
  });

  it("freezes the snapshot, corrects stats at read, and refuses to run twice", async () => {
    // Simulate the misbooking: 6 organic-booked settles from the
    // listed walker, on the counters and the payer record.
    const month = new Date().toISOString().slice(0, 7);
    await testEnv.COUNTERS.put(`metric:${month}:paid:small_blessing`, "6");
    await testEnv.COUNTERS.put(
      KV_KEYS.payer(LISTED.toLowerCase()),
      JSON.stringify({
        address: LISTED.toLowerCase(),
        first_seen: "2026-08-03T20:00:00.000Z",
        last_seen: "2026-08-03T21:00:00.000Z",
        purchases: 6,
      }),
    );

    const before = await computeStats(testEnv);
    const result = await reclassifyHousePayer(testEnv, LISTED, "walker");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.settles).toBe(6);
    }
    expect(await totalReclassified(testEnv)).toBe(6);

    const after = await computeStats(testEnv);
    // Organic corrected down, house up, total conserved, correction visible.
    expect(after.organic_settlements).toBe(before.organic_settlements - 6);
    expect(after.house_settlements).toBe(before.house_settlements + 6);
    expect(after.reclassified_house).toBe(6);
    // Raw counter untouched — an adjustment, not an erasure.
    expect(
      await testEnv.COUNTERS.get(`metric:${month}:paid:small_blessing`),
    ).toBe("6");

    // Frozen: a second attempt refuses rather than double-correcting.
    const again = await reclassifyHousePayer(testEnv, LISTED, "walker");
    expect(again.ok).toBe(false);
  });

  it("the admin lever needs auth and a listed wallet", async () => {
    const noAuth = await SELF.fetch(`${BASE}/admin/reclassify`, {
      method: "POST",
      body: new URLSearchParams({ address: LISTED }),
    });
    expect([401, 403]).toContain(noAuth.status);
  });

  it("the correction is public prose, not just a ledger row", async () => {
    const page = await (await SELF.fetch(`${BASE}/corrections`)).text();
    expect(page).toContain("organic-settlement count read 22");
    expect(page).toContain("asked for the correction rather than the credit");
  });
});
