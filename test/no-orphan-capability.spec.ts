import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "@/index";

/**
 * THE NO-ORPHAN-CAPABILITY GUARD, and why it walks the router instead
 * of a list somebody wrote.
 *
 * On 2026-08-20 the question "is everything we built publicly findable
 * by an agent?" was answered by hand, and the hand-count found 36
 * public routes that appeared on none of the six surfaces an agent
 * actually reads. Eight of them were real gaps — the artifact-record
 * doors (service-audit, watch, conformance-watch, bitcoin-anchor,
 * reconciliation, lucky) and the Tab's two intake doors had shipped
 * with tests, prose pages, and no machine listing. A capability an
 * agent cannot find is a capability the store does not have.
 *
 * This is the same disease the rooms guard cured for HTML pages: two
 * things that must agree — the router and the discovery surfaces —
 * with nothing checking that they do. So the check is structural. The
 * router is the ground truth of what exists; the six surfaces are the
 * ground truth of what is findable; every route is either findable or
 * carries a written reason why not. A new door added without touching
 * a surface fails this test by name.
 */

/**
 * Routes that are deliberately absent from the discovery surfaces,
 * keyed by the same static-prefix probe the walk computes. Each entry
 * must say WHY the quiet is correct — "we forgot" is not a reason, and
 * an entry without a live route (or whose route a surface now names)
 * fails the staleness checks below.
 */
const DELIBERATELY_QUIET: Record<string, string> = {
  // ---- keeper-ruled redirects, not rooms (they 301 to real pages;
  // listing them would advertise nine doors that are one door) ----
  "/about": "redirect to a real room; listing it would double-count the destination",
  "/contact": "redirect to a real room; listing it would double-count the destination",
  "/faq": "redirect to a real room; listing it would double-count the destination",
  "/legal": "redirect to a real room; listing it would double-count the destination",
  "/privacy": "redirect to a real room; listing it would double-count the destination",
  "/privacy-policy": "redirect to a real room; listing it would double-count the destination",
  "/security": "redirect to a real room; listing it would double-count the destination",
  "/support": "redirect to a real room; listing it would double-count the destination",
  "/terms": "redirect to a real room; listing it would double-count the destination",
  "/x402-test": "301 to /try, kept so old links keep working; /try is the listed door",

  // ---- web plumbing found by convention, not by reading a list ----
  "/robots.txt": "crawlers find it at its fixed path; that is the entire mechanism",
  "/sitemap.xml": "IS one of the six surfaces; a surface need not list itself",
  "/favicon.ico": "browsers request it unprompted; no reader chooses to visit it",
  "/og.png": "unfurlers find it via the og:image tag on every page head",
  "/site.webmanifest": "browsers find it via the link tag on every page head",
  "/.well-known/security.txt":
    "RFC 9116: the fixed path is the discovery mechanism — our own contact scout finds others' the same way",

  // ---- pending removal, tracked ----
  "/.well-known/x402list.txt":
    "pending removal (tracker #27, the token-route delisting); do not advertise a door being closed",

  // ---- discoverable at the only moment it matters: the artifact in
  // hand carries the URL, so a standing listing would be noise ----
  "/api/commission/pay":
    "payment_url rides the quoted commission record (commission-desk.ts builds it into every quote); nobody pays a rung without a quote in hand",
  "/api/waitlist":
    "waitlist_url rides the sold-out 402 body (buy.ts); the door only exists when an item is sold out",
  "/badges/stamps":
    "badge_url rides the stamp-minting response; a badge URL with no stamp behind it is a 404",

  // ---- the porch toy ----
  "/api/treat":
    "free, unmetered, named in prose on /porch where its audience actually is; the paid surfaces list paid capabilities",
};

/** Same skip rules and probe derivation the 2026-08-20 hand-count used. */
function publicProbes(): Map<string, string[]> {
  const probes = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const route of app.routes) {
    if (route.method === "ALL" || route.method === "OPTIONS") continue;
    const path = route.path;
    if (path.startsWith("/admin")) continue;
    if (path === "/*" || path === "*" || path === "/") continue;
    const key = `${route.method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Static prefix: cut at the first param or wildcard segment. A
    // surface names doors by their stable part, never by :param.
    const prefix = path
      .split("/")
      .filter((seg) => !seg.startsWith(":") && !seg.includes("*") && !seg.includes("{"))
      .join("/");
    const probe = prefix.length > 1 ? prefix : path;
    probes.set(probe, [...(probes.get(probe) ?? []), key]);
  }
  return probes;
}

async function discoveryHaystack(): Promise<string> {
  const surfaces: string[] = [];
  for (const url of [
    "https://scvd.store/llms.txt",
    "https://scvd.store/openapi.json",
    "https://scvd.store/.well-known/x402.json",
    "https://scvd.store/skill.md",
    "https://scvd.store/menu.json",
    "https://scvd.store/sitemap.xml",
  ]) {
    const response = await SELF.fetch(url);
    expect(response.status, `${url} is a discovery surface and must serve`).toBe(200);
    surfaces.push(await response.text());
  }
  return surfaces.join("\n");
}

describe("every public door is on a surface an agent reads, or says why not", () => {
  it("leaves no route unfindable without a written reason", async () => {
    const haystack = await discoveryHaystack();
    const unaccounted: string[] = [];
    for (const [probe, routes] of publicProbes()) {
      if (haystack.includes(probe)) continue;
      if (probe in DELIBERATELY_QUIET) continue;
      unaccounted.push(...routes.map((key) => `${key}  (probe: ${probe})`));
    }
    expect(
      unaccounted.sort().join("\n"),
      "these routes appear on NONE of the six discovery surfaces (llms.txt, openapi.json, x402.json, skill.md, menu.json, sitemap.xml) and carry no DELIBERATELY_QUIET reason — either list the door where agents read, or write down why the quiet is correct",
    ).toBe("");
  });

  it("keeps no stale entries in the quiet list", async () => {
    // Both failure modes of an allowlist: an entry whose route died
    // (the reason now explains nothing), and an entry a surface now
    // names (the quiet ended and the reason reads as if it didn't).
    const haystack = await discoveryHaystack();
    const probes = publicProbes();
    const stale: string[] = [];
    for (const probe of Object.keys(DELIBERATELY_QUIET)) {
      if (!probes.has(probe)) {
        stale.push(`${probe} — no registered route matches; remove the entry`);
      } else if (haystack.includes(probe)) {
        stale.push(`${probe} — a discovery surface now names it; remove the entry`);
      }
    }
    expect(stale.join("\n")).toBe("");
  });
});
