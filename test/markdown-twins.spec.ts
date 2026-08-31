import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE `.md` SUFFIX, AND THE LINE IT MUST NOT CROSS.
 *
 * index.ts answers `X.md` by asking the store for `X` with
 * `Accept: text/markdown` and passing the answer through. That makes a
 * twin exist exactly where a real markdown representation exists — and
 * the value of the whole mechanism depends on the second half: a page
 * that only speaks HTML must still 404, because a markdown rendering
 * invented by stripping tags would publish a document nobody wrote.
 */
describe("the .md twin fallback", () => {
  it("serves a twin wherever the page really speaks markdown", async () => {
    for (const path of [
      "/developers",
      "/deprecation",
      "/defects",
      "/api/preflight/v1",
      "/api/preflight/v2",
    ]) {
      const twin = await SELF.fetch(`${BASE}${path}.md`);
      expect(twin.status, `${path}.md does not answer`).toBe(200);
      expect(twin.headers.get("content-type")).toContain("text/markdown");

      const body = await twin.text();
      expect(body.length).toBeGreaterThan(200);

      // One document at two addresses, and it says so.
      expect(twin.headers.get("Link")).toContain(`<${BASE}${path}>; rel="canonical"`);

      // The twin IS the negotiated representation, not a second text.
      const negotiated = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/markdown" },
      });
      expect(await negotiated.text()).toBe(body);
    }
  });

  it("refuses to invent markdown for a page that has none", async () => {
    for (const path of [
      // An HTML-only room. The honest answer is that no markdown
      // representation exists, not a de-tagged approximation of one.
      "/what.md",
      "/nope.md",
    ]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, `${path} should not answer`).toBe(404);
    }
  });

  it("never shadows a twin that has its own bytes", async () => {
    // These are real routes with their own tests; the fallback runs in
    // notFound and must never be reached for them.
    for (const path of ["/index.md", "/pricing.md", "/agents.md", "/mcp.md"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, `${path}`).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
    }
  });

  it("leaves the paid shelf alone", async () => {
    /*
     * `/api/buy/{id}.md` would make the till sign a full 402 challenge
     * to produce a 404, once per item for a crawler walking the shelf.
     * No payment could be taken either way; this is a cost bound.
     */
    const response = await SELF.fetch(`${BASE}/api/buy/hello.md`);
    expect(response.status).toBe(404);
  });

  it("keeps JSON the default on the API doors", async () => {
    // A caller who stated no preference on an API door wants the
    // machine form. Markdown is opt-in, by header or by suffix.
    const response = await SELF.fetch(`${BASE}/api/preflight/v1`);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

/**
 * The free half of the store, in structured data.
 *
 * The shelf has been Products with Offers since it shipped. The three
 * free desks had nothing — which is the half an answer engine most
 * needs to describe, because "is there anything here I can use without
 * paying" is the first question anyone asks about a paid API.
 */
describe("the free instruments in JSON-LD", () => {
  it("declares them as Services, free, and provably so", async () => {
    const html = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();

    const blocks = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ].map((match) => JSON.parse(match[1]!) as Record<string, unknown>);

    const services = blocks.flatMap((block) => {
      const elements = block["itemListElement"];
      if (!Array.isArray(elements)) return [];
      return elements
        .map((entry) => (entry as Record<string, unknown>)["item"])
        .filter(
          (item): item is Record<string, unknown> =>
            !!item &&
            (item as Record<string, unknown>)["@type"] === "Service",
        );
    });

    expect(services.length).toBeGreaterThanOrEqual(3);
    for (const service of services) {
      expect(service["isAccessibleForFree"]).toBe(true);
      expect((service["offers"] as Record<string, unknown>)["price"]).toBe(0);
      const url = String(service["url"]);
      expect(url.startsWith(BASE)).toBe(true);
      // A Service naming a door that does not answer is the same
      // defect as a sameAs naming a page nobody wrote.
      const response = await SELF.fetch(url);
      expect([200, 400, 405]).toContain(response.status);
    }
  });

  it("publishes no rating of itself, anywhere in the structured data", async () => {
    /*
     * The store's first sentence is that nothing here is a score, a
     * rating, or a ranking. A scorecard offers a point for an
     * AggregateRating; a shop that would not put stars on somebody
     * else's endpoint has no business wearing them. See the declined
     * positions at /developers.
     */
    const html = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).not.toContain("AggregateRating");
    expect(html).not.toContain('"@type":"Review"');
  });
});
