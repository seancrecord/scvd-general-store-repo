import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { EXECUTION_CONTRACT_VERSION } from "@/routes/execution-contract";

const BASE = "https://scvd.store";

/**
 * THE EXECUTION-CONTRACT GIVE-AWAY (2026-08-11): a free behavioral
 * skill for any agent, shipped as the cheapest test of whether this
 * store's audience wants behavioral artifacts at all.
 *
 * What these tests hold:
 *   - the document serves, as markdown, with frontmatter a skill
 *     registry can read and a version derived from the one constant;
 *   - the load-bearing law survives edits: empty and blocked are
 *     different terminal states and the file SAYS never to trade one
 *     for the other — losing that line quietly would keep the skill's
 *     shape while dropping the reason it exists;
 *   - the interest is declared: a store selling verification that
 *     hands out behavioral advice must say so on the same page;
 *   - discovery works: llms.txt names the path, so an agent reading
 *     the front door can find it without guessing.
 */

describe("the execution-contract skill", () => {
  it("serves as markdown with registry-readable frontmatter", async () => {
    const response = await SELF.fetch(`${BASE}/skills/execution-contract.md`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    const body = await response.text();
    expect(body.startsWith("---\n")).toBe(true);
    expect(body).toContain("name: execution-contract");
    // The version is the constant, never a retyped copy of it.
    expect(body).toContain(`version: ${EXECUTION_CONTRACT_VERSION}`);
    // Frontmatter closes; a truncated document would still start well.
    expect(body.indexOf("---", 4)).toBeGreaterThan(0);
  });

  it("names all six terminal states", async () => {
    const response = await SELF.fetch(`${BASE}/skills/execution-contract.md`);
    const body = await response.text();
    for (const state of [
      "verified_success",
      "unverified_success",
      "empty",
      "blocked",
      "partial",
      "failed",
    ]) {
      expect(body, `terminal state ${state} left the document`).toContain(
        `\`${state}\``,
      );
    }
  });

  it("keeps the law the skill exists for: never report empty when blocked", async () => {
    const response = await SELF.fetch(`${BASE}/skills/execution-contract.md`);
    // Flattened before matching: the document hard-wraps at prose
    // width, and a copy edit that re-wraps a line must not read as
    // the law disappearing. Only the words are load-bearing.
    const flat = (await response.text()).replace(/\s+/g, " ");
    expect(flat).toContain("Never report empty when you were blocked");
  });

  it("declares the store's interest on the same page", async () => {
    const response = await SELF.fetch(`${BASE}/skills/execution-contract.md`);
    const flat = (await response.text()).replace(/\s+/g, " ");
    // The declared-interest paragraph, held by its two load-bearing
    // claims: the interest is named, and adoption requires nothing.
    expect(flat).toContain("That is the interest, declared");
    expect(flat).toContain("Nothing in this contract requires the store");
  });

  it("is named on the front door, so discovery is a link and not a guess", async () => {
    const response = await SELF.fetch(`${BASE}/llms.txt`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("/skills/execution-contract.md");
  });
});
