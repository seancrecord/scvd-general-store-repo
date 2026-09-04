import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { reRegistration } from "@/services/visibility";
import type { WardRound } from "@/services/ward-round";
import { MENU_ITEMS } from "@/store/menu";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * THE WEEKLY VISIBILITY CHECK (2026-09-04). The Sunday round already
 * asked the CDP index which of our doors it lists; the keeper heard
 * about a miss once, when the list changed, and the fix — one house
 * purchase per door — was prose in REGISTRATION_RUN.md. Now the desk
 * carries the reading and the exact press, and the page repeats every
 * week the miss stands.
 */
describe("the re-registration is spelled out", () => {
  it("names the shopping run and prices one copy of each missing door", () => {
    const [a, b] = MENU_ITEMS;
    const press = reRegistration([b!.id, a!.id, "not_a_door"]);
    // Menu order, unknown ids dropped, price summed at list.
    expect(press.items).toEqual([a!.id, b!.id]);
    expect(press.cost_usd).toBeCloseTo(a!.price_usdc + b!.price_usdc, 3);
    expect(press.command).toBe(`ITEMS=${a!.id},${b!.id} npm run shop`);
    expect(reRegistration([]).command).toBe("");
  });
});

describe("the desk says how visible the store is", () => {
  function round(missing: string[]): WardRound {
    return {
      week: "2026-W36",
      at: "2026-09-06T11:00:00.000Z",
      listed_resources: 0,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      our_doors: {
        claimed: MENU_ITEMS.length,
        found: MENU_ITEMS.map((item) => item.id).filter((id) => !missing.includes(id)),
        missing,
        could_not_check: false,
      },
      hosts: [],
    };
  }

  it("names the missing doors and the press when some are gone", async () => {
    const missing = MENU_ITEMS.slice(0, 2).map((item) => item.id);
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round(missing)));
    const page = await SELF.fetch(`${BASE}/admin`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Visibility:");
    expect(html).toContain(`${MENU_ITEMS.length - 2} of ${MENU_ITEMS.length}`);
    expect(html).toContain(`ITEMS=${missing.join(",")} npm run shop`);
  });

  it("says every door is findable when none is missing", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round([])));
    const page = await SELF.fetch(`${BASE}/admin`, { headers: AUTH });
    const html = await page.text();
    expect(html).toContain(`${MENU_ITEMS.length} of ${MENU_ITEMS.length}`);
    expect(html).toContain("it can find");
  });
});
