import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  monthReclassAdjustments,
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

  it("an explicit count caps at the payer record — the CV-wallet over-correction, refused", async () => {
    // A wallet listed for weeks has most settles CORRECTLY booked
    // house; freezing its whole purchase count would subtract correct
    // bookings from organic. The keeper states the misbooked count;
    // the record caps it; more-than-ever-happened refuses.
    const other = "0x007cA504E06C98d8580A061F1099da8BE02f8765".toLowerCase();
    await testEnv.COUNTERS.put(
      KV_KEYS.payer(other),
      JSON.stringify({
        address: other,
        first_seen: "2026-08-04T00:00:00.000Z",
        last_seen: "2026-08-04T01:00:00.000Z",
        purchases: 5,
      }),
    );
    const tooMany = await reclassifyHousePayer(testEnv, other, "walker", 9);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      expect(tooMany.refusal).toContain("more than ever happened");
    }
    const right = await reclassifyHousePayer(testEnv, other, "walker", 5);
    expect(right.ok).toBe(true);
    if (right.ok) {
      expect(right.record.settles).toBe(5);
    }
  });

  it("slices the correction per month from certificates, earliest first", async () => {
    /**
     * The office's month line reads raw monthly counters, so the
     * correction has to be derived for it: a reclassified wallet's
     * misbooked settles are its EARLIEST certs (listing postdates
     * them; later purchases book house at the till and were never in
     * the correction). Here the haiku-walker stand-in has 5 frozen
     * settles across two months of certs plus one post-listing cert
     * that must NOT be counted.
     */
    const walker = "0x007cA504E06C98d8580A061F1099da8BE02f8765".toLowerCase();
    const certs = [
      { id: "cert_july_1", date: "2026-07-30", usdc: 0.5 },
      { id: "cert_aug_1", date: "2026-08-03", usdc: 1 },
      { id: "cert_aug_2", date: "2026-08-03", usdc: 0.25 },
      { id: "cert_aug_3", date: "2026-08-04", usdc: 0.01 },
      { id: "cert_aug_4", date: "2026-08-04", usdc: 2 },
      // The sixth: bought AFTER listing, booked house at the till,
      // outside the frozen count of 5.
      { id: "cert_aug_5", date: "2026-08-05", usdc: 100 },
    ];
    for (const cert of certs) {
      await testEnv.PATRONS.put(
        KV_KEYS.cert(cert.id),
        JSON.stringify({
          certificate: {
            cert_id: cert.id,
            item: "hello",
            patron_number: 1,
            date: cert.date,
            paid_usdc: cert.usdc,
            payer: walker,
          },
          signature: "aa",
          public_key: "bb",
        }),
      );
    }
    // The frozen row (5 settles) — written directly so this test does
    // not depend on the lever test's ordering.
    await testEnv.COUNTERS.put(
      `house_reclass:${walker}`,
      JSON.stringify({
        address: walker,
        settles: 5,
        at: "2026-08-04T02:00:00.000Z",
        reason: "test",
      }),
    );

    const { months, truncated } = await monthReclassAdjustments(testEnv);
    expect(truncated).toBe(false);
    expect(months["2026-07"]).toEqual({ settles: 1, usdc: 0.5 });
    expect(months["2026-08"]!.settles).toBe(4);
    expect(months["2026-08"]!.usdc).toBeCloseTo(3.26, 6);
    // The post-listing $100 cert stayed out of the adjustment.
    expect(months["2026-08"]!.usdc).toBeLessThan(10);

    for (const cert of certs) {
      await testEnv.PATRONS.delete(KV_KEYS.cert(cert.id));
    }
    await testEnv.COUNTERS.delete(`house_reclass:${walker}`);
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
