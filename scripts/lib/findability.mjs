/**
 * THE FINDABILITY SIGNALS, IN ONE TABLE (2026-09-11).
 *
 * The registries and crawlers that decide whether an agent can find
 * this store read fixed paths: some in the repository (a manifest at
 * the root, a plugin descriptor in a dotted directory), some on the
 * site (a .well-known file, a text map at the root). Each row names
 * one such path, who reads it, and why the store serves it or does
 * not. The check walks the table and prints present / missing /
 * unreachable per row. It is a reading, never a gate: a missing
 * signal is a decision for the desk, not a red build, because most
 * of these are somebody else's convention and adopting one is a
 * position (rule 30's queue), not a fix.
 *
 * WHAT IT IS NOT: a list of every route the store serves. The
 * no-orphan guard and the door inventory hold the router; this holds
 * the conventions OTHER people read, present or not.
 */

/** @typedef {{ id: string, where: "repo" | "site", path: string, readers: string, note?: string }} Signal */

/** @type {readonly Signal[]} */
export const SIGNALS = [
  // ---- the repository, as registries and IDE agents read it ----
  { id: "mcp-registry-manifest", where: "repo", path: "server.json", readers: "official MCP registry (mcp-publisher), GitHub MCP feed, PulseMCP and every mirror of the registry" },
  { id: "npm-mcp-name", where: "repo", path: "package.json", readers: "the registry's npm ownership check reads the mcpName field", note: "field checked separately" },
  { id: "agent-plugins-manifest", where: "repo", path: "plugin.json", readers: "Agent Plugins Directory, cursor.directory (agent-plugins.org schema)" },
  { id: "agent-plugins-mcp", where: "repo", path: "mcp.json", readers: "Agent Plugins Directory (the servers the plugin bundles)" },
  { id: "claude-code-plugin", where: "repo", path: ".claude-plugin/plugin.json", readers: "Claude Code plugins, GitHub Agent Finder (application/vnd.github.copilot-plugin entries point at this file)" },
  { id: "claude-code-marketplace", where: "repo", path: ".claude-plugin/marketplace.json", readers: "Claude Code: /plugin marketplace add <owner>/<repo>" },
  { id: "gemini-extension", where: "repo", path: "gemini-extension.json", readers: "Gemini CLI: gemini extensions install <repo url>" },
  { id: "skill-md", where: "repo", path: "skills/scvd-general-store/SKILL.md", readers: "Agent Finder skill scan, ClawHub, Codex/Claude Code/Cursor skill installers (agentskills.io format)" },
  { id: "glama-maintainers", where: "repo", path: "glama.json", readers: "Glama MCP directory ownership" },
  { id: "agents-md", where: "repo", path: "AGENTS.md", readers: "Codex, Cursor, Copilot, Gemini CLI (contextFileName), any agent opening the repo" },
  { id: "citation", where: "repo", path: "CITATION.cff", readers: "GitHub 'Cite this repository', Zenodo, Zotero, Google Scholar's repository readers" },
  { id: "security-policy", where: "repo", path: "SECURITY.md", readers: "GitHub security tab, OpenSSF Scorecard" },
  // ---- the site, as crawlers and discovery services read it ----
  { id: "robots", where: "site", path: "/robots.txt", readers: "every crawler; Content-Signal, Agentmap and Schemamap ride here" },
  { id: "sitemap", where: "site", path: "/sitemap.xml", readers: "search and answer engines" },
  { id: "llms-txt", where: "site", path: "/llms.txt", readers: "LLM readers and the llms.txt directories" },
  { id: "llms-full", where: "site", path: "/llms-full.txt", readers: "LLM readers wanting the whole store in one file" },
  { id: "agents-md-site", where: "site", path: "/agents.md", readers: "agent-mode readers; the operational manual" },
  { id: "openapi", where: "site", path: "/openapi.json", readers: "function-calling toolchains, ChatGPT plugins, the ai-plugin manifest" },
  { id: "api-catalog", where: "site", path: "/.well-known/api-catalog", readers: "RFC 9727 API catalog consumers" },
  { id: "mcp-server-card", where: "site", path: "/.well-known/mcp", readers: "MCP server-card discovery (also /.well-known/mcp.json and /.well-known/mcp/server-card.json)" },
  { id: "a2a-card", where: "site", path: "/.well-known/agent-card.json", readers: "A2A clients and registries (also the older /.well-known/agent.json)" },
  { id: "ard", where: "site", path: "/.well-known/ard.json", readers: "Agentic Resource Discovery: GitHub Agent Finder, ardregistry.org, Neuronto, WellKnown" },
  { id: "ai-catalog", where: "site", path: "/.well-known/ai-catalog.json", readers: "ARD's predecessor catalog shape" },
  { id: "x402-discovery", where: "site", path: "/.well-known/x402", readers: "x402 discovery: x402scan, x402-list, the Bazaar" },
  { id: "did-web", where: "site", path: "/.well-known/did.json", readers: "did:web resolvers verifying the signing key" },
  { id: "http-message-signatures", where: "site", path: "/.well-known/http-message-signatures-directory", readers: "Web Bot Auth verifiers (Cloudflare and others) checking our outbound agent's key" },
  { id: "oauth-protected-resource", where: "site", path: "/.well-known/oauth-protected-resource", readers: "MCP clients probing the auth spec (this door needs none, and says so)" },
  { id: "security-txt", where: "site", path: "/.well-known/security.txt", readers: "RFC 9116 security researchers and scanners" },
  { id: "trust", where: "site", path: "/.well-known/trust.json", readers: "trust-manifest readers (Vouch and others)" },
  { id: "ai-plugin", where: "site", path: "/.well-known/ai-plugin.json", readers: "the retired ChatGPT plugin manifest, still fetched by crawlers (served 2026-09-10)" },
  { id: "tdmrep", where: "site", path: "/.well-known/tdmrep.json", readers: "W3C TDM Reservation Protocol: European text-and-data-mining crawlers read the training reservation here" },
  { id: "ai-txt", where: "site", path: "/ai.txt", readers: "Spawning's ai.txt convention for AI training permissions by media type" },
  { id: "webmcp", where: "site", path: "/webmcp.js", readers: "browser agents reading document.modelContext" },
  { id: "og-image", where: "site", path: "/og.png", readers: "unfurlers: Slack, X, LinkedIn, Facebook previews" },
];

