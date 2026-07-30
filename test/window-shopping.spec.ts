import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { readMonthLedger, readPorchLedger } from "@/lib/metrics";
import type { ItemInterest } from "@/lib/window-shopping";
import { readWindowShopping } from "@/lib/window-shopping";
import { MENU_ITEMS } from "@/store";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import { PENNY_PAGE_USDC } from "@/lib/payments";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const adminAuth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

async function shopping() {
  const [ledger, porch] = await Promise.all([
    readMonthLedger(testEnv),
    readPorchLedger(testEnv),
  ]);
  return readWindowShopping(ledger, porch);
}

async function rowFor(item: string): Promise<ItemInterest | undefined> {
  return (await shopping()).rows.find((row) => row.item === item);
}

/**
 * The porch log rides on waitUntil, so the write lands after the
 * response — reading straight through races it. Every count assertion
 * here waits for the deferred write rather than sleeping a fixed
 * interval.
 */
async function waitForLooks(
  item: string,
  field: "looks" | "looksInfra",
  expected: number,
): Promise<void> {
  await vi.waitFor(
    async () => {
      expect((await rowFor(item))?.[field]).toBe(expected);
    },
    { timeout: 2000, interval: 25 },
  );
}

/**
 * PER-ITEM WINDOW SHOPPING.
 *
 * The gap this closes: /menu.json logged as one surface and
 * /menu/:item_id logged as nothing, so a reader who opened one item's
 * page and left was invisible. Attention was measurable and money was
 * measurable; the shelf somebody picked up and put back down was not.
 */
describe("per-item window shopping", () => {
  it("logs a look at one item's own page", async () => {
    const before = (await rowFor("hello"))?.looks ?? 0;
    await SELF.fetch(`${BASE}/menu/hello`);
    await waitForLooks("hello", "looks", before + 1);
  });

  it("logs the markdown read of the same page as the same shelf", async () => {
    const before = (await rowFor("small_blessing"))?.looks ?? 0;
    await SELF.fetch(`${BASE}/menu/small_blessing`, {
      headers: { Accept: "text/markdown" },
    });
    // Same shelf, whichever format the reader prefers. Splitting these
    // would make markdown clients look like a different kind of visitor.
    await waitForLooks("small_blessing", "looks", before + 1);
  });

  it("refuses to mint a counter for an item that isn't on the shelf", async () => {
    // A junk path must not be able to grow the key space. The menu
    // bounds it, which is the whole reason validation happens in the
    // middleware rather than after the 404.
    const response = await SELF.fetch(`${BASE}/menu/not_a_real_item`);
    expect(response.status).toBe(404);
    const porch = await readPorchLedger(testEnv);
    const invented = Object.keys(porch.surfaces).filter(
      (surface) =>
        surface.startsWith("item:") &&
        !MENU_ITEMS.some((item) => `item:${item.id}` === surface),
    );
    expect(invented, "a junk id minted a porch surface").toEqual([]);
  });

  it("keeps crawler reads in their own column, never folded into organic", async () => {
    const before = await rowFor("hello");
    await SELF.fetch(`${BASE}/menu/hello`, {
      headers: { "User-Agent": "GPTBot/1.0" },
    });
    await waitForLooks("hello", "looksInfra", (before?.looksInfra ?? 0) + 1);
    // The point of the separation: a crawler walking the menu produces
    // exactly the shape of a wanted item, so it must never be readable
    // as one.
    expect((await rowFor("hello"))?.looks).toBe(before?.looks ?? 0);
  });

  it("names what was read and never once tried", async () => {
    const before = (await rowFor("graffiti_on_a_train"))?.looks ?? 0;
    await SELF.fetch(`${BASE}/menu/graffiti_on_a_train`);
    await waitForLooks("graffiti_on_a_train", "looks", before + 1);
    const result = await shopping();
    const row = result.rows.find((entry) => entry.item === "graffiti_on_a_train");
    if (row?.challenges === 0) {
      expect(result.lookedNeverTried).toContain("graffiti_on_a_train");
    }
    // And the list is ordered by looks, most-read first, because that's
    // the ordering the question implies.
    const looks = result.lookedNeverTried.map(
      (item) => result.rows.find((entry) => entry.item === item)?.looks ?? 0,
    );
    expect([...looks].sort((a, b) => b - a)).toEqual(looks);
  });

  it("carries every menu item, so an unread shelf is visible too", async () => {
    const result = await shopping();
    // Every menu item plus every almanac page: the table covers
    // everything that can be bought, not everything on the menu.
    expect(result.rows.length).toBe(MENU_ITEMS.length + ALMANAC_ENTRIES.length);
    for (const row of result.rows) {
      expect(typeof row.price_usdc).toBe("number");
    }
  });

  it("states what the number is not, before anyone plans on it", async () => {
    const result = await shopping();
    expect(result.honestLimit).toContain("reads and not readers");
    expect(result.honestLimit).toContain("floor");
    // The one reading it supports, said out loud.
    expect(result.honestLimit).toContain("comparing items against each other");
  });

  it("shows up on the office desk with the caution attached", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    expect(page).toContain("Which shelf got picked up");
    expect(page).toContain("reads and not readers");
  });
});

/**
 * THE ALMANAC, ADDED THE DAY IT OUTSOLD THE ENTIRE MENU.
 *
 * The store's first sale to a stranger was a penny page from the
 * keeper's journal — an item that is not in MENU_ITEMS, not in
 * menu.json, not in the MCP tool list, and was therefore invisible to
 * the one instrument built to answer "which shelf got picked up." The
 * table measuring want had a hole exactly where the only want anybody
 * ever showed up with went.
 */
describe("the almanac is on the want table too", () => {
  it("carries a row per journal page", async () => {
    const result = await shopping();
    for (const entry of ALMANAC_ENTRIES) {
      const row = result.rows.find(
        (candidate) => candidate.item === `almanac:${entry.slug}`,
      );
      expect(row, `${entry.slug} is missing from the want table`).toBeTruthy();
      expect(row?.price_usdc).toBe(PENNY_PAGE_USDC);
    }
  });

  it("shows a dash for looks, not a zero", async () => {
    // The page IS the product: the first touch is the 402 and there is
    // nothing to read for free. Rendering that as 0 would say "nobody
    // looked" when the truth is "looking is not possible" — a different
    // fact wearing the same digit.
    const result = await shopping();
    const row = result.rows.find((candidate) =>
      candidate.item.startsWith("almanac:"),
    );
    expect(row?.looks).toBeNull();
  });

  it("never files a no-free-page shelf under 'nobody looked at it'", async () => {
    const result = await shopping();
    for (const item of result.neverLookedAt) {
      expect(
        item.startsWith("almanac:"),
        `${item} has no free page and cannot be "never looked at"`,
      ).toBe(false);
    }
  });

  it("counts the free index as its own porch surface", async () => {
    // The browse denominator: who opened the list of pages. Without it
    // the almanac has a numerator and nothing under it.
    const before = (await readPorchLedger(testEnv)).surfaces["almanac"];
    await SELF.fetch(`${BASE}/almanac`, { headers: { Accept: "text/html" } });
    await vi.waitFor(
      async () => {
        const after = (await readPorchLedger(testEnv)).surfaces["almanac"];
        expect(after?.["organic"] ?? 0).toBe((before?.["organic"] ?? 0) + 1);
      },
      { timeout: 2000, interval: 25 },
    );
  });

  it("explains the dash where a reader will see it", async () => {
    const result = await shopping();
    expect(result.honestLimit).toContain("no free page to read");
    expect(result.honestLimit).toContain("not the same as nobody looking");
  });
});
