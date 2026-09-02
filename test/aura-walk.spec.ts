import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import methodDoc from "../AGENT_UX.md?raw";
import bundle from "../registry/clawhub/SKILL.md?raw";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";
import { ROUTES as WHEN_TO_BUY } from "@/lib/when-to-buy";
import { LABOR_ITEM_IDS } from "@/services/queue-capacity";
import { getOrder } from "@/services/orders";
import { markKeeperSeen } from "@/services/shutter";
import { MENU_ITEMS, getMenuItem } from "@/store";
import {
  AURA_WALK_ENTRY_POINTS,
  AURA_WALK_LOG_VERBS,
  AURA_WALK_MEASURES,
  AURA_WALK_METHOD_FILE,
} from "@/store/aura-walk";
import { CAPABILITY_QUERY, NOVELTY_ONLY, SPEC_RETURNS, SPEC_WHY_USE, USE_WHEN } from "@/store/spec";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const ID = "aura_walk";

/**
 * THE AURA WALK (roadmap S11, 2026-09-02): the cold-agent pass this
 * store runs on itself, sold on a door the buyer names, run by the
 * keeper's hand. Two things this file exists to hold:
 *
 *   1. The shelf cannot sell a method the document no longer
 *      describes. `src/store/aura-walk.ts` mirrors AGENT_UX.md's
 *      entry points and measures; each one has to appear in the
 *      document verbatim, or the copy is quoting a walk nobody runs.
 *   2. Keeper-time answers to TWO doors now, and every surface that
 *      said "one door" had to move. Derived: the labor set is read
 *      from the menu and the copy is checked against it.
 */

async function paid(path: string): Promise<Response> {
  const challenge = await SELF.fetch(`${BASE}${path}`);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0]!;
  const signature = buildPaymentSignature(accepted);
  return SELF.fetch(`${BASE}${path}`, {
    headers: { "PAYMENT-SIGNATURE": signature },
  });
}

beforeAll(installFacilitatorMock);
beforeEach(async () => {
  await markKeeperSeen(testEnv);
});

describe("the method on the shelf is the method in the document", () => {
  it("names every entry point AGENT_UX.md lists, verbatim", () => {
    expect(AURA_WALK_ENTRY_POINTS.length).toBeGreaterThan(0);
    for (const entry of AURA_WALK_ENTRY_POINTS) {
      expect(methodDoc, `${AURA_WALK_METHOD_FILE} no longer lists "${entry}"`).toContain(
        `- ${entry}`,
      );
    }
  });

  it("names the three measures and the three verbs, as written there", () => {
    for (const measure of AURA_WALK_MEASURES) {
      expect(methodDoc).toContain(`**${measure}`);
    }
    for (const verb of AURA_WALK_LOG_VERBS) {
      expect(methodDoc).toContain(verb);
    }
  });

  it("the row's own copy says how many entry points, derived, and cites the file", () => {
    const item = getMenuItem(ID)!;
    expect(item.description).toContain(`${AURA_WALK_ENTRY_POINTS.length} of them`);
    expect(JSON.stringify(item.constraints)).toContain(AURA_WALK_METHOD_FILE);
  });
});

describe("the row", () => {
  const item = getMenuItem(ID)!;

  it("is labor, a week's promise, capped with a waitlist, at the keeper's price", () => {
    expect(item.fulfillment).toBe("human_queue");
    expect(item.pricing).toBe("fixed");
    expect(item.price_usdc).toBe(150);
    expect(item.sla_hours).toBe(168);
    expect(item.weekly_inventory).toBeGreaterThan(0);
    expect(item.waitlist).toBe(true);
    // The Worker reads nothing to make this; the keeper's machines do
    // the walking, and the copy says so.
    expect(item.reads).toBe("made_here");
    expect(item.description).toContain("the store itself reads nothing");
  });

  it("never promises a grade, in any of its copy", () => {
    const copy = [
      item.description,
      item.note_402,
      ...(item.constraints ?? []),
      CAPABILITY_QUERY[ID],
      SPEC_WHY_USE[ID],
      SPEC_RETURNS[ID],
    ]
      .join(" ")
      .toLowerCase();
    expect(copy).toContain("never a grade");
    for (const forbidden of ["score", "rating", "ranking", "pass/fail", "verdict:"]) {
      expect(copy, `the walk's copy promises a ${forbidden}`).not.toContain(forbidden);
    }
    expect(copy).toContain("transcript");
  });

  it("carries the spec maps an instrument carries, and is not filed as a novelty", () => {
    expect(CAPABILITY_QUERY[ID]).toBeTruthy();
    expect(SPEC_WHY_USE[ID]).toBeTruthy();
    expect(SPEC_WHY_USE[ID]!.length).toBeLessThan(320);
    expect(SPEC_RETURNS[ID]).toBeTruthy();
    expect(NOVELTY_ONLY).not.toContain(ID);
    expect(USE_WHEN.some((entry) => entry.items.includes(ID))).toBe(true);
    expect(WHEN_TO_BUY.some((entry) => entry.items.includes(ID))).toBe(true);
  });

  it("requires the door in url, and says where a model preference goes", () => {
    const schema = buyInputSchema(item);
    expect(schema.required).toContain("url");
    const url = schema.properties["url"] as { description: string };
    expect(url.description).toContain("detail");
    expect(url.description).toContain(AURA_WALK_METHOD_FILE);
    expect(schema.properties["detail"]).toBeTruthy();
  });
});

