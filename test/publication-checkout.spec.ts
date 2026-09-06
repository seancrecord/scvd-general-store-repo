import { env, SELF } from "cloudflare:test";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { publicationPage } from "@/lib/publication-checkout";
import { decodePaymentRequired } from "./helpers/payment";
const BASE = "https://scvd.store";
const bindings = env as unknown as Env;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  installFacilitatorMock();
  await bindings.ORDERS.put(KV_KEYS.gazetteIssue(901), JSON.stringify({ issue_number: 901, title: "Fixture", date: "2026-09-01", markdown: "A test page", contributors: [], tip_ids: [] }));
});
afterAll(() => vi.useRealTimers());

describe("publications explain the whole HTTP purchase without a menu-item assumption", () => {
  for (const [path, field] of [["/almanac", "entries"], ["/gazette", "issues"], ["/zodiac/archive", "pages"]] as const) {
    it(path, async () => {
      const response = await SELF.fetch(BASE + path + "?view=compact");
      const index = await response.json() as { checkout: Record<string, unknown>; [key: string]: unknown };
      expect(index.checkout.request_header).toBe("PAYMENT-SIGNATURE");
      expect(index.checkout.response_header).toBe("PAYMENT-RESPONSE");
      expect(index.checkout.delivery_mime_type).toBe("text/markdown");
      expect(index.checkout.per_purchase_certificate).toBe(false);
      const rows = index[field] as { url: string; buy_url: string; method: string; required_params: string[] }[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(8);
      expect(rows[0]!.buy_url).toBe(rows[0]!.url);
      expect(rows[0]!.method).toBe("GET");
      expect(rows[0]!.required_params).toEqual([]);
      const quote = await SELF.fetch(rows[0]!.buy_url);
      expect(quote.status).toBe(402);
      const body = await quote.json() as { checkout: Record<string, unknown> };
      expect(body.checkout).toEqual(index.checkout);
      expect(decodePaymentRequired(quote).accepts.length).toBeGreaterThan(0);
    });
  }
  it("links the separate paid collections from the compact shelf", async () => {
    const catalog = await (await SELF.fetch(BASE + "/menu.json?view=compact")).json() as { publications: { index_url: string }[] };
    expect(catalog.publications.map(row => row.index_url)).toEqual(["/almanac", "/gazette", "/zodiac/archive"].map(path => BASE + path + "?view=compact"));
  });
  it("keeps discovery's publication tiers equal to the real quote", async () => {
    const manifest = await (await SELF.fetch(BASE + "/.well-known/x402.json")).json() as { resources: { resource: string; accepts: unknown[] }[] };
    const row = manifest.resources.find(row => row.resource.includes("/almanac/"))!;
    const quote = await SELF.fetch(row.resource);
    const pick = (entry: unknown) => { const { network, amount, asset, payTo } = entry as Record<string, unknown>; return { network, amount, asset: typeof network === "string" && network.startsWith("eip155:") ? String(asset).toLowerCase() : asset, payTo }; };
    expect(row.accepts.map(pick)).toEqual(decodePaymentRequired(quote).accepts.map(pick));
  });
});


describe("compact publication pagination", () => {
  it("visits every entry exactly once and rejects invalid or nonexistent pages", () => {
    const entries = Array.from({ length: 19 }, (_, index) => index);
    const first = publicationPage(entries, BASE + "/almanac", "0")!;
    const second = publicationPage(entries, BASE + "/almanac", "1")!;
    const last = publicationPage(entries, BASE + "/almanac", "2")!;
    expect([...first.rows, ...second.rows, ...last.rows]).toEqual(entries);
    expect(first.pagination.next).toBe(BASE + "/almanac?view=compact&page=1");
    expect(last.pagination.next).toBeNull();
    for (const page of ["-1", "1.5", "3", "9999999", "wat"]) expect(publicationPage(entries, BASE + "/almanac", page)).toBeNull();
  });
  it("refuses invalid compact pages at each public index", async () => {
    for (const path of ["/almanac", "/gazette", "/zodiac/archive"]) {
      expect((await SELF.fetch(BASE + path + "?view=compact&page=-1")).status).toBe(400);
    }
  });
});
