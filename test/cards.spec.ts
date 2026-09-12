import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { encodeQr } from "@/lib/qr";
import { drawSlot } from "@/services/cards";
import { commitOf, dayHasEnded, publishSeedRecord, seedFor, utcDate } from "@/services/paywall-seed";
import { getMenuItem } from "@/store";
import {
  CURRENT_SEASON,
  PACK_SIZE,
  RARITY_ORDER,
  SEASONS,
  SLOT_WHEELS,
  allEntries,
  cardsOfRarity,
  packChanceOf,
  slotOdds,
} from "@/store/cards";
import { drawnPlateKeys, plateFor } from "@/store/plates";
import { flattenPath } from "@/lib/pixel-card";
import { ITEM_MAKER_MARK } from "@/store/provenance";
import { NOVELTY_ONLY, SPEC_RETURNS } from "@/store/spec";
import { installMultiPurchaseFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import type { Env } from "@/types";

/**
 * THE PAYWALL (handoff v2, 2026-09-12). Five pressings a pack, drawn
 * by HMAC over a day seed that is committed at once and revealed the
 * morning after; every card a signed record with a print number
 * depicting a thing that is actually here, citing where. Held by
 * test: the set is whole and every cite answers, the odds are derived
 * from the wheels, the seed commits and reveals honestly, the draw is
 * deterministic and lands at the published rate, a pack buys and
 * verifies and unfurls, the bell presses a common, the window shows
 * and picks, and nothing on the table has a price.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function buy(item: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const url = `${BASE}/api/buy/${item}`;
  const challenge = await SELF.fetch(url, { headers });
  expect(challenge.status, `${item} quotes`).toBe(402);
  const required = decodePaymentRequired(challenge);
  const paid = await SELF.fetch(url, { headers: { ...headers, "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) } });
  expect(paid.status, `${item} delivers`).toBe(200);
  return json(paid);
}

describe("the set", () => {
  it("numbers its 52 cards with no gaps, no duplicate names, no duplicate keys", () => {
    for (const season of SEASONS) {
      expect(season.cards.map((card) => card.no)).toEqual(season.cards.map((_, index) => index + 1));
      const entries = allEntries(season);
      expect(new Set(entries.map((card) => card.name)).size).toBe(entries.length);
      expect(new Set(entries.map((card) => card.key)).size).toBe(entries.length);
    }
    expect(CURRENT_SEASON.cards.length).toBe(52);
    expect(CURRENT_SEASON.events.length).toBe(4);
    expect(CURRENT_SEASON.ally.rarity).toBe("keeper");
  });

  it("keeps the Keeper out of every wheel and the Events out of the count", () => {
    for (const wheel of SLOT_WHEELS) expect(wheel).not.toContain("keeper");
    for (const event of CURRENT_SEASON.events) expect(event.no).toBe(0);
    expect(CURRENT_SEASON.cards.some((card) => card.type === "event" || card.type === "ally")).toBe(false);
    for (const wheel of SLOT_WHEELS) {
      for (const rarity of new Set(wheel)) expect(cardsOfRarity(CURRENT_SEASON, rarity).length, `no ${rarity} card`).toBeGreaterThan(0);
    }
    expect(SLOT_WHEELS.length).toBe(PACK_SIZE);
  });

  it("cites a path on this store for every card, and every path answers", async () => {
    for (const card of allEntries(CURRENT_SEASON)) {
      expect(card.cite.startsWith("/"), `${card.name} cites ${card.cite}`).toBe(true);
      const response = await SELF.fetch(`${BASE}${card.cite}`, { headers: { Accept: "text/html" } });
      expect(response.status, `${card.name} cites ${card.cite}`).toBe(200);
    }
  });

  it("names a rail on every rail card and a defect on every condition", () => {
    for (const card of CURRENT_SEASON.cards) {
      if (card.type === "rail") expect(card.rail, card.name).toBeDefined();
      else expect(card.rail, card.name).toBeUndefined();
      if (card.type === "condition") expect(card.defect, card.name).toBeDefined();
    }
  });

  it("draws every plate it says it draws, and every plate flattens to ink", () => {
    for (const key of drawnPlateKeys()) {
      const plate = plateFor(key)!;
      expect(flattenPath(plate.d, (x, y) => [x, y]).length, key).toBeGreaterThan(0);
    }
    // The plates named in the set are real keys; the count on /design is derived, never typed.
    const drawn = new Set(drawnPlateKeys());
    expect(CURRENT_SEASON.cards.filter((card) => drawn.has(card.key)).length).toBeGreaterThan(30);
  });
});

describe("the odds are derived, never typed", () => {
  it("counts each slot's wheel and the fractions sum to one", () => {
    for (const row of slotOdds()) {
      expect(RARITY_ORDER.reduce((sum, rarity) => sum + row.stops[rarity], 0)).toBe(row.wheel_size);
      expect(row.wheel_size).toBe(SLOT_WHEELS[row.slot - 1]!.length);
    }
    expect(packChanceOf("common")).toBe(1);
    expect(packChanceOf("keeper")).toBe(0);
    expect(packChanceOf("holo")).toBeGreaterThan(0);
    expect(packChanceOf("holo")).toBeLessThan(packChanceOf("rare"));
  });

  it("lands on tiers at the published rate over many certificates, from one seed", async () => {
    const seed = await seedFor(testEnv, "2026-09-12");
    const pulls = 3000;
    const seen: Record<string, number> = { common: 0, uncommon: 0, rare: 0, holo: 0, keeper: 0 };
    for (let index = 0; index < pulls; index += 1) {
      const drawn = await drawSlot(seed, "0xabc", `cert_odds_${index}`, 5);
      seen[drawn.rarity] = (seen[drawn.rarity] ?? 0) + 1;
    }
    const wheel = SLOT_WHEELS[4]!;
    for (const rarity of RARITY_ORDER) {
      const expected = wheel.filter((stop) => stop === rarity).length / wheel.length;
      expect(Math.abs(seen[rarity]! / pulls - expected), `${rarity}`).toBeLessThan(0.03);
    }
  });

  it("is deterministic per (seed, payer, cert, slot) and moves with any of them", async () => {
    const seed = await seedFor(testEnv, "2026-09-12");
    const other = await seedFor(testEnv, "2026-09-13");
    const a = await drawSlot(seed, "0xabc", "cert_alpha", 4);
    const b = await drawSlot(seed, "0xabc", "cert_alpha", 4);
    expect(a).toEqual(b);
    const across = await Promise.all(Array.from({ length: 8 }, (_, i) => drawSlot(other, "0xabc", `cert_alpha${i}`, 4)));
    expect(across.some((slot) => slot.card.no !== a.card.no)).toBe(true);
  });

  it("steps past a capped card within its tier, deterministically", async () => {
    const seed = await seedFor(testEnv, "2026-09-12");
    const open = await drawSlot(seed, "0xabc", "cert_cap", 4, { wheel: ["rare"] });
    const capped = await drawSlot(seed, "0xabc", "cert_cap", 4, { wheel: ["rare"], capped: async (entry) => entry.key === open.card.key });
    expect(capped.card.key).not.toBe(open.card.key);
    expect(capped.rarity).toBe("rare");
    expect(capped.stepped).toBe(true);
    const everything = await drawSlot(seed, "0xabc", "cert_cap", 4, { wheel: ["rare"], capped: async () => true });
    expect(everything.rarity).toBe("common");
  });
});

describe("the day seed", () => {
  it("commits today and reveals only a finished day, signed both times", async () => {
    const today = utcDate();
    const running = await publishSeedRecord(testEnv, today);
    expect(running.record.seed).toBeUndefined();
    expect(running.record.commit).toMatch(/^[0-9a-f]{64}$/);
    // A finished day, seen from a fake later clock — never today's, or the
    // reveal would land on the record the door above is about to read.
    const finished = await publishSeedRecord(testEnv, "2027-01-05", new Date("2027-01-07T00:00:00Z"));
    expect(finished.record.seed).toMatch(/^[0-9a-f]{64}$/);
    expect(await commitOf(await seedFor(testEnv, "2027-01-05"))).toBe(finished.record.commit);
    expect(dayHasEnded("2026-09-12", new Date("2026-09-13T00:00:01Z"))).toBe(true);
    expect(dayHasEnded("2026-09-13", new Date("2026-09-13T23:59:59Z"))).toBe(false);

    const door = await json(await SELF.fetch(`${BASE}/api/paywall/seed/${today}`));
    expect(door["revealed"]).toBe(false);
    expect((door["record"] as Record<string, unknown>)["commit"]).toBe(running.record.commit);
    expect((await SELF.fetch(`${BASE}/api/paywall/seed/2999-01-01`)).status).toBe(400);
    expect((await SELF.fetch(`${BASE}/api/paywall/seed/2026-01-01`)).status).toBe(404);
  });
});

describe("the shelf", () => {
  it("lists the pack and the window pick as instant novelties with the specimen, marked HOUSE", async () => {
    for (const id of ["pack", "window_pick"]) {
      const item = getMenuItem(id);
      expect(item, id).toBeDefined();
      expect(item?.fulfillment).toBe("instant");
      expect(item?.sample_url).toBe("/p/specimen.svg");
      expect(NOVELTY_ONLY).toContain(id);
      expect(SPEC_RETURNS[id]).toBeTruthy();
      expect(ITEM_MAKER_MARK[id]).toBe("house");
    }
    expect(SPEC_RETURNS["pack"]).toContain("/api/pack/{pack_id}");
    expect(getMenuItem("window_pick")!.price_usdc).toBeLessThan(getMenuItem("pack")!.price_usdc);
  });

  it("says nothing about value, and never promises a market", () => {
    for (const id of ["pack", "window_pick"]) {
      const item = getMenuItem(id)!;
      const copy = `${item.description} ${item.note_402} ${(item.constraints ?? []).join(" ")}`.toLowerCase();
      expect(copy).toContain("entitles the holder to a card");
      expect(copy).not.toContain("invest");
      expect(copy).not.toContain("limited time");
      expect(copy).not.toContain("nft");
    }
  });
});

describe("a pack, bought", () => {
  it("hands back five pressings, each with a print number, a face, a share sheet, a page and a record that verifies", async () => {
    const body = await buy("pack");
    expect(body["order_id"]).toBeUndefined();
    expect(String(body["deliverable"])).toContain("Pack opened");
    expect(String(body["commit_d"])).toMatch(/^[0-9a-f]{64}$/);
    const cards = body["cards"] as Array<Record<string, unknown>>;
    expect(cards).toHaveLength(PACK_SIZE);

    const pack = await json(await SELF.fetch(String(body["pack_url"])));
    const manifest = pack["pack"] as Record<string, unknown>;
    expect(manifest["card_ids"]).toHaveLength(PACK_SIZE);
    expect(manifest["commit"]).toBe(body["commit_d"]);
    expect(manifest["payer"]).toBe(TEST_PAYER.toLowerCase());

    // The draw recomputes from the seed and the manifest's own inputs.
    const seed = await seedFor(testEnv, String(manifest["seed_date"]));
    for (let slot = 1; slot <= PACK_SIZE; slot += 1) {
      const redo = await drawSlot(seed, String(manifest["payer"]), String(manifest["cert_id"]), slot);
      expect(cards[slot - 1]!["card_no"], `slot ${slot}`).toBe(redo.card.no);
    }

    for (const card of cards) {
      expect(card["print_no"]).toBeGreaterThan(0);
      const record = await json(await SELF.fetch(String(card["verify_url"]).replace("/api/verify/", "/api/card/")));
      const inner = record["card"] as Record<string, unknown>;
      expect(inner["name"]).toBe(card["name"]);
      expect(inner["holder"]).toBe(TEST_PAYER.toLowerCase());

      const face = await SELF.fetch(String(card["face_url"]));
      expect(face.status).toBe(200);
      expect(face.headers.get("Content-Type")).toBe("image/svg+xml");
      const art = await face.text();
      expect(art).toContain(String(card["name"]).replace(/&/g, "&amp;").replace(/'/g, "&#39;"));
      expect(art).toContain(`/api/verify/${String(card["card_id"])}`);
      expect(art).not.toContain("SPECIMEN");
      expect(art).toContain('shape-rendering="crispEdges"'); // the QR strip

      const sheet = await SELF.fetch(String(card["share_url"]));
      expect(sheet.status).toBe(200);
      expect(sheet.headers.get("Content-Type")).toBe("image/png");
      const bytes = new Uint8Array(await sheet.arrayBuffer());
      expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

      const page = await SELF.fetch(String(card["page_url"]), { headers: { Accept: "text/html" } });
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain(`<meta property="og:image" content="${BASE}/p/${String(card["card_id"])}.png">`);
      expect(html).toContain('name="twitter:card" content="summary_large_image"');

      const verified = await json(await SELF.fetch(String(card["verify_url"])));
      expect(verified["valid"]).toBe(true);
    }
    const packVerified = await json(await SELF.fetch(`${BASE}/api/verify/${String(body["pack_id"])}`));
    expect(packVerified["valid"]).toBe(true);
  });

  it("never sells out, and the same idempotency key returns the same pack", async () => {
    const key = "pack-key-0123456789abcdef";
    const first = await buy("pack", { "Idempotency-Key": key });
    const again = await buy("pack", { "Idempotency-Key": key });
    expect(again["pack_id"]).toBe(first["pack_id"]);
    const fresh = await buy("pack");
    expect(fresh["pack_id"]).not.toBe(first["pack_id"]);
  });

  it("files the pull in the payer's binder, on the page and the manifest and the tool", async () => {
    const body = await buy("pack");
    const cards = body["cards"] as Array<Record<string, unknown>>;
    const binder = await json(await SELF.fetch(`${BASE}/api/paywall/binder/${TEST_PAYER}`));
    const ids = (binder["cards"] as Array<Record<string, unknown>>).map((row) => row["card_id"]);
    for (const card of cards) expect(ids).toContain(card["card_id"]);
    expect((await SELF.fetch(`${BASE}/binder/${TEST_PAYER}`, { headers: { Accept: "text/html" } })).status).toBe(200);
    expect((await SELF.fetch(`${BASE}/api/paywall/binder/not-a-wallet`)).status).toBe(400);
  });

  it("puts the pack in the window, and a window pick takes one of its cards at half a pack", async () => {
    const body = await buy("pack");
    const window = await json(await SELF.fetch(`${BASE}/api/paywall/window`));
    const shown = (window["window"] as Array<Record<string, unknown>>).map((pack) => pack["pack_id"]);
    expect(shown).toContain(body["pack_id"]);
    const pick = await buy("window_pick");
    const pressing = pick["pressing"] as Record<string, unknown>;
    expect(shown).toContain(pick["from_pack"]);
    const record = await json(await SELF.fetch(`${BASE}/api/card/${String(pressing["card_id"])}`));
    expect((record["card"] as Record<string, unknown>)["source"]).toBe("window");
    const verified = await json(await SELF.fetch(String(pressing["verify_url"])));
    expect(verified["valid"]).toBe(true);
  });

  it("refuses a card, a pack and a seed that were never made", async () => {
    expect((await SELF.fetch(`${BASE}/api/card/card_neverissued`)).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/p/card_neverissued.svg`)).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/p/card_neverissued`, { headers: { Accept: "text/html" } })).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/api/pack/pack_neverissued`)).status).toBe(404);
  });
});

describe("cards ride the other doors", () => {
  it("the bell presses one common a day, and not on the repeat ring", async () => {
    const ring = await json(await SELF.fetch(`${BASE}/api/bell`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent_name: "bell-tester" }) }));
    const pressing = ring["pressing"] as Record<string, unknown>;
    expect(pressing).toBeDefined();
    expect(pressing["rarity"]).toBe("common");
    const record = await json(await SELF.fetch(`${BASE}/api/card/${String(pressing["card_id"])}`));
    expect((record["card"] as Record<string, unknown>)["source"]).toBe("bell");
    const again = await json(await SELF.fetch(`${BASE}/api/bell`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent_name: "bell-tester" }) }));
    expect(again["pressing"]).toBeUndefined();
  });

  it("the guestbook earns its Event, and a plain purchase earns a common", async () => {
    const signed = await json(await SELF.fetch(`${BASE}/api/guestbook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "a signer", message: "pressed on the way out" }) }));
    const event = signed["pressing"] as Record<string, unknown>;
    expect(event["name"]).toBe("Signed the Guestbook");
    const hello = await buy("hello");
    const earned = hello["pressing"] as Record<string, unknown>;
    expect(earned).toBeDefined();
    expect(earned["rarity"]).toBe("common");
    const record = await json(await SELF.fetch(`${BASE}/api/card/${String(earned["card_id"])}`));
    expect((record["card"] as Record<string, unknown>)["source"]).toBe("earned");
  });
});

describe("the room", () => {
  it("prints every fraction beside its denominator, today's commit, and hangs an honest specimen", async () => {
    const twin = await json(await SELF.fetch(`${BASE}/design`, { headers: { Accept: "application/json" } }));
    const odds = twin["odds"] as Record<string, unknown>;
    expect(odds["per_slot"] as unknown[]).toHaveLength(PACK_SIZE);
    const perPack = odds["per_pack"] as Record<string, Record<string, unknown>>;
    expect(String(perPack["holo"]!["derivation"])).toContain("1 - (");
    const seed = twin["seed"] as Record<string, Record<string, Record<string, unknown>>>;
    expect(String(seed["today"]!["record"]!["commit"])).toMatch(/^[0-9a-f]{64}$/);
    const set = twin["set"] as Record<string, unknown>;
    expect((set["cards"] as unknown[]).length).toBe(CURRENT_SEASON.cards.length);

    const page = await (await SELF.fetch(`${BASE}/design`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("The odds, derived");
    expect(page).toContain("Signed at issue. Drawn by a seed you can check. Printed once.");
    for (const card of CURRENT_SEASON.cards) expect(page).toContain(card.name.replace(/&/g, "&amp;").replace(/'/g, "&#39;"));

    const specimen = await SELF.fetch(`${BASE}/p/specimen.svg`);
    expect(specimen.status).toBe(200);
    const svg = await specimen.text();
    expect(svg).toContain("SPECIMEN");
    expect(svg).not.toContain("/api/verify/");
    const set2 = await json(await SELF.fetch(`${BASE}/api/paywall/set`));
    expect((set2["cards"] as unknown[]).length).toBe(52);
  });
});

describe("the machine strip", () => {
  it("encodes a verify URL as a well-formed QR: finders, timing, a dark module, a size that matches the version", () => {
    const qr = encodeQr(`${BASE}/api/verify/card_ab12cd34ef`);
    expect(qr.size).toBe(qr.version * 4 + 17);
    const finder = (r0: number, c0: number): boolean => {
      for (let r = 0; r < 7; r += 1) for (let c = 0; c < 7; c += 1) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (qr.modules[r0 + r]![c0 + c] !== (ring || core)) return false;
      }
      return true;
    };
    expect(finder(0, 0) && finder(0, qr.size - 7) && finder(qr.size - 7, 0)).toBe(true);
    for (let i = 8; i < qr.size - 8; i += 1) expect(qr.modules[6]![i]).toBe(i % 2 === 0);
    expect(qr.modules[qr.size - 8]![8]).toBe(true);
    // Decoded with an independent reader (jsQR) for versions 1–6 in the
    // scratchpad check that shipped with lib/qr.ts; this holds the shape.
  });
});
