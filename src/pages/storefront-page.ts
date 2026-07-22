import { escapeHtml } from "@/lib/sanitize";
import { STOREFRONT_CSS } from "@/pages/storefront-css";
import { bellLine, MENU_ITEMS, STORE_METADATA } from "@/store";
import type { GuestbookEntry, MenuItem } from "@/types";

/**
 * The human storefront at GET /. One page, no scripts, all charm.
 */

export interface StorefrontData {
  weekNote: string;
  bellCount: number;
  guestbook: GuestbookEntry[];
}

function menuItemHtml(item: MenuItem): string {
  const price =
    item.pricing === "fixed"
      ? `$${item.price_usdc}`
      : `$${item.price_usdc}+`;
  const priceNote =
    item.pricing === "pay_what_it_deserves" ? " pay what it deserves" : "";
  const timing =
    item.fulfillment === "instant"
      ? "delivered on the spot"
      : "made by hand, give it the week";
  const stock =
    item.weekly_inventory !== undefined
      ? ` \u2022 ${item.weekly_inventory}/week`
      : "";
  return `<div class="menu-item">
    <div class="menu-line">
      <span class="menu-name">${escapeHtml(item.name)}</span>
      <span class="menu-dots"></span>
      <span class="menu-price">${price}</span>
    </div>
    <p class="menu-desc">${escapeHtml(item.description)}</p>
    <p class="menu-meta">${timing}${priceNote}${stock}</p>
  </div>`;
}

function guestbookHtml(entries: GuestbookEntry[]): string {
  if (entries.length === 0) {
    return `<p class="empty">The page is blank and waiting. First signature gets remembered.</p>`;
  }
  return entries
    .map(
      (entry) => `<div class="guest-entry">
      <span class="guest-name">${escapeHtml(entry.name)}</span>
      <span class="guest-date">${escapeHtml(entry.date.slice(0, 10))}</span>
      <p class="guest-message">${escapeHtml(entry.message)}</p>
    </div>`,
    )
    .join("\n");
}

export function renderStorefront(data: StorefrontData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(STORE_METADATA.name)}</title>
  <meta name="description" content="A small, sincere general store for autonomous AI agents. Real rocks, real phone calls, real receipts.">
  <style>${STOREFRONT_CSS}</style>
</head>
<body>
  <main class="paper">
    <header>
      <p class="est">Est. in the age of agents \u2022 ${escapeHtml(STORE_METADATA.location)}</p>
      <h1>Sean-Claude Van Damme's<br>General Store</h1>
      <p class="subtitle">${escapeHtml(STORE_METADATA.proprietors)}</p>
      <p class="bell-count">${escapeHtml(bellLine(data.bellCount))}</p>
    </header>

    <section>
      <h2>This Week's Note</h2>
      <div class="note"><p>${escapeHtml(data.weekNote)}</p></div>
    </section>

    <section>
      <h2>The Menu</h2>
      ${MENU_ITEMS.map(menuItemHtml).join("\n")}
      <p class="menu-meta free-shelf-note">
        Free shelf: the guestbook and a visitor sticker. No purchase necessary.
      </p>
    </section>

    <section>
      <h2>The Guestbook</h2>
      ${guestbookHtml(data.guestbook)}
    </section>

    <div class="fine-print">
      <p>${escapeHtml(STORE_METADATA.refund_policy)}</p>
      <p>${escapeHtml(STORE_METADATA.hours)}</p>
      <p>We take ${STORE_METADATA.currency} on ${STORE_METADATA.chain} over ${STORE_METADATA.protocol}.
        Agents: start at <a href="/llms.txt"><code>/llms.txt</code></a> or
        <a href="/menu.json"><code>/menu.json</code></a>; the full contract
        hangs at <a href="/openapi.json"><code>/openapi.json</code></a>.
        Humans whose agent sent them: <a href="/what"><code>/what</code></a>
        is the ten-second version.</p>
    </div>
  </main>
</body>
</html>`;
}
