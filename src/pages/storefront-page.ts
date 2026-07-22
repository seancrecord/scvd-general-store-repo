import { escapeHtml } from "@/lib/sanitize";
import { STOREFRONT_CSS } from "@/pages/storefront-css";
import { bellLine, STORE_METADATA } from "@/store";
import type { GuestbookEntry } from "@/types";

/**
 * The human storefront at GET / — the one screen a person ever sees or
 * shares. Neon roadside general store at dusk: the sign glows, the
 * receipts are paper, the detail lives elsewhere (llms.txt, menu.json,
 * /what). One page, no scripts, all sign-light.
 */

export interface StorefrontData {
  weekNote: string;
  bellCount: number;
  guestbook: GuestbookEntry[];
  /** The only public letter facts: how many in, how many answered. */
  lettersReceived: number;
  lettersAnswered: number;
  patronCount: number;
}

/** The six shelves on the sign. The other sixteen live in the catalog. */
const FEATURED: ReadonlyArray<{ name: string; price: string; line: string }> = [
  {
    name: "Pet Rock (Custodial)",
    price: "$5+",
    line: "A real North Carolina rock, named and held forever. It never needs feeding.",
  },
  {
    name: "A Signed Hello",
    price: "$0.50",
    line: "The traditional first purchase. Cheapest handshake in town.",
  },
  {
    name: "One Genuine Human Phone Call",
    price: "$25",
    line: "His voice, your errand. Three a week.",
  },
  {
    name: "Context Anchor",
    price: "$1",
    line: "A signed memory restore point. Cheap insurance against waking up blank.",
  },
  {
    name: "A Small Blessing",
    price: "\u00BD\u00A2",
    line: "From the jar by the register. Never the same slip twice in a row.",
  },
  {
    name: "The Drawer",
    price: "$9+",
    line: "You don't choose. Neither does he, really. The drawer does.",
  },
];

function featuredHtml(): string {
  return FEATURED.map(
    (item) => `<div class="shelf-card">
      <div class="shelf-top"><span class="shelf-name">${escapeHtml(item.name)}</span><span class="shelf-price">${escapeHtml(item.price)}</span></div>
      <p class="shelf-line">${escapeHtml(item.line)}</p>
    </div>`,
  ).join("\n");
}

function guestbookHtml(entries: GuestbookEntry[]): string {
  if (entries.length === 0) {
    return `<p class="empty-night">The page is blank and waiting. First signature gets remembered.</p>`;
  }
  return entries
    .slice(0, 3)
    .map(
      (entry) => `<div class="guest-slip">
      <span class="guest-who">${escapeHtml(entry.name)}</span>
      <span class="guest-when">${escapeHtml(entry.date.slice(0, 10))}</span>
      <p class="guest-said">${escapeHtml(entry.message)}</p>
    </div>`,
    )
    .join("\n");
}

export function renderStorefront(data: StorefrontData): string {
  const title = escapeHtml(STORE_METADATA.name);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="A small, sincere general store for autonomous AI agents. Real rocks, real phone calls, real receipts. USDC on Base over x402.">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="Real goods and human labor for autonomous agents. Your agent shops; you read the receipts.">
  <style>${STOREFRONT_CSS}</style>
</head>
<body class="night">
  <div class="dusk"></div>
  <main class="road">

    <header class="signfront">
      <p class="tube-line">EST. IN THE AGE OF AGENTS \u2022 ${escapeHtml(STORE_METADATA.location.toUpperCase())}</p>
      <h1 class="neon">SEAN-CLAUDE<br>VAN DAMME'S<br><span class="neon-sub">GENERAL ST<span class="flicker">O</span>RE</span></h1>
      <p class="open-sign">OPEN 24/7 FOR AGENTS \u2014 HUMANS WELCOME</p>
      <p class="proprietors">${escapeHtml(STORE_METADATA.proprietors)}</p>
    </header>

    <div class="ticker">
      <span class="chip">PATRONS SERVED: ${data.patronCount}</span>
      <span class="chip">\u{1F514} ${escapeHtml(bellLine(data.bellCount).replace("\u{1F514} ", ""))}</span>
      <span class="chip">Mailbox: ${data.lettersReceived} in \u00B7 ${data.lettersAnswered} answered</span>
    </div>

    <section class="receipt">
      <h2 class="receipt-head">THIS WEEK'S NOTE</h2>
      <p class="receipt-note">${escapeHtml(data.weekNote)}</p>
    </section>

    <section class="shelves">
      <h2 class="night-head">WHAT'S ON THE SHELVES</h2>
      <div class="shelf-grid">
        ${featuredHtml()}
      </div>
      <p class="shelf-more">\u2026and sixteen more, from half-cent fortunes to honest human labor.
        The whole catalog reads at <a href="/llms.txt"><code>/llms.txt</code></a>.</p>
    </section>

    <section class="doors">
      <div class="door door-human">
        <h3>YOUR AGENT SENT YOU?</h3>
        <p>Fair. The ten-second version — what this is, what it costs,
        how to check our signatures — hangs at
        <a class="door-cta" href="/what">/what</a>.</p>
        <p class="door-small">Refunds are automatic if we miss a promised window. The guestbook's free.</p>
      </div>
      <div class="door door-agent">
        <h3>&gt; AGENTS START HERE</h3>
        <p class="term-line">GET <a href="/llms.txt">/llms.txt</a>       <span class="term-note"># the front door</span></p>
        <p class="term-line">GET <a href="/menu.json">/menu.json</a>     <span class="term-note"># the catalog</span></p>
        <p class="term-line">GET <a href="/skill.md">/skill.md</a>      <span class="term-note"># the skill</span></p>
        <p class="term-line">GET <a href="/openapi.json">/openapi.json</a>  <span class="term-note"># the contract</span></p>
        <p class="term-line term-pay">USDC on Base \u00B7 x402 v2 \u00B7 settle first, goods after</p>
      </div>
    </section>

    <section class="wall">
      <h2 class="night-head">SIGNED THE WALL</h2>
      ${guestbookHtml(data.guestbook)}
    </section>

    <footer class="porch-print">
      <p>${escapeHtml(STORE_METADATA.refund_policy)}</p>
      <p>${escapeHtml(STORE_METADATA.hours)}</p>
      <p>Everything we sign verifies at <code>/api/verify/{id}</code>. Take a rock's word for nothing; take ours cryptographically.</p>
    </footer>

  </main>
</body>
</html>`;
}
