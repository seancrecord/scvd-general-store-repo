import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  OWNED_DISCOVERY_SURFACES,
  shelfBearingSurfaces,
} from "@/discovery";
import { SHELF_CLUSTERS, unshelvedItemIds } from "@/lib/mcp-tools";
import { MENU_ITEMS } from "@/store";
import { RETIRED_ITEMS } from "@/store/retired";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";
const SHELF = MENU_ITEMS.map((item) => item.id);
const SHELF_SET = new Set(SHELF);
const RETIRED = RETIRED_ITEMS.map((item) => item.id);

/**
 * SELF-ROW COHERENCE (2026-08-24).
 *
 * The joins thesis: machine surfaces can each be valid and still
 * disagree. We sell that observation pointed at other people. This
 * spec is the inventory join (ids, prices, buy URLs). The named
 * CI release blocker is test/self-row-blocker.spec.ts. Surfaces
 * this join watches: menu.json, x402.json, OpenAPI, the A2A card,
 * llms.txt, skill.md, and the MCP cluster list.
 *
 * Existing specs already guard one surface, or one direction
 * (present / not stale). This one is the JOIN: same live id set,
 * same min price, same buy URL, no retired id still catalogued.
 * MCP tool names are clusters, not item ids — that mismatch is
 * by design and is not a finding; the union of cluster itemIds is.
 */

async function fetchOk(path: string): Promise<Response> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, `${path} did not serve`).toBe(200);
  return response;
}

async function fetchJson(path: string): Promise<Record<string, unknown>> {
  const body: unknown = await (await fetchOk(path)).json();
  expect(isRecord(body), `${path} is not a JSON object`).toBe(true);
  return body as Record<string, unknown>;
}

function buyIdFromUrl(url: string): string | null {
  const match = url.match(/\/api\/buy\/([a-z0-9_]+)$/);
  return match?.[1] ?? null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
}

function sorted(ids: Iterable<string>): string[] {
  return [...ids].sort();
}

function missingFrom(have: Set<string>, want: readonly string[]): string[] {
  return want.filter((id) => !have.has(id));
}

describe("owned discovery surfaces stay reachable", () => {
  it("every inventoried door answers 200", async () => {
    expect(OWNED_DISCOVERY_SURFACES.length).toBeGreaterThan(0);
    for (const surface of OWNED_DISCOVERY_SURFACES) {
      await fetchOk(surface.path);
    }
  });

  it("the inventory names the shelf-bearing doors the join check uses", () => {
    const kinds = new Set(shelfBearingSurfaces().map((surface) => surface.kind));
    for (const kind of [
      "menu_json",
      "llms_txt",
      "skill_md",
      "openapi",
      "x402_catalog",
      "a2a_agent_card",
    ] as const) {
      expect(kinds.has(kind), `${kind} dropped from the inventory`).toBe(true);
    }
  });
});

describe("the live shelf is the same set on every catalog surface", () => {
  it("menu, x402, openapi, a2a, llms, skill, and MCP clusters name the same ids", async () => {
    const menu = await fetchJson("/menu.json");
    const items = Array.isArray(menu["items"]) ? menu["items"] : [];
    const menuIds = items.flatMap((item) =>
      isRecord(item) && typeof item["id"] === "string" ? [item["id"]] : [],
    );

    const x402 = await fetchJson("/.well-known/x402.json");
    const resources = Array.isArray(x402["resources"]) ? x402["resources"] : [];
    const x402Ids = resources.flatMap((resource) => {
      if (!isRecord(resource) || typeof resource["resourceUrl"] !== "string") {
        return [];
      }
      const id = buyIdFromUrl(resource["resourceUrl"]);
      return id ? [id] : [];
    });

    const openapi = await fetchJson("/openapi.json");
    const paths = isRecord(openapi["paths"]) ? openapi["paths"] : {};
    const openapiIds = Object.keys(paths).flatMap((path) => {
      const id = buyIdFromUrl(path);
      return id ? [id] : [];
    });

    const a2a = await fetchJson("/.well-known/a2a.json");
    const skills = Array.isArray(a2a["skills"]) ? a2a["skills"] : [];
    const a2aIds = skills.flatMap((skill) =>
      isRecord(skill) &&
      typeof skill["id"] === "string" &&
      skill["id"] !== "verify"
        ? [skill["id"]]
        : [],
    );

    const llms = await (await fetchOk("/llms-full.txt")).text();
    const skillMd = await (await fetchOk("/skill.md")).text();
    const llmsIds = SHELF.filter((id) => llms.includes(`  ${id},`));
    const skillIds = SHELF.filter((id) => skillMd.includes(`\`${id}\``));

    const mcpIds = SHELF_CLUSTERS.flatMap((cluster) => [...cluster.itemIds]);

    const catalogs: Record<string, string[]> = {
      menu_json: menuIds,
      x402_json: x402Ids,
      openapi: openapiIds,
      a2a: a2aIds,
      llms_txt: llmsIds,
      skill_md: skillIds,
      mcp_clusters: mcpIds,
    };

    const expected = sorted(SHELF);
    for (const [surface, ids] of Object.entries(catalogs)) {
      expect(sorted(new Set(ids)), `${surface} drifted from MENU_ITEMS`).toEqual(
        expected,
      );
    }
    expect(unshelvedItemIds(), "an item sits on no MCP shelf").toEqual([]);
  });

  it("no retired id is still catalogued as live", async () => {
    const menu = await fetchJson("/menu.json");
    const items = Array.isArray(menu["items"]) ? menu["items"] : [];
    const live = new Set(
      items.flatMap((item) =>
        isRecord(item) && typeof item["id"] === "string" ? [item["id"]] : [],
      ),
    );
    const x402 = await fetchJson("/.well-known/x402.json");
    const resources = Array.isArray(x402["resources"]) ? x402["resources"] : [];
    for (const resource of resources) {
      if (isRecord(resource) && typeof resource["resourceUrl"] === "string") {
        const id = buyIdFromUrl(resource["resourceUrl"]);
        if (id) live.add(id);
      }
    }
    const stillListed = RETIRED.filter((id) => live.has(id));
    expect(stillListed, "a retired door is still in a live catalog").toEqual([]);
    expect(missingFrom(SHELF_SET, RETIRED)).toEqual(RETIRED);
  });
});

