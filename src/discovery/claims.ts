import { isRecord } from "@/types";
import type { IdentityClaim } from "@/discovery/binding";

/**
 * CLAIM EXTRACTORS — turn a fetched surface into identity claims.
 *
 * Inventory first, no grades. The self-join (self-coherence.ts) is
 * what diffs them. MCP tool names are clusters, not item ids — this
 * file extracts route_identity from cluster itemIds / catalog ids,
 * never from tool names.
 */

function buyIdFromUrl(url: string): string | null {
  const match = url.match(/\/api\/buy\/([a-z0-9_]+)$/);
  return match?.[1] ?? null;
}

function claim(
  kind: IdentityClaim["kind"],
  value: string,
  surface: string,
  about: string,
  fetchedFrom: string,
): IdentityClaim {
  return { kind, value, surface, about, fetched_from: fetchedFrom };
}

export function claimsFromMenuJson(
  body: unknown,
  about: string,
  fetchedFrom: string,
): IdentityClaim[] {
  if (!isRecord(body)) return [];
  const claims: IdentityClaim[] = [];
  const store = body["store"];
  if (isRecord(store) && typeof store["name"] === "string") {
    claims.push(claim("service_identity", store["name"], "menu_json", about, fetchedFrom));
  }
  const items = Array.isArray(body["items"]) ? body["items"] : [];
  for (const item of items) {
    if (!isRecord(item) || typeof item["id"] !== "string") continue;
    claims.push(claim("route_identity", item["id"], "menu_json", about, fetchedFrom));
    if (typeof item["buy_url"] === "string") {
      claims.push(
        claim("endpoint_identity", item["buy_url"], "menu_json", about, fetchedFrom),
      );
    }
  }
  return claims;
}

export function claimsFromX402Json(
  body: unknown,
  about: string,
  fetchedFrom: string,
): IdentityClaim[] {
  if (!isRecord(body)) return [];
  const claims: IdentityClaim[] = [];
  const name =
    (typeof body["serviceName"] === "string" && body["serviceName"]) ||
    (typeof body["name"] === "string" && body["name"]) ||
    "";
  if (name) {
    claims.push(claim("service_identity", name, "x402_catalog", about, fetchedFrom));
  }
  const resources = Array.isArray(body["resources"]) ? body["resources"] : [];
  for (const resource of resources) {
    if (!isRecord(resource) || typeof resource["resourceUrl"] !== "string") {
      continue;
    }
    const id = buyIdFromUrl(resource["resourceUrl"]);
    if (!id) continue;
    claims.push(claim("route_identity", id, "x402_catalog", about, fetchedFrom));
    claims.push(
      claim(
        "endpoint_identity",
        resource["resourceUrl"],
        "x402_catalog",
        about,
        fetchedFrom,
      ),
    );
  }
  return claims;
}

export function claimsFromOpenApi(
  body: unknown,
  about: string,
  fetchedFrom: string,
): IdentityClaim[] {
  if (!isRecord(body)) return [];
  const claims: IdentityClaim[] = [];
  const info = body["info"];
  if (isRecord(info) && typeof info["title"] === "string") {
    claims.push(claim("service_identity", info["title"], "openapi", about, fetchedFrom));
  }
  const servers = Array.isArray(body["servers"]) ? body["servers"] : [];
  const firstServer = servers[0];
  const serverUrl =
    isRecord(firstServer) && typeof firstServer["url"] === "string"
      ? firstServer["url"].replace(/\/$/, "")
      : about.replace(/\/$/, "");
  const paths = isRecord(body["paths"]) ? body["paths"] : {};
  for (const path of Object.keys(paths)) {
    const id = buyIdFromUrl(path);
    if (!id) continue;
    claims.push(claim("route_identity", id, "openapi", about, fetchedFrom));
    claims.push(
      claim("endpoint_identity", `${serverUrl}${path}`, "openapi", about, fetchedFrom),
    );
  }
  return claims;
}

export function claimsFromA2a(
  body: unknown,
  about: string,
  fetchedFrom: string,
): IdentityClaim[] {
  if (!isRecord(body)) return [];
  const claims: IdentityClaim[] = [];
  if (typeof body["name"] === "string") {
    claims.push(claim("service_identity", body["name"], "a2a_agent_card", about, fetchedFrom));
  }
  const skills = Array.isArray(body["skills"]) ? body["skills"] : [];
  for (const skill of skills) {
    if (!isRecord(skill) || typeof skill["id"] !== "string") continue;
    if (skill["id"] === "verify") continue;
    claims.push(claim("route_identity", skill["id"], "a2a_agent_card", about, fetchedFrom));
    const description =
      typeof skill["description"] === "string" ? skill["description"] : "";
    const urlMatch = description.match(/https?:\/\/\S+\/api\/buy\/[a-z0-9_]+/);
    if (urlMatch) {
      claims.push(
        claim("endpoint_identity", urlMatch[0], "a2a_agent_card", about, fetchedFrom),
      );
    }
  }
  return claims;
}

export function claimsFromMcpItemIds(
  itemIds: readonly string[],
  about: string,
  fetchedFrom: string,
): IdentityClaim[] {
  return itemIds.map((id) =>
    claim("route_identity", id, "mcp_clusters", about, fetchedFrom),
  );
}

/**
 * Catalog lines are `  {id}, {name}, …` — the same shape the
 * self-coherence spec already greps. Other indented prose in
 * llms.txt does not use that comma form.
 */
export function claimsFromLlmsTxt(
  text: string,
  about: string,
  fetchedFrom: string,
): IdentityClaim[] {
  const claims: IdentityClaim[] = [];
  for (const match of text.matchAll(/^ {2}([a-z][a-z0-9_]*), /gm)) {
    const id = match[1];
    if (id) claims.push(claim("route_identity", id, "llms_txt", about, fetchedFrom));
  }
  return claims;
}

/** Skill table rows are `| `{id}` | {name} | …`. */
export function claimsFromSkillMd(
  text: string,
  about: string,
  fetchedFrom: string,
): IdentityClaim[] {
  const claims: IdentityClaim[] = [];
  for (const match of text.matchAll(/^\| `([a-z][a-z0-9_]*)` \|/gm)) {
    const id = match[1];
    if (id) claims.push(claim("route_identity", id, "skill_md", about, fetchedFrom));
  }
  return claims;
}
