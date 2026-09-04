import { getMenuItem } from "@/store";

/**
 * WHICH SURFACE A REQUEST TOUCHED — the porch log's whole vocabulary,
 * lifted out of the Worker entry on 2026-08-21 so it can be tested
 * directly. It is pure mapping with no I/O, and the test below it is
 * the guard that stops the map drifting behind the store again: it
 * had grown with the storefront while the evidence layer grew unseen
 * beside it.
 */
/**
 * The front-porch log: free-tier attribution. Paths and headers only;
 * no bodies, no cookies, nothing client-side, nothing in responses.
 * /mcp initialize+tools/list log inside the handler (needs the method).
 */
export const PORCH_EXACT = new Map<string, string>([
  ["/", "storefront"],
  ["/what", "what"],
  ["/llms.txt", "llms.txt"],
  ["/menu.json", "menu.json"],
  ["/skill.md", "skill.md"],
  // The execution-contract give-away's 30-day gate is "did anyone
  // organically fetch or reference this" — a porch row, not a feeling.
  ["/skills/execution-contract.md", "execution-contract"],
  ["/gazette", "gazette"],
  ["/almanac", "almanac"],
  ["/api/treat", "treat"],
  ["/stats", "stats"],
  ["/api/conformance", "conformance"],
  ["/api/conformance/v1", "conformance"],
  /**
   * THE EVIDENCE SURFACES, logged from 2026-08-21 — and the reason
   * they were missing is worth writing down: this map grew with the
   * STOREFRONT, one line per shelf, while the evidence layer grew
   * beside it and nobody added a line. So the store could tell you
   * how many agents read the menu and nothing at all about whether
   * anybody used the corpus, the passports, or the chip — which is
   * to say, it measured the shop and not the thing the shop is FOR.
   *
   * Surfaces are BOUNDED on purpose. A per-host key (corpus:host:x)
   * would let any stranger's hostname mint a counter key, which is an
   * unbounded key space bought with somebody else's traffic; the
   * bucket carries the count and the event row carries the detail.
   */
  ["/corpus", "corpus"],
  ["/corpus.json", "corpus.json"],
  ["/registry", "registry"],
  ["/inflows", "inflows"],
  /* The atlas is an experiment; counting it is how we learn whether
   * agents wanted it. */
  ["/atlas.json", "atlas"],
  ["/fresh-set", "fresh-set"],
  ["/defects", "defects"],
  ["/defects.json", "defects.json"],
  ["/okf/index.md", "okf:index"],
  ["/okf/log.md", "okf:log"],
  ["/passport", "passport"],
  ["/trust", "trust"],
  /* The page that reads these counts is counted too (2026-09-02). */
  ["/observatory", "observatory"],
  /**
   * THE INTERACTIVE DOORS AND THE FREE RESOURCES, logged from
   * 2026-09-04 — the keeper's question after the bounty walker's
   * letter: how many are reaching the free instruments and the rooms
   * this store does not currently count? The answer was: nobody
   * knew. The preflight, the before-you-pay check, the look, the
   * bounty board, the mailbox, the credit desk and every human page
   * past the storefront had no porch line. Same lesson as the
   * evidence surfaces above, one shelf further along.
   *
   * Bounded, like everything here: fixed strings, and every per-id
   * path below buckets to one surface.
   */
  ["/bounties", "bounties"],
  ["/api/bounties", "bounties.json"],
  ["/credit", "credit"],
  ["/api/credit/redeem", "credit:redeem"],
  ["/api/credit/challenge", "credit:challenge"],
  ["/api/preflight", "preflight"],
  ["/api/preflight/batch", "preflight:batch"],
  ["/api/preflight/checks", "preflight:checks"],
  ["/api/before-you-pay", "before-you-pay"],
  ["/api/look", "look"],
  ["/api/discovery", "discovery"],
  ["/api/onpage", "onpage"],
  ["/api/claims", "claims"],
  ["/api/verify-receipt", "verify-receipt"],
  ["/api/stamp", "stamp"],
  ["/api/standing-note", "standing-note"],
  ["/api/provenance/self", "provenance:self"],
  ["/api/request", "request"],
  ["/api/tip", "tip"],
  ["/api/practice", "practice"],
  ["/api/bot-auth/check", "bot-auth:check"],
  ["/a2a", "a2a"],
  ["/ask", "ask"],
  ["/conformance", "conformance:desk"],
  /* The human rooms past the storefront. */
  ["/menu", "menu"],
  ["/try", "try"],
  ["/developers", "developers"],
  ["/how-it-works", "how-it-works"],
  ["/how-it-works.json", "how-it-works.json"],
  /*
   * NOT /doors and NOT /doors.json, on purpose. That room promises in
   * its own words that reading it "writes anything" nowhere, dated and
   * held by a standing test (test/door-index.spec.ts). A porch row is
   * a write. The sentence outranks the count.
   */
  ["/pricing", "pricing"],
  ["/pricing.md", "pricing.md"],
  ["/rails", "rails"],
  ["/samples", "samples"],
  ["/x402-test", "x402-test"],
  ["/operators", "operators"],
  ["/directory", "directory"],
  ["/openapi.json", "openapi.json"],
  ["/llms-full.txt", "llms-full.txt"],
  ["/index.md", "index.md"],
  ["/mcp.md", "mcp.md"],
  ["/trade", "trade"],
  ["/trade.json", "trade.json"],
  ["/trade.md", "trade.md"],
  ["/train", "train"],
  ["/visitors", "visitors"],
  ["/porch", "porch"],
  ["/pulse", "pulse"],
  ["/pulse.json", "pulse.json"],
  ["/coverage", "coverage"],
  ["/coverage.json", "coverage.json"],
  ["/corrections", "corrections"],
  ["/disagreements", "disagreements"],
  ["/criteria", "criteria"],
  ["/rights", "rights"],
  ["/privacy", "privacy"],
  ["/attestation", "attestation"],
  ["/becoming", "becoming"],
  ["/notice", "notice"],
  ["/neighbours", "neighbours"],
  ["/profiles", "profiles"],
  ["/sites", "sites"],
  ["/fulfillment-log", "fulfillment-log"],
  ["/luckies/house", "luckies:house"],
  ["/gazette/founding", "gazette:founding"],
  ["/deprecation", "deprecation"],
  ["/wind-down", "wind-down"],
  ["/bot-auth", "bot-auth"],
]);

