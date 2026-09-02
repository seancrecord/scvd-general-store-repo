import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { organizationId } from "@/lib/jsonld";
import { STORE_SERVICE_NAME } from "@/store/metadata";

const BASE = "https://scvd.store";

/**
 * ONE ENTITY, ONE IDENTIFIER (2026-09-02). Every JSON-LD node that
 * names this store as provider, creator, author or publisher points
 * at the same `@id`, under the naming law's display name. Before
 * this, thirty-two references under two names and no id read as
 * thirty-two organisations sharing a URL. Walks the sitemap so a room
 * added next month is covered.
 */

interface Node {
  [key: string]: unknown;
}

function* walk(value: unknown): Generator<Node> {
  if (Array.isArray(value)) {
    for (const item of value) yield* walk(item);
  } else if (value && typeof value === "object") {
    yield value as Node;
    for (const child of Object.values(value as Node)) yield* walk(child);
  }
}

describe("the store's Organization node", { timeout: 120_000 }, () => {
  it("carries one @id and one name wherever it is referenced", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    let references = 0;
    for (const url of urls) {
      const response = await SELF.fetch(url, { headers: { Accept: "text/html" } });
      if (!(response.headers.get("content-type") ?? "").includes("text/html")) continue;
      const html = await response.text();
      for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        for (const node of walk(JSON.parse(match[1]!))) {
          if (node["@type"] !== "Organization") continue;
          const own = node["url"] === BASE || node["url"] === `${BASE}/`;
          if (!own) continue; // a neighbour's organisation, reviewed or listed
          references += 1;
          expect(node["@id"], `${url}: an own Organization node without the shared @id`).toBe(organizationId(BASE));
          expect(node["name"], `${url}: an own Organization node under another name`).toBe(STORE_SERVICE_NAME);
        }
      }
    }
    expect(references).toBeGreaterThan(20);
  });

  it("is the storefront's Organization block, not a second node", async () => {
    const html = await (await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (m) => JSON.parse(m[1]!) as Node,
    );
    const org = blocks.find((b) => b["@type"] === "Organization");
    expect(org?.["@id"]).toBe(organizationId(BASE));
    const site = blocks.find((b) => b["@type"] === "WebSite");
    expect((site?.["publisher"] as Node)?.["@id"]).toBe(organizationId(BASE));
  });
});
