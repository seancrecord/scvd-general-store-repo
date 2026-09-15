import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import mcpManifest from "../mcp.json";
import plugin from "../plugin.json";
import server from "../server.json";
import snapshot from "../registry/agntcy/record.json";
import skillMd from "../skills/scvd-x402-verification/SKILL.md?raw";
import {
  OASF_AGENT_SKILL,
  OASF_DOMAINS,
  OASF_RECORD_NAME,
  OASF_SCHEMA_VERSION,
  OASF_SKILLS,
  OASF_TAXONOMY_TAG,
  oasfFreeInstrumentTools,
  oasfRecord,
} from "@/lib/oasf-record";
import { OASF_RECORD_PATH } from "@/routes/oasf";
import { mcpToolCatalog } from "@/lib/mcp-tools";

/**
 * THE OASF RECORD IS THE STORE, NO MORE AND NO LESS.
 *
 * AGNTCY's Directory is a taxonomy-first registry: a consumer finds a
 * record by matching skills, domains and modules, then installs the
 * MCP server the record declares. Every one of those is a claim about
 * this repository, so every one of them is held here to the thing it
 * claims — the catalogue, the manifests, the skill file on disk.
 *
 * The one class of value this cannot check offline is the upstream
 * taxonomy ids; `npm run oasf:taxonomy:check` reads those back from
 * agntcy/oasf at the pinned tag and refuses drift. This holds the
 * shape; that holds the numbers.
 */
const ORIGIN = server.websiteUrl;

