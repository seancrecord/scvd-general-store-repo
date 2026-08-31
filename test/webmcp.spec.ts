import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  webmcpScript,
  webmcpTools,
  webmcpUnhandledTools,
} from "@/routes/webmcp";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { inferChannel } from "@/lib/channel";
import { WEBMCP_ORIGIN_TRIAL_TOKENS } from "@/pages/storefront-page";

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

  it("the till pages carry the declaration too — the room where the verb lives", async () => {
    /*
     * P8 (2026-08-28): the storefront had the declaration and the
     * till did not — the one page whose whole point is a browser
     * agent's next step. Same script, same read-only set, same CSP
     * fence; the purchase tool P8 sketched stays OFF this surface,
     * blocked not by the API but by the P7 ruling and the no-money
     * pin two tests up — overturning a ruling is the keeper's pen,
     * not a trailer.
     */
    for (const path of ["/try", "/menu/hello"]) {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/html" },
      });
      const html = await response.text();
      expect(html, `${path} misses the script`).toContain('src="/webmcp.js"');
      expect(html, `${path} misses the trial token`).toContain(
        'http-equiv="origin-trial"',
      );
      const csp = response.headers.get("Content-Security-Policy") ?? "";
      expect(csp, `${path} script fence`).toContain("script-src 'self'");
    }
  });

  it("carries a token per vendor, each bound to this origin and this feature", async () => {
    /*
     * Chrome and Edge gate document.modelContext behind SEPARATE origin
     * trials with separate signing keys, so the store carries one tag
     * per vendor. A token is inert data, but a token for the WRONG
     * origin or feature silently unlocks nothing — so the binding is
     * the assertion, and it is made about EVERY tag rather than the
     * first one found. An earlier cut read only the first match, which
     * would have gone blind to a second vendor's token the day it
     * shipped.
     */
    const response = await SELF.fetch(`${BASE}/`);
    const html = await response.text();
    const tags = [
      ...html.matchAll(/<meta http-equiv="origin-trial" content="([^"]+)">/g),
    ];
    expect(tags.length, "the storefront lost an origin-trial meta tag").toBe(
      WEBMCP_ORIGIN_TRIAL_TOKENS.length,
    );
    expect(tags.length, "both vendors are declared").toBeGreaterThanOrEqual(2);

    for (const [index, tag] of tags.entries()) {
      const browser = WEBMCP_ORIGIN_TRIAL_TOKENS[index]?.browser ?? "?";
      // The token is a binary signature followed by a JSON tail; the
      // tail alone carries the binding. Signature bytes can contain a
      // stray "{", so anchor on the JSON's first key, not the brace.
      const decoded = atob(tag[1] ?? "");
      const payload = JSON.parse(
        decoded.slice(decoded.indexOf('{"origin"')),
      ) as Record<string, unknown>;
      expect(payload["origin"], `${browser} token origin`).toBe(
        "https://scvd.store:443",
      );
      expect(payload["feature"], `${browser} token feature`).toBe("WebMCP");
      // NARROWEST GRANT THAT DOES THE JOB. Neither trial was registered
      // for subdomains (nothing is served off one) or for third-party
      // injection (we never inject our token into anybody else's
      // origin). Both would be wider than what the store does.
      expect(payload["isSubdomain"], `${browser} subdomain grant`).toBeFalsy();
      expect(payload["isThirdParty"], `${browser} third-party grant`).toBeFalsy();
      // A token quietly expiring is a silent no-op in the browser —
      // no error, nothing on the page. Surface it here instead.
      expect(
        typeof payload["expiry"],
        `${browser} token has no expiry`,
      ).toBe("number");
      expect(
        (payload["expiry"] as number) * 1000,
        `${browser} origin trial has EXPIRED — that door is shut and the page does not say so`,
      ).toBeGreaterThan(Date.now());
    }
  });

  it("names the soonest expiry, because the door shuts on the earliest one", () => {
    /*
     * Edge's trial ends 2026-10-15 and Chrome's 2026-11-17. A reader
     * that reported the first token, or the longest-lived one, would
     * call the browser door healthy for a month after it had already
     * closed in Edge. The door battery reads every token and reports
     * the soonest; this pins the same property in the source of truth.
     */
    const expiries = WEBMCP_ORIGIN_TRIAL_TOKENS.map((entry) => {
      const decoded = atob(entry.token);
      return (
        JSON.parse(decoded.slice(decoded.indexOf('{"origin"'))) as {
          expiry: number;
        }
      ).expiry;
    });
    const soonest = Math.min(...expiries);
    expect(expiries.length).toBeGreaterThanOrEqual(2);
    // The soonest is a real date in the future, and it is NOT simply
    // whichever token happens to be listed first.
    expect(soonest * 1000).toBeGreaterThan(Date.now());
    expect(Math.max(...expiries)).toBeGreaterThan(soonest);
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
