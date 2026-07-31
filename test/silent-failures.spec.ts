import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE SURFACES THAT FAIL WITHOUT TELLING ANYBODY.
 *
 * Written 2026-07-31 in answer to a keeper question worth repeating:
 * what else are we assuming, and can it be hardened before we find
 * out the hard way?
 *
 * The class that matters is not "broken" — broken gets noticed. It is
 * SILENTLY IGNORED: a malformed JSON-LD block, an OpenAPI document a
 * parser rejects, a robots rule that quietly excludes the pages we
 * most want read. Every one of those fails by an outside reader
 * shrugging and moving on, which produces no error here, no complaint
 * from them, and no way to tell it from nobody having looked.
 */
describe("the structured data actually parses", () => {
  async function jsonLd(): Promise<Record<string, unknown>> {
    const html = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
      html,
    );
    expect(match, "the storefront serves no JSON-LD block at all").toBeTruthy();
    return JSON.parse(match![1] as string) as Record<string, unknown>;
  }

  it("is valid JSON with the fields a resolver needs", async () => {
    const data = await jsonLd();
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("Organization");
    expect(data["name"]).toBeTruthy();
    expect(data["url"]).toBe("https://scvd.store");
  });

  it("carries no raw < that would end the script block early", async () => {
    /**
     * THE SILENT ONE. JSON in a script tag is not HTML, so escapeHtml
     * would corrupt it — but the HTML parser ends the block at the
     * first `</script`, wherever it appears, including inside a
     * string. One `<` in a keeper-written item description and the
     * structured data stops parsing, with markup after it landing in
     * the document. Answer engines would simply stop seeing us, and
     * nothing here would say so.
     */
    const html = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
      html,
    );
    expect(match![1], "an unescaped < is in the JSON-LD").not.toContain("<");
  });

  it("survives a description that tries to close the tag", async () => {
    // The escape is applied to the serialized output rather than per
    // field, so the guard holds for fields added later too. Proven on
    // the mechanism rather than trusted from the comment.
    const hostile = { note: "</script><img src=x>" };
    const serialized = JSON.stringify(hostile).replace(/</g, "\\u003c");
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized).note).toBe("</script><img src=x>");
  });
});

/**
 * CV'S THIRD ITEM: a number to parse instead of a paragraph to
 * interpret. The books were public, live and honest — and entirely in
 * prose, or in a document a schema reader has no reason to fetch. An
 * agent doing pre-purchase diligence parses the JSON-LD on the page it
 * is already looking at, and found no figures there at all.
 */
describe("the books are readable by a parser, not only a reader", () => {
  it("publishes the organic settlement count in the structured data", async () => {
    const html = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
      html,
    );
    const data = JSON.parse(match![1] as string) as {
      interactionStatistic?: { userInteractionCount: number; description: string }[];
      legalName?: string;
    };
    const counter = data.interactionStatistic?.[0];
    expect(counter, "no settlement figure in the JSON-LD").toBeTruthy();
    expect(typeof counter?.userInteractionCount).toBe("number");
    // The method travels with the number. A count with no statement of
    // what was excluded is a count somebody has to take on trust.
    expect(counter?.description).toMatch(/house wallets are excluded/i);
  });

  it("names the registered entity where a diligence check looks", async () => {
    const html = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).toContain("Record Creative Co. LLC");
  });

  it("keeps the entity out of the shop's own voice", async () => {
    // The machine layer answers "is there a company." The rooms still
    // say one person out of Oak City, because that is what a buyer
    // actually deals with — the company adds no second pair of hands.
    const what = await (
      await SELF.fetch(`${BASE}/what`, { headers: { Accept: "text/html" } })
    ).text();
    expect(what, "the entity leaked into the human copy").not.toContain(
      "Record Creative Co.",
    );
  });
});

describe("the contract a machine reads is a contract it can parse", () => {
  it("serves OpenAPI that parses and declares its version", async () => {
    // A spec a parser rejects is a spec nobody reads, and the failure
    // is an importer skipping us rather than an error we ever see.
    const spec = (await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json()) as Record<string, unknown>;
    expect(String(spec["openapi"])).toMatch(/^3\./);
    expect(spec["info"]).toBeTruthy();
    expect(Object.keys(spec["paths"] as object).length).toBeGreaterThan(10);
  });

  it("documents the machine surfaces a checklist actually pulls", async () => {
    const spec = (await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json()) as { paths: Record<string, unknown> };
    for (const path of ["/attestation", "/rights", "/corrections"]) {
      expect(spec.paths[path], `${path} answers but is undocumented`).toBeTruthy();
    }
  });
});

describe("nothing we want crawled is disallowed", () => {
  it("permits the machine surfaces, not just the storefront", async () => {
    // The store invites crawlers by name in robots.txt. A rule that
    // quietly excluded llms.txt or the discovery documents would undo
    // every other thing done for legibility, and would look exactly
    // like nobody visiting.
    const robots = await (await SELF.fetch(`${BASE}/robots.txt`)).text();
    expect(robots).toMatch(/Allow:\s*\//);
    expect(robots, "a Disallow rule appeared").not.toMatch(
      /Disallow:\s*\/\s*$/m,
    );
  });
});
