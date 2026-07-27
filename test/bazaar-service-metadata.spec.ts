import {
  isValidIconUrl,
  isValidServiceName,
  sanitizeTags,
} from "@x402/extensions/bazaar";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  MENU_ITEMS,
  STORE_METADATA,
  STORE_SERVICE_NAME,
  STORE_TAGS,
} from "@/store";
import { isRecord } from "@/types";

/**
 * THE BAZAAR QUALITY SCORECARD, investigated 2026-07-27.
 *
 * These tests run our declarations through the SDK's OWN validators —
 * the exact functions a facilitator calls before it keeps a field —
 * rather than through my reading of the rules. A test that encodes my
 * understanding of a third party's checker is worth very little; a
 * test that calls the checker is worth the whole investigation.
 */
describe("what a catalog will actually keep", () => {
  it("has a service name short enough to survive the cap", () => {
    expect(
      isValidServiceName(STORE_SERVICE_NAME),
      "the catalog would drop this name silently",
    ).toBe(true);
  });

  it("proves the real name is the reason the field was empty", () => {
    // Not a stylistic preference: the store's own name is 37 printable
    // characters against a 32-character cap, so a facilitator does not
    // truncate it, it refuses it and keeps nothing. This is the whole
    // finding, and it fails loudly if the SDK ever raises the cap —
    // at which point the real name should go back in.
    expect(STORE_METADATA.name.length).toBeGreaterThan(32);
    expect(isValidServiceName(STORE_METADATA.name)).toBe(false);
  });

  it("keeps every tag, rather than losing some to a silent filter", () => {
    const kept = sanitizeTags([...STORE_TAGS]);
    expect(kept, "every tag was rejected").toBeDefined();
    // Five is the cap. Losing one to length, casing, or a non-ASCII
    // character would mean shipping a filter we can't see.
    expect(kept).toHaveLength(STORE_TAGS.length);
    expect(kept).toEqual([...STORE_TAGS]);
  });

  it("publishes an icon URL the validator accepts", () => {
    expect(isValidIconUrl("https://scvd.store/favicon.svg")).toBe(true);
  });
});

describe("the discovery document an indexer crawls", () => {
  it("publishes an input schema under the name an indexer looks for", async () => {
    const body: unknown = await (
      await SELF.fetch("https://scvd.store/.well-known/x402.json")
    ).json();
    if (!isRecord(body) || !Array.isArray(body.resources)) {
      throw new Error("no resources");
    }
    for (const item of MENU_ITEMS) {
      const resource = body.resources.find(
        (entry: unknown) =>
          isRecord(entry) &&
          entry.resourceUrl === `https://scvd.store/api/buy/${item.id}`,
      );
      expect(isRecord(resource), item.id).toBe(true);
      if (!isRecord(resource)) continue;
      const schema = resource.inputSchema;
      expect(isRecord(schema), `${item.id} has no inputSchema`).toBe(true);
      if (!isRecord(schema)) continue;
      // A schema without a type is a bag of properties; some readers
      // accept it, some don't, and the ones that don't say "no".
      expect(schema.type).toBe("object");
      expect(isRecord(schema.properties)).toBe(true);
    }
  });

  it("says the required params in the schema, matching what buy actually enforces", async () => {
    const body: unknown = await (
      await SELF.fetch("https://scvd.store/.well-known/x402.json")
    ).json();
    if (!isRecord(body) || !Array.isArray(body.resources)) {
      throw new Error("no resources");
    }
    const anchor = body.resources.find(
      (entry: unknown) =>
        isRecord(entry) &&
        entry.resourceUrl === "https://scvd.store/api/buy/context_anchor",
    );
    if (!isRecord(anchor) || !isRecord(anchor.inputSchema)) {
      throw new Error("no anchor schema");
    }
    expect(anchor.inputSchema.required).toContain("summary");
  });

  it("carries the service metadata at the top, not only per resource", async () => {
    const body: unknown = await (
      await SELF.fetch("https://scvd.store/.well-known/x402.json")
    ).json();
    if (!isRecord(body)) throw new Error("no body");
    expect(body.serviceName).toBe(STORE_SERVICE_NAME);
    expect(body.tags).toEqual([...STORE_TAGS]);
    expect(body.iconUrl).toBe("https://scvd.store/favicon.svg");
  });
});
