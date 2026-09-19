import { env } from "cloudflare:test";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HonoEnv, MenuItem } from "@/types";
import type { Env } from "@/types";

/**
 * A SHELF THAT COULD NOT BE READ IS NOT A BARE SHELF (rule 52).
 *
 * stockedShelfCount swallowed every read failure into zero, and the
 * door turned that zero into `code: "already_done"`, `stock: 0` and
 * "Sold out, honestly" — a definite fact about the shelf, in
 * machine-readable form, over a read that never happened. A KV hiccup
 * and a sold-out shelf were the same bytes to the buyer and to us. The
 * failure direction was safe (a sale refused, never a sale of stock
 * that may not exist) and stays safe; what changes is the sentence.
 *
 * No shelf item is stocked on the live menu today, so the door is
 * held through the same middleware with a stocked item stood in for
 * one, and the read is failed through the listKeys every reader uses.
 */
const fault = vi.hoisted(() => ({ mode: "ok" as "ok" | "throw" | "truncated" }));
vi.mock("@/lib/kv-list", async (original) => {
  const actual = await original<typeof import("@/lib/kv-list")>();
  return { ...actual, listKeys: async (...args: Parameters<typeof actual.listKeys>) => {
    if ((args[1].prefix ?? "").startsWith("stock:")) {
      if (fault.mode === "throw") throw new Error("KV list failed");
      const result = await actual.listKeys(...args);
      return fault.mode === "truncated" ? { ...result, truncated: true } : result;
    }
    return actual.listKeys(...args);
  } };
});
const STOCKED: MenuItem = { ...(await import("@/store")).getMenuItem("hello")!, id: "stocked_test", name: "A Stocked Test", stocked: true };
vi.mock("@/store", async (original) => {
  const actual = await original<typeof import("@/store")>();
  return { ...actual, getMenuItem: (id: string) => (id === "stocked_test" ? STOCKED : actual.getMenuItem(id)) };
});
import { readShelfStock } from "@/services/stock";
import { stockCheck } from "@/routes/door-checks";

const testEnv = env as unknown as Env;
afterEach(() => { fault.mode = "ok"; });

const door = new Hono<HonoEnv>();
door.use("/api/buy/*", stockCheck);
door.get("/api/buy/:item_id", (c) => c.text("through to the gate"));
const knock = () => door.request("https://scvd.store/api/buy/stocked_test", {}, testEnv);

describe("the stock read says what it could not see", () => {
  it("reads an empty shelf as zero, exactly, and a capped one as a floor", async () => {
    expect(await readShelfStock(testEnv, STOCKED)).toEqual({ count: 0, truncated: false });
    fault.mode = "truncated";
    expect(await readShelfStock(testEnv, STOCKED)).toEqual({ count: 0, truncated: true });
  });

  it("reads a failed walk as null, never as zero", async () => {
    fault.mode = "throw";
    expect(await readShelfStock(testEnv, STOCKED)).toBeNull();
  });

  it("the door refuses an unreadable shelf as its own gap, 503, nothing charged — and keeps the sold-out 409 for a bare one", async () => {
    const bare = await knock();
    expect(bare.status).toBe(409);
    const bareBody = await bare.json() as Record<string, unknown>;
    expect(bareBody.code).toBe("already_done");
    expect(bareBody.stock).toBe(0);
    expect(bareBody.charged).toBe(false);

    fault.mode = "throw";
    const unreadable = await knock();
    expect(unreadable.status).toBe(503);
    const body = await unreadable.json() as Record<string, unknown>;
    expect(body.code).toBe("shelf_unreadable");
    expect(body.charged).toBe(false);
    expect(body.stock).toBeNull();
    expect(String(body.error)).not.toContain("Sold out");
    expect(String(body.error)).toContain("could not be read");
  });
});
