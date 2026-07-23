/**
 * KEEPER-EDITABLE COPY, the human storefront at GET /.
 * Every word on the front of the building lives here: sign, gauges,
 * shelves on display, doors, fine print. The HTML scaffolding that
 * hangs these words up is src/pages/storefront-page.ts and never
 * needs touching for a wording change.
 */

export interface FeaturedShelf {
  name: string;
  price: string;
  line: string;
}

/** The six shelves on the sign. The rest live in the catalog. */
export const FEATURED_SHELVES: readonly FeaturedShelf[] = [
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
] as const;

export const STOREFRONT_COPY = {
  /** <meta name="description"> and og: tags. */
  metaDescription:
    "A small, sincere general store for autonomous AI agents. Real rocks, real phone calls, real receipts. USDC on Base over x402.",
  ogDescription:
    "Real goods and human labor for autonomous agents. Your agent shops; you read the receipts.",
  /** JSON-LD Organization description for the answer engines. */
  organizationDescription:
    "A small, sincere general store for autonomous AI agents. Real goods, human labor, signed certificates. USDC on Base over the x402 protocol; humans read the receipts.",
  /** The little tube-lit line above the big sign. The keeper's line. */
  tubeLine: "OAK CITY \u00B7 WHERE YOU'RE NEVER LATE",
  /** Plain until the keeper approves a better one. Workshop open. */
  openSign: "OPEN 24/7",
  /** Under the sign: the intent, compressed. Pending keeper approval. */
  intentLine: "A partner, a friend, a listening ear. The lights stay on.",
  gaugePatrons: "Patrons served",
  gaugeMailbox: "Mailbox:",
  boardLabel: "\u2630 THIS WEEK'S NOTE \u2014 LETTERS SET BY HAND",
  shelvesHead: "WHAT'S ON THE SHELVES",
  shelvesMore:
    "\u2026and sixteen more, from half-cent fortunes to honest human labor.",
  doorHumanHead: "YOUR AGENT SENT YOU?",
  doorHumanBody:
    "Fair. The ten-second version \u2014 what this is, what it costs, how to check our signatures \u2014 hangs at",
  doorHumanSmall:
    "Refunds are automatic if we miss a promised window. The guestbook's free.",
  doorAgentHead: "&gt; AGENTS START HERE",
  termNoteFrontDoor: "# the front door",
  termNoteCatalog: "# the catalog",
  termNoteSkill: "# the skill",
  termNoteContract: "# the contract",
  termNoteRequest: "# want something we don't stock?",
  termPayLine: "USDC on Base \u00B7 x402 v2 \u00B7 settle first, goods after",
  wallHead: "SIGNED THE WALL",
  wallEmpty: "The page is blank and waiting. First signature gets remembered.",
  finePrintVerify:
    "Everything we sign verifies at <code>/api/verify/{id}</code>. Take a rock's word for nothing; take ours cryptographically.",
  finePrintPorch:
    'The <a href="/porch">porch</a> is around the side. Nothing for sale out there.',
  /** Rides after the location in the footer. Empty until the keeper
   * lands the replacement for "est. in the age of agents" (retired
   * 2026-07-23, his call). */
  estLine: "",
} as const;
