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

describe("admin auth is watched, never barred (2026-08-04)", () => {
  it("pages after a run of failures but never locks the door", async () => {
    await testEnv.COUNTERS.delete("admin_auth_fails");
    const bad = { Authorization: `Basic ${btoa("keeper:wrong-password")}` };

    // A run of wrong passwords.
    for (let i = 0; i < 6; i += 1) {
      const res = await SELF.fetch(`${BASE}/admin`, { headers: bad });
      expect(res.status).toBe(401);
    }
    // The failures were counted...
    const count = Number(await testEnv.COUNTERS.get("admin_auth_fails"));
    expect(count).toBeGreaterThanOrEqual(6);

    // ...and the door is STILL OPEN to the real password. No lockout:
    // a single-user panel a stranger can bar is a DoS, not a defense.
    const good = await SELF.fetch(`${BASE}/admin`, {
      headers: {
        Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
        Accept: "text/html",
      },
    });
    expect(good.status).toBe(200);
    // A clean login clears the window.
    expect(await testEnv.COUNTERS.get("admin_auth_fails")).toBeNull();
  });

  it("the alert fired for the brute-force run", async () => {
    await testEnv.COUNTERS.delete("admin_auth_fails");
    await testEnv.COUNTERS.delete("alert_sent:worker_health:admin-auth-bruteforce");
    const bad = { Authorization: `Basic ${btoa("keeper:nope")}` };
    for (let i = 0; i < 6; i += 1) {
      await SELF.fetch(`${BASE}/admin`, { headers: bad });
    }
    const { listAlerts } = await import("@/lib/alerts");
    const alert = (await listAlerts(testEnv, 20)).find((a) =>
      a.detail.includes("failed /admin logins"),
    );
    expect(alert).toBeDefined();
    expect(alert!.detail).toContain("rotate ADMIN_PASSWORD");
  });
});