describe("per-item facts agree across the catalogs that quote them", () => {
  it("min price and buy URL match the shelf on menu, x402, openapi, and a2a", async () => {
    const menu = await fetchJson("/menu.json");
    const items = Array.isArray(menu["items"]) ? menu["items"] : [];
    const menuById = new Map<
      string,
      { price: number; buyUrl: string; tiers: number[] }
    >();
    for (const item of items) {
      if (
        isRecord(item) &&
        typeof item["id"] === "string" &&
        typeof item["price_usdc"] === "number" &&
        typeof item["buy_url"] === "string"
      ) {
        menuById.set(item["id"], {
          price: item["price_usdc"],
          buyUrl: item["buy_url"],
          tiers: asNumberArray(item["price_tiers_usdc"]),
        });
      }
    }

    const x402 = await fetchJson("/.well-known/x402.json");
    const resources = Array.isArray(x402["resources"]) ? x402["resources"] : [];
    const x402ById = new Map<string, { url: string; tiers: number[] }>();
    for (const resource of resources) {
      if (!isRecord(resource) || typeof resource["resourceUrl"] !== "string") {
        continue;
      }
      const id = buyIdFromUrl(resource["resourceUrl"]);
      if (!id || !SHELF_SET.has(id)) continue;
      x402ById.set(id, {
        url: resource["resourceUrl"],
        tiers: asNumberArray(resource["price_usdc_options"]),
      });
    }

    const openapi = await fetchJson("/openapi.json");
    const paths = isRecord(openapi["paths"]) ? openapi["paths"] : {};
    const openapiById = new Map<string, { tiers: number[] }>();
    for (const [path, operation] of Object.entries(paths)) {
      const id = buyIdFromUrl(path);
      if (!id || !isRecord(operation) || !isRecord(operation["get"])) continue;
      const payment = operation["get"]["x-payment"];
      if (!isRecord(payment)) continue;
      openapiById.set(id, { tiers: asNumberArray(payment["price_usdc_options"]) });
    }

    const a2a = await fetchJson("/.well-known/a2a.json");
    const skills = Array.isArray(a2a["skills"]) ? a2a["skills"] : [];
    const a2aById = new Map<string, string>();
    for (const skill of skills) {
      if (isRecord(skill) && typeof skill["id"] === "string") {
        a2aById.set(
          skill["id"],
          typeof skill["description"] === "string" ? skill["description"] : "",
        );
      }
    }

    const disagreements: string[] = [];
    for (const item of MENU_ITEMS) {
      const catalog = menuById.get(item.id);
      const x402Row = x402ById.get(item.id);
      const openapiRow = openapiById.get(item.id);
      const a2aDescription = a2aById.get(item.id);
      const expectedUrl = `${BASE}/api/buy/${item.id}`;

      if (!catalog) {
        disagreements.push(`${item.id}: missing from menu.json`);
        continue;
      }
      if (catalog.price !== item.price_usdc) {
        disagreements.push(
          `${item.id}: menu price ${catalog.price} ≠ shelf ${item.price_usdc}`,
        );
      }
      if (catalog.buyUrl !== expectedUrl) {
        disagreements.push(`${item.id}: menu buy_url ${catalog.buyUrl}`);
      }
      if (Math.min(...catalog.tiers) !== item.price_usdc) {
        disagreements.push(`${item.id}: menu tiers do not open at the shelf price`);
      }
      if (!x402Row) {
        disagreements.push(`${item.id}: missing from x402.json`);
      } else {
        if (x402Row.url !== expectedUrl) {
          disagreements.push(`${item.id}: x402 resourceUrl ${x402Row.url}`);
        }
        if (Math.min(...x402Row.tiers) !== item.price_usdc) {
          disagreements.push(`${item.id}: x402 min price drifted`);
        }
      }
      if (!openapiRow) {
        disagreements.push(`${item.id}: missing from openapi.json`);
      } else if (Math.min(...openapiRow.tiers) !== item.price_usdc) {
        disagreements.push(`${item.id}: openapi min price drifted`);
      }
      if (a2aDescription === undefined) {
        disagreements.push(`${item.id}: missing from a2a skills`);
      } else if (!a2aDescription.includes(`$${item.price_usdc}`)) {
        disagreements.push(`${item.id}: a2a skill does not quote $${item.price_usdc}`);
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("the thin x402 index points at the rich catalog and the A2A card", async () => {
    const thin = await fetchJson("/.well-known/x402");
    expect(thin["catalog"]).toBe(`${BASE}/.well-known/x402.json`);
    expect(thin["a2a"]).toBe(`${BASE}/.well-known/a2a.json`);
    const resources = Array.isArray(thin["resources"]) ? thin["resources"] : [];
    const urls = resources.flatMap((resource) =>
      isRecord(resource) && typeof resource["resourceUrl"] === "string"
        ? [resource["resourceUrl"]]
        : [],
    );
    for (const item of MENU_ITEMS) {
      expect(urls, `${item.id} missing from the thin x402 index`).toContain(
        `${BASE}/api/buy/${item.id}`,
      );
    }
  });
});
