import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { negotiate, prefersMarkdown } from "@/lib/accept";

/**
 * WHAT A CRAWLER SEES WHEN IT DOES THE ORDINARY THING.
 *
 * An agent-readiness audit walked the store on 2026-08-21 and came
 * back with three findings that were true and one that was not, which
 * is a useful ratio. The false one is worth writing down: it reported
 * the homepage as having NO H1. The homepage has had an h1 since the
 * day it shipped — but the sign spells the name in letters that
 * flicker on their own timers, so `textContent` reads
 * "GENERAL ST O RE". A parser was right to say it could not find the
 * store's name in a heading. It was only wrong about why.
 *
 * These tests pin the store's side of that conversation: the name is
 * legible to a machine, the front door answers in the dialect it was
 * asked in, and a wrong guess at a URL comes back with a way out.
 */

describe("the Accept header, parsed rather than guessed at", () => {
  it("honours q-values instead of substring-matching", () => {
    /*
     * The convention's own named mistake. Both of these CONTAIN
     * "text/markdown"; only one of them is asking for it.
     */
    expect(prefersMarkdown("text/markdown", "text/html")).toBe(true);
    expect(
      prefersMarkdown("text/html, text/markdown;q=0.1", "text/html"),
    ).toBe(false);
    expect(
      prefersMarkdown("text/markdown;q=0.9, text/html;q=0.8", "text/html"),
    ).toBe(true);
  });

  it("treats a wildcard the store can satisfy as a yes", () => {
    // Substring matching says no here, and a cache-friendly server
    // that can produce text/* should say yes.
    expect(negotiate("text/*", ["text/markdown"])).toBe("text/markdown");
    expect(negotiate("*/*", ["application/json", "text/markdown"])).toBe(
      "application/json",
    );
  });

  it("breaks a q-value tie by specificity, not by luck", () => {
    expect(negotiate("*/*, text/markdown", ["text/html", "text/markdown"])).toBe(
      "text/markdown",
    );
  });

  it("respects an explicit refusal", () => {
    expect(negotiate("text/markdown;q=0", ["text/markdown"])).toBeNull();
  });

  it("falls back to the store's own first choice when nothing is stated", () => {
    // No header is not a preference for anything; the route's default
    // representation wins, which is why callers list it first.
    expect(negotiate(undefined, ["text/html", "text/markdown"])).toBe(
      "text/html",
    );
    expect(negotiate("", ["text/html", "text/markdown"])).toBe("text/html");
  });

  it("survives a malformed q without reading it as a refusal", () => {
    // q=banana is a client that failed to state a preference, not one
    // that ranked us at zero. Treating it as zero would drop a caller.
    expect(prefersMarkdown("text/markdown;q=banana", "text/html")).toBe(true);
  });
});

describe("the front door answers in the dialect it was asked in", () => {
  it("still serves the neon page to a browser", async () => {
    const page = await SELF.fetch("https://scvd.store/", {
      headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain("<h1");
  });

  it("serves markdown to an agent that asks for it, and says it varied", async () => {
    const doc = await SELF.fetch("https://scvd.store/", {
      headers: { Accept: "text/markdown" },
    });
    expect(doc.status).toBe(200);
    expect(doc.headers.get("content-type")).toContain("text/markdown");
    /*
     * The Vary header is the half of this that a checklist skips and a
     * CDN does not: without it, whichever variant reaches the edge
     * first is served to everyone until it expires.
     */
    expect(doc.headers.get("vary")).toContain("Accept");
    const body = await doc.text();
    expect(body.startsWith("#")).toBe(true);
  });

  it("declares Vary on the HTML variant too, not just the markdown one", async () => {
    // A Vary that only rides one representation is a Vary that does
    // not work: the cache keys on the response it happens to store.
    const page = await SELF.fetch("https://scvd.store/", {
      headers: { Accept: "text/html" },
    });
    expect(page.headers.get("vary")).toContain("Accept");
  });

  it("negotiates the catalog the same way", async () => {
    const md = await SELF.fetch("https://scvd.store/menu.json", {
      headers: { Accept: "text/markdown" },
    });
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(md.headers.get("vary")).toContain("Accept");

    const json = await SELF.fetch("https://scvd.store/menu.json");
    expect(json.headers.get("content-type")).toContain("application/json");
    expect(json.headers.get("vary")).toContain("Accept");
  });
});

describe("the store's name, legible to a machine", () => {
  it("puts the real name in the h1, not just the flickering bulbs", async () => {
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
    expect(h1).toBeTruthy();
    const text = h1.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    /*
     * The whole finding, in one assertion: the h1's text has to
     * contain the store's name spelled the way anyone would search
     * for it — not "GENERAL ST O RE".
     */
    expect(text.toLowerCase()).toContain("general store");
    expect(text.toLowerCase()).toContain("x402");
  });

  it("keeps the neon exactly as it was", async () => {
    // The design is not the price of being legible. The decorative
    // markup must survive verbatim, hidden from the a11y tree.
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    expect(html).toContain('<span class="flicker">O</span>');
    expect(html).toContain('class="neon-sub"');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("a wrong guess at a URL", () => {
  it("is a real 404, never a 200 wearing an app shell", async () => {
    const missing = await SELF.fetch(
      "https://scvd.store/some-path-that-does-not-exist",
    );
    expect(missing.status).toBe(404);
  });

  it("hands a lost agent the whole set of doors, in markdown", async () => {
    const missing = await SELF.fetch("https://scvd.store/nope", {
      headers: { Accept: "text/markdown" },
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("text/markdown");
    const body = await missing.text();
    expect(body).toContain("# 404");
    for (const path of ["/llms.txt", "/agents.md", "/menu.json", "/openapi.json", "/sitemap.xml"]) {
      expect(body).toContain(path);
    }
  });

  it("carries the same doors in the JSON body, so neither dialect knows less", async () => {
    const missing = await SELF.fetch("https://scvd.store/nope");
    const body = (await missing.json()) as {
      where_to_look_next?: Array<{ url: string; what: string }>;
    };
    const urls = (body.where_to_look_next ?? []).map((row) => row.url);
    expect(urls.some((url) => url.endsWith("/llms.txt"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/sitemap.xml"))).toBe(true);
    // Every row explains itself; a bare URL list is a maze, not a map.
    for (const row of body.where_to_look_next ?? []) {
      expect(row.what.length).toBeGreaterThan(5);
    }
  });
});