/**
 * Read one signal. `readRepo` answers whether a repo path exists;
 * `readSite` answers an HTTP status or throws when unreachable.
 * Returns present | missing | unreachable, never a score.
 */
export async function readSignal(signal, { readRepo, readSite }) {
  if (signal.where === "repo") {
    return { ...signal, state: (await readRepo(signal.path)) ? "present" : "missing" };
  }
  try {
    const status = await readSite(signal.path);
    return { ...signal, state: status >= 200 && status < 300 ? "present" : "missing", status };
  } catch {
    return { ...signal, state: "unreachable" };
  }
}

export async function readAll(signals, readers) {
  const rows = [];
  for (const signal of signals) rows.push(await readSignal(signal, readers));
  return rows;
}

export function summarize(rows) {
  const count = (state) => rows.filter((row) => row.state === state).length;
  return { present: count("present"), missing: count("missing"), unreachable: count("unreachable"), total: rows.length };
}

export function render(rows) {
  const width = Math.max(...rows.map((row) => row.path.length));
  const lines = rows.map((row) => `${row.state.padEnd(12)} ${row.where.padEnd(5)} ${row.path.padEnd(width)}  ${row.readers}`);
  const s = summarize(rows);
  lines.push("", `${s.present} present, ${s.missing} missing, ${s.unreachable} unreachable, of ${s.total} signals. A missing row is a decision, not a defect.`);
  return lines.join("\n");
}
