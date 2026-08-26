import { describe, expect, it } from "vitest";

/**
 * EVERY MCP NAME, DECLARED ONCE AND ECHOED WHERE THE REGISTRY LOOKS
 * (2026-08-26, keeper's directive: "so we don't have to constantly do
 * this"). The official MCP registry validates an npm package by two
 * markers that must agree: `mcpName` in package.json and a literal
 * `mcp-name: <value>` line in the README it ships. One was present
 * and one missing here twice in one day — this sweeps every
 * package.json at the repo root and one level down and demands the
 * sibling README carry the matching marker, so the next MCP package
 * added inherits the rule instead of rediscovering it at publish time.
 */

const packages = {
  ...(import.meta.glob("../package.json", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../*/package.json", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

const readmes = {
  ...(import.meta.glob("../README.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../*/README.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

describe("mcp-name markers", () => {
  it("every package.json mcpName has the matching README marker beside it", () => {
    const declared: { dir: string; mcpName: string }[] = [];
    for (const [path, raw] of Object.entries(packages)) {
      const pkg = JSON.parse(raw) as { mcpName?: string };
      if (pkg.mcpName) {
        declared.push({ dir: path.replace(/package\.json$/, ""), mcpName: pkg.mcpName });
      }
    }
    // The store worker and the Tab, at minimum — a sweep that finds
    // fewer is reading the wrong tree, not proving a clean state.
    expect(declared.length).toBeGreaterThanOrEqual(2);
    for (const { dir, mcpName } of declared) {
      expect(mcpName, `${dir}: mcpName must be reverse-DNS under store.scvd`).toMatch(
        /^store\.scvd\//,
      );
      const readme = readmes[`${dir}README.md`];
      expect(readme, `${dir}README.md must exist beside the mcpName`).toBeDefined();
      expect(
        readme!.includes(`mcp-name: ${mcpName}`),
        `${dir}README.md must carry "mcp-name: ${mcpName}" — the registry validates the pair`,
      ).toBe(true);
    }
  });
});