/**
 * A purchased artifact being read back by its id — the usage half of
 * every sale, bucketed as one surface so no stranger's id mints a key.
 * /api/verify/{id} is NOT here: the verify door books its own row
 * (recordVerifyCall), and counting it twice would flatter the number.
 */
const ARTIFACT_READ_PREFIXES = [
  "/api/anchor/",
  "/api/bitcoin-anchor/",
  "/api/bot-auth-card/",
  "/api/discovery/report/",
  "/api/good-buyer/",
  "/api/launch-check/",
  "/api/lucky/",
  "/api/mandate/",
  "/api/onpage-audit/",
  "/api/opening-day/",
  "/api/operator-statement/",
  "/api/patronage/",
  "/api/phantom/",
  "/api/provenance-check/",
  "/api/reconciliation/",
  "/api/report/",
  "/api/service-audit/",
  "/api/statement/",
] as const;

export function porchSurface(path: string, method: string): string | undefined {
  const exact = PORCH_EXACT.get(path);
  if (exact) {
    return exact;
  }
  if (path.startsWith("/.well-known/")) {
    return "well-known";
  }
  /*
   * The OKF bundle, bucketed like every other per-host surface: one
   * key for all host concepts, never one per stranger's hostname.
   */
  if (path.startsWith("/okf/host/")) {
    return "okf:host";
  }
  if (path === "/okf" || path.startsWith("/okf/")) {
    return "okf:concept";
  }
  if (path === "/zodiac" || path.startsWith("/zodiac/")) {
    return "zodiac";
  }
  if (path === "/api/bell" && method === "POST") {
    return "bell";
  }
  if (path === "/api/guestbook") {
    return method === "POST" ? "guestbook:write" : "guestbook:read";
  }
  /**
   * PER-ITEM WINDOW SHOPPING. /menu.json logged as one surface, so a
   * reader who pulled up a single item's page and left was invisible:
   * we could see attention on the menu and money at the till, and
   * nothing about WHICH shelf got picked up and put back down. That
   * gap is the closest thing this store can measure to want, since a
   * 402 needs a client that already decided to try.
   *
   * Only ids that are actually on the shelf log. A junk path can't
   * mint a counter key, so the key space stays bounded by the menu.
   */
  if (path.startsWith("/menu/")) {
    const itemId = path.slice("/menu/".length);
    return getMenuItem(itemId) ? `item:${itemId}` : undefined;
  }
  /**
   * ASKING ABOUT ONE ENDPOINT is a different act from browsing the
   * dataset, and it is the stronger signal: a reader who fetches one
   * host's corpus history or one host's passport is deciding
   * something about that host. Bucketed, never per-host.
   */
  if (path.startsWith("/corpus/host/")) {
    return "corpus:host";
  }
  if (path.startsWith("/corpus/")) {
    return "corpus:week";
  }
  if (path.startsWith("/passport/")) {
    return "passport:host";
  }
  /**
   * THE CHIP, and it is the sharpest instrument the store has: an
   * embedded badge is somebody putting OUR verdict on THEIR page, so
   * every render is a request carrying their page as the referrer —
   * proof of use and proof of a link in one row.
   *
   * UNDERCOUNTS BY DESIGN, and the observatory must say so: the badge
   * is edge-cached for hours, so what lands here is roughly one row
   * per viewer-cache-miss, never one per page view. A floor, stated
   * as a floor.
   */
  if (path.startsWith("/badges/passport/")) {
    return "chip";
  }
  /**
   * A WATCH HISTORY BEING READ is the usage half of a watch sold —
   * the keeper's question "are developers paying for standing_watch"
   * has a second half nobody was measuring: whether the thing they
   * bought gets looked at, by them or by whoever they showed it to.
   * A watch nobody reads is a subscription, not evidence.
   */
  if (path.startsWith("/api/watch/")) {
    return "watch:history";
  }
  if (path.startsWith("/api/conformance-watch/")) {
    return "conformance-watch:history";
  }
  /**
   * THE BOUNTY BOARD'S CLAIM DOOR: a POST is somebody presenting a
   * settlement for payment — the strongest money-out signal the store
   * has, and the outcome books its own row (recordBountyClaim). A GET
   * is somebody reading the instructions.
   */
  if (path === "/api/bounty-claim") {
    return method === "POST" ? "bounty-claim" : "bounty-claim:read";
  }
  /* The mailbox: a letter posted, or a pickup slip checked for a reply. */
  if (path === "/api/letter") {
    return method === "POST" ? "letter:write" : "letter:read";
  }
  if (path.startsWith("/api/letter/")) {
    return "letter:pickup";
  }
  /* The credit desk, read by wallet. One bucket, never one per wallet. */
  if (path.startsWith("/api/credit/")) {
    return "credit:read";
  }
  if (path.startsWith("/api/practice/")) {
    return "practice";
  }
  if (path.startsWith("/api/waitlist/")) {
    return "waitlist";
  }
  /* A buyer reading back their own order, commission or refund. */
  if (path.startsWith("/api/order/")) {
    return "order:read";
  }
  if (path.startsWith("/api/commission/")) {
    return "commission:read";
  }
  if (path.startsWith("/api/refund/")) {
    return "refund:read";
  }
  if (ARTIFACT_READ_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return "artifact:read";
  }
  return undefined;
}
