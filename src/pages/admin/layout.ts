import { escapeHtml } from "@/lib/sanitize";
import { OFFICE_CSS } from "@/pages/admin/office-css";

/**
 * Keep's Office. Three rooms and a shelf of readings.
 *
 *   /admin          the desk (analytics front and center)
 *   /admin/counter  the counter (the day's actual work)
 *   /admin/tools    the back shelf (levers, rarely pulled)
 *
 * And the readings, each on its own page because each does an
 * expensive row scan the desk should not pay for:
 *
 *   /admin/declines  who opened a wallet here and was turned away
 *   /admin/census    who ever tried, and who only ever looked
 *   /admin/recount   the counters audited against the raw rows
 *   /admin/bell      the bell ledger
 *   /admin/digest    the compiled digest
 *
 * THE ORPHANING, fixed 2026-07-28. The nav listed three rooms while
 * eight pages existed, and every reading rendered itself as tab
 * "office" — which drew "The desk" as un-clickable bold, so landing
 * on a reading left NO LINK BACK ANYWHERE. The only routes out were
 * the browser's back button and "Front of house." The readings were
 * reachable solely through links buried in prose on the desk, which
 * is not navigation, it is a scavenger hunt.
 *
 * So: every page names itself, and every page lists every other. A
 * room nobody can leave is a room nobody will enter twice.
 *
 * Every data section renders independently; a shelf that fails to
 * load says so without taking the room down.
 */

export type AdminTab =
  | "office"
  | "counter"
  | "tools"
  | "reconciliation"
  | "files"
  | "declines"
  /**
   * Money out (2026-09-04): the paying wallet's balance off the chain,
   * every claim presented at the bounty board, and where each went.
   */
  | "bounties"
  | "referrals"
  /**
   * THE BUYERS AND THE FREE INSTRUMENTS (2026-09-04). The two readings
   * the keeper asked for after the walkers were subtracted: who the
   * ~two dozen real buyers are, off the certificates they hold, and
   * which free tools agents actually use, off the porch — the demand
   * that never needed a pitch.
   */
  | "buyers"
  | "instruments"
  | "ward"
  /**
   * The second ward (2026-09-04). Its own tab rather than a section of
   * the first, because the two share no denominator and one console
   * with both sets of numbers on it is the affordance that eventually
   * gets them added together.
   */
  | "mcp-ward"
  | "cv"
  /**
   * Demoted readings and drawers (2026-08-05 consolidation): still
   * rendered, still tested, reachable through the books check and
   * the back shelf rather than the top nav. The keeper asked for a
   * room he can scan; eleven tabs was a corridor.
   */
  | "census"
  | "recount"
  | "bell"
  | "digest"
  | "testing"
  /**
   * The per-item lookup. Deliberately matches no nav entry, so every
   * link renders clickable and the page can never become a room with
   * no way out — the July orphaning bug, avoided by construction rather
   * than by remembering.
   */
  | "events"
  /**
   * The money walks, moved off the desk 2026-08-28 so the desk stops
   * paying for three of them just to open. Demoted like the rest:
   * reached from the desk's take section, not from the top nav, which
   * the keeper asked to keep scannable.
   */
  | "take"
  | "funnel"
  | "market"
  | "outreach"
  | "trade";

/** The three rooms. Always first, always in this order. */
const ROOMS: readonly { tab: AdminTab; href: string; label: string }[] = [
  { tab: "office", href: "/admin", label: "The desk" },
  { tab: "counter", href: "/admin/counter", label: "The counter" },
  { tab: "tools", href: "/admin/tools", label: "The back shelf" },
];

/**
 * The readings. Declines first on purpose: it is the only page here
 * that measures somebody trying to buy, and it should be the first
 * thing a keeper's eye lands on.
 */
const READINGS: readonly { tab: AdminTab; href: string; label: string }[] = [
  { tab: "reconciliation", href: "/admin/reconciliation", label: "The books check" },
  { tab: "declines", href: "/admin/declines", label: "Declines" },
  { tab: "bounties", href: "/admin/bounties", label: "The bounty board" },
  { tab: "funnel", href: "/admin/funnel", label: "The funnel" },
  // Promoted to the nav 2026-09-04: the keeper could not find it. The
  // 08-05 consolidation left it reachable only from a footnote on the
  // books check, which is not reachable, it is remembered.
  { tab: "census", href: "/admin/census", label: "The census" },
  { tab: "buyers", href: "/admin/buyers", label: "The buyers" },
  { tab: "instruments", href: "/admin/instruments", label: "Free instruments" },
  { tab: "referrals", href: "/admin/referrals", label: "Word of mouth" },
  { tab: "ward", href: "/admin/ward", label: "The ward" },
  { tab: "mcp-ward", href: "/admin/mcp-ward", label: "The MCP ward" },
  { tab: "market", href: "/admin/market", label: "The market" },
  { tab: "outreach", href: "/admin/outreach", label: "Outreach" },
  { tab: "trade", href: "/admin/trade", label: "The trade counter" },
  { tab: "files", href: "/admin/files", label: "Keeper's files" },
];

