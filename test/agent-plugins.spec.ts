import { describe, expect, it } from "vitest";
import { OPERATED_BY } from "@/store/copy/position";
import { STORE_TAGS } from "@/store";
import pluginManifest from "../plugin.json";
import mcpConfig from "../mcp.json";
import registryManifest from "../server.json";
import tabPackage from "../tab/package.json";
import pluginSkill from "../skills/scvd-general-store/SKILL.md?raw";
import clawhubBundle from "../registry/clawhub/SKILL.md?raw";

/**
 * THE AGENT PLUGINS PACKAGE (open-plugins.com), added 2026-08-11
 * because the Cursor Directory's scanner rejected this repository:
 * "No plugin components found in: repo root." The standard wants a
 * plugin.json manifest plus components at fixed locations — mcp.json
 * for MCP servers, skills/<name>/SKILL.md for skills — and this repo
 * had all of the substance and none of the filenames, which is the
 * trust.json lesson wearing a new hat: filed where a reader browses,
 * not where the checklist looks.
 *
 * EVERY VALUE IN THESE FILES ALREADY LIVES SOMEWHERE ELSE, so this
 * spec welds each one to its source (rule 1: derive it or make the
 * tool refuse). The manifest quotes the MCP registry entry
 * (server.json); the skill is a byte-identical second door to the
 * ClawHub bundle, which skill-parity.spec.ts already pins to the
 * served document; mcp.json points at the same two servers the
 * registry publishes. A value that drifts from its source fails here
 * by name.
 */

function frontmatterField(document: string, field: string): string {
  const line = document
    .split("\n")
    .find((entry) => entry.startsWith(`${field}:`));
  return line ? line.slice(field.length + 1).trim() : "";
}

describe("plugin.json is the registry entry wearing the manifest schema", () => {
  it("targets Agent Plugins 1.0.0 by its canonical identifier", () => {
    expect(pluginManifest.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
  });

  it("keeps a conforming name that matches the skill it ships", () => {
    // §5.5: 1-64 chars, lowercase alphanumeric with - and ., no
    // doubles, alphanumeric at both ends.
    expect(pluginManifest.name).toMatch(
      /^[a-z0-9](?:[a-z0-9]|[-.](?=[a-z0-9]))*$/,
    );
    expect(pluginManifest.name.length).toBeLessThanOrEqual(64);
    // The skill directory is skills/<name>/ and the frontmatter agrees.
    expect(frontmatterField(pluginSkill, "name")).toBe(pluginManifest.name);
  });

  it("quotes the MCP registry entry rather than describing itself twice", () => {
    // server.json is the store's registry manifest; a second
    // hand-typed description or version is a copy free to drift.
    expect(pluginManifest.description).toBe(registryManifest.description);
    expect(pluginManifest.version).toBe(registryManifest.version);
    expect(pluginManifest.repository).toBe(registryManifest.repository.url);
    expect(pluginManifest.homepage).toBe(registryManifest.websiteUrl);
  });

  it("names the operator the trust layer names", () => {
    expect(pluginManifest.author.name).toBe(OPERATED_BY);
  });

  it("carries every store tag among its keywords", () => {
    for (const tag of STORE_TAGS) {
      expect(pluginManifest.keywords, `keywords lost the store tag ${tag}`).toContain(tag);
    }
  });
});

describe("mcp.json points at the doors the registry publishes", () => {
  it("targets Agent Plugins 1.0.0 with the closed top-level shape", () => {
    expect(mcpConfig.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    );
    // §7.2.1: $schema and mcpServers, no other top-level fields.
    expect(Object.keys(mcpConfig).sort()).toEqual(["$schema", "mcpServers"]);
  });

  it("serves the store over the same URL the registry remote declares", () => {
    const store = mcpConfig.mcpServers["scvd-general-store"];
    expect(store.type).toBe("streamable-http");
    expect(store.url).toBe(registryManifest.remotes[0]?.url);
  });

  it("launches the Tab by the npm name the Tab actually publishes under", () => {
    const tab = mcpConfig.mcpServers["scvd-tab"];
    expect(tab.type).toBe("stdio");
    expect(tab.command).toBe("npx");
    expect(tab.args?.[tab.args.length - 1]).toBe(tabPackage.name);
  });
});

describe("the plugin skill is a second door, not a third document", () => {
  it("is byte-identical to the ClawHub bundle", () => {
    /**
     * The bundle is already pinned to the served /skill.md on every
     * load-bearing claim by skill-parity.spec.ts. A third
     * independently edited skill would be a third first impression;
     * identical bytes make it one document at two fixed locations,
     * and this assertion is the weld. Edit registry/clawhub/SKILL.md
     * and copy it here — never edit this copy directly.
     */
    expect(pluginSkill).toBe(clawhubBundle);
  });
});
