import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * /agents.md — the Shopify-canonical (May 2026) machine discovery
 * surface for shopping agents. Distinct from the repo's AGENTS.md
 * (coding-agent guidance). Tests that it is fetchable, scannable, and
 * points at the real contracts without drifting from the base URL.
 */
describe("/agents.md", () => {
  it("is fetchable as markdown and names the agent-facing contracts", async () => {
    const res = await SELF.fetch(`${BASE}/agents.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    // The four contracts the keeper named: MCP, buy, verify, llms.txt.
    expect(text).toContain(`${BASE}/mcp`);
    expect(text).toContain(`${BASE}/api/buy/`);
    expect(text).toContain(`${BASE}/api/verify/`);
    expect(text).toContain(`${BASE}/llms.txt`);
  });

  it("carries the discovery surfaces and the house 'will not do' line", async () => {
    const text = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(text).toContain("/.well-known/did.json");
    expect(text).toContain("/.well-known/trust.json");
    expect(text).toContain("/.well-known/liveness.json");
    // The standing safety promise reaches this surface too.
    expect(text.toLowerCase()).toContain("never asks you to run code");
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
