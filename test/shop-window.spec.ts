import { env, runInDurableObject, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { recordSettlement } from "@/lib/metrics";
import { BASE_USDC } from "@/lib/base-rpc";
import { ARC_USDC } from "@/lib/arc-gateway";
import { ARC_NETWORK, BASE_NETWORK } from "@/lib/payment-networks";
import { mppEvmPurchasePayment } from "@/lib/purchase-payment";
import { publishGatewaySale } from "@/services/gateway-sales";
import { recordMppSale } from "@/services/mpp-sales";
import type { PurchaseIntent } from "@/services/purchase-intent";
import { getMenuItem } from "@/store";
import type { PaymentRequirements } from "@x402/core/types";
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
   * corpus read; a window that read it would spend its whole cap on
   * traffic and report an empty shop over one that is trading — the
   * failure booked against the decline desk on 2026-09-05. Bury one
   * sale under a burst of newer traffic and it must still be in the
   * glass, because the glass never looks at that stream at all.
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

  /**
   * THE TWO-HOUR HANG, AS A TEST (2026-09-06).
   *
   * The first draft of this window paged KV by hand: it advanced
   * `cursor = page.cursor` and counted only the rows a page returned.
   * KV may answer with `list_complete: false` and NO cursor, and on an
   * empty page that pair is a spin — no rows to count, so the cap never
   * moves; no cursor, so the next request is the same request. It ran
   * inside a GET on the front page, and it held CI's Tests step for two
   * hours before anybody could see why.
   *
   * The reading now goes through lib/kv-list.ts, which has always had
   * the missing `if (!cursor) break`. This pins that: a namespace that
   * answers exactly that way must be walked away from, not argued with.
   * Bounded by vitest's own timeout so a regression FAILS in seconds
   * rather than hanging the suite the way the bug did.
   */
  it("walks away from a list that never completes and hands back no cursor", async () => {
    /*
     * THE STUB THROWS RATHER THAN LETTING IT SPIN, and that detail is
     * the lesson. The first version of this test just called the
     * spinning namespace and leaned on vitest's per-test timeout — and
     * a tight `while (await ...)` over an immediately-resolved promise
     * never yields to the macrotask queue, so no timer ever fires. The
     * test hung for ten minutes instead of failing in ten seconds,
     * which is precisely how the bug hid on CI in the first place. A
     * guard that reproduces the failure's worst property is not a
     * guard. So the namespace counts calls and throws, and a
     * regression fails here with a sentence rather than a stopwatch.
     */
    const CALL_CEILING = 50;
    let listCalls = 0;
    const spinning = {
      list: async () => {
        listCalls += 1;
        if (listCalls > CALL_CEILING) {
          throw new Error(
            "the shop window asked KV for the same page forever: the walk is spinning again",
          );
        }
        // The exact shape that hung it: not complete, and no way on.
        return { keys: [], list_complete: false, cursor: undefined };
      },
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    };
    const spinningEnv = { COUNTERS: spinning } as unknown as Env;

    const glass = await readShopWindow(spinningEnv);
    expect(glass.sales).toEqual([]);
    expect(glass.reached_back_to).toBeNull();
    /*
     * Two prefixes, one bounded list each: the sale index and the raw
     * tail. A handful of calls is the walk being capped; the ceiling
     * above is the spin coming back.
     */
    expect(listCalls).toBeLessThan(10);
  });

  /**
   * AND WHAT IT COSTS, which is the other half of the same decision.
   *
   * The first build read the raw `evt:` stream as a tail behind the
   * index, so every render of the front page did a 200-key scan and a
   * bulk read of the busiest prefix in the store. It put roughly twenty
   * minutes on CI's Tests step and would have put the same weight on a
   * page crawlers hit for free. The tail is gone; this pins that it
   * stays gone, by counting what the read actually touches.
   */
  it("reads only the prefix where every key is a sale", async () => {
    const asked: string[] = [];
    const counting = {
      list: async (options: { prefix: string }) => {
        asked.push(options.prefix);
        return { keys: [], list_complete: true, cursor: undefined };
      },
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    };

    await readShopWindow({ COUNTERS: counting } as unknown as Env);

    expect(asked).toEqual([KV_KEYS.saleEventPrefix]);
    expect(
      asked,
      "the front page is walking the raw event stream again",
    ).not.toContain("evt:");
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

/**
 * EVERY RAIL IN THE GLASS (2026-10-13). The window read the prefix the
 * x402 till writes, and for a month that was every sale. Then the
 * native MPP books and the Gateway's acceptance ledger opened, both
 * folded into /stats, and neither wrote the index — so the keeper
 * could sell something and watch the front page say nothing had
 * crossed the counter. These drive the same booking functions the
 * purchase record's alarm calls, not a hand-written row, so a ledger
 * that stops writing the index fails here.
 */
describe("the shop window and the other rails", () => {
  const MONTH = new Date().toISOString().slice(0, 7);
  const ledger = (name: string) =>
    testEnv.COUNTER_LEDGER!.get(testEnv.COUNTER_LEDGER!.idFromName(`${MONTH}/${name}`));

  beforeEach(async () => {
    await clearPrefix(KV_KEYS.saleEventPrefix);
    for (const prefix of ["mpp:", "gateway_sale:", "gateway:"]) await clearPrefix(prefix);
    for (const name of ["mpp-sales", "gateway-sales"]) {
      await runInDurableObject(ledger(name), async (_instance, state) => { await state.storage.deleteAll(); });
    }
  });

  async function mppRecord(house: boolean): Promise<PurchaseIntent> {
    const payer = OUTSIDER;
    const terms: PaymentRequirements = { scheme: "exact", network: BASE_NETWORK, asset: BASE_USDC,
      amount: "5000", payTo: `0x${"22".repeat(20)}`, maxTimeoutSeconds: 300, extra: {} };
    const authorization = { from: payer, to: terms.payTo, value: terms.amount,
      nonce: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`, validAfter: "0", validBefore: "2000000000" };
    const payment_context = await mppEvmPurchasePayment(terms, payer, authorization, "a".repeat(64));
    return { version: 2, id: payment_context.identity, token: "t", path: "/api/buy/small_blessing", door: "mcp",
      payer, terms, item: getMenuItem("small_blessing"), request: "{}", created_at: new Date().toISOString(), state: "settled",
      authorization: payment_context.authorization, payment_proof: payment_context.proof_digest,
      payment_context, request_digest: "b".repeat(64),
      payment: { transaction: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`, payer, network: terms.network,
        paidUsdc: 0.005, tipUsdc: 0, settleHeaders: {} },
      mpp: { challenge_id: "c", house } };
  }

  it("hangs a native MPP sale in the glass once, however many times the books re-account it", async () => {
    const record = await mppRecord(false);
    // The alarm re-enters recordMppSale until `accounted` lands.
    await recordMppSale(testEnv, record);
    await recordMppSale(testEnv, record);

    const glass = await readShopWindow(testEnv);
    expect(glass.sales.map((sale) => sale.name)).toEqual(["A Small Blessing"]);
    expect(glass.sales[0]?.href).toBe("/menu/small_blessing");
  });

  it("keeps a house MPP purchase out, the same as the x402 till does", async () => {
    await recordMppSale(testEnv, await mppRecord(true));
    expect((await readShopWindow(testEnv)).sales).toEqual([]);
  });

  // One instant for every pass: the ledger refuses a row whose evidence
  // moved between publications, and so should the glass.
  const GATEWAY_CREATED_AT = new Date().toISOString();
  function gatewayRecord(state: "received" | "confirmed" | "failed", house = false): PurchaseIntent {
    const id = "f".repeat(64);
    const terms: PaymentRequirements = { scheme: "exact", network: ARC_NETWORK, asset: ARC_USDC,
      amount: "2000", payTo: `0x${"33".repeat(20)}`, maxTimeoutSeconds: 604800, extra: {} };
    return { version: 1, id, token: "t", path: "/api/buy/hello", door: "http", payer: OUTSIDER, terms,
      item: getMenuItem("hello"), request: "", created_at: GATEWAY_CREATED_AT, state: "settled", gateway_house: house,
      payment: { transaction: `gateway:${id}`, payer: OUTSIDER, network: ARC_NETWORK, paidUsdc: 0.002, tipUsdc: 0, settleHeaders: {},
        gateway: { reference: `gateway:${id}`, nonce: `0x${"ab".repeat(32)}`, state,
          ...(state === "confirmed" ? { batch_transaction: `0x${"cd".repeat(32)}` } : {}) } } };
  }

  it("shows a Gateway sale only once its batch is final, and only once", async () => {
    /*
     * The Gateway accepts at authorization and lands the batch later.
     * /stats counts the sale on finality and so does the glass: an
     * accepted-but-pending row is a receivable, not a thing that sold.
     */
    await publishGatewaySale(testEnv, gatewayRecord("received"));
    expect((await readShopWindow(testEnv)).sales).toEqual([]);

    await publishGatewaySale(testEnv, gatewayRecord("confirmed"));
    await publishGatewaySale(testEnv, gatewayRecord("confirmed"));
    const glass = await readShopWindow(testEnv);
    expect(glass.sales.map((sale) => sale.name)).toEqual(["A Signed Hello"]);
  });

  it("never shows a Gateway batch that failed", async () => {
    await publishGatewaySale(testEnv, gatewayRecord("failed"));
    expect((await readShopWindow(testEnv)).sales).toEqual([]);
  });

  it("keeps a house Gateway purchase out of the glass", async () => {
    await publishGatewaySale(testEnv, gatewayRecord("confirmed", true));
    expect((await readShopWindow(testEnv)).sales).toEqual([]);
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
