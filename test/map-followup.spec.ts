import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { getMenuItem } from "@/store";
import { FREE_INSTRUMENTS, ROUTES } from "@/lib/when-to-buy";
import { PREFLIGHT_VERSION_NEXT, PREFLIGHT_VERSIONS } from "@/services/preflight";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";
const PRICE_NOTES = ["signature_agent_card", "the_statement", "luckies", "coffees_for_closers"];

describe("the map's price contradictions stay closed", () => {
  beforeAll(() => installFacilitatorMock());

  it.each(PRICE_NOTES)("%s quotes its current price, including after a price change", (id) => {
    const item = getMenuItem(id)!;
    const original = item.price_usdc;
    try {
      for (const price of [original, original + 0.37]) {
        item.price_usdc = price;
        expect(item.note_402).toContain(`$${price}`);
      }
    } finally {
      item.price_usdc = original;
    }
  });

  it.each(PRICE_NOTES)("%s carries the same price in its listing and unpaid challenge", async (id) => {
    const item = getMenuItem(id)!;
    for (const accept of ["text/markdown", "text/html"]) {
      const response = await SELF.fetch(`${BASE}/menu/${id}`, { headers: { Accept: accept } });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(item.note_402.replaceAll("'", accept === "text/html" ? "&#39;" : "'"));
    }
    const menu = await (await SELF.fetch(`${BASE}/menu.json`)).json() as {
      items: { id: string; price_usdc: number; note_402: string }[];
    };
    const listing = menu.items.find((entry) => entry.id === id)!;
    expect(listing.price_usdc).toBe(item.price_usdc);
    expect(listing.note_402).toBe(item.note_402);
    const response = await SELF.fetch(`${BASE}/api/buy/${id}`);
    expect(response.status).toBe(402);
    const body = await response.json() as { error: string };
    const challenge = JSON.parse(atob(response.headers.get("PAYMENT-REQUIRED")!)) as { accepts: { amount: string }[] };
    expect(body.error).toContain(`$${item.price_usdc}`);
    expect(challenge.accepts.some((entry) => Number(entry.amount) === Math.round(item.price_usdc * 1e6))).toBe(true);
  });
});

describe("routing distinguishes different jobs and starts with existing free checks", () => {
  it("does not sell a page check as a paid purchase attempt", () => {
    const launch = ROUTES.find((route) => route.items.includes("launch_check"))!;
    expect(launch.items).not.toContain("onpage_audit");
    expect(launch.free).toContain("preflight_endpoint");
  });

  it("does not sell completed-transaction evidence as authorization before acting", () => {
    const mandate = ROUTES.find((route) => route.items.includes("the_mandate"))!;
    expect(mandate.items).not.toContain("attestation_bundle");
    expect(ROUTES.find((route) => route.items.includes("attestation_bundle"))?.job).toMatch(/settled|completed|already happened/);
  });

  it("routes page and Web Bot Auth checks to their own free desks", () => {
    const page = ROUTES.find((route) => route.items.includes("onpage_audit"))!;
    const card = ROUTES.find((route) => route.items.includes("signature_agent_card"))!;
    expect(page.items).not.toContain("signature_agent_card");
    expect(page.free).toContain("/api/onpage");
    expect(card.free).toContain("/api/bot-auth/check");
    for (const path of ["/api/onpage", "/api/bot-auth/check"]) {
      expect(FREE_INSTRUMENTS.some((entry) => !entry.isTool && entry.reach(BASE).includes(path))).toBe(true);
    }
  });

  it("advertises the current MCP preflight battery in the matching HTTP link", () => {
    expect(FREE_INSTRUMENTS.find((entry) => entry.name === "Preflight")!.reach(BASE))
      .toContain(`/api/preflight/${PREFLIGHT_VERSION_NEXT}`);
  });
});

describe("preflight documentation sends callers to the battery they requested", () => {
  it.each(PREFLIGHT_VERSIONS)("%s keeps its request URL and ladder consistent", async (battery) => {
    const response = await SELF.fetch(`${BASE}/api/preflight/${battery}`);
    const body = await response.json() as {
      version: string; url: string;
      the_ladder: { free_first: { endpoint: string }; paid: { id: string; price_usdc: number }[] };
      what_it_cannot_check: string[];
    };
    expect(body.version).toBe(battery);
    expect(body.url).toBe(`${BASE}/api/preflight/${battery}`);
    expect(body.the_ladder.free_first.endpoint).toContain(body.url);
    expect(body.what_it_cannot_check.find((line) => line.startsWith("Delivery."))).toContain("launch_check");
    const purchaseAttempt = body.the_ladder.paid.find((item) => item.id === "launch_check");
    expect(purchaseAttempt?.price_usdc).toBe(getMenuItem("launch_check")!.price_usdc);
  });
});
