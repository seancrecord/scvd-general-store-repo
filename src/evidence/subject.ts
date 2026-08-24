/**
 * SUBJECT DIMENSIONS — the ONE registry of what an observation is
 * about (ledger M2; spec §2a). The subject of every observation is
 * the tuple (endpoint, protocol, protocol_version, chain, rail),
 * carried in the envelope, the corpus schema, and the battery
 * manifest's applicability field — all reading THIS file, so a new
 * protocol family lands as a registry entry and new subject rows,
 * never as a schema migration. If adding a protocol requires touching
 * the envelope schema, the schema was wrong (spec §2a).
 *
 * Two different strictness rules, on purpose:
 * - PROTOCOLS are a closed registry: observing a protocol family
 *   means we built a battery family for it, which is a code change
 *   anyway, so the registry gaining a row IS the honest record of
 *   that build. Unknown protocol = reject.
 * - CHAINS are open grammar: a well-formed CAIP-2 id we have never
 *   seen is a valid subject — the observatory must be able to record
 *   an observation about a door on a chain it met five minutes ago.
 *   KNOWN_CHAINS says which ids our own rails and readers touch; it
 *   is documentation for coverage claims (M1), never a gate.
 */

export interface ProtocolFamily {
  id: string;
  /** Versions the battery can name. An envelope may cite only these. */
  versions: readonly string[];
}

/**
 * The protocol families the observatory has battery coverage for.
 * MPP, AP2/ACP-class land here as new rows when their batteries are
 * built (spec §12) — the row arriving WITH the battery is the point.
 */
export const PROTOCOL_FAMILIES: readonly ProtocolFamily[] = [
  { id: "x402", versions: ["v1", "v2"] },
  /** The signed offer/receipt extension battery (offer-receipt rev 1). */
  { id: "x402-offer-receipt", versions: ["rev1"] },
  /**
   * Discovery surfaces (joins thesis, 2026-08-24). The row is the
   * subject id so a coherence observation can name the surface it
   * looked at. The battery that diffs them is not built yet — the
   * row arriving first is M2's rule, not a claim we have checks.
   */
  { id: "x402_bazaar", versions: ["rev1"] },
  { id: "x402_list", versions: ["rev1"] },
  { id: "mcp_card", versions: ["rev1"] },
  { id: "mcp_registry_listing", versions: ["rev1"] },
  { id: "a2a_agent_card", versions: ["0.3.0"] },
  { id: "llms_txt", versions: ["rev1"] },
  { id: "openapi", versions: ["3.1"] },
  { id: "menu_json", versions: ["rev1"] },
  { id: "agent_services_json", versions: ["rev1"] },
  { id: "owned_passport", versions: ["rev1"] },
  { id: "receipt", versions: ["rev1"] },
  { id: "badge", versions: ["rev1"] },
] as const;

/**
 * CAIP-2: namespace ":" reference — namespace is 3–8 lowercase
 * alphanumerics/hyphen, reference 1–32 of a slightly wider set.
 * Grammar per the CAIP-2 spec; deliberately not a known-list check.
 */
const CAIP2_GRAMMAR = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/;

/** Chains the store's own rails and readers currently touch (M1's
 * coverage matrix documents DEPTH per class; this list is only the
 * id spelling, so coverage claims and subjects cannot drift apart). */
/** Base Sepolia — named so coverage can exclude sandbox without
 * retyping the id. Listed in KNOWN_CHAINS because a subject on it
 * is valid; no production class claims depth there. */
export const SANDBOX_CHAIN = "eip155:84532" as const;

export const KNOWN_CHAINS: readonly string[] = [
  "eip155:8453", // Base mainnet
  SANDBOX_CHAIN, // Base Sepolia (sandbox walks only)
  "eip155:137", // Polygon mainnet
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", // Solana mainnet (CAIP-2)
] as const;

/** Assets a rail may settle in. One entry today, and that is the
 * honest state of the store's rails — additive like the protocols. */
export const RAIL_ASSETS: readonly string[] = ["usdc"] as const;

/**
 * A rail is "<asset>:<chain>" — settlement asset on a specific chain
 * (e.g. "usdc:eip155:8453"). Derived spelling, never a third registry:
 * the asset must be registered, the chain must parse.
 */
export function isValidRail(rail: string): boolean {
  const separator = rail.indexOf(":");
  if (separator <= 0) return false;
  const asset = rail.slice(0, separator);
  const chain = rail.slice(separator + 1);
  return RAIL_ASSETS.includes(asset) && CAIP2_GRAMMAR.test(chain);
}

export function isValidChain(chain: string): boolean {
  return CAIP2_GRAMMAR.test(chain);
}

export function isKnownChain(chain: string): boolean {
  return KNOWN_CHAINS.includes(chain);
}

export function protocolFamily(id: string): ProtocolFamily | undefined {
  return PROTOCOL_FAMILIES.find((family) => family.id === id);
}

/** The subject tuple (spec §2a). */
export interface EvidenceSubject {
  /** The observed door, as fetched — full URL, never a bare host. */
  endpoint: string;
  /** A PROTOCOL_FAMILIES id. */
  protocol: string;
  /** A version that family's registry row names. */
  protocol_version: string;
  /** CAIP-2 chain id the observation concerns, or "none" when the
   * observation is protocol-level with no chain in view (a robots
   * read, a headers-only probe). Stated, never omitted (§2). */
  chain: string;
  /** "<asset>:<chain>" settlement rail, or "none" when no settlement
   * dimension exists for this observation class. */
  rail: string;
}

/** Defect codes are stable and namespaced, battery-style (spec §4). */
export function subjectDefects(subject: EvidenceSubject): string[] {
  const defects: string[] = [];
  let endpointValid = false;
  try {
    const url = new URL(subject.endpoint);
    endpointValid = url.protocol === "https:" || url.protocol === "http:";
  } catch {
    endpointValid = false;
  }
  if (!endpointValid) defects.push("subject.endpoint.not-a-url");
  const family = protocolFamily(subject.protocol);
  if (!family) {
    defects.push("subject.protocol.unregistered");
  } else if (!family.versions.includes(subject.protocol_version)) {
    defects.push("subject.protocol_version.unregistered");
  }
  if (subject.chain !== "none" && !isValidChain(subject.chain)) {
    defects.push("subject.chain.caip2-grammar");
  }
  if (subject.rail !== "none" && !isValidRail(subject.rail)) {
    defects.push("subject.rail.malformed");
  }
  return defects;
}
