import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { JSONLD_ACCEPTED_PAYMENT, JSONLD_PRICE_CURRENCY } from "@/lib/jsonld";

const BASE = "https://scvd.store";

/**
 * THE VALIDATOR'S CURRENCY AND THE TILL'S ASSET, KEPT APART
 * (2026-09-02).
 *
 * Search Console read every priced page and marked priceCurrency and
 * currency invalid, because "USDC" is not an ISO 4217 code and
 * Google's merchant-listing validator wants one, whatever schema.org
 * says about tickers. So every JSON-LD money field says "USD" — true,
 * the shelf is priced in dollars and USDC is a dollar stablecoin —
 * and every priced Offer says in words that USDC over x402 is what
 * settles. This walks the sitemap rather than a typed list of pages,
 * so a room added next month is covered without anybody remembering.
 */

interface Node {
  [key: string]: unknown;
}

async function sitemapUrls(): Promise<string[]> {
  const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
}

async function jsonLdBlocks(url: string): Promise<Node[]> {
  const response = await SELF.fetch(url, { headers: { Accept: "text/html" } });
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return [];
  const html = await response.text();
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]!) as Node,
  );
}

/** Every object reachable from the node, depth first. */
function* walk(value: unknown): Generator<Node> {
  if (Array.isArray(value)) {
    for (const item of value) yield* walk(item);
  } else if (value && typeof value === "object") {
    yield value as Node;
    for (const child of Object.values(value as Node)) yield* walk(child);
  }
}

describe("JSON-LD money fields", { timeout: 120_000 }, () => {
  it("never say USDC where a validator reads an ISO code, and always say it where a buyer reads words", async () => {
    const urls = await sitemapUrls();
    expect(urls.length).toBeGreaterThan(20);
    let pricedOffers = 0;
    for (const url of urls) {
      for (const block of await jsonLdBlocks(url)) {
        for (const node of walk(block)) {
          for (const field of ["priceCurrency", "currency"]) {
            if (field in node) {
              expect(node[field], `${url}: ${field}`).toBe(JSONLD_PRICE_CURRENCY);
            }
          }
          if (node["@type"] === "Offer" && Number(node["price"] ?? 0) > 0) {
            pricedOffers += 1;
            expect(node["acceptedPaymentMethod"], `${url}: priced Offer without the asset in words`).toBe(
              JSONLD_ACCEPTED_PAYMENT,
            );
          }
        }
      }
    }
    // The storefront alone carries every item as a Product; zero here means the walk read nothing.
    expect(pricedOffers).toBeGreaterThan(10);
  });
});
