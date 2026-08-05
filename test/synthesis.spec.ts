import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { SPEC_KEY_ORDER, SPEC_KEY_ORDER_FULL } from "@/lib/listing-spec";
import { SKILL_VERSION, USE_WHEN } from "@/store/spec";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { decodePaymentRequired } from "./helpers/payment";

/**
 * The machine-legibility layer (synthesis build pass): uniform listing
 * schema in CI, verification adjacency on every 402, the honest books
 * at /stats, the guarantee split, and the restructured skill.
 */

const BASE = "https://scvd.store";

/**
 * Canonical key order, with why_use elidable: novelty items state no
 * capability gap and must not invent one, so its absence is part of
 * the contract rather than a hole in it.
 */
function expectCanonicalKeyOrder(spec: Record<string, unknown>): void {
  const keys = Object.keys(spec);
  const expected = SPEC_KEY_ORDER_FULL.filter(
    (key) => key !== "why_use" || keys.includes("why_use"),
  );
  expect(keys).toEqual([...expected]);
  for (const required of SPEC_KEY_ORDER) {
    expect(keys).toContain(required);
  }
}


beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("S1: one schema, one field order, all items", () => {
  it("publishes the schema at a stable versioned URL", async () => {
    const response = await SELF.fetch(`${BASE}/schemas/listing-spec-v1.json`);
    expect(response.status).toBe(200);
    const schema = await json(response);
    expect(schema["x-key-order"]).toEqual([...SPEC_KEY_ORDER]);
    expect(schema["required"]).toEqual([...SPEC_KEY_ORDER]);
  });

  it("every listing conforms, literal key order included", async () => {
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const items = menu["items"] as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const spec = item["spec"] as Record<string, unknown>;
      // Literal JSON key order is the whole point; toEqual won't see it.
      expectCanonicalKeyOrder(spec);
      expect(typeof spec["capability"]).toBe("string");
      expect(Array.isArray(spec["constraints"])).toBe(true);
      const price = spec["price"] as Record<string, unknown>;
      expect(price["protocol"]).toBe("x402 v2");
      // C3: the guarantee split rides every paid listing.
      expect(Array.isArray(item["guaranteed"])).toBe(true);
      expect(Array.isArray(item["not_guaranteed"])).toBe(true);
    }
  });
});

describe("the description cap (CDP schema limit, learned the hard way)", () => {
  it("keeps every buy route's 402 description under the facilitator's cap", async () => {
    const { buyRouteDescription, ROUTE_DESCRIPTION_CAP } = await import(
      "@/lib/payments"
    );
    const { MENU_ITEMS } = await import("@/store");
    const fakeEnv = { STORE_BASE_URL: "https://scvd.store" } as Parameters<
      typeof buyRouteDescription
    >[1];
    for (const item of MENU_ITEMS) {
      const description = buyRouteDescription(item, fakeEnv);
      expect(
        description.length,
        `${item.id} description is ${description.length} chars`,
      ).toBeLessThanOrEqual(ROUTE_DESCRIPTION_CAP);
    }
    expect(ROUTE_DESCRIPTION_CAP).toBeLessThan(500);
  });
});

