import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { LLMS_AREAS } from "@/routes/llms";
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
  "/privacy-policy": "redirect to a real room; listing it would double-count the destination",
  "/security": "redirect to a real room; listing it would double-count the destination",
  "/support": "redirect to a real room; listing it would double-count the destination",
  "/terms": "redirect to a real room; listing it would double-count the destination",
  "/x402-test": "301 to /try, kept so old links keep working; /try is the listed door",
  /*
   * /agent is not in this map and does not need to be: the walk's
   * substring probe already accounts for it via /agents.md, which
   * every surface lists. /agent-mode is the same one-hop redirect and
   * gets the same reason the eight above it get.
   */
  "/agent-mode":
    "301 to /agents.md, the agent-mode view every surface already lists; listing the guess as well would advertise two doors that are one door",
  /*
   * The SHOUTED spelling of a door already listed in lower case.
   * Vetting the site as an arriving agent (2026-08-29) found
   * /agents.md answering and /AGENTS.md 404ing, and the convention
   * that has settled is the shouted one — an agent only gets one
   * guess, and a 404 on a conventional path reads as "no agent guide
   * here" rather than "try the other case". Both spellings now
   * answer; listing both would advertise two doors that are one
   * door, which is the same reason the redirects above stay quiet.
   */
  "/AGENTS.md":
    "the same document as /agents.md, which every surface already lists; an agent guessing the shouted convention must not get a 404, but listing both would double-count one door",

  // ---- web plumbing found by convention, not by reading a list ----
  "/robots.txt": "crawlers find it at its fixed path; that is the entire mechanism",
  "/schemamap.xml":
    "robots.txt names it in a Schemamap directive, which IS the NLWeb Schema Feeds discovery mechanism — the same reasoning the Sitemap line has always run on; every feed it indexes is separately listed",
  "/.well-known/mcp/server-card.json":
    "the third spelling of /.well-known/mcp, which every surface already lists; listing all three would advertise three doors that are one card",
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

  // ---- a browser asset, not a capability ----
  "/till.js":
    "the browser till (house rule 53): a page asset a browser fetches from the <script> tag on /try and the item pages, never a door an agent calls. An agent buying here uses /api/buy/{item_id} or MCP, which are both listed; naming a JavaScript file on an agent surface would advertise a capability agents cannot use and would not want",

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
  /*
   * LLMS.TXT IS NOW A SET OF FILES, NOT ONE FILE (2026-08-27).
   *
   * The guide was 90kB against a 30,000-character convention, so it
   * was split: /llms.txt is an index and each product area carries its
   * own llms.txt with that area's sections whole. Nothing was deleted
   * and no prose moved into a second copy — the area files are views
   * over the same rendered document, and /llms-full.txt still serves
   * all of it byte for byte.
   *
   * The surface this guard reads therefore has to be the SET. Ten
   * doors were named only in sections that now live in an area file,
   * and they are no less published than they were yesterday.
   *
   * WHAT THIS COSTS, STATED RATHER THAN GLOSSED: a door named only in
   * an area file is one hop further away than a door named in the
   * index. The index links every area file and /llms-full.txt still
   * carries everything, so nothing is unreachable — but "an agent
   * reads llms.txt and sees the door" is now "an agent reads llms.txt,
   * follows one link, and sees the door" for those ten. That is a real
   * weakening of the property this file asserts, and it belongs here
   * rather than in nobody's memory.
   */
  const areaFiles = LLMS_AREAS.map(
    (area) => `https://scvd.store${area.path}/llms.txt`,
  );
  for (const url of [
    "https://scvd.store/llms.txt",
    ...areaFiles,
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
      /*
       * THIS CHECK'S OWN BLIND SPOT, WRITTEN DOWN RATHER THAN LEFT TO
       * BE REDISCOVERED (rule 52, 2026-08-26).
       *
       * The match is plain substring containment, so a probe that is a
       * SUFFIX of a longer listed path passes without being listed
       * itself: `/index.md` was accounted for by the presence of
       * `/okf/index.md` on the day it shipped, and nobody would have
       * known. It is now genuinely listed on llms.txt, so the pass is
       * real — but the mechanism that hid it is still here.
       *
       * Left as containment on purpose for now: tightening it to a
       * boundary match changes the verdict for every route at once,
       * which is a separate change with its own blast radius and
       * wants its own pass. The floor this guard establishes is
       * therefore "no route is unlisted AND unlike anything listed",
       * which is weaker than the sentence in the failure message. A
       * reader deciding how much to trust a green run should read
       * this paragraph, not that sentence.
       */
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
