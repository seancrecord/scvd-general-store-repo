import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  assembleSelfRow,
  selfJoinDisagreements,
  type FetchedSelfRow,
} from "@/discovery";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";
import { MENU_ITEMS, STORE_SERVICE_NAME } from "@/store";
import { isRecord } from "@/types";

const ABOUT = "https://scvd.store";
const SHELF = MENU_ITEMS.map((item) => item.id).sort();

/**
 * JOINS THESIS STEP 4, pointed at us: extract claims from each
 * owned catalog, then set-join them with the same function we will
 * sell. The inventory spec already greps ids. This spec is the
 * instrument — extractors + joinClaimSets — failing if a surface
 * drifts OR if the join goes quiet (empty extractors would
 * "agree").
 */

async function fetchLiveRow(): Promise<FetchedSelfRow> {
  const [menu, x402, openapi, a2a, llms, skillMd] = await Promise.all([
    SELF.fetch(`${ABOUT}/menu.json`).then((r) => r.json()),
    SELF.fetch(`${ABOUT}/.well-known/x402.json`).then((r) => r.json()),
    SELF.fetch(`${ABOUT}/openapi.json`).then((r) => r.json()),
    SELF.fetch(`${ABOUT}/.well-known/a2a.json`).then((r) => r.json()),
    SELF.fetch(`${ABOUT}/llms.txt`).then((r) => r.text()),
    SELF.fetch(`${ABOUT}/skill.md`).then((r) => r.text()),
  ]);
  return {
    about: ABOUT,
    fetchedFrom: ABOUT,
    menu,
    x402,
    openapi,
    a2a,
    llms,
    skillMd,
    mcpItemIds: SHELF_CLUSTERS.flatMap((cluster) => [...cluster.itemIds]),
  };
}

function routeIds(claims: { kind: string; value: string }[]): string[] {
  return claims
    .filter((claim) => claim.kind === "route_identity")
    .map((claim) => claim.value)
    .sort();
}

function serviceNames(claims: { kind: string; value: string }[]): string[] {
  return claims
    .filter((claim) => claim.kind === "service_identity")
    .map((claim) => claim.value);
}

describe("claim extractors read the live catalogs", () => {
  it("every catalog surface states the live shelf as route_identity", async () => {
    const sides = assembleSelfRow(await fetchLiveRow());
    expect(sides.length).toBeGreaterThan(0);
    for (const side of sides) {
      expect(routeIds(side.claims), `${side.surface} extracted no routes`).toEqual(
        SHELF,
      );
    }
  });

  it("JSON catalogs that name the store agree on service_identity", async () => {
    const sides = assembleSelfRow(await fetchLiveRow());
    const named = sides.filter((side) =>
      side.claims.some((claim) => claim.kind === "service_identity"),
    );
    expect(named.map((side) => side.surface).sort()).toEqual(
      ["a2a_agent_card", "menu_json", "openapi", "x402_catalog"].sort(),
    );
    for (const side of named) {
      expect(serviceNames(side.claims), `${side.surface} service drifted`).toEqual([
        STORE_SERVICE_NAME,
      ]);
    }
  });
});

describe("the self-join uses the binding instrument", () => {
  it("live surfaces produce zero disagreements", async () => {
    const sides = assembleSelfRow(await fetchLiveRow());
    for (const side of sides) {
      expect(routeIds(side.claims).length, `${side.surface} silent`).toBe(
        SHELF.length,
      );
    }
    expect(selfJoinDisagreements(sides)).toEqual([]);
  });

  it("a planted extra x402 route is a disagreement — the join can fire", async () => {
    const row = await fetchLiveRow();
    expect(isRecord(row.x402)).toBe(true);
    const x402 = { ...(row.x402 as Record<string, unknown>) };
    const resources = Array.isArray(x402["resources"]) ? [...x402["resources"]] : [];
    resources.push({ resourceUrl: `${ABOUT}/api/buy/planted_ghost_item` });
    x402["resources"] = resources;
    const sides = assembleSelfRow({ ...row, x402 });
    const found = selfJoinDisagreements(sides);
    expect(found.length, "planted id produced no disagreement").toBeGreaterThan(0);
    expect(
      found.some(
        (row) =>
          row.kind === "route_identity" &&
          row.only_right.includes("planted_ghost_item"),
      ),
    ).toBe(true);
  });

  it("MCP tool names bound as route_identity disagree — clusters are not ids", async () => {
    const row = await fetchLiveRow();
    const sides = assembleSelfRow({
      ...row,
      mcpItemIds: SHELF_CLUSTERS.map((cluster) => cluster.name),
    });
    const found = selfJoinDisagreements(sides);
    const mcpVsMenu = found.filter(
      (row) =>
        row.kind === "route_identity" &&
        (row.left_surface === "mcp_clusters" || row.right_surface === "mcp_clusters"),
    );
    expect(mcpVsMenu.length).toBeGreaterThan(0);
    const names = new Set(SHELF_CLUSTERS.map((cluster) => cluster.name));
    expect(
      mcpVsMenu.some((row) =>
        [...row.only_left, ...row.only_right].some((id) => names.has(id)),
      ),
    ).toBe(true);
  });
});
