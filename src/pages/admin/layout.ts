import { escapeHtml } from "@/lib/sanitize";

/**
 * The back room's shared shell: one nav, three rooms.
 *   /admin        the counter (the day's actual work)
 *   /admin/books  the books (ledgers and diagnostics, read-only)
 *   /admin/tools  the back shelf (levers, rarely pulled)
 * Every data section renders independently; a shelf that fails to
 * load says so without taking the room down.
 */

export type AdminTab = "counter" | "books" | "tools";

export function renderAdminShell(
  tab: AdminTab,
  bodyHtml: string,
  loadNotes: string[] = [],
): string {
  const link = (target: AdminTab, href: string, label: string): string =>
    tab === target
      ? `<strong>${label}</strong>`
      : `<a href="${href}">${label}</a>`;
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
  <title>The Back Room</title>
  <style>
    body { font-family: monospace; max-width: 900px; margin: 1rem auto; padding: 0 1rem; }
    section { border: 1px solid #999; padding: 1rem; margin-bottom: 1rem; }
    li { margin-bottom: 0.75rem; }
    textarea, input[type=text] { width: 100%; max-width: 500px; }
    nav { margin-bottom: 1rem; }
    nav a, nav strong { margin-right: 1rem; }
    details > summary { cursor: pointer; margin-bottom: 0.5rem; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <h1>The Back Room</h1>
  <nav>
    ${link("counter", "/admin", "The counter")}
    ${link("books", "/admin/books", "The books")}
    ${link("tools", "/admin/tools", "The back shelf")}
    <a href="/">Front of house</a>
  </nav>
  ${notes}
  ${bodyHtml}
</body>
</html>`;
}
