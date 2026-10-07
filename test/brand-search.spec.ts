import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { STORE_SERVICE_NAME } from "@/store/metadata";
import { STOREFRONT_COPY, OPEN_SIGNS } from "@/store/copy/storefront";
import { ENTITY_PROFILES, KEEPER_SOCIAL, EXTERNAL_RECORDS } from "@/store/trust-signals";
import { renderSimplePage } from "@/pages/simple-page";
import { isRecord } from "@/types";
import { ROOMS, UNLISTED_ROOMS } from "@/store/rooms";
import { renderStorefront } from "@/pages/storefront-page";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

async function selectedText(html: string, selector: string): Promise<string> {
  let text = "";
  await new HTMLRewriter().on(selector, { text(chunk) { text += chunk.text; } })
    .transform(new Response(html)).text();
  return text;
}

async function snippetText(html: string): Promise<string> {
  // Exercise actual markup boundaries, including nested exclusions. A string
  // search over the original HTML would pass on invisible metadata alone.
  const eligible = await new HTMLRewriter()
    .on("head, script, style, [data-nosnippet], .sr-only", { element(el) { el.remove(); } })
    .transform(new Response(html)).text();
  return selectedText(eligible, "body");
}

describe("brand search presentation", () => {
  it("gives people the brand and existing service summary before the decorative opening", async () => {
    const html = await (await SELF.fetch(BASE, { headers: HTML })).text();
    expect(await selectedText(html, ".store-intro")).toContain(STORE_SERVICE_NAME);
    expect(await selectedText(html, ".store-intro")).toContain(STOREFRONT_COPY.metaDescription);
    const intro = html.indexOf('class="store-intro"');
    expect(intro).toBeGreaterThan(-1);
    expect(intro).toBeLessThan(html.indexOf('class="open-sign"'));
    expect(await snippetText(html)).toContain(STOREFRONT_COPY.metaDescription);
  });

  it("keeps jokes and support prose visible while excluding them from snippets", async () => {
    const html = await (await SELF.fetch(BASE, { headers: HTML })).text();
    const human = await selectedText(html, "body");
    const snippet = await snippetText(html);
    expect(human).toContain(STOREFRONT_COPY.intentLine);
    expect(human).toContain("The bell has been rung");
    expect(OPEN_SIGNS.some((line) => human.includes(line))).toBe(true);
    expect(snippet).not.toContain(STOREFRONT_COPY.intentLine);
    expect(snippet).not.toContain("The bell has been rung");
    for (const line of OPEN_SIGNS) expect(snippet).not.toContain(line);
    expect(snippet).toContain("WHAT THIS PLACE IS");
  });

  it("distinguishes identity profiles from outside reports in the Organization node", async () => {
    const html = await (await SELF.fetch(BASE, { headers: HTML })).text();
    const nodes: unknown[] = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1]!));
    const org = nodes.find((node) => isRecord(node) && node["@type"] === "Organization");
    if (!isRecord(org)) throw new Error("Organization missing");
    expect(org.sameAs).toEqual([...new Set([...KEEPER_SOCIAL, ...ENTITY_PROFILES])]);
    if (!Array.isArray(org.subjectOf)) throw new Error("Outside records missing");
    const reportedUrls = org.subjectOf.filter(isRecord).map((node) => node.url);
    for (const record of EXTERNAL_RECORDS) expect(reportedUrls).toContain(record.url);
  });

  it("keeps a visitor's wall text out of the store's search description", async () => {
    const message = "A unique visitor wall message.";
    const html = renderStorefront({
      weekNote: "A test note.", bellCount: 0, recordWeeks: 0,
      recordTruncated: false, patronCount: null,
      guestbook: [{ id: "seo-fixture", name: "Visitor", message, date: "2026-10-07T12:00:00.000Z" }],
    });
    expect(await selectedText(html, ".wall-slips")).toContain(message);
    expect(await snippetText(html)).not.toContain(message);
  });

  it("preserves the keeper's existing exclusions from search", () => {
    expect(UNLISTED_ROOMS.length).toBeGreaterThan(0);
    for (const room of UNLISTED_ROOMS) {
      const html = renderSimplePage({ title: room.name, description: room.name, path: room.path, bodyHtml: "<p>Room body.</p>" });
      expect(html).toContain('<meta name="robots" content="noindex">');
    }
  });

  for (const path of ["/", "/what", "/developers", "/menu", "/menu/hello", "/conformance", "/corpus"]) {
    it(`keeps identity and canonical metadata consistent on ${path}, including tracking URLs`, async () => {
      const response = await SELF.fetch(`${BASE}${path}?utm_source=brand-check`, { headers: HTML });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Robots-Tag") ?? "").not.toMatch(/noindex|none/i);
      const html = await response.text();
      expect(html).toContain(`<link rel="canonical" href="${BASE}${path}">`);
      expect(html).toContain(`<meta property="og:url" content="${BASE}${path}">`);
      expect(html).toContain(`<meta property="og:site_name" content="${STORE_SERVICE_NAME}">`);
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
    });
  }

  it("keeps site-wide navigation out of room snippets without hiding page content or links", async () => {
    const html = renderSimplePage({ title: "Example", description: "Example description", path: "/what", bodyHtml: "<p>Unique room explanation.</p>" });
    expect(await selectedText(html, ".nav-home")).toContain(STORE_SERVICE_NAME);
    for (const room of ROOMS.filter((room) => room.path !== "/what")) {
      expect(html).toContain(`href="${room.path}"`);
    }
    expect(await snippetText(html)).toContain("Unique room explanation.");
    expect(await snippetText(html)).not.toContain("Front of the store");
  });

  it("escapes page-specific social metadata and never invents a URL for a pathless page", () => {
    const html = renderSimplePage({ title: 'A "title" <test>', description: 'A "description" <test>', bodyHtml: "<p>Body</p>" });
    expect(html).toContain('<meta name="twitter:title" content="A &quot;title&quot; &lt;test&gt;, scvd.store">');
    expect(html).toContain('<meta name="twitter:description" content="A &quot;description&quot; &lt;test&gt;">');
    expect(html).not.toContain('property="og:url"');
  });
});
