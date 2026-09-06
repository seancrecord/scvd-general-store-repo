import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { webmcpScript } from "@/routes/webmcp";
import { firstPartyScriptCsp } from "@/lib/csp";
import { ROOMS } from "@/store/rooms";

/**
 * THE BROWSER DOOR, ON EVERY ROOM, IN THE SPEC'S SHAPE (2026-09-05).
 *
 * Three things a WebMCP fix-up asked for and the store's own record
 * of the spec (docs/WEBMCP_AND_MCP_APPS_2026-08.md) already said:
 * detection reads document.modelContext then navigator.modelContext;
 * a handler takes the host's AbortSignal and passes it to the fetch;
 * a handler answers in MCP's content shape, one compact text block.
 * And one thing arrival-is-discovery implies: the script rides every
 * room, with the P7 fence on every HTML answer beside it.
 */

const BASE = "https://scvd.store";
const AS_A_BROWSER = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

describe("the served script", () => {
  const script = webmcpScript();

  it("detects both roots, spec order first", () => {
    expect(script.indexOf("document.modelContext")).toBeGreaterThan(-1);
    expect(script.indexOf("navigator.modelContext")).toBeGreaterThan(script.indexOf("document.modelContext"));
  });

  it("takes the host's AbortSignal and hands it to the fetch", () => {
    expect(script).toContain("execute: function (args, opts)");
    expect(script).toContain("signal.throwIfAborted()");
    expect(script).toContain("init.signal = signal");
  });

  it("answers in MCP's content shape with one compact text block", () => {
    expect(script).toContain('content: [{ type: "text", text: JSON.stringify(payload) }]');
    expect(script).toContain("structuredContent: payload");
    // Compact: no pretty-print argument on the serializer.
    expect(script).not.toContain("JSON.stringify(payload, null");
  });
});

describe("every room carries the door and the fence", () => {
  it("serves the script tag and the CSP on every HTML room", async () => {
    for (const room of ROOMS) {
      const response = await SELF.fetch(`${BASE}${room.path}`, { headers: AS_A_BROWSER });
      expect(response.status, room.path).toBe(200);
      const type = response.headers.get("content-type") ?? "";
      if (!type.startsWith("text/html")) continue;
      const html = await response.text();
      expect(html, `${room.path} carries no /webmcp.js`).toContain('<script src="/webmcp.js" defer>');
      expect(response.headers.get("Content-Security-Policy"), `${room.path} fence`).toBe(
        firstPartyScriptCsp(BASE),
      );
    }
  });

  it("fences a page that never opted in, and leaves JSON and admin alone", async () => {
    const page = await SELF.fetch(`${BASE}/what`, { headers: AS_A_BROWSER });
    expect(page.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    const json = await SELF.fetch(`${BASE}/what`, { headers: { Accept: "application/json" } });
    expect(json.headers.get("Content-Security-Policy")).toBeNull();
    const admin = await SELF.fetch(`${BASE}/admin`, { headers: AS_A_BROWSER });
    expect(admin.headers.get("Content-Security-Policy")).toBeNull();
  });
});
