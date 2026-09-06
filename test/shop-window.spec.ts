import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { recordSettlement } from "@/lib/metrics";
import {
  nameForItemKey,
  readShopWindow,
  relativeWhen,
  WINDOW_SIZE,
} from "@/services/shop-window";
import { escapeHtml } from "@/lib/sanitize";
import { STOREFRONT_COPY } from "@/store/copy/storefront";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const OUTSIDER = "0x9999999999999999999999999999999999999999";

/**
 * THE SHOP WINDOW — the front page's answer to "what are people
 * buying", and the four things it must never get wrong.
 *
 * KV persists across a spec file, and both surfaces here are
 * append-only prefixes, so this clears its own before every case
 * (AGENTS.md): a window that passes alone and fails in the suite is
 * the exact shape of test this store has been bitten by.
 */
async function clearPrefix(prefix: string): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix, limit: 1000 });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
}

describe("the shop window", () => {
  beforeEach(async () => {
    await clearPrefix(KV_KEYS.saleEventPrefix);
    await clearPrefix("evt:");
  });

  it("names the shelf, never the till's key for it", async () => {
    await recordSettlement(testEnv, "/api/buy/small_blessing", {
      paidUsdc: 0.005,
      minimumUsdc: 0.005,
      payer: OUTSIDER,
    });

    const glass = await readShopWindow(testEnv);
    expect(glass.sales.length).toBe(1);
    const [sale] = glass.sales;
    /*
     * The whole point of the keeper's ask was product speak: a shopper
     * reads "A Small Blessing", not the string the counters are keyed
     * by. The name is the shelf's own, so a rename on the menu renames
     * it here on the same deploy.
     */
    expect(sale?.name).toBe("A Small Blessing");
    expect(sale?.name).not.toContain("_");
    expect(sale?.href).toBe("/menu/small_blessing");
    expect(sale?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(sale?.when).toBe("just now");
  });

  it("keeps the proprietors' own purchases out of the glass", async () => {
    /*
     * Family doesn't make the paper (HOUSE_FLAG_POLICY). The window is
     * the store's most visible surface, so it is the easiest place for
     * house traffic to quietly become a track record.
     */
    await recordSettlement(testEnv, "/api/buy/hello", {
      houseHeader: testEnv.HOUSE_SECRET,
      paidUsdc: 0.002,
      minimumUsdc: 0.002,
    });

    const glass = await readShopWindow(testEnv);
    expect(glass.sales).toEqual([]);
  });

  it("shows the newest first, and no more than the glass holds", async () => {
    for (const item of ["hello", "small_blessing", "daily_fortune", "the_confession", "luckies", "spot_check"]) {
      await recordSettlement(testEnv, `/api/buy/${item}`, {
        paidUsdc: 0.01,
        minimumUsdc: 0.01,
        payer: OUTSIDER,
      });
    }

    const glass = await readShopWindow(testEnv);
    expect(glass.sales.length).toBe(WINDOW_SIZE);
    const instants = glass.sales.map((sale) => sale.at);
    expect([...instants].sort((a, b) => b.localeCompare(a))).toEqual(instants);
  });

  /**
   * THE REASON THE SALE INDEX EXISTS, as a test rather than as a
   * comment. The raw `evt:` stream carries every price check and every
   * corpus read, so a bounded scan of it spends its whole cap on
   * traffic and reports an empty shop over one that is trading — the
   * failure booked against the decline desk on 2026-09-05. Bury one
   * sale under more newer rows than the window will ever scan and it
   * must still be in the glass.
   */
  it("reaches a sale buried under a burst of newer traffic", async () => {
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.002,
      minimumUsdc: 0.002,
      payer: OUTSIDER,
    });

    const noise = Array.from({ length: 260 }, (_unused, index) =>
      testEnv.COUNTERS.put(
        `evt:${invertedTimestamp(Date.now() + 1000 + index)}:${index.toString(36)}`,
        JSON.stringify({
          kind: "challenge",
          item: "corpus",
          channel: "unknown",
          house: false,
          at: new Date(Date.now() + 1000 + index).toISOString(),
        }),
      ),
    );
    await Promise.all(noise);

    const glass = await readShopWindow(testEnv);
    expect(
      glass.sales.map((sale) => sale.name),
      "the newest sale was buried by traffic the window had to scan past",
    ).toEqual(["A Signed Hello"]);
  });

  it("hangs the rows in the storefront's own HTML, with no script involved", async () => {
    await recordSettlement(testEnv, "/api/buy/daily_fortune", {
      paidUsdc: 0.01,
      minimumUsdc: 0.01,
      payer: OUTSIDER,
    });

    const html = await (
      await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).toContain(STOREFRONT_COPY.soldHead);
    expect(html).toContain("The Daily Fortune");
    expect(html).toContain('class="sold-row"');
    // The script is an enhancement on top of rows that are already
    // there; a reader with no JavaScript sees the same window.
    expect(html).toContain('src="/shop-window.js"');
  });

  it("says so plainly when nothing has crossed the counter", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })
    ).text();
    // Escaped, because the copy has an apostrophe in it and every word
    // this store renders goes through the escaper on the way out.
    expect(html).toContain(escapeHtml(STOREFRONT_COPY.soldEmpty));
    expect(html).toContain('class="sold-none"');
    expect(html).not.toContain('class="sold-row"');
  });

  it("serves the feed the page polls, briefly cacheable", async () => {
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.002,
      minimumUsdc: 0.002,
      payer: OUTSIDER,
    });

    const response = await SELF.fetch(`${BASE}/shop-window.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=30");
    const body = (await response.json()) as {
      sales: Array<{ name: string; href: string; at: string; when: string }>;
      read_at: string;
    };
    expect(body.sales[0]?.name).toBe("A Signed Hello");
    expect(body.read_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /**
   * NOBODY'S NAME IS IN THE GLASS. A settle knows the wallet, the
   * user-agent and the channel; the window publishes none of them, and
   * this walks the served bytes rather than trusting the shape.
   */
  it("publishes nothing about who bought", async () => {
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.002,
      minimumUsdc: 0.002,
      payer: OUTSIDER,
      userAgent: "some-buyer-agent/1.0",
    });

    const body = await (await SELF.fetch(`${BASE}/shop-window.json`)).text();
    expect(body).not.toContain(OUTSIDER);
    expect(body).not.toContain("some-buyer-agent");
    expect(body.toLowerCase()).not.toContain("payer");
  });

  it("serves its script as a script, and one that builds nodes rather than markup", async () => {
    const response = await SELF.fetch(`${BASE}/shop-window.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("javascript");
    const source = await response.text();
    /*
     * The one rule this store's only browser-side renderer has to keep:
     * values from storage reach the page as text, never as markup.
     */
    expect(source).not.toContain("innerHTML");
    expect(source).toContain("textContent");
    expect(source).toContain("/shop-window.json");
  });
});

