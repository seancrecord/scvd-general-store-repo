import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE TWO ROOMS THAT CARRIED NO STRUCTURED DATA.
 *
 * The sweep that closed the markdown gap found /disagreements and
 * /observatory serving an indexer their prose and their titles and
 * nothing it could lift — no JSON-LD at all. That was left alone at
 * the time on purpose: it is a content decision, not a negotiation
 * bug, and it did not belong in a commit about negotiation.
 *
 * This is that decision made. The node has to PARSE, not merely be
 * present: a malformed block is worse than none, because a reader
 * that trips on it may drop the whole page's structured data.
 */
const ROOMS = [
  { path: "/disagreements", type: "Dataset" },
  { path: "/observatory", type: "Dataset" },
] as const;

function blocks(html: string): unknown[] {
  const found = [...html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )];
  return found.map((match) => JSON.parse(match[1]!));
}

describe("the rooms that gained structured data", () => {
  it("serves a JSON-LD node that parses, with the type it claims", async () => {
    for (const { path, type } of ROOMS) {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/html" },
      });
      expect(response.status, path).toBe(200);
      const html = await response.text();

      let parsed: unknown[];
      try {
        parsed = blocks(html);
      } catch (error) {
        throw new Error(`${path}: JSON-LD does not parse — ${String(error)}`);
      }
      expect(parsed.length, `${path} carries no JSON-LD`).toBeGreaterThan(0);

      const node = parsed.find(
        (candidate) => (candidate as { "@type"?: string })["@type"] === type,
      ) as Record<string, unknown> | undefined;
      expect(node, `${path} has no ${type} node`).toBeDefined();

      // The fields a reader actually lifts. A Dataset with no licence
      // or no creator is a node that says less than the page does.
      expect(node!["url"], `${path} url`).toBe(`${BASE}${path}`);
      expect(node!["name"], `${path} name`).toBeTruthy();
      expect(node!["description"], `${path} description`).toBeTruthy();
      expect(node!["license"], `${path} license`).toContain("creativecommons.org");
      expect(node!["isAccessibleForFree"], `${path} free`).toBe(true);
      expect(node!["creator"], `${path} creator`).toBeTruthy();
      expect(
        Array.isArray(node!["variableMeasured"]),
        `${path} should name what it measures`,
      ).toBe(true);
    }
  });

  /*
   * THE VOCABULARY /disagreements DOES NOT GET TO USE.
   *
   * ClaimReview carries a reviewRating: it models one party
   * adjudicating another's claim. Emitting it here would publish, in
   * machine form, the thing house rule 51 refuses — that this store
   * rates the instrument it diverges from. Both readings stand with
   * their derivations; neither is authoritative over the other.
   */
  it("never rates the other instrument in structured data", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/disagreements`, { headers: { Accept: "text/html" } })
    ).text();
    const serialised = JSON.stringify(blocks(html));
    expect(serialised).not.toContain("ClaimReview");
    expect(serialised).not.toContain("reviewRating");
    expect(serialised).not.toContain("ratingValue");
  });

  it("names both sides of a divergence, each with where it is published", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/disagreements`, { headers: { Accept: "text/html" } })
    ).text();
    const dataset = blocks(html).find(
      (node) => (node as { "@type"?: string })["@type"] === "Dataset",
    ) as Record<string, unknown>;
    const list = dataset["hasPart"] as { itemListElement?: unknown[] } | undefined;
    const items = list?.itemListElement ?? [];
    for (const entry of items as Array<{ item?: { citation?: unknown[] } }>) {
      const citations = entry.item?.citation ?? [];
      // Ours and theirs. A divergence with one side is not one.
      expect(citations.length, "each divergence cites both readings").toBe(2);
      for (const cite of citations as Array<Record<string, unknown>>) {
        expect(cite["url"], "a reading without a URL cannot be checked").toBeTruthy();
        expect(cite["author"], "a reading must name the instrument").toBeTruthy();
      }
    }
  });
});
