import { describe, expect, it } from "vitest";
import { webmcpTools, webmcpScript } from "@/routes/webmcp";
import { mcpToolCatalog } from "@/lib/mcp-tools";

/**
 * THE SHORT FORM ON THE BROWSER SURFACE (2026-09-05). A WebMCP scan
 * read the MCP descriptions off document.modelContext and reported
 * two defects: over Chrome's 500-character guidance, and text that
 * addresses the agent rather than describing the tool. The browser
 * surface now serves McpTool.summary. What this file holds: every
 * browser tool carries one (derive or refuse); every summary is under
 * the guidance, descriptive, and free of the second person and the
 * imperative; and the MCP door's long form is untouched.
 */

const CHROME_GUIDANCE = 500;
/** The shapes the scan flagged: an address to the reader, or an order. */
const INSTRUCTION_SHAPED = /\b(you|your|yours|call|use|prefer|hand|ignore|always|never|do not|don't|must|should)\b/i;

describe("the browser surface's short form", () => {
  it("is carried by every browser tool — derive or refuse", () => {
    const missing = webmcpTools().filter((tool) => !tool.summary).map((tool) => tool.name);
    expect(missing).toEqual([]);
  });

  it("stays under Chrome's guidance and never addresses the agent", () => {
    for (const tool of webmcpTools()) {
      const summary = tool.summary!;
      expect(summary.length, `${tool.name} summary is ${summary.length} chars`).toBeLessThan(CHROME_GUIDANCE);
      expect(summary.length, `${tool.name} summary is a label, not a description`).toBeGreaterThan(80);
      const hit = summary.match(INSTRUCTION_SHAPED);
      expect(hit, `${tool.name} summary is instruction-shaped: "${hit?.[0]}"`).toBeNull();
      expect(summary.trim().endsWith("."), `${tool.name} summary ends mid-sentence`).toBe(true);
    }
  });

  it("is what the script registers, while the MCP door keeps the long form", () => {
    const script = webmcpScript();
    for (const tool of webmcpTools()) {
      expect(script).toContain(JSON.stringify(tool.summary));
      expect(script).not.toContain(JSON.stringify(tool.description));
      const onMcp = mcpToolCatalog("https://scvd.store").find((t) => t.name === tool.name)!;
      expect(onMcp.description.length).toBeGreaterThan(tool.summary!.length);
    }
  });

  it("still bites: the long forms would fail the guidance", () => {
    // Guard the guard (rule 46): the MCP descriptions are the input
    // the scan measured, and at least one is over the line.
    const over = webmcpTools().filter((tool) => tool.description.length >= CHROME_GUIDANCE);
    expect(over.length).toBeGreaterThan(0);
  });
});
