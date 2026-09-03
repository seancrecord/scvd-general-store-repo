import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { OPERATOR_STAGES, unshelvedOperatorItems } from "@/routes/operators";
import { ROOMS } from "@/store/rooms";
import { FREE_DOORS } from "@/store/atlas";

/**
 * FOR OPERATORS (2026-09-03). What this file holds:
 *
 *   - every stage's items are on the shelf, and every seller-side
 *     item with a real ticket is on some stage;
 *   - the page serves a person and a machine at one URL, free first
 *     in every stage, every price read off the shelf;
 *   - no score, no rank, no certify;
 *   - the room is registered and the atlas points a seller at it.
 */

const BASE = "https://scvd.store";
const SELLER_SIDE = [
  "launch_check",
  "opening_day",
  "passport_refresh",
  "service_audit",
  "standing_watch",
  "conformance_watch",
  "operator_statement",
  "trust_profile",
  "the_case_file",
  "aura_walk",
  "onpage_audit",
];

describe("the stages and the shelf", () => {
  it("name only items that are on the shelf", () => {
    expect(unshelvedOperatorItems()).toEqual([]);
  });

  it("carry every seller-side item somewhere, once", () => {
    const staged = OPERATOR_STAGES.flatMap((stage) => [...stage.items]);
    for (const id of SELLER_SIDE) {
      expect(staged.filter((entry) => entry === id), `${id} is staged ${staged.filter((entry) => entry === id).length} times`).toHaveLength(1);
      expect(MENU_ITEMS.some((item) => item.id === id), `${id} left the shelf`).toBe(true);
    }
  });

  it("lead every stage with a free instrument", () => {
    for (const stage of OPERATOR_STAGES) {
      expect(stage.free, `${stage.moment} has no free door first`).toBeTruthy();
    }
  });
});

describe("the page", () => {
  it("serves a person and a machine at one URL, prices from the shelf, free first", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/operators`, { headers: { Accept: "application/json" } })
    ).json()) as { stages: { moment: string; free_first?: { how: string }; on_the_shelf: { id: string; price_usdc: number; buy_url: string; cadence: string }[] }[] };
    expect(body.stages.length).toBe(OPERATOR_STAGES.length);
    for (const stage of body.stages) {
      expect(stage.free_first?.how).toContain(BASE);
      for (const rung of stage.on_the_shelf) {
        const item = MENU_ITEMS.find((entry) => entry.id === rung.id)!;
        expect(rung.price_usdc).toBe(item.price_usdc);
        expect(rung.buy_url).toBe(`${BASE}/api/buy/${item.id}`);
        expect(["one_off", "term"]).toContain(rung.cadence);
      }
    }
    const html = await (await SELF.fetch(`${BASE}/operators`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("For operators");
    expect(html).toContain("Before you launch");
    expect(html.indexOf("Free first")).toBeLessThan(html.indexOf("/menu/launch_check"));
    expect(html).toContain("Nothing here ranks you, scores you, or certifies you");
    for (const word of ["certified", "approved by", "top rated"]) {
      expect(html.toLowerCase()).not.toContain(word);
    }
  });

  it("is a registered room, and the atlas sends a seller here", () => {
    expect(ROOMS.map((room) => room.path)).toContain("/operators");
    expect(FREE_DOORS.map((door) => door.path)).toContain("/operators");
  });
});
