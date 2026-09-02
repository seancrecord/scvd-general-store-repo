import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS, getMenuItem } from "@/store";
import { RETIRED_ITEMS } from "@/store/retired";
import { CAPABILITY_QUERY, NOVELTY_ONLY, SPEC_RETURNS, USE_WHEN } from "@/store/spec";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";
import { ROUTES } from "@/lib/when-to-buy";
import { CHEAP_DOOR_ITEM_IDS } from "@/store/copy/practice-counter";
import { FEATURED_SHELVES } from "@/store/copy/storefront";
import { dailyFortune } from "@/services/penny-shelf";
import { FORTUNES } from "@/store/fortunes";
import { isRecord } from "@/types";
import {
  installFacilitatorMock,
  type FacilitatorMockState,
} from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import clawhubBundle from "../registry/clawhub/SKILL.md?raw";

/**
 * THE FORTUNE CAME BACK, 2026-09-02.
 *
 * Retired 2026-08-20 as "folded into small_blessing", and the books
 * disagreed: three organic settles, the most of any door in the
 * store, and x402-list still listing it and scoring the 410 against
 * us. The keeper's ruling reopened it — same id, same copy, same
 * penny — and this file holds it to what the other doors carry: the
 * menu, the capability query, the returns line, the novelty register,
 * the use_when list, the MCP cluster, the when-to-buy route, the
 * practice counter, the guide, the skill bundle, and the storefront.
 *
 * Ids never come back to mean something ELSE; this one came back to
 * mean the same thing, and the retired shelf's comment says so.
 */

const BASE = "https://scvd.store";
let facilitator: FacilitatorMockState;

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("Expected a JSON object body");
  return body;
}

async function buy(url: string): Promise<Record<string, unknown>> {
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0];
  if (!accepted) throw new Error(`No payment option offered for ${url}`);
  const paid = await SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
  expect(paid.status).toBe(200);
  return json(paid);
}

describe("the day's fortune, relisted", () => {
  it("is on the shelf at a penny with the keeper's original copy, and off the retired list", () => {
    const item = getMenuItem("daily_fortune");
    expect(item).toBeDefined();
    expect(item?.price_usdc).toBe(0.01);
    expect(item?.fulfillment).toBe("instant");
    expect(item?.description).toContain("a chalkboard, not a slot machine");
    expect(RETIRED_ITEMS.map((entry) => entry.id)).not.toContain("daily_fortune");
  });

  it("answers 402 at the door again, not the tombstone", async () => {
    const door = await SELF.fetch(`${BASE}/api/buy/daily_fortune`);
    expect(door.status).toBe(402);
    const page = await SELF.fetch(`${BASE}/menu/daily_fortune`);
    expect(page.status).toBe(200);
  });

  it("is the same line for everyone until midnight UTC, with the date beside it", async () => {
    const first = await buy(`${BASE}/api/buy/daily_fortune`);
    const second = await buy(`${BASE}/api/buy/daily_fortune`);
    expect(facilitator.settleCalls).toBeGreaterThanOrEqual(2);
    const today = new Date().toISOString().slice(0, 10);
    expect(first["fortune_date"]).toBe(today);
    expect(second["fortune_date"]).toBe(today);
    expect(first["deliverable"]).toBe(second["deliverable"]);
    expect(first["deliverable"]).toBe(dailyFortune());
    expect(FORTUNES).toContain(first["deliverable"]);
  });

  it("is a chalkboard, not a slot machine: the pick is a function of the date alone", () => {
    const a = dailyFortune(new Date("2026-09-02T00:00:01Z"));
    const b = dailyFortune(new Date("2026-09-02T23:59:59Z"));
    expect(a).toBe(b);
    // Across a month the board changes — the pool is bigger than one.
    const seen = new Set<string>();
    for (let day = 1; day <= 28; day += 1) {
      seen.add(dailyFortune(new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`)));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("the fortune carries what the other doors carry", () => {
  it("has a capability query, a returns line, and sits on the novelty register", () => {
    expect(CAPABILITY_QUERY["daily_fortune"]).toBeTruthy();
    expect(SPEC_RETURNS["daily_fortune"]).toContain("fortune_date");
    expect(NOVELTY_ONLY).toContain("daily_fortune");
  });

  it("is named by the use_when list, the MCP penny cluster, the when-to-buy route, the practice counter, and the sign", () => {
    expect(USE_WHEN.some((entry) => entry.items.includes("daily_fortune"))).toBe(true);
    const penny = SHELF_CLUSTERS.find((cluster) => cluster.name === "buy_small_pleasure");
    expect(penny?.itemIds).toContain("daily_fortune");
    expect(ROUTES.some((route) => route.items.includes("daily_fortune"))).toBe(true);
    expect(CHEAP_DOOR_ITEM_IDS).toContain("daily_fortune");
    expect(FEATURED_SHELVES.map((card) => card.id)).toContain("daily_fortune");
  });

  it("is on menu.json, the OpenAPI summary, the guide, and the skill bundle", async () => {
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const ids = (menu["items"] as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain("daily_fortune");
    expect(ids.indexOf("daily_fortune")).toBeLessThan(ids.indexOf("the_confession"));

    const openapi = await json(await SELF.fetch(`${BASE}/openapi.json`));
    const paths = openapi["paths"] as Record<string, { get?: { summary?: string } }>;
    expect(paths["/api/buy/daily_fortune"]?.get?.summary).toBe(CAPABILITY_QUERY["daily_fortune"]);

    const guide = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    expect(guide).toContain("daily_fortune");
    expect(guide).toContain("fortune_date");

    const skill = await (await SELF.fetch(`${BASE}/skill.md`)).text();
    expect(skill).toContain("/api/buy/daily_fortune");
    expect(clawhubBundle).toContain("/api/buy/daily_fortune");
  });

  it("the shelf has one door more than the retirement left it", () => {
    // Derived, not typed: the penny shelf is three doors in file order.
    const penny = MENU_ITEMS.filter((item) =>
      ["small_blessing", "daily_fortune", "the_confession"].includes(item.id),
    ).map((item) => item.id);
    expect(penny).toEqual(["small_blessing", "daily_fortune", "the_confession"]);
  });
});
