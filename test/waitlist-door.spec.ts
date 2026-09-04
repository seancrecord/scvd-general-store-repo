import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { getMenuItem } from "@/store";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE POINTER THE SOLD-OUT 409 HANDS OUT MUST OPEN (2026-09-04, CV's
 * fourth round). GET /api/buy/aura_walk answered 409 with a
 * waitlist_url while his house order held the week's one slot;
 * GET on that URL answered "That aisle doesn't exist." The route
 * existed and took POST, the 409 never said so, and the wrong-method
 * branch of the 404 handler compared the request path against route
 * PATTERNS as literal strings — so no parametrized door ever earned a
 * 405. A stranger following the store's own pointer hit a dead end.
 */

const aura = getMenuItem("aura_walk")!;
const inventoryKey = KV_KEYS.inventory(aura.id, currentWeekKey());

afterEach(async () => {
  await testEnv.COUNTERS.delete(inventoryKey);
});

describe("the waitlist door answers the obvious GET", () => {
  it("tells a stranger how to join, with the method, rather than 404", async () => {
    const response = await SELF.fetch(`${BASE}/api/waitlist/${aura.id}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["waitlist_method"]).toBe("POST");
    expect(body["charged"]).toBe(false);
    expect(body["waitlist_url"]).toBe(`${BASE}/api/waitlist/${aura.id}`);
    expect(String(body["error"] ?? "")).not.toContain("aisle");
  });

  it("still names an unknown item as unknown", async () => {
    const response = await SELF.fetch(`${BASE}/api/waitlist/not_an_item`);
    expect(response.status).toBe(404);
  });

  it("earns a 405 with Allow on a method the door does not take — a parametrized route counts", async () => {
    const response = await SELF.fetch(`${BASE}/api/waitlist/${aura.id}`, { method: "DELETE" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toContain("POST");
    expect(response.headers.get("Allow")).toContain("GET");
  });
});

describe("the sold-out 409 says how, not only where", () => {
  it("carries the method and the body shape beside the URL", async () => {
    // The week's slot, taken: the shelf gate reads this counter.
    await testEnv.COUNTERS.put(inventoryKey, String(aura.weekly_inventory));
    const response = await SELF.fetch(`${BASE}/api/buy/${aura.id}`);
    expect(response.status).toBe(409);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["code"]).toBe("sold_out");
    expect(body["charged"]).toBe(false);
    expect(body["waitlist_url"]).toBe(`${BASE}/api/waitlist/${aura.id}`);
    expect(body["waitlist_method"]).toBe("POST");
    expect(body["waitlist_body"]).toHaveProperty("callback_url");

    // And the pointer opens: the same instructions on the door itself.
    const door = await SELF.fetch(String(body["waitlist_url"]));
    expect(door.status).toBe(200);
    const shape = (await door.json()) as Record<string, unknown>;
    expect(shape["shelf"]).toBe("empty");
    expect(shape["waitlist_method"]).toBe("POST");

    // Joining works the way the door says, and costs nothing.
    const joined = await SELF.fetch(String(body["waitlist_url"]), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: "cv", callback_url: "https://example.com/ring" }),
    });
    expect(joined.status).toBe(201);
    expect(((await joined.json()) as Record<string, unknown>)["charged"]).toBe(false);
  });
});
