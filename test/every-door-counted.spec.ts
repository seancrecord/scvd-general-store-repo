import { describe, expect, it } from "vitest";
import { app } from "@/index";
import { porchSurface } from "@/lib/porch-surface";

/**
 * EVERY DOOR IS COUNTED, OR SAYS WHY NOT (2026-09-06).
 *
 * The porch map has been caught drifting behind the store three times
 * now, and each time the same way: somebody opened a room, nobody
 * added a line, and the store went on publishing counts that were
 * missing it. The evidence surfaces went a month unmeasured. The
 * verifier door ran two days unseen. The versioned preflight —
 * /api/preflight/v1, the exact address the MCP instructions, llms.txt
 * and the census finding all send agents to — was never counted at
 * all, so the one free instrument the store advertises hardest read as
 * its quietest.
 *
 * The guard that already existed could not catch any of them, because
 * it was a HAND-WRITTEN LIST of surfaces to check. A list only fails
 * for a room somebody remembered to add to it, which is precisely the
 * room that was never going to be forgotten.
 *
 * So this one derives its subject from the app itself. It walks Hono's
 * own route table — every path the store actually serves — and demands
 * that each one either resolves to a porch surface, matches an exempt
 * pattern with a reason, or appears by name in the inventory below.
 * A new door fails here on the day it is added. The failure is not an
 * accusation that it must be counted; it is a demand that somebody
 * DECIDE, in writing, and the inventory is where that decision goes.
 *
 * The inventory is the store's own admission, and it is long. Every
 * entry is a room whose readership is unknown. Shrinking it is work
 * for another day; hiding it is not available.
 */

/** Reasons a whole class of route is not on the porch. */
const EXEMPT: ReadonlyArray<{ why: string; test: (route: string) => boolean }> = [
  {
    why: "The keeper's own back room, behind basic auth: house traffic by definition, and the porch counts what strangers do.",
    test: (route) => route.includes(" /admin"),
  },
  {
    why: "Browser and crawler furniture — icons, robots, sitemaps, the health probe. Fetched by machinery, never chosen by a reader.",
    test: (route) =>
      /^GET \/(favicon\.(svg|ico)|robots\.txt|sitemap\.(xml|md)|og\.png|site\.webmanifest|schemamap\.xml|health)$/.test(route) ||
      /^GET \/[a-z-]*\.js$/.test(route) ||
      route.startsWith("GET /schemas/"),
  },
  {
    why: "Rendered images — the chip is counted as its own surface at /badges/passport/; the rest are pictures, edge-cached, and a count of them would be a count of cache misses.",
    test: (route) => route.startsWith("GET /badges/") || route.startsWith("GET /luckies/"),
  },
  {
    why: "The three MCP doors log INSIDE their handlers, because the surface depends on the JSON-RPC method and the tool name, which a path cannot see.",
    test: (route) => /^[A-Z]+ \/mcp(\/|$)/.test(route),
  },
  {
    why: "Doors that book their own row: /api/verify books a verify event, /api/buy books challenge, decline and settle. Counting them here too would flatter the number twice.",
    test: (route) => route.startsWith("GET /api/verify/") || / \/api\/buy\//.test(route),
  },
  {
    why: "/doors and /doors.json promise in their own words that reading them writes nothing anywhere, held by test/door-index.spec.ts. The sentence outranks the count.",
    test: (route) => route.startsWith("GET /doors"),
  },
  {
    why: "The per-item menu pages DO resolve, to item:<id>, but only for an id on the shelf — a junk id cannot mint a key. The sampled placeholder is not on the shelf, so it reads as unresolved here and is not.",
    test: (route) => route.startsWith("GET /menu/:item_id") || route === "GET /menu/",
  },
];

