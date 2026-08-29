import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { mcpMd } from "@/routes/mcp-md";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { webmcpTools } from "@/routes/webmcp";

/**
 * /mcp.md — THE DOOR-CHOOSING PAGE, held to describing the store
 * that exists. Its whole risk is the one rule 10's worked example
 * names: a true-sounding page nobody re-checks, propagating through
 * strangers. So the lists here are derived, and these tests fail the
 * build when the page and the catalogs disagree.
 */

const BASE = "https://scvd.store";

describe("the page describes the live surfaces", () => {
  it("names every tool the MCP door actually serves", () => {
    const page = mcpMd(BASE);
    for (const tool of mcpToolCatalog(BASE)) {
      expect(page, `${tool.name} missing from /mcp.md`).toContain(tool.name);
    }
  });

  it("names exactly the tools WebMCP registers, and no writes", () => {
    const page = mcpMd(BASE);
    const registered = webmcpTools().map((tool) => tool.name);
    expect(registered.length).toBeGreaterThan(0);
    for (const name of registered) {
      expect(page).toContain(name);
    }
    // The browser section's claim is that nothing that writes or pays
    // registers. If that ever changes, this page must not still say it.
    for (const tool of mcpToolCatalog(BASE)) {
      if (tool.itemId || tool.itemIds || tool.name.startsWith("buy_")) {
        expect(registered).not.toContain(tool.name);
      }
    }
  });

  it("states the rendering gap as a dated observation, not a score", () => {
    const page = mcpMd(BASE);
    expect(page).toContain("2026-08-2");
    expect(page).toContain("one operator's dated observation");
    /*
     * THE PROPERTY, NOT THE PHRASING (amended 2026-08-28 at the
     * keeper's word: this page is functionality, not us arguing
     * about fault). What must survive is that a reader who sees no
     * card learns three things — the path that DOES render, that
     * the verdict is identical either way, and where the host-side
     * gap is tracked. How that gets said is copy, and copy moves.
     */
    expect(page).toContain("use the stdio path");
    expect(page).toContain("the verdict is identical");
    expect(page).toContain("claude-ai-mcp#471");
    // Hosts we did not test are named as untested, never as passing.
    expect(page).toContain("not tested by us");
  });

  it("keeps the house promise and an unbuilt list", () => {
    const page = mcpMd(BASE);
    expect(page).toContain("act without your decision");
    expect(page).toContain("What is not built");
    // The invitation is the point of publishing it at all.
    expect(page.toLowerCase()).toContain("mailbox");
  });
});

describe("the door", () => {
  it("serves /mcp.md as markdown", async () => {
    const response = await SELF.fetch(`${BASE}/mcp.md`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("markdown");
    expect(await response.text()).toContain("The MCP doors");
  });

  it("is named where agents read, not discoverable only by guessing", async () => {
    for (const path of ["/llms.txt", "/agents.md"]) {
      const body = await (await SELF.fetch(`${BASE}${path}`)).text();
      expect(body, `${path} does not name /mcp.md`).toContain("/mcp.md");
    }
  });
});
