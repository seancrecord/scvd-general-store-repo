import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { markKeeperSeen } from "@/services/shutter";
import { MENU_ITEMS } from "@/store";
import type { Env } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE PROMISE, WHERE THE DECISIONS HAPPEN (the Price Club rung).
 *
 * The refund commitment existed on /rights, the fulfillment log, and
 * a fine-print line — everywhere except the storefront's own voice
 * and the 402 a buyer reads before paying for human labor. These pin
 * both: the front says the promise in the keeper's approved words,
 * and every human-fulfilled door's 402 carries it with the item's own
 * window, derived rather than typed.
 */
describe("the refund promise is loud where it matters", () => {
  beforeAll(async () => {
    installFacilitatorMock();
    // The human shelf shutters when the keeper hasn't been seen; a
    // fresh test KV has never seen him. Open the store first.
    await markKeeperSeen(env as unknown as Env);
  });

  it("stands on the storefront in the keeper's words", async () => {
    const page = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("THE PROMISE");
    // The keeper's sentence renders HTML-escaped; assert on the
    // apostrophe-free span so the test reads as the words a person says.
    expect(page).toContain("you get your money back");
    expect(page).toContain('href="/fulfillment-log"');
  });

  it("rides every human-fulfilled item's 402, with that item's window", async () => {
    const humanItems = MENU_ITEMS.filter(
      (item) => item.fulfillment === "human_queue",
    );
    expect(humanItems.length).toBeGreaterThan(0);
    for (const item of humanItems) {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
      expect(response.status).toBe(402);
      const body = (await response.json()) as Record<string, unknown>;
      const promise = String(body["refund_promise"] ?? "");
      expect(promise, `${item.id} 402 carries no refund promise`).toContain(
        "your money back",
      );
      expect(
        promise,
        `${item.id} promise does not quote its own sla_hours`,
      ).toContain(`${item.sla_hours ?? 168} hours`);
    }
  });

  it("stays out of instant items' 402s, where there is no window to miss", async () => {
    const instant = MENU_ITEMS.find((item) => item.fulfillment === "instant");
    expect(instant).toBeDefined();
    const response = await SELF.fetch(`${BASE}/api/buy/${instant?.id}`);
    expect(response.status).toBe(402);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["refund_promise"]).toBeUndefined();
  });
});
