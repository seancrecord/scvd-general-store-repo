import { SELF } from "cloudflare:test";
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
    // H1 store name, blockquote summary, and the operational sections.
    expect(text.startsWith("# ")).toBe(true);
    expect(text).toContain("\n> ");
    expect(text).toContain("## Purchasing flow (HTTP)");
    expect(text).toContain("## Purchasing flow (MCP)");
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
    expect(text.toLowerCase()).toContain("never asks you to run code");
  });

  it("is honest that the protocol is x402 + MCP, not Shopify's UCP", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(text).toContain("not UCP");
  });

  it("derives every URL from the request base, so it cannot drift", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    // No hardcoded alternate host slipped in.
    expect(text).not.toContain("http://");
    for (const line of text.split("\n")) {
      const urls = line.match(/https:\/\/[^\s)]+/g) ?? [];
      for (const url of urls) {
        expect(url.startsWith(BASE), `${url} is not under ${BASE}`).toBe(true);
      }
    }
  });
});
