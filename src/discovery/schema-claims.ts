import { buyIdFromUrl } from "@/discovery/claims";
import { isRecord } from "@/types";

/**
 * SCHEMA CLAIMS — what a surface says you must send to buy a route.
 *
 * Landscape §11 schema_coherence: agents compose from schemas, not
 * prose. Identity joins already ask whether the catalogs name the
 * same doors. This file asks a different question: for a door both
 * sides named, do the required input fields agree?
 *
 * MCP's `item_id` is a selector on a cluster tool, not a buy
 * parameter — OpenAPI and x402 put the item in the path. It is
 * stripped before the claim is stored so the join compares the
 * fields a buyer actually fills in.
 */

export interface SchemaClaim {
  route: string;
  surface: string;
  /** Required input names, sorted, unique. The compared fact. */
  required: string[];
  about: string;
  fetched_from: string;
}

const MCP_SELECTOR = "item_id";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function claim(
  route: string,
  surface: string,
  required: readonly string[],
  about: string,
  fetchedFrom: string,
): SchemaClaim {
  return {
    route,
    surface,
    required: sortedUnique(required.filter((name) => name !== MCP_SELECTOR)),
    about,
    fetched_from: fetchedFrom,
  };
}

/** Query parameters marked required on each /api/buy/{id} operation. */
export function schemaFromOpenApi(
  body: unknown,
  about: string,
  fetchedFrom: string,
): SchemaClaim[] {
  if (!isRecord(body) || !isRecord(body["paths"])) return [];
  const claims: SchemaClaim[] = [];
  for (const [path, item] of Object.entries(body["paths"])) {
    const route = buyIdFromUrl(path);
    if (!route || !isRecord(item)) continue;
    const required: string[] = [];
    for (const operation of Object.values(item)) {
      if (!isRecord(operation) || !Array.isArray(operation["parameters"])) {
        continue;
      }
      for (const parameter of operation["parameters"]) {
        if (!isRecord(parameter)) continue;
        if (parameter["in"] !== "query") continue;
        if (parameter["required"] !== true) continue;
        if (typeof parameter["name"] === "string") {
          required.push(parameter["name"]);
        }
      }
    }
    claims.push(claim(route, "openapi", required, about, fetchedFrom));
  }
  return claims;
}

/** inputSchema.required on each paid x402 catalog resource. */
export function schemaFromX402(
  body: unknown,
  about: string,
  fetchedFrom: string,
): SchemaClaim[] {
  if (!isRecord(body) || !Array.isArray(body["resources"])) return [];
  const claims: SchemaClaim[] = [];
  for (const resource of body["resources"]) {
    if (!isRecord(resource) || typeof resource["resourceUrl"] !== "string") {
      continue;
    }
    const route = buyIdFromUrl(resource["resourceUrl"]);
    if (!route || !isRecord(resource["inputSchema"])) continue;
    claims.push(
      claim(
        route,
        "x402_catalog",
        stringList(resource["inputSchema"]["required"]),
        about,
        fetchedFrom,
      ),
    );
  }
  return claims;
}

function routeFromIf(branch: unknown): string | null {
  if (!isRecord(branch) || !isRecord(branch["if"])) return null;
  const properties = branch["if"]["properties"];
  if (!isRecord(properties) || !isRecord(properties[MCP_SELECTOR])) return null;
  const value = properties[MCP_SELECTOR]["const"];
  return typeof value === "string" ? value : null;
}

function requiredFromThen(branch: unknown): string[] {
  if (!isRecord(branch) || !isRecord(branch["then"])) return [];
  return stringList(branch["then"]["required"]);
}

/**
 * Per-item required fields from a tools/list body. Cluster tools
 * publish itemIds plus allOf if/then branches; a missing branch is
 * a claim of "no extra required fields," not silence.
 */
export function schemaFromMcpTools(
  body: unknown,
  about: string,
  fetchedFrom: string,
): SchemaClaim[] {
  const tools = isRecord(body) && Array.isArray(body["tools"])
    ? body["tools"]
    : Array.isArray(body)
      ? body
      : [];
  const claims: SchemaClaim[] = [];
  for (const tool of tools) {
    if (!isRecord(tool)) continue;
    const schema = isRecord(tool["inputSchema"]) ? tool["inputSchema"] : {};
    const byRoute = new Map<string, string[]>();
    const branches = Array.isArray(schema["allOf"]) ? schema["allOf"] : [];
    for (const branch of branches) {
      const route = routeFromIf(branch);
      if (!route) continue;
      byRoute.set(route, requiredFromThen(branch));
    }
    const itemIds = stringList(tool["itemIds"]);
    if (itemIds.length > 0) {
      for (const route of itemIds) {
        claims.push(
          claim(route, "mcp_tools", byRoute.get(route) ?? [], about, fetchedFrom),
        );
      }
      continue;
    }
    if (typeof tool["itemId"] === "string") {
      claims.push(
        claim(
          tool["itemId"],
          "mcp_tools",
          stringList(schema["required"]),
          about,
          fetchedFrom,
        ),
      );
    }
  }
  return claims;
}
