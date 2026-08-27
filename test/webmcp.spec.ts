import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  webmcpScript,
  webmcpTools,
  webmcpUnhandledTools,
} from "@/routes/webmcp";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { inferChannel } from "@/lib/channel";

/**
 * THE WEBMCP SURFACE (P7, 2026-08-27). The store's second executable
 * surface, and the same two construction guarantees the ruling asked
 * for are what this file pins: the registered set CANNOT ACT (free +
 * read-only by derivation, nothing that writes, nothing that takes
 * money) and CANNOT DRIFT (the definitions are the MCP catalog's own
 * objects; a handler map that falls behind derivation fails here).
 */

const BASE = "https://scvd.store";

describe("the derived tool set cannot act", () => {
  it("registers only free, read-only tools", () => {
    for (const tool of webmcpTools()) {
      expect(tool.itemId, `${tool.name} is paid`).toBeUndefined();
      expect(tool.itemIds, `${tool.name} is a paid shelf`).toBeUndefined();
      expect(
        tool.annotations?.readOnlyHint,
        `${tool.name} is not read-only`,
      ).toBe(true);
    }
  });

  it("nothing that can take money reaches the browser surface", () => {
    const registered = new Set(webmcpTools().map((tool) => tool.name));
    for (const tool of mcpToolCatalog(BASE)) {
      if (tool.itemId || tool.itemIds || tool.name.startsWith("buy_")) {
        expect(
          registered.has(tool.name),
          `${tool.name} takes payment and must never register on WebMCP`,
        ).toBe(false);
      }
    }
    // The write-shaped errands stay off too: the browser surface is
    // read-only by derivation, not by list.
    expect(registered.has("ring_bell")).toBe(false);
    expect(registered.has("sign_guestbook")).toBe(false);
  });

  it("the script holds no payment plumbing or key vocabulary", () => {
    const script = webmcpScript();
    // Descriptions may NAME the paid doors (the preflight points at
    // buy_observation, the guide explains _meta['x402/payment']); no
    // buy_* tool may ever REGISTER and no handler may reach a till.
    expect(script).not.toMatch(/"name":\s*"buy_/);
    expect(script).not.toContain("/api/buy");
    expect(script).not.toContain("PAYMENT-SIGNATURE");
    expect(script).not.toContain("privateKey");
    expect(script).not.toContain("localStorage");
    expect(script).not.toContain("document.cookie");
  });
});

describe("the derived tool set cannot drift", () => {
  it("every derived tool has a handler — derive or refuse", () => {
    expect(webmcpUnhandledTools()).toEqual([]);
  });

  it("serves the MCP catalog's own descriptions, byte for byte", () => {
    const script = webmcpScript();
    for (const tool of webmcpTools()) {
      expect(script).toContain(JSON.stringify(tool.name));
      expect(script).toContain(JSON.stringify(tool.description));
    }
  });

  it("carries the evidence instruments a browser agent would want", () => {
    const names = webmcpTools().map((tool) => tool.name);
    expect(names).toContain("preflight_endpoint");
    expect(names).toContain("check_conformance");
    expect(names).toContain("verify_artifact");
    expect(names).toContain("read_store_guide");
  });
});

describe("the script speaks the spec's surface and fails closed", () => {
  it("registers on document.modelContext and feature-detects", () => {
    const script = webmcpScript();
    expect(script).toContain("document.modelContext");
    expect(script).toContain("registerTool");
    // A browser without the API must get a silent no-op, not an error.
    expect(script).toContain('typeof mc.registerTool !== "function"');
  });

  it("tags every fetch with the designed channel marker", () => {
    expect(webmcpScript()).toContain("src=webmcp");
  });

  it("carries the house promise where a viewer reads source", () => {
    const script = webmcpScript();
    expect(script).toContain("act without your decision");
    expect(script).toContain("credentials");
  });
});

describe("the door itself", () => {
  it("GET /webmcp.js serves the script as javascript", async () => {
    const response = await SELF.fetch(`${BASE}/webmcp.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("javascript");
    expect(await response.text()).toContain("document.modelContext");
  });

  it("the storefront loads it and fences script execution to self", async () => {
    const response = await SELF.fetch(`${BASE}/`);
    const html = await response.text();
    expect(html).toContain('src="/webmcp.js"');
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("script-src 'self'");
  });

  it("carries an origin-trial token bound to this origin and this feature", async () => {
    // Chrome 149-156 gate document.modelContext behind the trial; the
    // token is inert data, but a token for the WRONG origin or feature
    // would silently unlock nothing — so the binding is the assertion.
    const response = await SELF.fetch(`${BASE}/`);
    const html = await response.text();
    const match = /<meta http-equiv="origin-trial" content="([^"]+)">/.exec(
      html,
    );
    expect(match, "the storefront lost its origin-trial meta tag").toBeTruthy();
    // The token is a binary signature followed by a JSON tail; the
    // tail alone carries the binding. Signature bytes can contain a
    // stray "{", so anchor on the JSON's first key, not the brace.
    const decoded = atob(match![1] ?? "");
    const payload = JSON.parse(
      decoded.slice(decoded.indexOf('{"origin"')),
    ) as Record<string, unknown>;
    expect(payload["origin"]).toBe("https://scvd.store:443");
    expect(payload["feature"]).toBe("WebMCP");
    // A token quietly expiring is a silent no-op in Chrome; surface it
    // here instead. Bump this on renewal (Google mails a reminder).
    expect(payload["expiry"]).toBe(1794873600);
  });

  it("?src=webmcp is its own channel, the skill's pattern", () => {
    expect(inferChannel({ declaredSource: "webmcp" })).toBe("webmcp");
    // Claims are claims: the marker never overrides the MCP door's
    // definitive tag.
    expect(inferChannel({ declaredSource: "webmcp", viaMcp: true })).toBe(
      "mcp",
    );
  });
});
