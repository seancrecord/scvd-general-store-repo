import { escapeHtml } from "@/lib/sanitize";

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
  | "declines"
  | "census"
  | "recount"
  | "bell"
  | "digest";

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
  { tab: "declines", href: "/admin/declines", label: "Declines" },
  { tab: "census", href: "/admin/census", label: "Census" },
  { tab: "recount", href: "/admin/recount", label: "Recount" },
  { tab: "bell", href: "/admin/bell", label: "Bell" },
  { tab: "digest", href: "/admin/digest", label: "Digest" },
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
      : `<p style="color:#8c2f1b"><strong>Some shelves didn't load:</strong> ${loadNotes
          .map((note) => escapeHtml(note))
          .join(", ")}. The rest of the room is fine; reload to retry.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keep's Office</title>
  <style>
    body { font-family: monospace; max-width: 900px; margin: 1rem auto; padding: 0 1rem; }
    section { border: 1px solid #999; padding: 1rem; margin-bottom: 1rem; }
    li { margin-bottom: 0.75rem; }
    textarea, input[type=text] { width: 100%; max-width: 500px; }
    nav { margin-bottom: 0.35rem; }
    nav a, nav strong { margin-right: 1rem; }
    nav.readings { margin-bottom: 1rem; font-size: 0.9em; }
    nav.readings::before { content: "readings: "; color: #666; }
    details > summary { cursor: pointer; margin-bottom: 0.5rem; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <h1>Keep's Office</h1>
  <nav>
    ${ROOMS.map(link).join("\n    ")}
    <a href="/">Front of house</a>
  </nav>
  <nav class="readings">
    ${READINGS.map(link).join("\n    ")}
  </nav>
  ${notes}
  ${bodyHtml}
</body>
</html>`;
}

/** Every page the office can render. The nav is the whole map. */
export const ADMIN_PAGES: readonly { tab: AdminTab; href: string }[] = [
  ...ROOMS,
  ...READINGS,
];
