import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { FRAME_ANCESTOR_HOSTS, firstPartyScriptCsp } from "@/lib/csp";

/**
 * THE FENCE, WITH ITS TWO NEW RAILS (2026-09-05).
 *
 * A header check found the page policy silent on connect-src and on
 * frame-ancestors: the browser default for both is "anywhere", which
 * on a page that ships a script is an allowance nobody chose. The two
 * lines are read here off the doors that actually ship scripts, so
 * the fence cannot loosen on one page while a test watches another.
 */

const BASE = "https://scvd.store";
const AS_A_BROWSER = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const SCRIPT_DOORS = ["/", "/try", "/conformance", "/menu/small_blessing"];

describe("the first-party script fence", () => {
  it("is one derivation from the base URL", () => {
    const csp = firstPartyScriptCsp(BASE);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    // The MCP origin is this origin; both spellings, so a string
    // matcher and a keyword reader agree.
    expect(csp).toContain(`connect-src 'self' ${BASE}`);
    expect(csp).toContain(
      `frame-ancestors 'self' ${FRAME_ANCESTOR_HOSTS.join(" ")}`,
    );
    // A base with a path or trailing slash still yields a bare origin.
    expect(firstPartyScriptCsp("https://scvd.store/")).toBe(csp);
  });

  it("names exactly the two chat hosts that may frame a page", () => {
    expect([...FRAME_ANCESTOR_HOSTS].sort()).toEqual([
      "https://chatgpt.com",
      "https://claude.ai",
    ]);
  });

  it("rides every door that ships a first-party script", async () => {
    for (const path of SCRIPT_DOORS) {
      const response = await SELF.fetch(`${BASE}${path}`, { headers: AS_A_BROWSER });
      expect(response.status, path).toBe(200);
      const html = await response.text();
      expect(html, `${path} ships no script`).toMatch(/<script src="\/(webmcp|till)\.js"/);
      const csp = response.headers.get("Content-Security-Policy") ?? "";
      expect(csp, `${path} connect-src`).toContain("connect-src 'self'");
      expect(csp, `${path} frame-ancestors`).toContain("frame-ancestors 'self'");
      for (const host of FRAME_ANCESTOR_HOSTS) {
        expect(csp, `${path} lacks ${host}`).toContain(host);
      }
      expect(csp).toBe(firstPartyScriptCsp(BASE));
    }
  });
});
