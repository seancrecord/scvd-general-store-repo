import { OASF_RECORD_PATH } from "@/lib/oasf-record";

/** Protocol scope is separate from whether anybody has indexed it. */
export const DISCOVERY_PROTOCOLS = [
  { id: "x402", label: "x402", path: "/conformance", status: "available", scope: "Payment challenges, endpoint inspection and signed offer/receipt verification. The current quote names available checkout rails." },
  { id: "mpp", label: "MPP", path: "/developers", status: "inspection", scope: "Read-only MPP inspection. Checkout availability is declared separately in current payment capabilities; inspection is not a promise that every product accepts MPP." },
  { id: "mcp", label: "MCP", path: "/mcp", status: "available", scope: "Remote tools for the store and a focused verifier at /mcp/verifier." },
  { id: "webmcp", label: "WebMCP", path: "/webmcp.js", status: "available", scope: "Browser tool registration on supported browsers; client support and origin-trial availability still apply." },
  { id: "erc8004", label: "ERC-8004", path: "/.well-known/agent-registration.json", status: "available", scope: "Canonical identity, service links and endpoint-domain acknowledgment. Indexing and ownership do not establish reputation." },
  { id: "a2a", label: "A2A", path: "/.well-known/agent-card.json", status: "available", scope: "The agent card declares the current endpoint, capabilities and version." },
  { id: "oasf", label: "OASF", path: OASF_RECORD_PATH, status: "published-record", scope: "Canonical capability record. A record served here does not establish signed federation publication or Cisco/Anro admission." },
  { id: "ucp", label: "UCP", path: "/.well-known/ucp", status: "available", scope: "Business profile, catalog search, lookup and product detail at the pinned 2026-08-25 release. Checkout and order are advertised in the profile exactly when this deployment has them switched on; the profile's status block says which items and rails. No third-party conformance claim." },
  { id: "skills", label: "Skills and plugins", path: "/.well-known/agent-skills/index.json", status: "available", scope: "Task guidance paired with MCP connections. Each host has its own installation and publication status." },
  { id: "general", label: "Other public records", path: "/trust", status: "records", scope: "Source, discovery and operator records that are not evidence of a particular protocol implementation." },
] as const;

export type DiscoveryProtocol = (typeof DISCOVERY_PROTOCOLS)[number]["id"];
