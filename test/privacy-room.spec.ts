import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * /privacy became a room 2026-08-21 — the MCP connector directories'
 * privacy-policy gate reads a redirect-to-JSON as absence. What these
 * pin: the room answers as a page AND as JSON, the alias still lands,
 * the load-bearing negative claims are on the page (they are the
 * policy), and the one honest limit — signed artifacts cannot be
 * deleted — is stated rather than buried.
 */
describe("/privacy is a real room now", () => {
  it("serves the policy as a page with the structural claims on it", async () => {
    const response = await SELF.fetch(`${BASE}/privacy`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    const page = await response.text();
    for (const claim of [
      "No accounts",
      "No cookies",
      "no kept IP logs",
      "cannot be deleted",
    ]) {
      expect(page, `policy is missing: ${claim}`).toContain(claim);
    }
    expect(page).toContain("/.well-known/trust.json");
  });

  it("serves the same policy as JSON to machines", async () => {
    const response = await SELF.fetch(`${BASE}/privacy`, {
      headers: { Accept: "application/json" },
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(Array.isArray(body.sections)).toBe(true);
    expect(String(body.what_this_is)).toContain("no cookies");
  });

  it("keeps the conventional alias pointing at the room", async () => {
    const response = await SELF.fetch(`${BASE}/privacy-policy`, {
      redirect: "manual",
    });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toContain("/privacy");
  });
});