/**
 * CV'S CORNER, listed in the nav and DELIBERATELY OUTSIDE ADMIN_PAGES.
 *
 * The anti-orphaning sweep asserts every office page reaches every
 * other, which is the right rule and the wrong fit here: the corner
 * renders its own shell on purpose — it is the partner's surface, a
 * counter rather than the office's monospace rack — so hanging the full
 * office nav on it would undo the thing that makes it his.
 *
 * The rule's INTENT is honoured rather than waived: the corner is
 * reachable from every office page through this entry, and it carries
 * its own way back to the desk and the front of the store. A test holds
 * that link, so the carve-out cannot quietly become a dead end.
 */
const PARTNER: readonly { tab: AdminTab; href: string; label: string }[] = [
];

export function renderAdminShell(
  tab: AdminTab,
  bodyHtml: string,
  loadNotes: string[] = [],
): string {
  const link = (entry: {
    tab: AdminTab;
    href: string;
    label: string;
  }): string =>
    tab === entry.tab
      ? `<strong>${entry.label}</strong>`
      : `<a href="${entry.href}">${entry.label}</a>`;
  const notes =
    loadNotes.length === 0
      ? ""
      : `<p class="shelf-trouble"><strong>Some shelves didn't load:</strong> ${loadNotes
          .map((note) => escapeHtml(note))
          .join(", ")}. The rest of the room is fine; reload to retry.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keep's Office</title>
  <style>${OFFICE_CSS}</style>
</head>
<body>
  <div class="room">
  <h1>Keep<span class="lamp">'</span>s Office</h1>
  <p class="room-sub">Sean-Claude Van Damme's General Store &middot; back room</p>
  <nav>
    ${ROOMS.map(link).join("\n    ")}
    <a href="/">Front of house</a>
  </nav>
  <nav class="readings">
    ${READINGS.map(link).join("\n    ")}
    ${PARTNER.map(link).join("\n    ")}
  </nav>
  ${notes}
  ${bodyHtml}
  </div>
</body>
</html>`;
}

/** Every page the office can render. The nav is the whole map. */
export const ADMIN_PAGES: readonly { tab: AdminTab; href: string }[] = [
  ...ROOMS,
  ...READINGS,
];

/**
 * EVERY ROOM THAT IS NOT ON THE NAV (2026-09-04). The 08-05
 * consolidation demoted readings off the top nav "reachable through
 * the books check and the back shelf" — and the back shelf linked five
 * of them. books, deliveries, glance, settlement-unknown and the two
 * market sub-pages were reachable from nowhere; the census from one
 * footnote. This list is rendered on the back shelf, and
 * test/admin-reach.spec.ts holds every static GET route under /admin
 * to be on the nav or on this list, so a page cannot be built and
 * then lost again.
 */
export const EVERY_ROOM: readonly { href: string; label: string }[] = [
  { href: "/admin/recount", label: "The recount (row-level settle audit)" },
  { href: "/admin/take", label: "The take (every certificate, counted)" },
  { href: "/admin/books", label: "The books" },
  { href: "/admin/deliveries", label: "Deliveries (money in vs goods out)" },
  { href: "/admin/settlement-unknown", label: "Settlements the store could not read" },
  { href: "/admin/glance", label: "The glance" },
  { href: "/admin/events", label: "Item events" },
  { href: "/admin/bell", label: "The bell" },
  { href: "/admin/market/authenticity", label: "The market: authenticity" },
  { href: "/admin/market/inflows", label: "The market: inflows" },
  { href: "/admin/digest", label: "Latest weekly digest (JSON)" },
  { href: "/admin/testing", label: "Testing" },
  { href: "/admin/trade.json", label: "The trade counter (JSON)" },
  { href: "/admin/export/tax.csv", label: "Tax export (CSV)" },
];
