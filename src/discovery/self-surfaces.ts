/**
 * OUR OWN DISCOVERY SURFACES, listed once.
 *
 * The joins thesis (docs/VERIFICATION_LANDSCAPE_2026-08.md §11):
 * everyone validates each machine surface alone; SCVD validates
 * whether they agree. We are our own first subject — this file is
 * the host inventory for scvd.store. Adding a new agent-facing
 * catalog door means adding it here; the self-coherence spec fetches
 * every row and fails the suite if a catalog-bearing surface drifts
 * from MENU_ITEMS.
 *
 * Inventory only. No grades, no scores, no verdicts. Those belong
 * to later coherence batteries pointed at other people's hosts.
 *
 * Paths only, never a second typed item list: the shelf itself is
 * MENU_ITEMS. Surfaces that do not claim a shelf (signing key, DID,
 * liveness, the temporary x402-list token) stay out — they cannot
 * disagree about what we sell.
 */

export type DiscoverySurfaceKind =
  | "menu_json"
  | "llms_txt"
  | "skill_md"
  | "openapi"
  | "x402_catalog"
  | "x402_thin"
  | "a2a_agent_card"
  | "mcp_well_known"
  | "agents_md";

export interface OwnedDiscoverySurface {
  id: string;
  path: string;
  kind: DiscoverySurfaceKind;
  /** True when this surface claims the live paid shelf. */
  carries_shelf: boolean;
}

export const OWNED_DISCOVERY_SURFACES: readonly OwnedDiscoverySurface[] = [
  { id: "menu_json", path: "/menu.json", kind: "menu_json", carries_shelf: true },
  { id: "llms_txt", path: "/llms.txt", kind: "llms_txt", carries_shelf: true },
  { id: "skill_md", path: "/skill.md", kind: "skill_md", carries_shelf: true },
  { id: "openapi", path: "/openapi.json", kind: "openapi", carries_shelf: true },
  {
    id: "x402_catalog",
    path: "/.well-known/x402.json",
    kind: "x402_catalog",
    carries_shelf: true,
  },
  {
    id: "x402_thin",
    path: "/.well-known/x402",
    kind: "x402_thin",
    carries_shelf: false,
  },
  {
    id: "a2a_agent_card",
    path: "/.well-known/a2a.json",
    kind: "a2a_agent_card",
    carries_shelf: true,
  },
  {
    id: "mcp_well_known",
    path: "/.well-known/mcp",
    kind: "mcp_well_known",
    carries_shelf: false,
  },
  {
    id: "agents_md",
    path: "/agents.md",
    kind: "agents_md",
    // Manual, not a catalog: it points at /menu.json and names the
    // MCP shelves. Requiring every item id here would force the
    // operational guide to become a second typed shelf.
    carries_shelf: false,
  },
] as const;

export function shelfBearingSurfaces(): readonly OwnedDiscoverySurface[] {
  return OWNED_DISCOVERY_SURFACES.filter((surface) => surface.carries_shelf);
}