describe("the OASF record", () => {
  it("is cut from the store's own source", () => {
    expect(snapshot, "run: npm run oasf:cut").toEqual(
      JSON.parse(JSON.stringify(oasfRecord(ORIGIN))),
    );
  });

  it("carries every field an OASF record requires", () => {
    for (const field of [
      "schema_version",
      "name",
      "version",
      "description",
      "authors",
      "created_at",
      "skills",
    ] as const) {
      expect(snapshot[field], `OASF requires ${field}`).toBeTruthy();
    }
    expect(snapshot.schema_version).toBe(OASF_SCHEMA_VERSION);
    expect(snapshot.name).toBe(OASF_RECORD_NAME);
    // The version is server.json's, so the listings move together.
    expect(snapshot.version).toBe(server.version);
    expect(snapshot.authors[0]).toContain(plugin.author.name);
    // RFC-3339, and fixed: a timestamp that moved would re-CID the record.
    expect(snapshot.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  /**
   * A record that names a class without its id, or an id that is not a
   * number, is the shape a Directory server rejects. The pinned tag
   * travels in an annotation so a reader of the pushed record can see
   * which taxonomy the ids were read from.
   */
  it("names each skill and domain with the id OASF derives for it", () => {
    expect(snapshot.domains).toEqual(OASF_DOMAINS.map(({ name, id }) => ({ name, id })));
    expect(snapshot.skills).toEqual(OASF_SKILLS.map(({ name, id }) => ({ name, id })));
    for (const row of [...snapshot.domains, ...snapshot.skills]) {
      expect(row.name, "taxonomy names are hierarchical paths").toMatch(/^[a-z0-9_]+(\/[a-z0-9_]+)*$/);
      expect(Number.isInteger(row.id) && row.id > 0).toBe(true);
    }
    expect(snapshot.annotations["scvd.oasf.taxonomy_source"]).toContain(OASF_TAXONOMY_TAG);
  });

  /**
   * Every declared row says why, in the source. A taxonomy row nobody
   * can justify in a sentence is the one that gets added for reach.
   */
  it("can say why it claims each row", () => {
    for (const row of [...OASF_DOMAINS, ...OASF_SKILLS]) {
      expect(row.why.length, `${row.name} has no stated reason`).toBeGreaterThan(40);
    }
  });

  /**
   * The annotation that answers "what can I try without paying" is
   * read off the store's own free-instrument roster, so it cannot
   * name a tool the server does not serve — which the hand-typed
   * version did.
   */
  it("names free instruments the server actually serves", () => {
    const named = snapshot.annotations["scvd.free.instruments"]!.split(",");
    expect(named).toEqual(oasfFreeInstrumentTools());
    const live = new Set(mcpToolCatalog(ORIGIN).map((t) => t.name));
    for (const name of named) expect(live.has(name), `${name} is not in the catalogue`).toBe(true);
  });

  it("points at the public repository, which is what makes it scannable", () => {
    // Directory's security reconciler runs its MCP scanner on records
    // with a source_code locator; without one, every scanner is
    // skipped and `dirctl search --safe` does not return us at all.
    expect(snapshot.locators).toEqual([{ type: "source_code", urls: [plugin.repository] }]);
  });
});

/**
 * The snapshot is imported as JSON, so TypeScript infers a union over
 * the two module shapes and every field reads as possibly absent.
 * Naming the shape once here is what the assertions below are for.
 */
interface McpModuleData {
  name: string;
  description: string;
  connections: { type: string; url?: string; command?: string; args?: string[] }[];
  tools: { name: string; title?: string; description?: string; scopes?: string[] }[];
}

describe("the record's MCP module", () => {
  const mcp = { data: snapshot.modules.find((m) => m.name === "integration/mcp")!.data as unknown as McpModuleData };

  it("declares exactly the connections mcp.json declares", () => {
    const declared = Object.values(mcpManifest.mcpServers).map((s) =>
      JSON.parse(JSON.stringify(s)),
    );
    expect(mcp.data.connections).toEqual(declared);
  });

  /**
   * THE STDIO BRIDGE IS THE INSTALL PATH, NOT LEGACY BAGGAGE.
   * `dirctl install` derives its MCP entry through OASF-SDK's Copilot
   * translator, whose OASF 1.x path skips every non-stdio connection.
   * Drop the bridge and the record stays valid, pushable and
   * exportable — and installs as nothing.
   */
  it("keeps a stdio connection, or the record cannot be installed", () => {
    const stdio = mcp.data.connections.filter((c) => c.type === "stdio");
    expect(stdio.length, "dirctl install emits stdio connections only").toBeGreaterThan(0);
    for (const connection of stdio) expect(connection.command).toBeTruthy();
    expect(mcp.data.connections.some((c) => c.type === "streamable-http")).toBe(true);
  });

  it("lists exactly the tools the server lists, each with a description", () => {
    const live = mcpToolCatalog(ORIGIN).map((t) => t.name);
    expect(mcp.data.tools.map((t) => t.name).sort()).toEqual([...live].sort());
    for (const tool of mcp.data.tools) {
      // The short form: a directory entry is a different room from an
      // MCP handshake, and a stranger's indexer reads this one.
      expect(tool.description!.length, `${tool.name} has no description`).toBeGreaterThan(20);
      expect(tool.description!.length, `${tool.name}'s description is the long form`).toBeLessThan(500);
    }
  });

  it("names the server the same thing mcp.json names it", () => {
    expect(Object.keys(mcpManifest.mcpServers)).toContain(mcp.data.name);
    expect(mcp.data.description).toBe(server.description);
  });
});

describe("the record's Agent Skill module", () => {
  const skills = {
    data: snapshot.modules.find((m) => m.name === "core/language_model/agentskills")!.data as unknown as {
      skill_file: string;
    },
  };

  it("describes the skill file that is actually in the tree", () => {
    expect(skills.data.skill_file).toBe(OASF_AGENT_SKILL.file);
    const frontmatter = skillMd.split("---")[1] ?? "";
    expect(frontmatter).toContain(`name: ${OASF_AGENT_SKILL.name}`);
    expect(frontmatter).toContain(OASF_AGENT_SKILL.description);
  });

  /**
   * The skill exists to make an installed connector used correctly,
   * so the free-first order is the thing it must actually say. A
   * marketing page that installs itself beside the tools is worse
   * than no skill at all.
   */
  it("tells an agent to use the free instruments before spending", () => {
    expect(skillMd).toContain("preflight_endpoint");
    expect(skillMd).toContain("check_conformance");
    expect(skillMd).toMatch(/never call a paid tool merely because the tool is installed/i);
  });
});

/**
 * NO A2A MODULE, THOUGH check_a2a_card EXISTS. An integration module
 * describes how to reach THIS record's subject. The store inspects
 * other people's agent cards; it does not serve an A2A endpoint a
 * consumer of that module could call, and declaring one would be a
 * promise it cannot keep. Same rule as every instrument here: what was
 * observed, not what is adjacent to it.
 */
describe("what the record declines to claim", () => {
  it("declares only the two modules the store can honour", () => {
    expect(snapshot.modules.map((m) => m.name)).toEqual([
      "integration/mcp",
      "core/language_model/agentskills",
    ]);
  });

  it("serves the record at the name it claims", () => {
    expect(OASF_RECORD_PATH).toBe("/agents/general-store");
    expect(new URL(OASF_RECORD_NAME).origin).toBe(ORIGIN);
  });

  /**
   * End to end, under the real env. The route builds the record from
   * STORE_BASE_URL and the cut builds it from server.json's
   * websiteUrl; if those two ever disagree, the door and the file a
   * directory was pushed would quietly stop being the same document.
   * Asserting the bytes is the only version of this check that
   * notices.
   */
  it("serves, at both paths, exactly the record the tree ships", async () => {
    for (const path of [OASF_RECORD_PATH, "/.well-known/oasf.json"]) {
      const response = await SELF.fetch(`${ORIGIN}${path}`);
      expect(response.status, `${path} must serve the record`).toBe(200);
      expect(await response.json(), `${path} disagrees with registry/agntcy/record.json`).toEqual(
        snapshot,
      );
    }
  });
});