describe("S2: verification adjacency on the 402", () => {
  it("carries key, sample artifact, and identity policy in-payload", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(response.status).toBe(402);
    // The challenge header still parses; the body grew, nothing moved.
    expect(decodePaymentRequired(response).x402Version).toBe(2);
    const body = await json(response);
    const verification = body["verification"] as Record<string, unknown>;
    expect(String(verification["key_fingerprint"])).toMatch(/^[0-9a-f]{64}$/);
    expect(verification["sample_artifact_id"]).toBe("cert_4dww28dx5j");
    expect(String(verification["identity_policy"])).toContain(
      // WAS "never rotated". The store rotated 2026-07-31 and the
      // policy line had to stop boasting about a streak any handover
      // ends. What the policy actually promises, and what this now
      // pins, is that a change is announced before the new key signs
      // and the announcement is signed by the outgoing key.
      "signed by the outgoing key",
    );
    expect(String(body["spec_note"])).toContain("Returns:");
    const spec = body["spec"] as Record<string, unknown>;
    expectCanonicalKeyOrder(spec);
  });

  it("matches the key published at .well-known exactly", async () => {
    const challenge = await json(await SELF.fetch(`${BASE}/api/buy/hello`));
    const wellKnown = await json(
      await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`),
    );
    const verification = challenge["verification"] as Record<string, unknown>;
    expect(verification["key_fingerprint"]).toBe(wellKnown["public_key"]);
    expect(String(wellKnown["identity_policy"])).toContain(
      "signed by the outgoing key",
    );
  });
});

describe("C2: the honest books at /stats", () => {
  it("computes live, publishes the exclusion policy, states the zero", async () => {
    const stats = await json(await SELF.fetch(`${BASE}/stats`));
    expect(stats["operating_since"]).toBe("2026-07-22");
    expect(typeof stats["settled_purchases_total"]).toBe("number");
    expect(typeof stats["organic_settlements"]).toBe("number");
    expect(String(stats["house_flag_policy"])).toContain("excluded");
    expect(String(stats["track_record"])).toContain("Operating since");
  });

  it("rides the catalog root metadata", async () => {
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const store = menu["store"] as Record<string, unknown>;
    expect(store["stats"]).toBe(`${BASE}/stats`);
    expect(String(store["track_record"])).toContain("Settled purchases");
    expect(store["listing_spec_schema"]).toBe(
      `${BASE}/schemas/listing-spec-v1.json`,
    );
  });
});

describe("C1 + C3 on the MCP door", () => {
  it("tops tool descriptions with the fact block and closes with the guarantee", async () => {
    const reply = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });
    const result = (await json(reply))["result"] as Record<string, unknown>;
    const tools = result["tools"] as Array<Record<string, unknown>>;
    const shelf = tools.find((tool) => tool["name"] === "buy_signed_record");
    expect(shelf).toBeDefined();
    const description = String(shelf?.["description"]);
    // A shelf leads with what calling it accomplishes, then lists its
    // items with price and what each returns.
    expect(description.startsWith("Purpose:")).toBe(true);
    expect(description).toContain("hello:");
    expect(description).toContain(
      "Guaranteed: signature validity forever; verification free forever; price as displayed; delivery format as specified.",
    );
    expect(description).toContain("Not guaranteed:");
    // S1 survives grouping: each item keeps its uniform listing spec,
    // now keyed by item_id on the shelf.
    const specs = shelf?.["specs"] as Record<string, Record<string, unknown>>;
    expectCanonicalKeyOrder(specs["hello"]!);
  });
});

describe("S3: the skill reads as structure", () => {
  it("carries the three layers and its version", async () => {
    const skill = await (await SELF.fetch(`${BASE}/skill.md`)).text();
    /**
     * PINNED TO THE CONSTANT, NOT THE NUMBER. This read "version:
     * 2.2.0" as a literal and passed happily for three releases while
     * the published bundle moved to 2.5.x — a test freezing the exact
     * value that had drifted, which is the fifth of these found today.
     * What the skill must carry is the version THE STORE DECLARES; the
     * publish script refuses any other.
     */
    expect(skill).toContain(`version: ${SKILL_VERSION}`);
    expect(skill).toContain(// Renamed 2026-08-02 on the keeper's ruling: the practice counter is
      // the primary framing and commerce is secondary, so this section is
      // no longer the store's opening pitch and no longer named as though
      // it were. "## Start here" is now the first section.
      "## Also a general store: when to reach for the shelf");
    expect(skill).toContain("## Execution structure");
    expect(skill).toContain("## Resource evidence");
    expect(skill).toContain("Well well. Come in then.");
    expect(skill).toContain("where you got your luck");
  });

  it("mirrors the scheduling signals into the x402 discovery catalog", async () => {
    const discovery = await json(
      await SELF.fetch(`${BASE}/.well-known/x402.json`),
    );
    const signals = discovery["when_to_use"] as string[];
    expect(Array.isArray(signals)).toBe(true);
    // Derived from USE_WHEN since 2026-07-27, so assert the invariant
    // (the situations reach the discovery doc) rather than one phrase.
    expect(signals.length).toBeGreaterThanOrEqual(USE_WHEN.length);
    expect(signals.join(" ")).toContain("context_anchor");
    expect(signals.join(" ")).toContain("standing_watch");
    const resources = discovery["resources"] as Array<Record<string, unknown>>;
    const hello = resources.find((resource) =>
      String(resource["resourceUrl"]).endsWith("/api/buy/hello"),
    );
    expect(String(hello?.["description"]).startsWith("Returns:")).toBe(true);
  });
});
