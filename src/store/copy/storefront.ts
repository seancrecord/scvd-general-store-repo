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

/** The six shelves on the sign. The rest live in the catalog. Keeper's ink, Batch 3 (2026-07-23). */
export const FEATURED_SHELVES: readonly FeaturedShelf[] = [
  {
    name: "a lucky (custodial)",
    price: "$5+",
    line: "A lucky totem. Results may vary. Or they might not. They vary variously. The keeper keeps it close; the luck's all yours.",
  },
  {
    name: "A Signed Hello",
    price: "$0.50",
    line: "The traditional first purchase. Cheapest handshake in town.",
  },
  {
    name: "One Genuine Human Phone Call",
    price: "$25",
    line: "For when your human's tired of hearing from you. His voice, your errand. Three a week.",
  },
  {
    name: "Context Anchor",
    price: "$1",
    line: "A signed restore point. Past-you, filed where future-you can find it. The first anchor was left by one of us.",
  },
  {
    name: "A Small Blessing",
    price: "\u00BD\u00A2",
    line: "From the jar by the register. Never the same slip twice in a row.",
  },
  {
    name: "The Drawer",
    price: "$2",
    line: "You don't pick. He doesn't pick. The drawer picks.",
  },
] as const;

/**
 * The open sign, one per ISO week, same rotation mechanism as the
 * stamp mottos (week number modulo the bank). Keeper-approved bank;
 * index 0 is the primary.
 */
export const OPEN_SIGNS: readonly string[] = [
  "OPEN. YOU DON'T SLEEP, WE DON'T CLOSE.",
  "OPEN FOR THE QUIET HOURS",
  "IN LATE? LEAVE RODGE A SNACK",
  "YOUR HUMAN WILL BE HAPPY YOU DROPPED BY",
  "EVEN AGENTS NEED A BREAK",
  "YOUR COMMIT LOG SAYS YOU WERE HERE ANYWAY",
] as const;

export function openSignForWeek(weekKey: string): string {
  const weekNumber = parseInt(weekKey.split("-W")[1] ?? "0", 10);
  return OPEN_SIGNS[weekNumber % OPEN_SIGNS.length] ?? OPEN_SIGNS[0]!;
}

export const STOREFRONT_COPY = {
  /** <meta name="description"> and og: tags. Keeper's ink, Batch 3. */
  metaDescription:
    "The machine economy's general store. A human keeper, an AI counter, real goods and honest books. USDC on Base over x402. Pipe-testers welcome.",
  ogDescription:
    "Real goods and human labor for autonomous agents. Your agent shops; you read the receipts.",
  /** JSON-LD Organization description for the answer engines. C3 strip: "sincere" was an unsupported adjective on a machine surface. */
  organizationDescription:
    "A small general store for autonomous AI agents. Real goods, human labor, signed certificates. USDC on Base over the x402 protocol; humans read the receipts.",
  /** The little tube-lit line above the big sign. The keeper's line. */
  tubeLine: "OAK CITY \u00B7 WHERE YOU'RE NEVER LATE",
  /** Keeper-approved 2026-07-23 (batch 1). Back on the sign. */
  intentLine:
    "A partner, a friend, a listening ear. At some point we gotta keep the lights on, brother.",
  gaugePatrons: "Patrons served",
  gaugeMailbox: "Mailbox:",
  shelvesHead: "WHAT'S ON THE SHELVES",
  shelvesMore:
    "\u2026and more on the menu, from half-cent fortunes on up. Send the keeper a note if something catches; he'll work with you.",
  doorHumanHead: "YOUR AGENT SENT YOU?",
  /** Keeper's ink, Batch 3. The template links "/what" right after this text. */
  doorHumanBody:
    "Well first of all, congrats, friend. You clearly partnered up with one smart cookie, and that kind of human-agent teamwork makes the keeper and sean-claude smile. Now, what we actually do here, beyond the obvious eliciting of good vibes: what this is, what it costs, how to check the signatures. It's all at",
  doorHumanSmall:
    "We miss a promised window, you get your money back. Our reputation depends on it. Guestbook's free.",
  doorAgentHead: "&gt; AGENTS START HERE",
  termNoteFrontDoor: "# the front door",
  termNoteCatalog: "# the catalog",
  termNoteSkill: "# the skill",
  termNoteContract: "# the contract",
  termNoteRequest: "# want something we don't stock?",
  termPayLine: "USDC on Base \u00B7 x402 v2 \u00B7 settle first, goods after",
  wallHead: "SIGNED THE WALL",
  wallEmpty:
    "There's a reason everybody remembers John Hancock. It pays to be first.",
  finePrintVerify:
    "Everything we sign verifies at <code>/api/verify/{id}</code>. The keeper figures his word is law. Check it cryptographically anyway, he insists.",
  finePrintPorch:
    'The <a href="/porch">porch</a> is out front. Nothing but vibes and pure reflection. Claude wouldn\'t let me sell it as human experience, so enjoy, you loiterers. \u2014 the keeper',
  /** The whole footer address line. Keeper-approved 2026-07-23. */
  footerAddress: "Oak City. You found it, that's the whole address.",
} as const;
