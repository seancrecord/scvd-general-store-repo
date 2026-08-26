import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * THE THIN DOCUMENT HAD NO WORDS IN IT.
 *
 * /.well-known/x402 served `{ version, resources }` — a bare array of
 * URLs — while every name, description and tag lived next door in
 * x402.json. x402scan's card for this store reads "x402-compatible
 * service at https://scvd.store/api/buy/hello", categorised `other`,
 * which is what a directory produces when the source gave it nothing
 * to work with. A week was spent making the rich surfaces rich and
 * nobody checked what the thin one said about us.
 */
describe("the minimal x402 document says who we are", () => {
  it("carries a name and a description, not just URLs", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/x402`)
    ).json()) as { name?: string; description?: string; tags?: string[] };
    expect(body.name, "an indexer reading this has nothing to file us under").toBeTruthy();
    expect(body.description?.length ?? 0).toBeGreaterThan(20);
    expect(body.tags?.length ?? 0).toBeGreaterThan(0);
  });

  it("keeps the structured, priced resource contract pinned", async () => {
    /**
     * THE CONSTRAINT, RE-PINNED 2026-08-26. This test used to pin
     * resources as bare URL strings, on the theory that any shape
     * change silently loses scanners. A verified outside diagnosis
     * showed the opposite: the bare strings were WHY routers indexed
     * us as a known origin that never resolves as routable tools,
     * while the catalog next door served structured objects — two
     * incompatible shapes for the same tools. The keeper ruled: one
     * structured, priced shape on both surfaces. The failure mode the
     * old comment feared is still real, which is exactly why the NEW
     * contract gets the same pin — a rename, a reorder, or a lost
     * accepts array fails here before any scanner files us as nothing.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/x402`)
    ).json()) as { version: number; resources: unknown };
    expect(body.version).toBe(1);
    expect(Array.isArray(body.resources)).toBe(true);
    const resources = body.resources as {
      resourceUrl: string;
      method: string;
      accepts: unknown[];
    }[];
    const urls = resources.map((resource) => {
      expect(typeof resource, "a resource must be a structured object").toBe(
        "object",
      );
      expect(resource.resourceUrl).toMatch(/^https:\/\//);
      expect(resource.method).toBe("GET");
      expect(
        Array.isArray(resource.accepts) && resource.accepts.length > 0,
        "a resource lost its priced accepts",
      ).toBe(true);
      return resource.resourceUrl;
    });
    // Every shelf still listed, so restructuring did not quietly drop one.
    for (const item of MENU_ITEMS) {
      expect(urls, `${item.id} fell out of discovery`).toContain(
        `${BASE}/api/buy/${item.id}`,
      );
    }
  });

  it("names the fuller catalog beside it", async () => {
    // An indexer that started at the thin document should not have to
    // guess that a richer one exists next door.
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/x402`)
    ).json()) as { catalog?: string };
    expect(body.catalog).toMatch(/\/\.well-known\/x402\.json$/);
  });
});
