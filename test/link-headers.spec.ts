import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * RFC 8288 Link headers on the front door, and the one way they hurt.
 *
 * The relations are a map handed to a machine before it parses 84KB of
 * neon. A map naming a door that does not answer is worse than no map,
 * so this walks every href the apex advertises. That is the same rule
 * the rel=alternate tags already live under (finding P17), applied one
 * layer down where a broken entry is harder to notice.
 */
describe("the front door's Link headers", () => {
  it("advertises the map, and every door on it answers", async () => {
    const response = await SELF.fetch(BASE, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    const header = response.headers.get("Link") ?? "";
    expect(header, "the HTML apex sends no Link header").not.toBe("");

    for (const relation of [
      "canonical",
      "alternate",
      "sitemap",
      "service-desc",
      "service-doc",
      "api-catalog",
    ]) {
      expect(header, `no rel="${relation}" on the apex`).toContain(
        `rel="${relation}"`,
      );
    }

    const hrefs = [...header.matchAll(/<([^>]+)>/g)].map((match) => match[1]!);
    const dead: string[] = [];
    for (const href of new Set(hrefs)) {
      const target = await SELF.fetch(href);
      if (target.status !== 200) dead.push(`${href} → ${target.status}`);
    }
    expect(
      dead.join("\n"),
      "the apex advertises these in its Link header and they do not answer",
    ).toBe("");
  });

  it("serves the developer llms file at every name its room answers to", async () => {
    for (const path of [
      "/developers/llms.txt",
      "/docs/llms.txt",
      "/api/llms.txt",
    ]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, `${path} does not answer`).toBe(200);
      expect((await response.text()).length).toBeGreaterThan(200);
    }
  });

  it("serves the agent view to a caller who asked for it in the URL", async () => {
    const response = await SELF.fetch(`${BASE}/?mode=agent`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    // The same document Accept negotiation serves, not a second one.
    const negotiated = await SELF.fetch(BASE, {
      headers: { Accept: "text/markdown" },
    });
    expect(await response.text()).toBe(await negotiated.text());
  });
});
