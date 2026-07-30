import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { listEventsForItem, recordSettlement } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const adminAuth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * "THE ANSWER EXISTS BUT SCROLLED OFF THE PAGE" IS ITS OWN GAP.
 *
 * The keeper went looking for the settle row of the store's first
 * organic sale and could not find it: a health-check bot hit eleven
 * items fourteen minutes later and pushed it out of the desk's
 * fifteen-row window. The row was there. The page could not reach it,
 * and re-pulling until it surfaced would be a lottery, not a lookup.
 *
 * Not a wrong number, not a missing number — an unreachable one.
 */
describe("one item's whole history", () => {
  const ITEM = "almanac:notes-from-a-tuesday-in-oak-city";

  it("finds an item's settle however much has happened since", async () => {
    await recordSettlement(testEnv, `/almanac/notes-from-a-tuesday-in-oak-city`, {
      userAgent: "lookup-spec/1.0",
      paidUsdc: 0.01,
      minimumUsdc: 0.01,
      payer: "0x6666666666666666666666666666666666666666",
    });
    // Bury it under noise, exactly as the health-check bot did.
    for (let i = 0; i < 20; i += 1) {
      await recordSettlement(testEnv, "/api/buy/hello", {
        userAgent: "noise/1.0",
        houseHeader: testEnv.HOUSE_SECRET,
        paidUsdc: 0.5,
        minimumUsdc: 0.5,
      });
    }
    const history = await listEventsForItem(testEnv, ITEM);
    const settle = history.events.find(
      (event) => event.kind === "settle" && event.user_agent === "lookup-spec/1.0",
    );
    expect(settle, "the settle is unreachable behind newer rows").toBeTruthy();
    // And the thing the keeper actually wanted to know.
    expect(settle?.channel).toBeTruthy();
  });

  it("tells NOT FOUND apart from NOT REACHED", async () => {
    // An empty result must say which it is. A scan that stopped early
    // and an item that never happened look identical otherwise, and
    // one of them is a fact about the world while the other is a fact
    // about the scan.
    const shallow = await listEventsForItem(testEnv, "no-such-item", 1);
    expect(shallow.events.length).toBe(0);
    expect(shallow.capped).toBe(true);
    expect(shallow.rows_scanned).toBeGreaterThan(0);

    const deep = await listEventsForItem(testEnv, "no-such-item");
    expect(deep.events.length).toBe(0);
    expect(deep.capped).toBe(false);
  });

  it("says on the page which kind of empty it is", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/admin/events?item=no-such-item`, {
        headers: adminAuth,
      })
    ).text();
    expect(page).toContain("Nothing for this item in the rows scanned");
    expect(page).toMatch(/the whole log|NOT REACHED/);
  });

  it("is reachable by clicking the item on the desk, not by knowing the URL", async () => {
    const desk = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    expect(desk).toContain("/admin/events?item=");
  });

  it("keeps a way out, since it matches no nav tab", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/admin/events?item=${encodeURIComponent(ITEM)}`, {
        headers: adminAuth,
      })
    ).text();
    expect(page).toContain('href="/admin"');
    expect(page).toContain('href="/admin/counter"');
  });

  it("handles an item key with a colon in it", async () => {
    // The almanac keys carry one, and a key that needs escaping to be
    // looked up is a lookup nobody will use.
    const response = await SELF.fetch(
      `${BASE}/admin/events?item=${encodeURIComponent(ITEM)}`,
      { headers: adminAuth },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(ITEM);
  });
});