describe("keeper-time answers to two doors now", () => {
  it("the labor set is the collab and the walk, derived from the menu", () => {
    expect([...LABOR_ITEM_IDS].sort()).toEqual(["aura_walk", "the_collab"]);
  });

  it("the human-labor MCP tool names every labor door, and says two", () => {
    const tool = SHELF_CLUSTERS.find((cluster) => cluster.name === "buy_human_task")!;
    for (const id of LABOR_ITEM_IDS) {
      expect(tool.itemIds, `buy_human_task does not sell ${id}`).toContain(id);
      expect(tool.purpose).toContain(id);
    }
    expect(tool.purpose).toContain("Two doors");
    expect(tool.purpose).not.toContain("One door");
  });

  it("no public surface still says keeper-time is one door", async () => {
    const surfaces = ["/llms.txt", "/llms-full.txt", "/skill.md", "/menu.json"];
    for (const path of surfaces) {
      const text = await (await SELF.fetch(`${BASE}${path}`)).text();
      expect(text, `${path} still says "One door now"`).not.toContain("One door now");
      expect(text, `${path} still says "One door since"`).not.toContain("One door since");
    }
    expect(bundle).not.toContain("One door since");
    expect(bundle).toContain(ID);
  });
});

describe("the door", () => {
  it("answers the free knock with the 402 and the refund promise", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/${ID}`);
    expect(response.status).toBe(402);
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["refund_promise"])).toContain("168 hours");
  });

  it("refuses the paid request without a door, before any money moves", async () => {
    const response = await paid(`/api/buy/${ID}`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["charged"]).toBe(false);
    expect(body["code"]).toBe("bad_request");
    expect(String(body["error"])).toContain("url");
  });

  it("refuses our own hostname, naming the free passes instead", async () => {
    const response = await paid(`/api/buy/${ID}?url=${encodeURIComponent(`${BASE}/api/buy/hello`)}`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["charged"]).toBe(false);
    expect(body["code"]).toBe("target_refused");
    expect(String(body["error"])).toContain(AURA_WALK_METHOD_FILE);
  });

  it("refuses a door the shared law refuses (plain http), nothing charged", async () => {
    const response = await paid(`/api/buy/${ID}?url=${encodeURIComponent("http://door.example/api/x")}`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["charged"]).toBe(false);
  });

  it("opens the order with the door on it, separate from the detail", async () => {
    const door = "https://door.example/api/thing";
    const response = await paid(
      `/api/buy/${ID}?url=${encodeURIComponent(door)}&detail=${encodeURIComponent("send a small model too")}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["order_id"]).toBeTruthy();
    const record = (await getOrder(testEnv, String(body["order_id"])))!;
    expect(record.item_id).toBe(ID);
    expect(record.status).toBe("queued");
    expect(record.target_url).toBe(door);
    expect(record.detail).toBe("send a small model too");
    expect(record.sla_hours).toBe(168);
  });
});

describe("the ladder", () => {
  it("lists the walk by price among the shelf, between the certificate and the collab", () => {
    const byPrice = [...MENU_ITEMS].sort((a, b) => a.price_usdc - b.price_usdc).map((i) => i.id);
    const at = byPrice.indexOf(ID);
    expect(byPrice[at - 1]).toBe("trust_profile");
    expect(byPrice[at + 1]).toBe("the_collab");
  });
});