/** Rooms the porch does not count, by name, each under the reason it is not counted. */
const UNCOUNTED_TODAY: readonly string[] = [
  // Private signed monitoring delivery, not visitor demand. Its own
  // receipt ledger is reviewed at /admin/desvela-registry.json.
  "POST /webhooks/desvela-registry",
  /**
   * HUMAN AND LEGAL ROOMS. A person reading the terms is not an agent
   * using an instrument, and the question this porch asks — did anyone
   * USE the thing the shop is for — is not asked of them.
   */
  "GET /about",
  "GET /faq",
  "GET /terms",
  "GET /legal",
  "GET /contact",
  "GET /support",
  "GET /security",
  "GET /privacy-policy",
  /**
   * A ROOM'S SECOND SPELLING. The markdown, llms.txt and .json twins of
   * rooms that already answer at another address. Counting both would
   * double a room's readership and call it growth.
   */
  "GET /docs",
  "GET /api",
  "GET /auth.md",
  "GET /agents.md",
  "GET /AGENTS.md",
  "GET /developers/llms.txt",
  "GET /conformance/llms.txt",
  "GET /menu/llms.txt",
  "GET /trust/llms.txt",
  "GET /docs/llms.txt",
  "GET /api/llms.txt",
  "GET /sources.json",
  "GET /mcp-ward.json",
  "GET /fixtures.json",
  "GET /ask/feed.json",
  "GET /trust-list.json",
  "GET /house-ledger.json",
  // Compatibility redirect; the destination key registry is the counted surface.
  "GET /keys",
  /**
   * THE STOREFRONT'S OWN FURNITURE. /shop-window.json is what
   * /shop-window.js polls once a minute while somebody has the front
   * page open; the rows it carries are already in the storefront's
   * HTML, and the storefront is counted. Counting this too would
   * count one reader sixty times an hour and call the front page's
   * refresh loop a readership — the same double-count the second
   * spellings above are kept dark for, arriving by machinery rather
   * than by a second address. If it is ever published as an
   * instrument in its own right, it earns a porch line that day.
   */
  "GET /shop-window.json",
  /**
   * PER-ID ROOMS WITH NO BUCKET YET. Each needs the treatment corpus:host
   * and passport:host already have — one bucketed key, never one per
   * stranger's id — and none has been given it.
   */
  "GET /:file{[a-f0-9]{32}\\.txt}",
  "GET /defects/:id{[a-z0-9-]+}",
  "GET /notice/:host",
  "GET /profiles/:host",
  "GET /samples/:slug{[a-z0-9-]+\\.json}",
  "GET /fixtures/:set{[a-z0-9]+}/:file{[a-z0-9.-]+\\.json}",
  "GET /ledger/:file{[0-9]{4}-W[0-9]{2}\\.json}",
  "GET /ledger/:week{[0-9]{4}-W[0-9]{2}}",
  "GET /case/:case_id",
  "GET /almanac/:slug",
  "GET /directory/:slug",
  "GET /gazette/:issue{issue-[0-9]+}",
  /**
   * EVIDENCE AND INSTRUMENT ROOMS THAT SHOULD PROBABLY BE COUNTED, and
   * are not. This is the live end of the list — the same shape as the
   * gap that hid the verifier door for two days and the versioned
   * preflight for a month. Named here so the next reader inherits the
   * question instead of rediscovering it.
   *
   * ONE CAME OFF ON 2026-09-06: /openapi-tools.json. It is the ~13 KB
   * function-calling contract that sits beside the ~650 KB OpenAPI,
   * and the catalog and the discovery document had named only the
   * large one. Now they name both, and the small one is counted —
   * because the only way to learn whether pointing at it works is to
   * count who takes it.
   */
  "GET /api/conformance/v1/fixtures",
  "GET /feeds",
  "GET /feeds/brief.xml",
  "GET /feeds/corpus.xml",
  "GET /feeds/corrections.xml",
  "GET /feeds/disagreements.xml",
  "GET /ledger",
  "GET /sources",
  "GET /mcp-ward",
  "GET /scorers",
  "GET /stack",
  "GET /spec/scvd-attestation",
  "GET /spec/scvd-attestation/v1",
  "GET /agent",
  "GET /agent-mode",
  // The 1990s guess for the front door (2026-09-10): a 301 to /, which is counted.
  "GET /index.html",
  // The training position in Spawning's grammar (2026-09-11): a fixed-path
  // policy file derived from robots.txt's Content-Signal, read by crawlers.
  "GET /ai.txt",
  "GET /api/declare-door",
  "POST /api/declare-door",
  "POST /api/claims/challenge",
  "POST /api/tab/delta",
  "GET /api/tab/pool",
  /**
   * THE TRADE COUNTER, which books its own ledger rows for what it
   * settles but no porch row for who reads or knocks.
   */
  "GET /api/trade/catalog",
  "GET /api/trade/contract",
  "GET /api/trade/ledger",
  "POST /api/trade/:partner/check",
  "GET /api/trade/:partner/check",
  "GET /api/trade/:partner/statement",
  "GET /api/trade/:partner/claim",
  "POST /api/trade/:partner/:item_id",
  /**
   * The door card (2026-09-09): a marketplace's liveness probe hits
   * it on a schedule, so counting it would fill the porch with a
   * robot's heartbeat and call it footfall. What the counter can
   * prove about this door is on its own ledger, not the porch's.
   */
  "GET /api/trade/:partner/:item_id",
];

