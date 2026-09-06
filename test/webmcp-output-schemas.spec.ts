import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { TOOL_ENDPOINTS, webmcpScript, webmcpTools } from "@/routes/webmcp";

const BASE = "https://scvd.store";

/**
 * WHAT A BROWSER AGENT IS TOLD IT WILL GET BACK.
 *
 * A tool with an input schema and no output schema tells an agent how
 * to ask and nothing about the answer, so the agent must call it to
 * find out what a call returns — which is the whole cost the schema
 * exists to avoid. It also means a planner cannot chain: it cannot
 * know that find_in_catalog hands back an `items[].id` that check_order
 * or a buy_* will accept.
 *
 * The store's MCP door has carried outputSchema on every tool since
 * the surface contract. The browser surface, which derives from the
 * same catalogue rows, was dropping the field in two places at once —
 * once when serializing the catalogue into the script, once when
 * building each registration object. An external WebMCP scan
 * (webmcp.com, 2026-09-06) read the result correctly: "no output
 * schemas on any tool". Nothing was missing from the store; the
 * browser was being handed less than the store held.
 *
 * These tests hold the derivation rather than the field: the browser's
 * schema must BE the catalogue's schema, so the two doors cannot drift
 * into describing the same answer differently.
 */
function servedTools(): Array<Record<string, unknown>> {
  const source = webmcpScript();
  const start = source.indexOf("var TOOLS = [") + "var TOOLS = ".length;
  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "[") depth += 1;
    else if (source[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return JSON.parse(source.slice(start, end)) as Array<Record<string, unknown>>;
}

describe("the browser surface says what comes back", () => {
  it("every registered tool is served with an output schema", () => {
    const bare = servedTools()
      .filter((tool) => !tool.outputSchema)
      .map((tool) => String(tool.name));
    expect(
      bare,
      `a browser agent must call these to learn what they return:\n${bare.join("\n")}`,
    ).toEqual([]);
  });

  it("the served schema IS the catalogue's, not a second copy", () => {
    const catalogue = new Map(
      webmcpTools()
        .filter((tool) => TOOL_ENDPOINTS[tool.name])
        .map((tool) => [tool.name, tool.outputSchema]),
    );
    for (const tool of servedTools()) {
      expect(
        tool.outputSchema,
        `${tool.name} describes its answer differently on the two doors`,
      ).toEqual(catalogue.get(String(tool.name)));
    }
  });

  it("each schema is an object schema that names at least one field", () => {
    for (const tool of servedTools()) {
      const schema = tool.outputSchema as {
        type?: string;
        properties?: Record<string, unknown>;
      };
      expect(schema.type, `${tool.name} output schema has no type`).toBe("object");
      expect(
        Object.keys(schema.properties ?? {}).length,
        `${tool.name} output schema names no fields, which is no schema at all`,
      ).toBeGreaterThan(0);
    }
  });

  it("the registration handed to the browser carries it too", () => {
    // Serializing the field into TOOLS and then not passing it to
    // registerTool would leave the script honest and the browser
    // uninformed — the same defect one layer down.
    const source = webmcpScript();
    const registration = source.slice(
      source.indexOf("var registration = {"),
      source.indexOf("execute: function"),
    );
    expect(registration).toContain("outputSchema: tool.outputSchema");
  });

  it("the live script serves what the source builds", async () => {
    const response = await SELF.fetch(`${BASE}/webmcp.js`);
    const body = await response.text();
    for (const tool of servedTools()) {
      expect(body).toContain(`"name": "${String(tool.name)}"`);
    }
    expect(body.match(/"outputSchema"/g)?.length).toBe(servedTools().length);
  });
});
