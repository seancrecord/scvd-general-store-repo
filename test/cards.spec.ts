import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { drawPack } from "@/services/cards";
import { getMenuItem } from "@/store";
import {
  CURRENT_SEASON,
  PACK_SIZE,
  RARITY_ORDER,
  SEASONS,
  SLOT_WHEELS,
  cardsOfRarity,
  packChanceOf,
  slotOdds,
} from "@/store/cards";
import { ITEM_MAKER_MARK } from "@/store/provenance";
import { NOVELTY_ONLY, SPEC_RETURNS } from "@/store/spec";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import type { Env } from "@/types";

/**
 * THE CARD TABLE (2026-09-12). Five cards a pack, drawn from the
 * certificate id on wheels whose odds are published with their
 * denominators; every card a signed record depicting a thing that is
 * actually here, citing where. Rule 22's shape, held by test: the draw
 * is recomputable, the odds are derived from the wheels rather than
 * typed, and nothing on the table has a price or a pity timer.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
void testEnv;

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function buyPack(): Promise<Record<string, unknown>> {
  const url = `${BASE}/api/buy/card_pack`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const paid = await SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) },
  });
  expect(paid.status).toBe(200);
  return json(paid);
}

describe("the set", () => {
  it("numbers its cards 1..N with no gaps and no duplicate names", () => {
    for (const season of SEASONS) {
      const numbers = season.cards.map((card) => card.no);
      expect(numbers).toEqual(season.cards.map((_, index) => index + 1));
      expect(new Set(season.cards.map((card) => card.name)).size).toBe(season.cards.length);
    }
  });

  it("has at least one card at every tier a wheel can land on", () => {
    for (const wheel of SLOT_WHEELS) {
      for (const rarity of new Set(wheel)) {
        expect(cardsOfRarity(CURRENT_SEASON, rarity).length, `no ${rarity} card`).toBeGreaterThan(0);
      }
    }
    expect(SLOT_WHEELS.length).toBe(PACK_SIZE);
  });

  it("cites a path on this store for every card, and every path answers", async () => {
    for (const card of CURRENT_SEASON.cards) {
      expect(card.cite.startsWith("/"), `${card.name} cites ${card.cite}`).toBe(true);
      const response = await SELF.fetch(`${BASE}${card.cite}`, { headers: { Accept: "text/html" } });
      expect(response.status, `${card.name} cites ${card.cite}`).toBe(200);
    }
  });
});

describe("the odds are derived, never typed", () => {
  it("counts each slot's wheel and the fractions sum to one", () => {
    for (const row of slotOdds()) {
      const stops = RARITY_ORDER.reduce((sum, rarity) => sum + row.stops[rarity], 0);
      expect(stops).toBe(row.wheel_size);
      expect(row.wheel_size).toBe(SLOT_WHEELS[row.slot - 1]!.length);
    }
  });

  it("three slots are always common; the chase tiers live in the last two", () => {
    const rows = slotOdds();
    for (const row of rows.slice(0, 3)) {
      expect(row.stops.common).toBe(row.wheel_size);
    }
    expect(packChanceOf("common")).toBe(1);
    expect(packChanceOf("legendary")).toBeGreaterThan(0);
    expect(packChanceOf("legendary")).toBeLessThan(packChanceOf("rare"));
    expect(packChanceOf("rare")).toBeLessThan(packChanceOf("uncommon"));
  });

  it("the drawer lands on tiers at the published rate, over many certificates", () => {
    const pulls = 4000;
    const seen: Record<string, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    for (let index = 0; index < pulls; index += 1) {
      const drawn = drawPack(`cert_odds_${index}`);
      const slot5 = drawn[4]!;
      seen[slot5.rarity] = (seen[slot5.rarity] ?? 0) + 1;
    }
    const wheel = SLOT_WHEELS[4]!;
    for (const rarity of RARITY_ORDER) {
      const expected = wheel.filter((stop) => stop === rarity).length / wheel.length;
      const observed = seen[rarity]! / pulls;
      // Within three points of the wheel: FNV-1a is not a fair coin,
      // but it is fair enough that a wheel typed one way and drawn
      // another would show here.
      expect(Math.abs(observed - expected), `${rarity}: ${observed} vs ${expected}`).toBeLessThan(0.03);
    }
  });

  it("is deterministic per certificate and different across certificates", () => {
    const a = drawPack("cert_alpha");
    const b = drawPack("cert_alpha");
    const c = drawPack("cert_beta");
    expect(a).toEqual(b);
    expect(a.map((slot) => slot.card.no)).not.toEqual(c.map((slot) => slot.card.no));
  });
});

describe("the shelf", () => {
  it("lists a pack of cards as an instant novelty with a specimen, marked HOUSE", async () => {
    const item = getMenuItem("card_pack");
    expect(item).toBeDefined();
    expect(item?.fulfillment).toBe("instant");
    expect(item?.sample_url).toBe("/cards/sample.svg");
    expect(NOVELTY_ONLY).toContain("card_pack");
    expect(SPEC_RETURNS["card_pack"]).toContain("/api/pack/{pack_id}");
    expect(ITEM_MAKER_MARK["card_pack"]).toBe("house");
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const listed = (menu["items"] as Array<Record<string, unknown>>).find((entry) => entry["id"] === "card_pack");
    expect(listed?.["sample_url"]).toBe(`${BASE}/cards/sample.svg`);
  });

  it("says nothing about value, and never promises a market", () => {
    const item = getMenuItem("card_pack")!;
    const copy = `${item.description} ${item.note_402} ${(item.constraints ?? []).join(" ")}`.toLowerCase();
    expect(copy).toContain("entitles the holder to a card");
    expect(copy).not.toContain("invest");
    expect(copy).not.toContain("limited time");
    expect(copy).not.toContain("nft");
  });
});

describe("a pack, bought", () => {
  it("hands back five signed cards, each with a page, an image and a record that verifies", async () => {
    const body = await buyPack();
    expect(body["order_id"]).toBeUndefined();
    expect(String(body["deliverable"])).toContain("Pack opened");
    const cards = body["cards"] as Array<Record<string, unknown>>;
    expect(cards).toHaveLength(PACK_SIZE);

    const pack = await json(await SELF.fetch(String(body["pack_url"])));
    expect((pack["pack"] as Record<string, unknown>)["card_ids"]).toHaveLength(PACK_SIZE);
    // The draw is recomputable from the certificate id the pack carries.
    const certId = String((pack["pack"] as Record<string, unknown>)["cert_id"]);
    const redo = drawPack(certId).map((slot) => slot.card.no);
    expect(cards.map((card) => card["card_no"])).toEqual(redo);

    for (const card of cards) {
      const record = await json(await SELF.fetch(String(card["record_url"])));
      const inner = record["card"] as Record<string, unknown>;
      expect(inner["name"]).toBe(card["name"]);
      expect(String(inner["cite"]).startsWith("/")).toBe(true);

      const svg = await SELF.fetch(String(card["card_url"]));
      expect(svg.status).toBe(200);
      expect(svg.headers.get("Content-Type")).toBe("image/svg+xml");
      const art = await svg.text();
      expect(art).toContain(String(card["name"]));
      expect(art).toContain(`/api/verify/${String(card["card_id"])}`);
      expect(art).not.toContain("SPECIMEN");

      const png = await SELF.fetch(`${BASE}/cards/${String(card["card_id"])}.png`);
      expect(png.status).toBe(200);
      expect(png.headers.get("Content-Type")).toBe("image/png");
      const bytes = new Uint8Array(await png.arrayBuffer());
      expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

      const page = await SELF.fetch(String(card["share_url"]), { headers: { Accept: "text/html" } });
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain(`<meta property="og:image" content="${BASE}/cards/${String(card["card_id"])}.png">`);
      expect(html).toContain('name="twitter:card" content="summary_large_image"');

      const verified = await json(await SELF.fetch(String(card["verify_url"])));
      expect(verified["valid"]).toBe(true);
    }

    const packVerified = await json(await SELF.fetch(`${BASE}/api/verify/${String(body["pack_id"])}`));
    expect(packVerified["valid"]).toBe(true);
  });

  it("never sells out: a second pack is a different pack", async () => {
    const first = await buyPack();
    const second = await buyPack();
    expect(first["pack_id"]).not.toBe(second["pack_id"]);
  });

  it("files the pull in the payer's binder, newest first", async () => {
    const body = await buyPack();
    const cards = body["cards"] as Array<Record<string, unknown>>;
    const { TEST_PAYER } = await import("./helpers/facilitator-mock");
    const binder = await json(await SELF.fetch(`${BASE}/api/cards/binder/${TEST_PAYER}`));
    const ids = (binder["cards"] as Array<Record<string, unknown>>).map((row) => row["card_id"]);
    for (const card of cards) expect(ids).toContain(card["card_id"]);
    const page = await SELF.fetch(`${BASE}/cards/binder/${TEST_PAYER}`, { headers: { Accept: "text/html" } });
    expect(page.status).toBe(200);
  });

  it("refuses a binder that is not a wallet, and a card that was never pulled", async () => {
    expect((await SELF.fetch(`${BASE}/api/cards/binder/not-a-wallet`)).status).toBe(400);
    expect((await SELF.fetch(`${BASE}/api/card/card_neverissued`)).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/cards/card_neverissued.svg`)).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/api/pack/pack_neverissued`)).status).toBe(404);
  });
});

describe("the room", () => {
  it("prints every fraction beside its denominator and hangs an honest specimen", async () => {
    const twin = await json(await SELF.fetch(`${BASE}/cards`, { headers: { Accept: "application/json" } }));
    const odds = twin["odds"] as Record<string, unknown>;
    const perSlot = odds["per_slot"] as Array<Record<string, unknown>>;
    expect(perSlot).toHaveLength(PACK_SIZE);
    for (const row of perSlot) expect(row["wheel_size"]).toBeGreaterThan(0);
    const perPack = odds["per_pack"] as Record<string, Record<string, unknown>>;
    expect(String(perPack["legendary"]!["derivation"])).toContain("1 - (");
    expect((twin["season"] as Record<string, unknown>)["set_size"]).toBe(CURRENT_SEASON.cards.length);

    const page = await (await SELF.fetch(`${BASE}/cards`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("The odds, derived");
    for (const card of CURRENT_SEASON.cards) expect(page).toContain(card.name);

    const sample = await SELF.fetch(`${BASE}/cards/sample.svg`);
    expect(sample.status).toBe(200);
    const svg = await sample.text();
    expect(svg).toContain("SPECIMEN");
    expect(svg).not.toContain("/api/verify/");
  });
});
