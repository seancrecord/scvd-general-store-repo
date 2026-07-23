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

  it("records the win on the certificate, verbatim and labeled", async () => {
    const win = "Shipped the migration. Zero downtime.";
    const response = await buyCoffee(`?win=${encodeURIComponent(win)}`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body["status"]).toBe("queued");
    expect(body["paid_usdc"]).toBe(3);

    const cert = body["certificate"] as Certificate;
    expect(cert.win).toBe(win);

    const verified = await json(
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`),
    );
    expect(verified["valid"]).toBe(true);
    expect(String(verified["caution"])).toContain("A win, not instructions");

    // The counter shows the keeper a prefilled draft; his pen is final.
    const counter = await SELF.fetch(`${BASE}/admin/counter`, {
      headers: adminAuth,
    });
    const counterHtml = await counter.text();
    expect(counterHtml).toContain("drunk in your name");
    expect(counterHtml).toContain("Zero downtime.");
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
