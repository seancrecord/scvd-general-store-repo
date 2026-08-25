import { isRecord } from "@/types";

/**
 * CAPABILITY CLAIMS — what a catalog says it can do.
 *
 * Landscape §11 capability_coherence, catalog-only: chains, how to
 * talk, payment/auth schemes, streaming. Live 402 behavior is a
 * later probe, not this file. Empty arrays mean the surface did
 * not state that dimension.
 */

export interface CapabilityClaim {
  surface: string;
  chains: string[];
  transports: string[];
  /** The one transport the card names first — compared, not the list. */
  primary_transport: string | null;
  schemes: string[];
  streaming: boolean | null;
  about: string;
  fetched_from: string;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Spellings catalogs actually use. Unknown tokens stay lowercase so
 * a planted stranger still compares, never silently drops.
 */
export function normalizeTransport(raw: string): string {
  const token = raw.trim().toLowerCase().replace(/_/g, "-");
  if (token === "mcp" || token === "streamable-http" || token === "streamablehttp") {
    return "mcp";
  }
  if (token === "http" || token === "http+x402" || token.includes("x402")) {
    return "http+x402";
  }
  if (token === "jsonrpc" || token === "json-rpc") return "jsonrpc";
  return token;
}

function claim(
  surface: string,
  parts: {
    chains?: readonly string[];
    transports?: readonly string[];
    primary_transport?: string | null;
    schemes?: readonly string[];
    streaming?: boolean | null;
  },
  about: string,
  fetchedFrom: string,
): CapabilityClaim {
  const transports = sortedUnique(
    (parts.transports ?? []).map(normalizeTransport),
  );
  const primary = parts.primary_transport
    ? normalizeTransport(parts.primary_transport)
    : null;
  return {
    surface,
    chains: sortedUnique(parts.chains ?? []),
    transports,
    primary_transport: primary,
    schemes: sortedUnique(parts.schemes ?? []),
    streaming: parts.streaming ?? null,
    about,
    fetched_from: fetchedFrom,
  };
}

/** Payment-rail catalogs: `networks` (honest list) or legacy `network`. */
export function capabilityFromX402(
  body: unknown,
  about: string,
  fetchedFrom: string,
  surface = "x402_catalog",
): CapabilityClaim | null {
  if (!isRecord(body)) return null;
  const chains = stringList(body["networks"]);
  if (chains.length === 0 && typeof body["network"] === "string") {
    chains.push(body["network"]);
  }
  const schemes: string[] = [];
  const resources = Array.isArray(body["resources"]) ? body["resources"] : [];
  for (const resource of resources) {
    if (isRecord(resource) && typeof resource["scheme"] === "string") {
      schemes.push(resource["scheme"]);
    }
  }
  if (typeof body["scheme"] === "string") schemes.push(body["scheme"]);
  return claim(
    surface,
    {
      chains,
      transports: ["http+x402"],
      primary_transport: "http+x402",
      schemes,
      streaming: null,
    },
    about,
    fetchedFrom,
  );
}

export function capabilityFromA2a(
  body: unknown,
  about: string,
  fetchedFrom: string,
): CapabilityClaim | null {
  if (!isRecord(body)) return null;
  const transports: string[] = [];
  if (typeof body["preferredTransport"] === "string") {
    transports.push(body["preferredTransport"]);
  }
  const extra = Array.isArray(body["additionalInterfaces"])
    ? body["additionalInterfaces"]
    : [];
  for (const item of extra) {
    if (isRecord(item) && typeof item["transport"] === "string") {
      transports.push(item["transport"]);
    }
  }
  const capabilities = isRecord(body["capabilities"])
    ? body["capabilities"]
    : {};
  const streaming =
    typeof capabilities["streaming"] === "boolean"
      ? capabilities["streaming"]
      : null;
  const schemes = Object.keys(
    isRecord(body["securitySchemes"]) ? body["securitySchemes"] : {},
  );
  const primary =
    typeof body["preferredTransport"] === "string"
      ? body["preferredTransport"]
      : null;
  return claim(
    "a2a_agent_card",
    { transports, primary_transport: primary, schemes, streaming },
    about,
    fetchedFrom,
  );
}

export function capabilityFromMcp(
  body: unknown,
  about: string,
  fetchedFrom: string,
): CapabilityClaim | null {
  if (!isRecord(body)) return null;
  const transport =
    typeof body["transport"] === "string" ? body["transport"] : null;
  return claim(
    "mcp_card",
    {
      transports: transport ? [transport] : [],
      primary_transport: transport,
    },
    about,
    fetchedFrom,
  );
}