describe("the window's words", () => {
  it("reads the clock in English, and gets vaguer the further back it looks", () => {
    const now = Date.parse("2026-09-06T12:00:00Z");
    expect(relativeWhen("2026-09-06T11:59:30Z", now)).toBe("just now");
    expect(relativeWhen("2026-09-06T11:40:00Z", now)).toBe("20 minutes ago");
    expect(relativeWhen("2026-09-06T11:00:00Z", now)).toBe("about an hour ago");
    expect(relativeWhen("2026-09-06T05:00:00Z", now)).toBe("7 hours ago");
    expect(relativeWhen("2026-09-05T12:00:00Z", now)).toBe("yesterday");
    expect(relativeWhen("2026-09-01T12:00:00Z", now)).toBe("5 days ago");
    expect(relativeWhen("2026-08-01T12:00:00Z", now)).toBe("last month");
    // A clock the other way round is not a story about the future.
    expect(relativeWhen("2026-09-06T12:00:30Z", now)).toBe("just now");
    expect(relativeWhen("not a date", now)).toBe("recently");
  });

  it("names a penny page by its title and a stranger's key readably", () => {
    // A page that takes money and mints nothing is keyed by its path.
    expect(nameForItemKey("almanac:no-such-page")).toEqual({
      name: "A page from the almanac",
      href: "/almanac/no-such-page",
    });
    /*
     * A door taking money before it reaches the menu is a real
     * possibility and the honest answer is still a readable one — the
     * window never prints an id with underscores in it, and never
     * silently drops a sale the books counted.
     */
    const stranger = nameForItemKey("some_new_door");
    expect(stranger.name).toBe("Some new door");
    expect(stranger.href).toBe("/menu");
  });
});
