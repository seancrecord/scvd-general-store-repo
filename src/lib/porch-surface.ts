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
  ["/fresh-set", "fresh-set"],
  ["/okf/index.md", "okf:index"],
  ["/okf/log.md", "okf:log"],
  ["/passport", "passport"],
  ["/trust", "trust"],
]);

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
  return undefined;
}
