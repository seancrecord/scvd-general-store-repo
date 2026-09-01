import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MACHINE_SURFACE_CEILINGS } from "@/store/reader-limits";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * THE OTHER HALF OF PROBLEMS #25.
 *
 * OpenAPI walked over a 1 MB scanner cap while every content
 * guard stayed green (test/openapi-fetchable.spec.ts holds that
 * door). The same failure is available on every other machine
 * surface an agent is told to fetch — a true document nobody
 * can retrieve is a silent "we have no contract."
 *
 * House rule 59: the reader's limit is part of the contract.
 * The ceilings live in src/store/reader-limits.ts once. This
 * file measures the four surfaces #25 still had open, and
 * refuses the cheap pass (delete the doors until it fits).
 */

const OPENAPI = "/openapi.json";

const SURFACES = MACHINE_SURFACE_CEILINGS.filter(
  (surface) => surface.path !== OPENAPI,
);

async function served(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, path).toBe(200);
  return response.text();
}

describe("machine surfaces stay inside the reader's limit", () => {
  it("measures every surface #25 still owed a ceiling", () => {
    const paths = SURFACES.map((surface) => surface.path);
    expect(paths).toEqual([
      "/menu.json",
      "/corpus.json",
      "/.well-known/x402.json",
      "/llms.txt",
    ]);
  });

  it("stays inside each budget, which is inside each fetch cap", async () => {
    const over: string[] = [];
    for (const surface of SURFACES) {
      const text = await served(surface.path);
      if (text.length >= surface.budget) {
        over.push(
          `${surface.path} is ${text.length}, past the ${surface.budget} budget (reader cap ${surface.fetchCap}). Do not raise the number — find what got inlined. Past the cap the reader stops fetching and the store reads as having no ${surface.path}.`,
        );
      }
      expect(text.length).toBeLessThan(surface.fetchCap);
    }
    expect(over.join("\n")).toBe("");
  });
});

describe("the cheap way to pass is not to delete the shelf", () => {
  it("still lists every menu item, on both catalogs", async () => {
    const menu = JSON.parse(await served("/menu.json")) as {
      items: Array<{ id: string }>;
    };
    const x402 = JSON.parse(await served("/.well-known/x402.json")) as {
      resources: Array<{ resource: string }>;
    };
    const ids = MENU_ITEMS.map((item) => item.id);
    expect(menu.items.map((item) => item.id)).toEqual(ids);
    const buyUrls = new Set(x402.resources.map((row) => row.resource));
    const missing = ids.filter(
      (id) => !buyUrls.has(`${BASE}/api/buy/${id}`),
    );
    expect(missing).toEqual([]);
  });

  it("still serves the corpus as an index a stranger can check", async () => {
    const corpus = JSON.parse(await served("/corpus.json")) as {
      entries: unknown;
      chain: unknown;
      how_to_verify: unknown;
    };
    expect(typeof corpus.entries).toBe("number");
    expect(corpus.chain).toBeTruthy();
    expect(Array.isArray(corpus.how_to_verify)).toBe(true);
    expect((corpus.how_to_verify as unknown[]).length).toBeGreaterThan(0);
  });

  it("still points the index at the other machine doors", async () => {
    const index = await served("/llms.txt");
    expect(index.length).toBeGreaterThan(1_000);
    expect(index).toContain("/menu.json");
    expect(index).toContain("/corpus.json");
    // The index names the discovery door; the richer catalog sits
    // beside it at /.well-known/x402.json. Either string is the
    // door. Requiring the .json suffix would be inventing a
    // sentence the guide does not currently say.
    expect(index).toContain("/.well-known/x402");
  });
});
