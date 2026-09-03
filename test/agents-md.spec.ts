import { SELF } from "cloudflare:test";
import { WRITTEN_ABOUT } from "@/store/copy/asked-for";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * /agents.md — the Shopify-canonical (May 2026) OPERATIONAL manual
 * for transacting agents: H1, blockquote summary, H2 sections with
 * link lists, led by the actual purchasing flow (the thing that makes
 * it agents.md and not llms.txt). Distinct from the repo's AGENTS.md
 * (coding-agent guidance).
 */
describe("/agents.md", () => {
  it("is fetchable markdown in the Shopify shape: H1, blockquote, purchasing flow", async () => {
    const res = await SELF.fetch(`${BASE}/agents.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    /*
     * Frontmatter, then the H1. The metadata block sits ABOVE the
     * document (2026-08-30) so an agent gets the title, canonical and
     * licence without reading the prose for them; the H1 still leads
     * the CONTENT, which is what the convention asks and what this
     * assertion has always been protecting.
     */
    expect(text.startsWith("---\n")).toBe(true);
    const frontmatterEnd = text.indexOf("\n---\n");
    expect(frontmatterEnd).toBeGreaterThan(0);
    expect(text.slice(4, frontmatterEnd)).toContain("title:");
    expect(text.slice(frontmatterEnd + 5).trimStart().startsWith("# ")).toBe(true);
    expect(text).toContain("\n> ");
    // Retitled 2026-08-27 (scanner S13): the flows were always usage,
    // now the heading says the word skill-file checkers look for.
    expect(text).toContain("## Usage: purchasing flow (HTTP)");
    expect(text).toContain("## Usage: purchasing flow (MCP)");
    expect(text).toContain("## Checkout rules & rate limits");
    // The contracts an operational agent needs to execute a buy.
    expect(text).toContain(`${BASE}/mcp`);
    expect(text).toContain(`${BASE}/api/buy/`);
    expect(text).toContain(`${BASE}/api/verify/`);
    expect(text).toContain(`${BASE}/menu.json`);
  });

  it("draws the Shopify llms.txt-vs-agents.md distinction and points at both", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(text).toContain(`${BASE}/llms.txt`);
    // This file is the transaction flow; llms.txt is the prose.
    expect(text).toContain("this\n> file is the transaction flow");
  });

  it("carries policies, the skill, discovery surfaces, and the house 'will not do' line", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(text).toContain(`${BASE}/skill.md`);
    expect(text).toContain(`${BASE}/sitemap.xml`);
    expect(text).toContain("/.well-known/did.json");
    expect(text).toContain("/.well-known/trust.json");
    expect(text).toContain("/.well-known/liveness.json");
    expect(text.toLowerCase()).toContain("act without your decision");
  });

  it("is honest that the protocol is x402 + MCP, not Shopify's UCP", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(text).toContain("not UCP");
  });

  it("derives every URL from the request base, so it cannot drift", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    // No hardcoded alternate host slipped in. Deliberate outbound
    // links (the open-source verifier's repo) are named here rather
    // than allowed by pattern, so a new external URL has to be a
    // decision instead of an accident.
    // The byline pieces (2026-09-02) are a decision too: they are the
    // WRITTEN_ABOUT list in store/copy/asked-for.ts, and only that list.
    const ALLOWED_EXTERNAL = [
      "https://github.com/seancrecord/",
      ...WRITTEN_ABOUT.map((piece) => piece.url),
    ];
    expect(text).not.toContain("http://");
    for (const line of text.split("\n")) {
      const urls = line.match(/https:\/\/[^\s)]+/g) ?? [];
      for (const url of urls) {
        const allowed =
          url.startsWith(BASE) ||
          ALLOWED_EXTERNAL.some((prefix) => url.startsWith(prefix));
        expect(allowed, `${url} is neither under ${BASE} nor allow-listed`).toBe(
          true,
        );
      }
    }
  });
});

/**
 * S13, THE HONEST VERSION (2026-08-27). A skill-file checker wants at
 * least two of Installation / Configuration / Usage. The document was
 * always an operational manual — better content, wrong headings — so
 * the flows were retitled Usage (keeper's prose untouched) and an
 * Installation section tells the truth: nothing to install, plus the
 * optional local tools that genuinely do.
 */
describe("the checker's headings, without the fake README", () => {
  it("carries Installation and Usage headings", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(text).toContain("## Installation");
    expect(text).toContain("## Usage");
    // The truth the section leads with: the store itself installs nothing.
    expect(text).toContain("Nothing to install");
  });

  it("names the CLI install only when the publish has actually run", async () => {
    const { CLI_PUBLISHED, CLI_INSTALL, CLI_SOURCE_URL } = await import(
      "@/store/cli"
    );
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    /*
     * Boundary-aware, because "npm i -g scvd-tab" — a real, published
     * package this page rightly names — CONTAINS the banned command as
     * a substring. The no-orphan guard already learned this exact
     * lesson (/index.md passing via /okf/index.md); the regex derives
     * from the constant and refuses only the command that would fail
     * in a reader's terminal.
     */
    const exactInstall = new RegExp(
      `${CLI_INSTALL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
    );
    if (CLI_PUBLISHED) {
      // The day the publish lands and the constant flips, this surface
      // updates with the rest — this branch starts asserting it.
      expect(text).toMatch(exactInstall);
    } else {
      // Rule 46: the banned string derives from the same constant the
      // page reads, so this cannot memorize a stale command. The
      // source link still works today either way.
      expect(text).not.toMatch(exactInstall);
      expect(text).toContain(CLI_SOURCE_URL);
    }
  });
});