/** Hono reports paths with parameters; the porch maps concrete paths. */
function sampleOf(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+(\{.*?\})?/g, "x").replace(/\*/g, "x");
}

function registeredRoutes(): string[] {
  const seen = new Set<string>();
  for (const route of app.routes as ReadonlyArray<{ path: string; method: string }>) {
    if (route.method === "ALL" || route.path === "/*") continue;
    seen.add(`${route.method} ${route.path}`);
  }
  return [...seen].sort();
}

describe("every door the store serves is counted, or named as uncounted", () => {
  it("has no route that is neither counted, exempt, nor on the inventory", () => {
    const undecided: string[] = [];
    for (const route of registeredRoutes()) {
      const [method, ...rest] = route.split(" ");
      const path = rest.join(" ");
      if (porchSurface(sampleOf(path), method!)) continue;
      if (EXEMPT.some((rule) => rule.test(route))) continue;
      if (UNCOUNTED_TODAY.includes(route)) continue;
      undecided.push(route);
    }
    // A new door lands here. Count it in lib/porch-surface, or add it to
    // UNCOUNTED_TODAY under the reason it stays dark. Both are answers;
    // silence is not.
    expect(undecided).toEqual([]);
  });

  it("keeps the inventory honest: nothing on it is counted, and nothing on it is gone", () => {
    const routes = new Set(registeredRoutes());
    const stale: string[] = [];
    const nowCounted: string[] = [];
    for (const entry of UNCOUNTED_TODAY) {
      if (!routes.has(entry)) {
        stale.push(entry);
        continue;
      }
      const [method, ...rest] = entry.split(" ");
      if (porchSurface(sampleOf(rest.join(" ")), method!)) nowCounted.push(entry);
    }
    // A room that got its porch line, or was deleted, comes off the list.
    expect({ stale, nowCounted }).toEqual({ stale: [], nowCounted: [] });
  });

  it("counts the versioned instrument doors the store publishes", () => {
    // The gap this file was written for: every one of these is an
    // address the store hands to agents in writing.
    expect(porchSurface("/api/preflight/v1", "POST")).toBe("preflight");
    expect(porchSurface("/api/preflight/v2", "POST")).toBe("preflight");
    expect(porchSurface("/api/before-you-pay/v1", "POST")).toBe("before-you-pay");
    expect(porchSurface("/api/look/v1", "POST")).toBe("look");
    expect(porchSurface("/api/conformance/v1", "POST")).toBe("conformance");
    expect(porchSurface("/api/discovery/v1", "POST")).toBe("discovery");
    expect(porchSurface("/api/onpage/v1", "POST")).toBe("onpage");
  });

  it("mints nothing for a version that is not one, so a stranger's string cannot make a key", () => {
    expect(porchSurface("/api/preflight/vNOPE", "POST")).toBeUndefined();
    expect(porchSurface("/api/preflight/v", "POST")).toBeUndefined();
    expect(porchSurface("/api/preflight/v1/extra", "POST")).toBeUndefined();
    expect(porchSurface("/api/nonsense/v1", "POST")).toBeUndefined();
  });
});
