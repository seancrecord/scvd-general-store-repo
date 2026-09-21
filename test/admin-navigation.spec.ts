import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ADMIN_PAGES, PAGE_HEADS, SHELVES } from "@/pages/admin/layout";
import { escapeHtml } from "@/lib/sanitize";
import { KV_KEYS } from "@/lib/kv-keys";
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

  /**
   * EVERY ROOM SAYS ITS OWN NAME (2026-09-21). Twenty-six of thirty
   * pages opened into an <h2> under a shell <h1> reading "Keep's
   * Office", so the page you were on looked like every page you were
   * not on. The head is rendered by the shell off PAGE_HEADS, which is
   * exhaustive over AdminTab — this holds the rendering to it, so the
   * map cannot be filled in and then quietly not used.
   */
  it("names itself, in one line, on every page", async () => {
    const seen = new Map<string, string>();
    for (const page of ADMIN_PAGES) {
      const html = await (
        await SELF.fetch(`${BASE}${page.href}`, { headers: BROWSER })
      ).text();
      const head = PAGE_HEADS[page.tab];

      // Compared through the same escape the shell renders with, so a
      // name with an apostrophe in it is held to the real output.
      expect(
        html.includes(`<h1>${escapeHtml(head.title)}</h1>`),
        `${page.href} does not render its own name as the h1`,
      ).toBe(true);
      expect(
        html.includes(escapeHtml(head.what)),
        `${page.href} renders no line saying what it is`,
      ).toBe(true);

      // Exactly one h1: the shell's old "Keep's Office" heading is an
      // eyebrow now, and a page adding its own back would make two.
      expect(
        (html.match(/<h1[ >]/g) ?? []).length,
        `${page.href} does not have exactly one h1`,
      ).toBe(1);

      const clash = seen.get(head.title);
      expect(clash, `${page.href} and ${clash} share the name "${head.title}"`).toBe(undefined);
      seen.set(head.title, page.href);
    }
  });

  /**
   * EVERY READING ON EXACTLY ONE SHELF (2026-09-21). The 08-05
   * consolidation's note says "eleven tabs was a corridor"; the list
   * had grown back to twenty in one undifferentiated row. Grouping is
   * only an improvement while the groups stay honest — a reading on no
   * shelf is invisible again, and one on two shelves is a reading the
   * keeper cannot learn the location of.
   */
  it("puts every reading on exactly one shelf", () => {
    const placed = SHELVES.flatMap((shelf) => shelf.hrefs);
    expect(new Set(placed).size, `a reading is on two shelves: ${placed.join(", ")}`).toBe(placed.length);

    const rooms = new Set(["/admin/round", "/admin", "/admin/counter", "/admin/tools"]);
    const readings = ADMIN_PAGES.map((page) => page.href).filter((href) => !rooms.has(href));
    for (const href of readings) {
      expect(placed, `${href} is on the nav but on no shelf`).toContain(href);
    }
    for (const href of placed) {
      expect(readings, `${href} is on a shelf but not on the nav`).toContain(href);
    }
  });

  it("names each shelf once, above the readings it holds", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/admin`, { headers: BROWSER })
    ).text();
    for (const { shelf } of SHELVES) {
      expect(html, `the ${shelf} shelf is not signposted`).toContain(
        `<span class="shelf-name">${shelf}</span>`,
      );
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
    /*
     * A DISTINCT ADDRESS PER PAGE, since 2026-08-10. Seventeen
     * unauthenticated probes from one address is exactly the shape the
     * new throttle exists to slow, so sharing an address here would
     * make the sweep test its own rate limiter rather than the gate.
     * Asserting 401 specifically still matters: it proves each page
     * demands AUTH, not merely that something refused it.
     */
    for (const [index, page] of ADMIN_PAGES.entries()) {
      const response = await SELF.fetch(`${BASE}${page.href}`, {
        headers: { "CF-Connecting-IP": `192.0.2.${index + 1}` },
      });
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
  it("pages after a run of failures, and a STRANGER still cannot bar the keeper", async () => {
    /*
     * THE PROPERTY, SHARPENED 2026-08-10 rather than abandoned.
     *
     * This used to assert that a correct password ALWAYS works, on the
     * reasoning that a single-user panel a stranger can bar is a DoS
     * and not a defence. That reasoning is right and it still holds —
     * but watching a guesser is not slowing one, and the store had
     * accidentally taken BOTH "no lockout" and "no throttle" while
     * only meaning to take the first.
     *
     * A PER-ADDRESS throttle keeps the property that mattered: the
     * stranger slows only themselves. So the assertion becomes the
     * thing actually worth defending — a run of failures from one
     * address leaves the keeper's own access untouched — rather than
     * the literal wording, which forbade any throttle at all.
     */
    await testEnv.COUNTERS.delete("admin_auth_fails");
    const attacker = "203.0.113.200";
    const keeper = "198.51.100.200";
    await testEnv.COUNTERS.delete(KV_KEYS.adminFailByIp(attacker));
    await testEnv.COUNTERS.delete(KV_KEYS.adminFailByIp(keeper));
    const bad = {
      Authorization: `Basic ${btoa("keeper:wrong-password")}`,
      "CF-Connecting-IP": attacker,
    };

    // A run of wrong passwords from one address.
    for (let i = 0; i < 6; i += 1) {
      await SELF.fetch(`${BASE}/admin`, { headers: bad });
    }
    // The failures were counted...
    const count = Number(await testEnv.COUNTERS.get("admin_auth_fails"));
    expect(count).toBeGreaterThanOrEqual(6);
    // ...the page fires BEFORE the throttle engages, which is the
    // order that matters: hearing about it beats slowing it, and the
    // throttle threshold sits above the alert threshold so a
    // single-address run always reports before it starts waiting.
    for (let i = 0; i < 3; i += 1) {
      await SELF.fetch(`${BASE}/admin`, { headers: bad });
    }
    expect((await SELF.fetch(`${BASE}/admin`, { headers: bad })).status).toBe(429);

    // ...and the keeper's own door is untouched.
    const good = await SELF.fetch(`${BASE}/admin`, {
      headers: {
        Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
        "CF-Connecting-IP": keeper,
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
    // Its own address: the throttle is per-address, so a test that
    // shares one with another test inherits its wait.
    const alertIp = "203.0.113.201";
    await testEnv.COUNTERS.delete(KV_KEYS.adminFailByIp(alertIp));
    const bad = {
      Authorization: `Basic ${btoa("keeper:nope")}`,
      "CF-Connecting-IP": alertIp,
    };
    for (let i = 0; i < 6; i += 1) {
      await SELF.fetch(`${BASE}/admin`, { headers: bad });
    }
    const { listAlerts } = await import("@/lib/alerts");
    const alert = (await listAlerts(testEnv, 20)).find((a) =>
      a.detail.includes("failed /admin logins"),
    );
    expect(alert).toBeDefined();
    // The advice sharpened 2026-08-10: a run of FAILURES is evidence
    // nobody got in, so "rotate" is only worth doing if the password
    // is weak or reused. Reflexive rotation is theatre.
    expect(alert!.detail).toContain("rotating ADMIN_PASSWORD is only worth doing");
    expect(alert!.detail).toContain("made to wait between tries");
  });
});
