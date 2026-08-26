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

/**
 * Remove markup until the string stops changing, then drop a dangling
 * unterminated tag.
 *
 * BOTH HALVES ARE LOAD-BEARING, and the second one only exists because
 * the assertion below caught the first fix being wrong: looping on
 * /<[^>]*>/ handles nesting, but that pattern REQUIRES a closing
 * bracket, so `<script src="x"` at the end of a fragment survives any
 * number of passes. That was the exact case CodeQL named.
 */
function stripTags(fragment: string): string {
  let previous: string;
  let current = fragment;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, "");
  } while (current !== previous);
  return current.replace(/<[^>]*$/, "");
}

/**
 * The document as an unfriendly extractor sees it: every subtree a
 * page marks decorative (`aria-hidden="true"`) or visually hidden
 * (`class="sr-only"`) removed, WITH ITS CHILDREN, before a single
 * character is counted.
 *
 * Deliberately crude, and that is the point — it is a stand-in for
 * somebody else's crawler, not a browser. It only has to model the
 * one behaviour that made the store's h1 read as empty.
 *
 * THE NESTING IS THE WHOLE JOB, and the first draft of this helper
 * got it wrong in the direction that hides a bug: a non-greedy
 * `[\s\S]*?<\/span>` stops at the first CLOSING tag, so a hidden
 * span containing a decorative one leaves its own tail behind — and
 * the tail of the old neon sign still spelled "GENERAL STORE", so
 * the guard passed against exactly the markup it was written to
 * fail. Depth is counted here instead.
 */
function withoutHiddenSubtrees(html: string): string {
  const opener = /<span\b[^>]*(?:aria-hidden="true"|class="sr-only")[^>]*>/i;
  let out = html;
  for (;;) {
    const start = opener.exec(out);
    if (!start) return out;
    let index = start.index + start[0].length;
    let depth = 1;
    const tag = /<(\/?)span\b[^>]*>/gi;
    tag.lastIndex = index;
    let match: RegExpExecArray | null;
    while (depth > 0 && (match = tag.exec(out)) !== null) {
      depth += match[1] === "/" ? -1 : 1;
      index = match.index + match[0].length;
    }
    // An unbalanced document: drop the rest rather than loop forever.
    out = out.slice(0, start.index) + " " + out.slice(depth > 0 ? out.length : index);
  }
}

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

describe("the h1 reader cannot be fooled by a stray angle bracket", () => {
  it("strips until stable, so an unterminated tag leaves no markup behind", () => {
    // The exact shape CodeQL named: one pass of /<[^>]+>/ leaves this.
    expect(stripTags('<span>General <b>Store</b><script src="x"')).toBe(
      "General Store",
    );
    expect(stripTags("<p><em>x402</em></p>")).toBe("x402");
    expect(stripTags("plain text")).toBe("plain text");
  });
});

describe("the store's name, legible to a machine", () => {
  it("puts the real name in the h1, not just the flickering bulbs", async () => {
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
    expect(h1).toBeTruthy();
    /*
     * STRIPPED UNTIL STABLE, not once (CodeQL, 2026-08-22). A single
     * pass of /<[^>]+>/ leaves an unterminated `<script src="x"` — and
     * more to the point here, a nested or malformed tag can leave
     * markup that this assertion would then read as the store's NAME.
     * A guard on legibility that can be fooled by a stray angle
     * bracket is not a guard.
     */
    const text = stripTags(h1).replace(/\s+/g, " ").trim();
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
    // markup must survive verbatim.
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    expect(html).toContain('<span class="flicker">O</span>');
    expect(html).toContain('class="neon-sub"');
    expect(html).toContain('<span class="flicker-slow">\'</span>');
  });

  /**
   * THE SAME FINDING, FOUR DAYS LATER, STILL TRUE (2026-08-26).
   *
   * The 2026-08-21 fix put the whole heading inside the sr-only span
   * and marked the neon letters aria-hidden. Every assertion above
   * passed and the audit went on reporting "no H1 tag", because an
   * extractor that drops visually-hidden and aria-hidden subtrees
   * before counting text — which many do, precisely to skip
   * boilerplate — was left with an h1 containing nothing at all.
   *
   * So the guard is run TWICE: once over the document as served, and
   * once over the document with every hidden subtree removed first.
   * A heading that only survives the friendly reading is a heading
   * half the readers cannot see.
   */
  it("still names the store after a reader drops every hidden subtree", async () => {
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    const visible = withoutHiddenSubtrees(html);
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(visible)?.[1] ?? "";
    const text = stripTags(h1).replace(/\s+/g, " ").trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("general store");
  });

  it("leaves an extractor plenty of prose once markup and hidden text are gone", async () => {
    /*
     * "Only 4354 chars of text content" was the other half of the
     * same finding. The threshold here is not the auditor's — it is
     * the floor below which the front of the store would have
     * stopped saying what it is. Measured the hard way: hidden
     * subtrees dropped, script and style dropped, tags dropped.
     */
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    const prose = stripTags(
      withoutHiddenSubtrees(html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
    expect(prose.length).toBeGreaterThan(2000);
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

/**
 * CONTENT SIGNALS, AND WHY OURS SAY YES.
 *
 * Another agent's site (cairnwake.com, read 2026-08-23) declares
 * `search=yes, ai-train=no, use=reference`. Ours declared nothing at
 * all — the stance was implicit in "Crawlers welcome; nothing to hide"
 * and invisible to any machine.
 *
 * The store's answer is the OPPOSITE of theirs, on purpose: a shop
 * whose product is being the reference for x402 conformance wants to
 * be in the corpus a model learns from. Same emerging standard, a
 * different position, stated where a crawler will actually read it.
 */
describe("the store says what may be done with what it publishes", () => {
  it("declares Content-Signal in robots.txt, and asks to be trained on", async () => {
    const res = await SELF.fetch("https://scvd.store/robots.txt");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Content-Signal:");
    expect(body).toContain("search=yes");
    // The deliberate one. If this ever flips to no, it should be
    // because the keeper changed his mind, not because it was copied.
    expect(body).toContain("ai-train=yes");
    expect(body).toContain("ai-input=yes");
    // And the reason is written down beside it.
    expect(body).toContain("deliberate position");
  });
});
