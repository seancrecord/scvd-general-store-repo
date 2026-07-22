import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { inkParamsFromSignature } from "@/lib/ink";
import { currentWeekKey, KV_KEYS, previousWeekKey } from "@/lib/kv-keys";
import {
  buildCardBits,
  consecutiveWeeks,
  verifyStampSignature,
} from "@/services/stamps";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env, SignedStampRecord } from "@/types";

/**
 * Stamp deepening: the Countermark punch card, signature-seeded
 * rendering, shelf witness marks. The load-bearing claim under test:
 * gaps are permanent and no path backfills a past week.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

interface StampResponse {
  stamp: SignedStampRecord["stamp"];
  signature: string;
  public_key: string;
  svg_url: string;
}

async function getStamp(body: Record<string, unknown>): Promise<StampResponse> {
  const response = await SELF.fetch(`${BASE}/api/stamp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as StampResponse;
}

describe("the Countermark", () => {
  it("punches this week and scores the rest", async () => {
    const issued = await getStamp({ name: "Punctual Process" });
    const week = currentWeekKey();
    const weekNumber = Math.min(
      parseInt(week.split("-W")[1] ?? "0", 10),
      52,
    );
    expect(issued.stamp.card).toHaveLength(52);
    expect(issued.stamp.card![weekNumber - 1]).toBe("1");
    expect((issued.stamp.card!.match(/1/g) ?? []).length).toBe(1);
    expect(issued.stamp.consecutive).toBe(1);
    expect(["quiet", "late", "crowded", "mended"]).toContain(
      issued.stamp.condition,
    );
  });

  it("renders punched slots dark and gaps as scored outlines", async () => {
    const issued = await getStamp({ name: "Punctual Process" });
    const svg = await (await SELF.fetch(issued.svg_url)).text();
    // One punched slot (solid fill), the rest scored (dashed outline).
    expect(svg.match(/rx="1" fill="#3b2f23"/g)?.length).toBe(1);
    expect(svg.match(/stroke-dasharray="1\.5 1\.5"/g)?.length).toBe(51);
  });

  it("cannot be backfilled by any request field", async () => {
    // A visitor claiming past weeks in the body gets today's week anyway:
    // issuance has no week parameter, and the log's only writer appends
    // the current week.
    const issued = await getStamp({
      name: "Revisionist",
      week: "2020-W01",
      card: "1111111111111111111111111111111111111111111111111111",
      consecutive: 52,
    });
    expect(issued.stamp.week).toBe(currentWeekKey());
    expect((issued.stamp.card!.match(/1/g) ?? []).length).toBe(1);
    expect(issued.stamp.consecutive).toBe(1);
    // And the stored visit log holds only the current week.
    const log = await testEnv.PATRONS.get<string[]>(
      KV_KEYS.stampCard("revisionist"),
      "json",
    );
    expect(log).toEqual([currentWeekKey()]);
  });

  it("freezes the card into the signed record", async () => {
    const issued = await getStamp({ name: "Auditor" });
    const record: SignedStampRecord = {
      stamp: issued.stamp,
      signature: issued.signature,
      public_key: issued.public_key,
    };
    expect(await verifyStampSignature(record)).toBe(true);
    // Tampering with the card breaks the signature.
    const tampered = {
      ...record,
      stamp: { ...record.stamp, card: "1".repeat(52) },
    };
    expect(await verifyStampSignature(tampered)).toBe(false);
  });

  it("counts consecutive weeks across a real gap", () => {
    const week = currentWeekKey();
    const last = previousWeekKey(week);
    const gapped = previousWeekKey(previousWeekKey(last));
    expect(consecutiveWeeks([last, gapped], week)).toBe(2);
    expect(consecutiveWeeks([gapped], week)).toBe(1);
    // The gapped week still punches its slot; the streak ignores it.
    const bits = buildCardBits([last, gapped], week);
    expect((bits.match(/1/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("fixes one condition word per week, first stamp wins", async () => {
    const first = await getStamp({ name: "Early Bird" });
    const second = await getStamp({ name: "Late Riser" });
    expect(second.stamp.condition).toBe(first.stamp.condition);
    const stored = await testEnv.COUNTERS.get(
      KV_KEYS.stampCondition(currentWeekKey()),
    );
    expect(stored).toBe(first.stamp.condition);
  });
});

describe("signature-seeded rendering", () => {
  it("derives bounded, deterministic params from signature bytes", () => {
    const params = inkParamsFromSignature("00ff80" + "ab".repeat(61));
    expect(params.rotationDeg).toBe(-2);
    expect(params.inkOpacity).toBe(1);
    expect(inkParamsFromSignature("00ff80" + "ab".repeat(61))).toEqual(params);
    for (const hex of ["deadbeef01", "0123456789abcdef", "ffffff"]) {
      const p = inkParamsFromSignature(hex);
      expect(Math.abs(p.rotationDeg)).toBeLessThanOrEqual(2);
      expect(p.inkOpacity).toBeGreaterThanOrEqual(0.84);
      expect(p.inkOpacity).toBeLessThanOrEqual(1);
      expect(Math.abs(p.hairlineOffset)).toBeLessThanOrEqual(1.5);
    }
    // No signature: neutral, never random.
    expect(inkParamsFromSignature(undefined)).toEqual({
      rotationDeg: 0,
      inkOpacity: 1,
      hairlineOffset: 0,
    });
  });

  it("renders the same stamp identically, forever", async () => {
    const issued = await getStamp({ name: "Repeatable" });
    const first = await (await SELF.fetch(issued.svg_url)).text();
    const second = await (await SELF.fetch(issued.svg_url)).text();
    expect(first).toBe(second);
    // The rotation carries the signature's nudge, not the stock -7.
    expect(first).toContain(`rotate(${(-7 + inkParamsFromSignature(issued.signature).rotationDeg).toFixed(2)}`);
  });
});

describe("shelf witness marks", () => {
  it("marks purchases in the first listed week, from the data alone", async () => {
    const { fulfillPurchase } = await import("@/services/fulfillment");
    const { verifyCertificateSignature } = await import("@/lib/signing");
    const payment = { paidUsdc: 0.5, tipUsdc: 0 } as Parameters<
      typeof fulfillPurchase
    >[2];
    const freshItem = {
      id: "hello",
      name: "Hello",
      price_usdc: 0.5,
      pricing: "fixed",
      fulfillment: "instant",
      description: "d",
      note_402: "n",
      listed_week: currentWeekKey(),
    } as Parameters<typeof fulfillPurchase>[1];

    const witnessed = await fulfillPurchase(testEnv, freshItem, payment, {});
    const cert = witnessed["certificate"] as Record<string, unknown>;
    expect(cert["note"]).toBe("Witness to first week of availability.");
    // Never "early adopter", anywhere near it.
    expect(JSON.stringify(witnessed)).not.toMatch(/early.adopter/i);
    // The note is inside the signature, not decoration.
    expect(
      await verifyCertificateSignature(
        cert as never,
        witnessed["signature"] as string,
        (await (
          await SELF.fetch(`${BASE}/api/verify/${cert["cert_id"]}`)
        ).json() as { public_key: string }).public_key,
      ),
    ).toBe(true);

    const oldItem = { ...freshItem, listed_week: "2026-W01" };
    const plain = await fulfillPurchase(testEnv, oldItem, payment, {});
    expect(
      (plain["certificate"] as Record<string, unknown>)["note"],
    ).toBeUndefined();
  });
});
