import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HUMAN_SURFACES } from "@/routes/site-meta";

const BASE = "https://scvd.store";

/**
 * THE MARKDOWN SURFACE, DISCOVERABLE (scanner findings P17, S10/S11,
 * P20, 2026-08-27). Three related repairs:
 *
 * 1. No page emitted <link rel="alternate" type="text/markdown">, so
 *    a reader that prefers markdown had no machine way to learn a twin
 *    exists. The link goes only where a twin actually answers — a
 *    link tag to a 404 is worse than no tag.
 * 2. /sitemap.md did not exist. It derives from the SAME list that
 *    feeds sitemap.xml, so the two maps cannot disagree.
 * 3. llms.txt carried the verify template as a bare URL; URL-extracting
 *    scanners probed it braces-and-all and reported a dead link. The
 *    template is inline code now, everywhere in the guide.
 */
describe("markdown alternate links", () => {
  it("the storefront head points at /index.md", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/`, { headers: { "User-Agent": "browser/1" } })
    ).text();
    expect(html).toContain(
      '<link rel="alternate" type="text/markdown" href="https://scvd.store/index.md">',
    );
  });

  it("an item page points at its negotiated markdown twin", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/menu/hello`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(html).toContain(
      '<link rel="alternate" type="text/markdown" href="https://scvd.store/menu/hello">',
    );
  });

  it("a page with no markdown twin carries no alternate link", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/what`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).not.toContain('type="text/markdown"');
  });
});

describe("/sitemap.md", () => {
  it("serves markdown derived from the same list as sitemap.xml", async () => {
    const response = await SELF.fetch(`${BASE}/sitemap.md`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type") ?? "").toContain(
      "text/markdown",
    );
    const body = await response.text();
    // Derived assertion: iterate the exported source list, never a
    // hand-typed path (rule 46). Every human room the XML map carries,
    // the markdown map carries.
    for (const path of HUMAN_SURFACES) {
      expect(body, `sitemap.md is missing ${path}`).toContain(
        `${BASE}${path === "/" ? "/" : path}`,
      );
    }
    // And the shelf's parent, same as the XML gained on 08-27.
    expect(body).toContain(`${BASE}/menu`);
  });

  it("is reachable from /index.md, so it is not an orphan", async () => {
    const index = await (await SELF.fetch(`${BASE}/index.md`)).text();
    expect(index).toContain("/sitemap.md");
  });
});

describe("the verify template travels as code, never as a bare URL", () => {
  it("llms.txt has no extractable URL containing braces outside backticks", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    // Strip inline code spans, then extract what a URL scanner would:
    // anything left with a brace is the dead-link report waiting to
    // happen (P20 — scanners probe {id} verbatim).
    const outsideCode = text.replace(/`[^`]*`/g, "");
    const urls = outsideCode.match(/https?:\/\/[^\s)>"']+/g) ?? [];
    const braced = urls.filter((url) => url.includes("{"));
    expect(braced, `bare templated URLs: ${braced.join(", ")}`).toEqual([]);
  });

  it("the full guide keeps the same promise", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    const outsideCode = text.replace(/`[^`]*`/g, "");
    const urls = outsideCode.match(/https?:\/\/[^\s)>"']+/g) ?? [];
    expect(urls.filter((url) => url.includes("{"))).toEqual([]);
  });
});
