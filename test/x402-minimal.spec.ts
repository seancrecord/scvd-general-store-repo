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

  it("keeps version and resources exactly as they were", async () => {
    /**
     * THE CONSTRAINT, AND THE REASON THIS TEST EXISTS. This document
     * follows a de-facto contract that scanners parse without
     * negotiating. Additions are safe; a rename, a reorder into a
     * nested object, or a change of type is not — and the failure
     * would be silent, since a scanner that stops understanding us
     * does not send a complaint, it just files us as nothing.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/x402`)
    ).json()) as { version: number; resources: unknown };
    expect(body.version).toBe(1);
    expect(Array.isArray(body.resources)).toBe(true);
    const resources = body.resources as string[];
    for (const resource of resources) {
      expect(typeof resource, "a resource stopped being a bare URL string").toBe(
        "string",
      );
      expect(resource).toMatch(/^https:\/\//);
    }
    // Every shelf still listed, so enriching did not quietly drop one.
    for (const item of MENU_ITEMS) {
      expect(resources, `${item.id} fell out of discovery`).toContain(
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
