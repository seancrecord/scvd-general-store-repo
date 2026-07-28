import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ADMIN_PAGES } from "@/pages/admin/layout";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};
/** What a keeper's browser actually sends. */
const BROWSER = { ...AUTH, Accept: "text/html" };

/**
 * THE ORPHANING, 2026-07-28.
 *
 * The office grew from three rooms to eight pages and the nav never
 * grew with it. Worse, every reading rendered itself as tab "office",
 * which draws "The desk" as un-clickable bold — so landing on the
 * census or the recount left NO LINK BACK ANYWHERE. The only ways out
 * were the browser's back button and "Front of house."
 *
 * These tests exist so the next page added to this office cannot go
 * missing the same way. A room nobody can leave is a room nobody
 * enters twice.
 */
describe("the office nav", () => {
  it("reaches every page from every page", async () => {
    for (const page of ADMIN_PAGES) {
      const response = await SELF.fetch(`${BASE}${page.href}`, {
        headers: BROWSER,
      });
      expect(response.status, `${page.href} did not render`).toBe(200);
      const html = await response.text();

      for (const other of ADMIN_PAGES) {
        if (other.tab === page.tab) continue;
        expect(
          html.includes(`href="${other.href}"`),
          `${page.href} has no way to reach ${other.href}`,
        ).toBe(true);
      }
    }
  });

  it("marks the page you are on, and only that one", async () => {
    for (const page of ADMIN_PAGES) {
      const html = await (
        await SELF.fetch(`${BASE}${page.href}`, { headers: BROWSER })
      ).text();
      // The current page is bold rather than a link — which is exactly
      // why a page must never claim to be a different one.
      expect(
        html.includes(`href="${page.href}"`),
        `${page.href} links to itself, so it is claiming to be another page`,
      ).toBe(false);
    }
  });

  it("keeps a way out of the office entirely", async () => {
    for (const page of ADMIN_PAGES) {
      const html = await (
        await SELF.fetch(`${BASE}${page.href}`, { headers: BROWSER })
      ).text();
      expect(html, page.href).toContain('href="/"');
    }
  });

  it("holds the whole door shut, every page", async () => {
    for (const page of ADMIN_PAGES) {
      const response = await SELF.fetch(`${BASE}${page.href}`);
      expect(response.status, `${page.href} is not behind the gate`).toBe(401);
    }
  });

  it("keeps the digest as JSON by default, since something may read it", async () => {
    // The route was JSON-only before it got a shell. A browser asks
    // for HTML by name and gets the page; everything else keeps the
    // contract it already had.
    const scripted = await SELF.fetch(`${BASE}/admin/digest`, {
      headers: AUTH,
    });
    expect(scripted.status).toBe(200);
    expect(scripted.headers.get("Content-Type")).toContain("application/json");
  });
});
