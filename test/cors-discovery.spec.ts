import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * CORS ON THE DISCOVERY SURFACE (scanner finding C1, 2026-08-27; house
 * rule 53's browser buyer, one door earlier).
 *
 * The server card at /.well-known/mcp.json went out with no
 * Access-Control-Allow-Origin header, so a browser-based MCP client
 * could not READ it — the fetch dies in the browser regardless of what
 * the server answered. Every surface here is public, read-only, and
 * identical for every caller; an absent ACAO header on such a surface
 * protects nothing and only breaks the browser caller.
 *
 * The boundary matters as much as the header: the allowance is an
 * explicit list of discovery paths (plus the MCP JSON-RPC door, which
 * needs the OPTIONS preflight answered), never app-wide. /admin and
 * every stateful room stay outside it, and a test below pins that.
 */
describe("the discovery surface answers browsers from any origin", () => {
  const DISCOVERY_GETS = [
    "/.well-known/mcp.json",
    "/.well-known/agent-card.json",
    "/.well-known/x402.json",
    "/.well-known/ai-catalog.json",
    "/.well-known/ard.json",
    "/openapi.json",
    "/llms.txt",
    "/menu.json",
    "/index.md",
    "/sitemap.xml",
    "/agents.md",
    "/skill.md",
    // The area files are the same derived class as /llms.txt itself.
    "/menu/llms.txt",
  ];

  for (const path of DISCOVERY_GETS) {
    it(`GET ${path} carries Access-Control-Allow-Origin: *`, async () => {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Origin: "https://example-agent-host.test" },
      });
      expect(response.status).toBeLessThan(400);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  }

  it("POST /mcp answers with CORS, so a browser MCP client can read the RPC reply", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example-agent-host.test",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    // The headers a browser client is allowed to read off the reply.
    expect(
      response.headers.get("Access-Control-Expose-Headers") ?? "",
    ).toContain("mcp-session-id");
  });

  it("the OPTIONS preflight on the MCP door says yes to POST and the mcp-* headers", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example-agent-host.test",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, mcp-protocol-version",
      },
    });
    expect([200, 204]).toContain(response.status);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods") ?? "").toContain(
      "POST",
    );
    const allowedHeaders = (
      response.headers.get("Access-Control-Allow-Headers") ?? ""
    ).toLowerCase();
    expect(allowedHeaders).toContain("content-type");
    expect(allowedHeaders).toContain("mcp-protocol-version");
  });

  it("the well-known MCP alias preflights too — the card readable but the door unreachable is the same failure one hop later", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example-agent-host.test",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect([200, 204]).toContain(response.status);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("/admin never carries the header — the boundary is the point", async () => {
    const response = await SELF.fetch(`${BASE}/admin`, {
      headers: { Origin: "https://example-agent-host.test" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("a paid door never carries it either — the till is same-origin by design", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { Origin: "https://example-agent-host.test" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
