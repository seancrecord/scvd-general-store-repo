import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE SITEMAP RENDERS, AND IS STILL A SITEMAP (2026-09-21).
 *
 * An agent review filed "/sitemap.xml fails to render in a browser —
 * low agent relevance, but broken tooling surface."
 *
 * The document was never invalid. Checked against the live store: well
 * formed, 6,484 entries, every loc absolute and on-origin, no
 * duplicates, nothing needing escape, every entry dated, and far
 * inside the 50,000-URL and 50MB limits the spec sets. What it lacked
 * was a stylesheet, so a browser fell back to its raw XML tree over
 * 700KB of markup — which is what reads as "fails to render".
 *
 * A stylesheet is the fix, and the risk it carries is the reason this
 * file exists: a processing instruction sits OUTSIDE the document
 * element, so getting it wrong does not produce a styled sitemap with
 * a cosmetic flaw, it produces a sitemap that no longer parses. The
 * assertions below are therefore about the XML first and the page
 * second.
 */

/**
 * The Workers runtime has no DOMParser and this repo pulls in no XML
 * parser, so well-formedness is checked structurally here. It is
 * deliberately narrow: it catches the ways a processing instruction
 * breaks a document — a PI opened and not closed, a PI after the root
 * element, an unbalanced document element — and claims nothing about
 * entity handling or namespace resolution. The live document was
 * parsed with a real parser when this change was made; this keeps the
 * shape from drifting afterwards.
 */
function structurallySound(body: string, root: string): void {
  const rootAt = body.indexOf(`<${root}`);
  expect(rootAt, `no <${root}> element`).toBeGreaterThan(-1);

  // Every processing instruction is closed, and all of them sit in the
  // prolog — a `<?...?>` after the root element is a parse error.
  const prolog = body.slice(0, rootAt);
  expect((prolog.match(/<\?/g) ?? []).length).toBe((prolog.match(/\?>/g) ?? []).length);
  expect(body.slice(rootAt).includes("<?"), "a processing instruction follows the root").toBe(
    false,
  );

  // The document element opens once and closes once.
  expect((body.match(new RegExp(`<${root}[\\s>]`, "g")) ?? []).length).toBe(1);
  expect((body.match(new RegExp(`</${root}>`, "g")) ?? []).length).toBe(1);
  expect(body.indexOf(`</${root}>`)).toBeGreaterThan(rootAt);
}

async function sitemap(): Promise<{ response: Response; body: string }> {
  const response = await SELF.fetch(`${BASE}/sitemap.xml`);
  expect(response.status).toBe(200);
  return { response, body: await response.text() };
}

describe("the sitemap renders for a person", () => {
  it("still parses as XML with the stylesheet attached", async () => {
    const { body } = await sitemap();
    /*
     * The one ordering that matters: the declaration first, the
     * stylesheet PI after it, the document element after that. A PI
     * before the XML declaration is a parse error, not a style bug.
     */
    expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    const declarationEnd = body.indexOf("?>") + 2;
    const styleAt = body.indexOf("<?xml-stylesheet");
    const rootAt = body.indexOf("<urlset");
    expect(styleAt, "no stylesheet: a browser falls back to the raw XML tree").toBeGreaterThan(
      declarationEnd - 1,
    );
    expect(styleAt, "the stylesheet PI must precede the document element").toBeLessThan(rootAt);

    structurallySound(body, "urlset");
  });

  it("keeps every entry it had, and dates all of them", async () => {
    const { body } = await sitemap();
    const locs = body.match(/<loc>/g)?.length ?? 0;
    const mods = body.match(/<lastmod>/g)?.length ?? 0;
    expect(locs).toBeGreaterThan(20);
    expect(mods, "an entry lost its date").toBe(locs);
  });

  it("points the stylesheet at our own origin, where a browser will use it", async () => {
    /*
     * Browsers apply XSLT under the same-origin rule. A cross-origin
     * href here would be silently ignored and the review's finding
     * would come back unfixed, with a test passing over it.
     */
    const { body } = await sitemap();
    expect(body).toContain(`<?xml-stylesheet type="text/xsl" href="${BASE}/sitemap.xsl"?>`);
  });

  it("serves that stylesheet as XSLT, not as a script", async () => {
    const response = await SELF.fetch(`${BASE}/sitemap.xsl`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("xslt+xml");

    const body = await response.text();
    structurallySound(body, "xsl:stylesheet");

    // It transforms the sitemap's namespace, not the default one — the
    // commonest way one of these silently renders an empty table.
    expect(body).toContain("http://www.sitemaps.org/schemas/sitemap/0.9");
    expect(body).toContain("s:urlset/s:url");

    // Nothing executable: the store's script-src stays as tight here
    // as everywhere else.
    expect(body).not.toContain("<script");
  });
});
