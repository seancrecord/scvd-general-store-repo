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

/**
 * THE PARAMETER DESCRIPTIONS, ON THE SAME TERMS (2026-09-05).
 *
 * The short-form work above fixed the TOOL descriptions and a rescan
 * then flagged one field INSIDE a schema: check_before_you_pay's
 * client_profile, at 165 characters and opening "Leave it off…" — an
 * imperative addressed to the agent, in the one place a model reads
 * to fill an argument. Chrome's guidance for a parameter description
 * is 150 characters.
 *
 * The rule this holds is narrower than the one for tool summaries,
 * on purpose. A field may say "the door you are about to pay": that
 * describes the caller's own input and is how this store talks. What
 * it may not do is COMMAND — a sentence opening with a bare verb,
 * telling the reader what to send or withhold.
 */
const PARAMETER_DESCRIPTION_CAP = 150;
const IMPERATIVE_OPENERS = [
  "leave", "omit", "pass", "call", "use", "send", "set", "ignore",
  "prefer", "keep", "add", "supply", "provide", "include", "always",
  "never", "do", "don't", "must", "should",
];

/** The first word of every sentence in a description. */
function sentenceOpeners(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+/)
    .map((sentence) => sentence.trim().split(/[\s,:]+/)[0] ?? "")
    .map((word) => word.replace(/[^A-Za-z']/g, "").toLowerCase())
    .filter(Boolean);
}

function commands(text: string): string[] {
  return sentenceOpeners(text).filter((word) => IMPERATIVE_OPENERS.includes(word));
}

/** Every description in a schema, nested properties included, by path. */
function describedFields(
  schema: Record<string, unknown>,
  path = "",
): Array<{ path: string; description: string }> {
  const found: Array<{ path: string; description: string }> = [];
  const description = schema["description"];
  if (path && typeof description === "string") {
    found.push({ path, description });
  }
  const properties = schema["properties"];
  if (typeof properties === "object" && properties !== null) {
    for (const [name, child] of Object.entries(properties)) {
      if (typeof child === "object" && child !== null) {
        found.push(...describedFields(child as Record<string, unknown>, path ? `${path}.${name}` : name));
      }
    }
  }
  return found;
}

describe("the browser surface's parameter descriptions", () => {
  it("stay under Chrome's guidance and never command the reader", () => {
    let checked = 0;
    for (const tool of webmcpTools()) {
      for (const field of describedFields(tool.inputSchema as Record<string, unknown>)) {
        checked += 1;
        const where = `${tool.name}.${field.path}`;
        expect(
          field.description.length,
          `${where} is ${field.description.length} chars`,
        ).toBeLessThanOrEqual(PARAMETER_DESCRIPTION_CAP);
        expect(commands(field.description), `${where} commands the reader`).toEqual([]);
      }
    }
    // Rule 46: a guard over an empty set proves nothing.
    expect(checked).toBeGreaterThan(8);
  });

  it("still bites: the sentence it was written for is caught", () => {
    const retired =
      "Optional. What your client is configured with. Leave it off and you get the reading for a client configured with NOTHING, which is the case that loses money quietly.";
    expect(retired.length).toBeGreaterThan(PARAMETER_DESCRIPTION_CAP);
    expect(commands(retired)).toEqual(["leave"]);
    // And the descriptive second person it deliberately still allows.
    expect(commands("The https x402 door you are about to pay.")).toEqual([]);
  });
});
