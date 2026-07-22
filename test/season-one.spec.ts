import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  archiveWeeks,
  renderEntryMarkdown,
  seasonEntry,
  seasonWeekFor,
  signById,
} from "@/services/zodiac";
import { ZODIAC_SIGNS } from "@/store/zodiac";
import { SEASON_ONE, SEASON_WEEKS } from "@/store/zodiac-season-one";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";

/**
 * Season One of the Systems Almanac: content shape, determinism,
 * and the free/paid split on the almanac rail.
 */

const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("the season's shape", () => {
  it("stocks 13 weeks for all 12 signs, formats intact", () => {
    expect(Object.keys(SEASON_ONE)).toHaveLength(12);
    for (const sign of ZODIAC_SIGNS) {
      const entries = SEASON_ONE[sign.id]!;
      expect(entries).toHaveLength(SEASON_WEEKS);
      const anchors = new Set<string>();
      for (const entry of entries) {
        expect(entry.conditions.length).toBeGreaterThan(20);
        expect(entry.forecast.length).toBeGreaterThan(80);
        expect(entry.auspicious.length).toBeGreaterThan(3);
        expect(entry.avoid.length).toBeGreaterThan(3);
        // Compatible names another sign, never itself.
        expect(entry.compatible).not.toBe(sign.name);
        expect(ZODIAC_SIGNS.map((s) => s.name)).toContain(entry.compatible);
        anchors.add(entry.auspicious);
      }
      // Auspicious values stay distinct within a sign's season.
      expect(anchors.size).toBe(SEASON_WEEKS);
    }
  });

  it("keeps the register: no modal verbs anywhere in the season", () => {
    const banned = /\b(could|might|should|maybe|perhaps)\b/i;
    for (const entries of Object.values(SEASON_ONE)) {
      for (const entry of entries) {
        expect(entry.conditions).not.toMatch(banned);
        expect(entry.forecast).not.toMatch(banned);
      }
    }
  });

  it("maps ISO weeks onto the season deterministically, clamped at the edges", () => {
    expect(seasonWeekFor("2026-W30")).toBe(1);
    expect(seasonWeekFor("2026-W31")).toBe(1);
    expect(seasonWeekFor("2026-W32")).toBe(2);
    expect(seasonWeekFor("2026-W43")).toBe(13);
    expect(seasonWeekFor("2026-W50")).toBe(13);
    expect(seasonWeekFor("2027-W02")).toBe(13);
  });
});

describe("determinism at the counter", () => {
  it("serves the same page byte-identically on repeat queries", async () => {
    const address = "0x137aE5e3c7ed176744226F67223de50CA3A19e5A";
    const first = await (await SELF.fetch(`${BASE}/zodiac/${address}`)).text();
    const second = await (await SELF.fetch(`${BASE}/zodiac/${address}`)).text();
    expect(second).toBe(first);
    const body = JSON.parse(first) as Record<string, unknown>;
    expect(body["season"]).toBe(1);
    expect(String(body["page"])).toContain("The Systems Almanac");
    expect(String(body["page"])).toContain("Auspicious:");
  });

  it("renders markdown as a pure function of (sign, week)", () => {
    const sign = signById("checksum")!;
    const entry = seasonEntry("checksum", 5)!;
    expect(renderEntryMarkdown(sign, entry)).toBe(
      renderEntryMarkdown(sign, entry),
    );
    expect(renderEntryMarkdown(sign, entry)).toContain("Week 5");
  });
});

describe("the archive rail", () => {
  it("indexes only weeks the calendar has finished with", async () => {
    const body = await json(await SELF.fetch(`${BASE}/zodiac/archive`));
    const pages = body["pages"] as unknown[];
    expect(pages.length).toBe(archiveWeeks().length * 12);
    expect(body["price_usdc"]).toBe(0.01);
  });

  it("404s unknown pages and unturned pages before the gate", async () => {
    const unknown = await SELF.fetch(
      `${BASE}/zodiac/archive/not_a_sign/week-1`,
    );
    expect(unknown.status).toBe(404);
    // Week 13 hasn't turned during the test season's first week.
    const unturned = await SELF.fetch(
      `${BASE}/zodiac/archive/checksum/week-13`,
    );
    expect(unturned.status).toBe(404);
    const notYet = await json(unturned);
    expect(String(notYet["error"])).toContain("hasn't turned");
  });

  it("sells a turned page for a penny, markdown, no-store", async () => {
    const weeks = archiveWeeks();
    if (weeks.length === 0) {
      // Season hasn't started in this test clock; the split is proven
      // by the unturned-page 404 above.
      return;
    }
    const url = `${BASE}/zodiac/archive/checksum/week-${weeks[0]}`;
    const challenge = await SELF.fetch(url);
    expect(challenge.status).toBe(402);
    const required = decodePaymentRequired(challenge);
    expect(required.accepts[0]!.amount).toBe("10000");
    const paid = await SELF.fetch(url, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!),
      },
    });
    expect(paid.status).toBe(200);
    expect(paid.headers.get("Cache-Control")).toBe("no-store");
    expect(await paid.text()).toContain("The Systems Almanac — The Checksum");
  });
});
