import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "@/index";
import { KV_KEYS } from "@/lib/kv-keys";
import { manifestAccepts, priceTiersUsdc } from "@/lib/payments";
import { listingSpec } from "@/lib/listing-spec";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { MENU_ITEMS } from "@/store";
import type { Env } from "@/types";
import { productionShape } from "./helpers/production-shape";

const BASE = "https://scvd.store";
const enabled = productionShape(env as unknown as Env);

// Production had eight almanac pages and four seller issues when the
// empty-KV guard passed a 572 KB catalog. Include publication growth,
// all checkout rails, and non-ASCII titles in the measured document.
beforeEach(async () => {
  for (const prefix of [KV_KEYS.almanacEntryPrefix, KV_KEYS.openForBusinessIssuePrefix, KV_KEYS.gazettePrefix]) {
    const keys = await enabled.ORDERS.list({ prefix });
    await Promise.all(keys.keys.map(({ name }) => enabled.ORDERS.delete(name)));
  }
  for (let n = 1; n <= 8; n++) {
    await enabled.ORDERS.put(KV_KEYS.almanacEntry(`budget-${n}`), JSON.stringify({
      slug: `budget-${n}`, title: `A keeper’s page — ${n}`, date: "2026-10-12",
      teaser: "A publication fixture.", markdown: "A publication fixture.",
    }));
  }
  for (let n = 1; n <= 4; n++) {
    await enabled.ORDERS.put(KV_KEYS.openForBusinessIssue(`2026-W${n + 35}`), JSON.stringify({
      week: `2026-W${n + 35}`, title: `Seller’s issue — ${n}`, date: "2026-10-12",
      teaser: "A publication fixture.", number_of_the_week: "", markdown: "A publication fixture.",
    }));
    await enabled.ORDERS.put(KV_KEYS.gazetteIssue(n), JSON.stringify({
      issue_number: n, title: `Gazette — ${n}`, date: "2026-10-12", markdown: "A publication fixture.",
      contributors: [], tip_ids: [], signature: "fixture", public_key: "fixture",
    }));
  }
});

describe("discovery with a populated publication shelf", () => {
  it.each(["/.well-known/x402", "/.well-known/x402.json"])("%s stays readable without dropping purchase options", async (path) => {
    const response = await app.request(`${BASE}${path}`, {}, enabled);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(500_000);
    const body = JSON.parse(text);
    for (const item of MENU_ITEMS) {
      const row = body.resources.find((r: { url: string }) => r.url === `${BASE}/api/buy/${item.id}`);
      expect(row, item.id).toBeDefined();
      expect(row.accepts).toEqual(manifestAccepts(enabled, priceTiersUsdc(item)));
      expect(row.inputSchema).toEqual({ type: "object", ...buyInputSchema(item) });
      expect(row.spec_url).toBe(`${BASE}/menu/${item.id}`);
      expect(row.made_by).toEqual(listingSpec(item, BASE).outputs.made_by);
    }
    for (let n = 1; n <= 8; n++) expect(body.resources.some((r: { url: string }) => r.url === `${BASE}/almanac/budget-${n}`)).toBe(true);
    for (let n = 1; n <= 4; n++) {
      for (const suffix of [`open-for-business/2026-W${n + 35}`, `gazette/issue-${n}`]) {
        const row = body.resources.find((r: { url: string }) => r.url === `${BASE}/${suffix}`);
        expect(row).toBeDefined();
        expect(row.accepts.length).toBeGreaterThan(0);
        expect(row.checkout).toBeDefined();
      }
    }
  });

  it("the advertised specification is complete at its free JSON destination", async () => {
    const response = await app.request(`${BASE}/.well-known/x402.json`, {}, enabled);
    const body = await response.json() as { resources: { url: string; spec_url?: string }[] };
    for (const item of MENU_ITEMS) {
      const row = body.resources.find(r => r.url === `${BASE}/api/buy/${item.id}`)!;
      expect(row.spec_url).toBeDefined();
      const full = await app.request(row.spec_url!, { headers: { Accept: "application/json" } }, enabled);
      expect(full.status).toBe(200);
      expect((await full.json() as { spec: unknown }).spec).toEqual(listingSpec(item, BASE));
    }
  });
});
