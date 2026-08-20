import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import type { McpTool } from "@/lib/mcp-tools";

const BASE = "https://scvd.store";

/**
 * THE COLD-AGENT FINDINGS, PINNED.
 *
 * From the first pass in AGENT_UX.md (CV, 2026-08-02). None of these
 * were bugs — every one was behaviour that kept its promise while
 * costing a stranger a round trip, a 400, or a beat of hesitation.
 * Which is exactly why they need tests: nothing would have failed
 * without them, and a tidy-up would put every one of them back.
 */
describe("a cold agent can budget before it spends", () => {
  it("names a price range in every buy tool's description", () => {
    const tools = mcpToolCatalog(BASE).filter((tool: McpTool) =>
      tool.name.startsWith("buy_"),
    );
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(
        /\$\d/.test(tool.description),
        `${tool.name} makes an agent trigger a 402 to learn what anything costs`,
      ).toBe(true);
    }
  });

  it("says in prose which items need an extra field", () => {
    // The requirement lives in an allOf/if/then branch. An agent that
    // reads descriptions more reliably than it resolves conditionals
    // otherwise learns it by eating an avoidable 400.
    const tools = mcpToolCatalog(BASE);
    const record = tools.find((tool: McpTool) => tool.name === "buy_signed_record");
    expect(record).toBeDefined();
    expect(record!.description).toContain("graffiti_on_a_train needs tag");
  });

});

describe("the strongest trust signal arrives first, not fourth", () => {
  /**
   * That the conformance desk works on artifacts we did NOT issue —
   * competitors' included — is the one line that separates us from a
   * store marketing itself. It was the fourth thing a stranger met.
   * A registry shows `description` and often nothing else.
   */
  it("leads the served skill description with it", async () => {
    const skill = await (await SELF.fetch(`${BASE}/skill.md`)).text();
    const description = skill
      .split("\n")
      .find((line) => line.startsWith("description:"));
    expect(description, "skill.md has no description field").toBeTruthy();
    expect(description!.toLowerCase()).toContain("any issuer");
    // "a competitor's" and "we compete with" both make the claim; the
    // description was rewritten to a trigger phrase on 2026-08-02 and
    // the word changed with it. Match the claim, not one spelling.
    expect(description!.toLowerCase()).toMatch(/compet(e|itor)/);
  });

  it("leads the published bundle description with it too", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    const description = bundle
      .split("\n")
      .find((line) => line.startsWith("description:"));
    expect(description!.toLowerCase()).toContain("any issuer");
    // "a competitor's" and "we compete with" both make the claim; the
    // description was rewritten to a trigger phrase on 2026-08-02 and
    // the word changed with it. Match the claim, not one spelling.
    expect(description!.toLowerCase()).toMatch(/compet(e|itor)/);
  });
});

describe("a rationale is findable from where somebody stands", () => {
  it("points at the grouping rationale from the file people open", async () => {
    // Third instance in one day of "the answer exists, one file over."
    const source = (await import("../src/routes/mcp.ts?raw")).default;
    expect(source).toContain("mcp-tools.ts");
    expect(source).toContain("SHELF_CLUSTERS");
  });
});
