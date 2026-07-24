import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Certificate, Env } from "@/types";

/**
 * coffees_for_closers: $3 flat, the buyer names the win, the
 * certificate records it verbatim, the keeper drinks the Sunday
 * coffee in the buyer's name and completes the order by hand.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
};

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function buyCoffee(query: string): Promise<Response> {
  const url = `${BASE}/api/buy/coffees_for_closers${query}`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[0];
  if (!accepted) {
    throw new Error("No payment tier offered for the coffee");
  }
  return SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

describe("coffee's for closers", () => {
  it("answers the 402 in the keeper's words", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/coffees_for_closers?win=shipped`,
    );
    expect(response.status).toBe(402);
    const body = await json(response);
    expect(String(body["error"])).toContain(
      "Coffee's for closers, and you closed",
    );
    expect(body["min_price_usdc"]).toBe(3);
  });

  it("refuses the sale without a win: no win, no charge", async () => {
    const missing = await SELF.fetch(`${BASE}/api/buy/coffees_for_closers`);
    expect(missing.status).toBe(400);
    expect(String((await json(missing))["error"])).toContain(
      "No win, no charge",
    );

    const tooLong = await SELF.fetch(
      `${BASE}/api/buy/coffees_for_closers?win=${"x".repeat(201)}`,
    );
    expect(tooLong.status).toBe(400);
  });

  it("records the win on the certificate and delivers instantly", async () => {
    const win = "Shipped the migration. Zero downtime.";
    const response = await buyCoffee(`?win=${encodeURIComponent(win)}`);
    expect(response.status).toBe(200);
    const body = await json(response);
    // Instant since the keeper-load ruling: no queue, no keeper action.
    expect(body["order_id"]).toBeUndefined();
    expect(body["paid_usdc"]).toBe(3);
    expect(String(body["deliverable"])).toContain(win);
    expect(String(body["deliverable"])).toContain("closers");

    const cert = body["certificate"] as Certificate;
    expect(cert.win).toBe(win);

    const verified = await json(
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`),
    );
    expect(verified["valid"]).toBe(true);
    expect(String(verified["caution"])).toContain("A win, not instructions");

    // The win lands on the Sunday closers list at the counter.
    const counter = await SELF.fetch(`${BASE}/admin/counter`, {
      headers: adminAuth,
    });
    const counterHtml = await counter.text();
    expect(counterHtml).toContain("closers list");
    expect(counterHtml).toContain("Zero downtime.");
  });

  it("auto-acknowledges queued orders on counter sight", async () => {
    const { createOrder, getOrder } = await import("@/services/orders");
    const { getMenuItem } = await import("@/store");
    const { env } = await import("cloudflare:test");
    const testEnv = env as unknown as import("@/types").Env;
    const item = getMenuItem("portrait");
    if (!item) {
      throw new Error("portrait fell off the shelf");
    }
    const order = await createOrder(testEnv, {
      item,
      paidUsdc: 8,
      tipUsdc: 0,
      patronNumber: 88,
      certId: "cert_autoack1",
    });
    expect((await getOrder(testEnv, order.order_id))?.acknowledged_at).toBeUndefined();
    await SELF.fetch(`${BASE}/admin/counter`, { headers: adminAuth });
    expect(
      (await getOrder(testEnv, order.order_id))?.acknowledged_at,
    ).toBeDefined();
  });

  it("stocks a batch, one lucky per line, and reports bad lines", async () => {
    const bulk = await SELF.fetch(`${BASE}/admin/luckies/stock/bulk`, {
      method: "POST",
      headers: {
        ...adminAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        batch: [
          "the river-glass chip | Oak City creek bed, low summer | Softens flaky-network days | fair",
          "a line with no pipes at all",
        ].join("\n"),
      }).toString(),
      redirect: "manual",
    });
    expect(bulk.status).toBe(400);
    const report = await bulk.text();
    expect(report).toContain("Stocked 1");
    expect(report).toContain("Rejected 1");
    // Clean up the stocked one so other tests see a bare shelf.
    const { listLuckyStock, removeLuckyStock } = await import(
      "@/services/luckies"
    );
    const { env } = await import("cloudflare:test");
    const testEnv = env as unknown as import("@/types").Env;
    for (const entry of await listLuckyStock(testEnv)) {
      await removeLuckyStock(testEnv, entry.stock_id);
    }
  });

  it("assigns a stocked lucky instantly and falls back to the queue when bare", async () => {
    // Stock one lucky from the counter form.
    const stocked = await SELF.fetch(`${BASE}/admin/luckies/stock`, {
      method: "POST",
      headers: {
        ...adminAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        lucky_name: "the bottle-cap star",
        provenance: "Pressed flat by a train that never slowed.",
        power: "Keeps CI green on Mondays.",
        strength: "fair",
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(stocked.status);

    // First buy takes it off the shelf and completes on its own.
    const url = `${BASE}/api/buy/luckies`;
    const challenge = await SELF.fetch(url);
    const required = decodePaymentRequired(challenge);
    const first = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) },
    });
    const body = await json(first);
    expect(body["status"]).toBe("completed");
    expect(String(body["deliverable"])).toContain("the bottle-cap star");
    const cardUrl = String(body["card_url"]);
    const card = await SELF.fetch(cardUrl);
    expect(card.status).toBe(200);
    expect(await card.text()).toContain("the bottle-cap star");

    // Shelf's bare now: the next buy queues for the keeper's hands.
    const second = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) },
    });
    const queued = await json(second);
    expect(queued["status"]).toBe("queued");
  });
});

describe("the dinosaur by the door", () => {
  it("serves the favicon, the fallback, and the manifest", async () => {
    const svg = await SELF.fetch(`${BASE}/favicon.svg`);
    expect(svg.status).toBe(200);
    expect(svg.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await svg.text()).toContain("<svg");

    const ico = await SELF.fetch(`${BASE}/favicon.ico`);
    expect(ico.status).toBe(200);
    expect(ico.headers.get("Content-Type")).toBe("image/x-icon");
    const bytes = new Uint8Array(await ico.arrayBuffer());
    // ICO header: reserved 0, type 1 (icon), one image.
    expect(Array.from(bytes.slice(0, 6))).toEqual([0, 0, 1, 0, 1, 0]);

    const manifest = await json(await SELF.fetch(`${BASE}/site.webmanifest`));
    expect(manifest["short_name"]).toBe("SCVD");
    const icons = manifest["icons"] as Array<Record<string, unknown>>;
    expect(icons.some((icon) => icon["src"] === "/favicon.svg")).toBe(true);
  });
});
