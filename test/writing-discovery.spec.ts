import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { WRITTEN_ABOUT, INDEPENDENT_REPORTING } from "@/store/copy/asked-for";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

async function home() {
  const response = await SELF.fetch(BASE, { headers: { Accept: "text/html" } });
  expect(response.status).toBe(200);
  const html = await response.text();
  const nodes: unknown[] = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]!));
  const org = nodes.find((node) => isRecord(node) && node["@type"] === "Organization");
  if (!isRecord(org) || !Array.isArray(org.subjectOf)) throw new Error("Organization articles missing");
  return { html, org, subjects: org.subjectOf.filter(isRecord) };
}

async function readableSection(html: string) {
  let text = "";
  const links: string[] = [];
  const visible = await new HTMLRewriter()
    .on("head, script, style, [hidden], [data-nosnippet], .sr-only", { element(el) { el.remove(); } })
    .transform(new Response(html)).text();
  await new HTMLRewriter()
    .on("#writing-recognition", { text(chunk) { text += chunk.text; } })
    .on("#writing-recognition a", { element(el) { links.push(el.getAttribute("href") ?? ""); } })
    .transform(new Response(visible)).text();
  // HTMLRewriter preserves entities in text chunks; decode the emitted
  // escapes so the assertion compares what a reader sees with the metadata.
  text = text.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return { text, links };
}

describe("writing discovery", () => {
  it("joins both publication profiles to one keeper associated with the store", async () => {
    const { html, org, subjects } = await home();
    expect(html).toContain('id="keeper"');
    for (const piece of WRITTEN_ABOUT) {
      const author = subjects.find((node) => node.url === piece.url)?.author;
      expect(author).toMatchObject({
        "@type": "Person", "@id": `${BASE}/#keeper`, name: "keeper",
        sameAs: ["https://hackernoon.com/u/keeper-scvd", "https://dev.to/seancrecord"],
        worksFor: { "@id": org["@id"] },
      });
    }
  });

  it("links each relevant room back to its writing without placing it in unrelated rooms", async () => {
    for (const path of [...new Set(WRITTEN_ABOUT.map((piece) => piece.related.path)), "/criteria"]) {
      const response = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } });
      expect(response.status, path).toBe(200);
      const links: string[] = [];
      await new HTMLRewriter().on("#related-writing a", {
        element(el) { links.push(el.getAttribute("href") ?? ""); },
      }).transform(response).text();
      expect(links, path).toEqual(WRITTEN_ABOUT.filter((piece) => piece.related.path === path).map((piece) => piece.url));
    }
  });

  it("makes every existing byline readable and crawlable below the main store actions", async () => {
    const { html } = await home();
    const { text, links } = await readableSection(html);
    expect(text).toContain("Writing & recognition");
    expect(text).toContain("Written by the keeper");
    for (const piece of WRITTEN_ABOUT) {
      expect(text).toContain(piece.title);
      expect(links).toContain(piece.url);
    }
    for (const piece of INDEPENDENT_REPORTING) expect(links).not.toContain(piece.url);
    expect(html.indexOf('id="writing-recognition"')).toBeGreaterThan(html.indexOf('class="shelves"'));
  });

  it("gives external articles author, date, summary and subject metadata matching visible copy", async () => {
    const { html, org, subjects } = await home();
    const { text, links } = await readableSection(html);
    for (const piece of WRITTEN_ABOUT) {
      const article = subjects.find((node) => node.url === piece.url);
      expect(article?.["@type"]).toBe("Article");
      expect(article?.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(text).toContain(article?.datePublished);
      expect(article?.description).toBeTruthy();
      expect(text).toContain(article?.description);
      if (!isRecord(article?.author)) throw new Error("External author missing");
      expect(article.author["@type"]).toBe("Person");
      expect(links).toContain(article.author.url);
      expect(text).toContain(article.author.name);
      expect(article.about).toMatchObject({ "@id": org["@id"] });
      expect(article.publisher).toEqual({ "@type": "Organization", name: piece.where });
    }
  });

  it("keeps the dated writer recognition scoped to the person, with its retained evidence", async () => {
    const { html, org } = await home();
    const { text, links } = await readableSection(html);
    expect(text).toMatch(/2026-10-06.*keeper.*#1.*Web3/s);
    expect(links).toContain("https://hackernoon.com/writers");
    expect(links.some((link) => link.endsWith("/research/writing-recognition-2026-10-06/hackernoon-web3.png"))).toBe(true);
    expect(org).not.toHaveProperty("award");
    expect(org).not.toHaveProperty("aggregateRating");
  });

  it("links the short index to complete writing evidence within its reading budget", async () => {
    const body = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(body).toContain(`${BASE}/#writing-recognition`);
    expect(body).toContain("Written by the keeper");
    expect(body).toMatch(/2026-10-06.*keeper.*#1.*Web3/);
    const { LLMS_INDEX_CHARACTER_BUDGET } = await import("@/store/reader-limits");
    expect(body.length).toBeLessThan(LLMS_INDEX_CHARACTER_BUDGET);
  });

  it("carries the same article facts through the existing markdown and agent doors", async () => {
    const { subjects } = await home();
    for (const path of ["/index.md", "/agents.md", "/llms-full.txt"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, path).toBe(200);
      const body = await response.text();
      expect(body).toContain("Writing & recognition");
      for (const piece of WRITTEN_ABOUT) {
        const article = subjects.find((node) => node.url === piece.url);
        expect(article?.description).toBeTruthy();
        expect(body).toContain(piece.url);
        expect(body).toContain(article?.description);
        expect(body).toContain(article?.datePublished);
      }
    }
  });
});
