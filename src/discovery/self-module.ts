import { citeWrappedJoin, type PassportModule } from "@/discovery/cite-module";
import { schemaModuleFromCatalogs } from "@/discovery/schema-module";
import {
  assembleSelfRow,
  type FetchedSelfRow,
} from "@/discovery/self-coherence";
import { jcsCanonicalize } from "@/lib/jcs";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";

export type { PassportModule };

/**
 * SELF-PASSPORT MODULE — the join, cited on our own passport.
 *
 * Landscape §10.1: the passport is a derived signed view over
 * envelopes. This file runs the self-row join, wraps it, and
 * returns the citation the passport signs: class id, schema,
 * evidence hash, derived fold, limitations. No scores. A census
 * passport cites the same module when a join was already stored;
 * GET /passport/{host} does not fetch.
 */

export type CatalogFetcher = (path: string) => Promise<string>;

/** Loopback fetch from the incoming request's origin — not STORE_BASE_URL, which can leave the Worker. */
export function originCatalogFetcher(origin: string): CatalogFetcher {
  return async (path: string) => {
    const response = await fetch(`${origin}${path}`);
    if (!response.ok) {
      throw new Error(`self-catalog ${path} returned ${response.status}`);
    }
    return response.text();
  };
}

const CATALOG_PATHS = {
  menu_json: "/menu.json",
  x402_catalog: "/.well-known/x402.json",
  openapi: "/openapi.json",
  a2a_agent_card: "/.well-known/a2a.json",
  llms_txt: "/llms.txt",
  skill_md: "/skill.md",
} as const;

export async function fetchSelfCatalogs(
  base: string,
  getText: CatalogFetcher,
): Promise<{
  row: FetchedSelfRow;
  bodies: Record<string, string>;
  urls: Record<string, string>;
}> {
  const texts: Record<string, string> = {};
  const urls: Record<string, string> = {};
  // Sequential fetches stacked the landing over the 5s spec timeout.
  const fetched = await Promise.all(
    Object.entries(CATALOG_PATHS).map(async ([surface, path]) => ({
      surface,
      path,
      text: await getText(path),
    })),
  );
  for (const { surface, path, text } of fetched) {
    texts[surface] = text;
    urls[surface] = `${base}${path}`;
  }
  const mcpItemIds = SHELF_CLUSTERS.flatMap((cluster) => [...cluster.itemIds]);
  texts["mcp_clusters"] = jcsCanonicalize(mcpItemIds);
  return {
    row: {
      about: base,
      fetchedFrom: base,
      menu: JSON.parse(texts["menu_json"] ?? "null"),
      x402: JSON.parse(texts["x402_catalog"] ?? "null"),
      openapi: JSON.parse(texts["openapi"] ?? "null"),
      a2a: JSON.parse(texts["a2a_agent_card"] ?? "null"),
      llms: texts["llms_txt"] ?? "",
      skillMd: texts["skill_md"] ?? "",
      mcpItemIds,
    },
    bodies: texts,
    urls,
  };
}

export async function discoveryModuleFromCatalogs(
  live: Awaited<ReturnType<typeof fetchSelfCatalogs>>,
  signingKeyHex: string,
  at: string,
  clock: string,
): Promise<PassportModule> {
  const cited = await citeWrappedJoin({
    about: live.row.about,
    sides: assembleSelfRow(live.row),
    bodies: live.bodies,
    urls: live.urls,
    signingKeyHex,
    at,
    clock,
    authorizationBase: live.row.about,
  });
  if (!cited) {
    throw new Error(
      "self-passport refused to cite the join — fewer than two claim-bearing surfaces, or the envelope did not validate",
    );
  }
  return cited;
}

/** One catalog fetch, both join citations. The landing path used to fetch twice. */
export async function selfPassportModules(input: {
  base: string;
  signingKeyHex: string;
  at: string;
  clock: string;
  getText: CatalogFetcher;
}): Promise<PassportModule[]> {
  const live = await fetchSelfCatalogs(input.base, input.getText);
  return Promise.all([
    discoveryModuleFromCatalogs(
      live,
      input.signingKeyHex,
      input.at,
      input.clock,
    ),
    schemaModuleFromCatalogs(
      live,
      input.signingKeyHex,
      input.at,
      input.clock,
    ),
  ]);
}

export async function selfPassportDiscoveryModule(input: {
  base: string;
  signingKeyHex: string;
  at: string;
  clock: string;
  getText?: CatalogFetcher;
}): Promise<PassportModule> {
  const getText =
    input.getText ??
    (async (path: string) => {
      const response = await fetch(`${input.base}${path}`);
      if (!response.ok) {
        throw new Error(`self-catalog ${path} returned ${response.status}`);
      }
      return response.text();
    });
  const live = await fetchSelfCatalogs(input.base, getText);
  return discoveryModuleFromCatalogs(
    live,
    input.signingKeyHex,
    input.at,
    input.clock,
  );
}
