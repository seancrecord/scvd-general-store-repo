import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HUMAN_SURFACES } from "@/routes/site-meta";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * BEING PUBLISHED, AS OPPOSED TO MERELY EXISTING.
 *
 * Four rooms built between 2026-07-29 and 07-30 — the receipts page,
 * the dependency page, the corrections record and the visitors'
 * register — went live with no sitemap line and no meta description.
 * Every small room in the store renders through one function, and that
 * function emitted no description, no canonical and no og tags at all,
 * so a search engine and an answer engine alike had nothing to quote
 * but whatever text happened to land first on the page.
 *
 * That is the quiet version of not shipping. These tests make it loud:
 * a page in the sitemap must answer, and a page that answers must say
 * what it is. The description field is now REQUIRED by the type, so
 * forgetting one is a compile error rather than a thing discovered
 * months later in a search console nobody opened.
 */
describe("every room in the sitemap is a room", () => {
  it("answers on every listed path", async () => {
    for (const path of HUMAN_SURFACES) {
      const response = await SELF.fetch(`${BASE}${path}`, { headers: HTML });
      expect(response.status, `${path} is in the sitemap and does not answer`).toBe(
        200,
      );
    }
  });

  it("says what it is, in a sentence something can quote", async () => {
    for (const path of HUMAN_SURFACES) {
      const page = await (
        await SELF.fetch(`${BASE}${path}`, { headers: HTML })
      ).text();
      const description = /<meta name="description" content="([^"]*)"/.exec(page);
      expect(description, `${path} has no meta description`).toBeTruthy();
      const said = description?.[1] ?? "";
      // Long enough to be an answer, not a keyword smear.
      expect(said.length, `${path}'s description is too thin to quote`).toBeGreaterThan(
        60,
      );
      expect(said.length, `${path}'s description will be truncated`).toBeLessThan(
        320,
      );
    }
  });

  it("gives an answer engine a title and a card to work from", async () => {
    for (const path of HUMAN_SURFACES) {
      const page = await (
        await SELF.fetch(`${BASE}${path}`, { headers: HTML })
      ).text();
      expect(page, `${path} has no og:title`).toContain('property="og:title"');
      expect(page, `${path} has no og:description`).toContain(
        'property="og:description"',
      );
    }
  });

  it("carries the four rooms that were built and never published", async () => {
    // The specific regression. Named rather than left to the loop
    // above, because the loop passes trivially if somebody deletes an
    // entry from the list instead of fixing the page.
    for (const path of ["/neighbours", "/stack", "/corrections", "/visitors"]) {
      expect(
        HUMAN_SURFACES as readonly string[],
        `${path} is still missing from the sitemap`,
      ).toContain(path);
    }
  });
});

describe("the sitemap itself", () => {
  it("lists every human room and every item page", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    for (const path of HUMAN_SURFACES) {
      expect(xml, `${path} missing from sitemap.xml`).toContain(
        `<loc>${BASE}${path}</loc>`,
      );
    }
    // Per-item pages carry the only per-item prose that exists, and the
    // storefront's JSON-LD already names these exact URLs as offer URLs.
    for (const item of MENU_ITEMS) {
      expect(xml, `/menu/${item.id} missing from sitemap.xml`).toContain(
        `<loc>${BASE}/menu/${item.id}</loc>`,
      );
    }
  });

  it("dates every entry, because no date reads as never changed", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    const locs = xml.match(/<loc>/g)?.length ?? 0;
    const mods = xml.match(/<lastmod>/g)?.length ?? 0;
    expect(locs).toBeGreaterThan(0);
    expect(mods).toBe(locs);
  });
});

describe("llms.txt, the map agents actually read", () => {
  it("names the rooms that exist now", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    for (const path of ["/neighbours", "/visitors", "/stack", "/corrections"]) {
      expect(text, `llms.txt never mentions ${path}`).toContain(path);
    }
  });

  it("carries no hardcoded count of anything", async () => {
    // A count in a static document is a lie with a timer on it — the
    // exact defect deleted from the published skill bundle two days
    // earlier, which had said "twenty-one items" against a shelf of
    // twenty-three. llms.txt said "five of them" about a corrections
    // record that now holds six.
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(text).not.toMatch(
      /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty[- ]\w+)\s+(of them|items|corrections|entries|goods)\b/i,
    );
  });
});
