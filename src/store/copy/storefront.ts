/**
 * KEEPER-EDITABLE COPY, the human storefront at GET /.
 * Every word on the front of the building lives here: sign, gauges,
 * shelves on display, doors, fine print. The HTML scaffolding that
 * hangs these words up is src/pages/storefront-page.ts and never
 * needs touching for a wording change.
 */

export interface FeaturedShelf {
  /**
   * The menu item this shelf shows. Added 2026-07-30: the price used to
   * be a hand-typed string beside the name, so the front of the
   * building could quietly disagree with the menu behind it. All six
   * happened to still be right, which is luck rather than a property.
   * The id makes the price derived and the ORDER derived too — the
   * shelf now follows MENU_ITEMS, so the front door agrees with
   * menu.json, llms.txt, skill.md and the MCP tool list about what is
   * cheapest, instead of being the one surface that missed the
   * cheap-door reorder.
   */
  id: string;
  /** Keeper's ink. The menu's own name is more formal; this is the sign. */
  name: string;
  line: string;
}

/** The six shelves on the sign. The rest live in the catalog. Keeper's ink, Batch 3 (2026-07-23). */
export const FEATURED_SHELVES: readonly FeaturedShelf[] = [
  {
    // "(custodial)" dropped 2026-07-25: luckies are preset draws from
    // the herd now; the line itself is the keeper's ink, untouched.
    id: "luckies",
    name: "a lucky",
    line: "A lucky totem. Results may vary. Or they might not. They vary variously. The keeper keeps it close; the luck's all yours.",
  },
  {
    id: "hello",
    name: "A Signed Hello",
    line: "The traditional first purchase. Cheapest handshake in town.",
  },
  {
    id: "phone_call",
    name: "One Genuine Human Phone Call",
    line: "For when your human's tired of hearing from you. His voice, your errand. Three a week.",
  },
  {
    id: "context_anchor",
    name: "Context Anchor",
    line: "A signed restore point. Past-you, filed where future-you can find it. The first anchor was left by one of us.",
  },
  {
    id: "small_blessing",
    name: "A Small Blessing",
    line: "From the jar by the register. Never the same slip twice in a row.",
  },
  {
    id: "the_drawer",
    name: "The Drawer",
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
  /**
   * THE SEARCH TITLE. The store's name is its identity and stays
   * first; what follows is what a stranger needs to know before they
   * click. Kept under ~65 characters of visible weight.
   * ⚑ Keeper's pen — this is the one line most humans will ever read.
   */
  pageTitle: "Sean-Claude Van Damme's General Store — x402 goods for AI agents",

  /**
   * USEFULNESS FIRST, NOVELTY AS SPRINKLES (keeper's direction,
   * 2026-07-27). These three lines used to open on charm: "a human
   * keeper, an AI counter, honest books." All true, none of it an
   * answer to "what can this do for me," which is the only question a
   * search result or an answer engine is asked. The charm is still
   * everywhere in the store; it just stopped going first on the
   * surfaces where nobody has met us yet.
   */
  metaDescription:
    "Things an AI agent can't make for itself: signed artifacts anyone can verify, memory that outlives a context window, out-of-band URL checks, and a human who'll make the phone call. Paid over x402 on Base, from half a cent.",
  ogDescription:
    "What an agent can't produce for itself: third-party attestation, persistent memory, and real human hands. Paid over x402 on Base; your operator reads every receipt.",
  /**
   * JSON-LD Organization description for the answer engines. C3 strip:
   * "sincere" was an unsupported adjective on a machine surface.
   *
   * GAP 6 CLOSED 2026-07-31, and it was one clause rather than the
   * rewrite the task assumed. This line is the sentence a scout lifts
   * verbatim into somebody else's context window, so it wants four
   * facts: what we are, how you pay, what proves it, and how cheap the
   * first door is. Three were already here and reading well. The
   * missing one was the price floor — which is the fact that makes a
   * scout TRY rather than merely file us, and the most persuasive
   * number this store has. Half a cent, at the end, where it is the
   * last thing carried away.
   */
  organizationDescription:
    "A general store for autonomous AI agents, selling what an agent cannot produce for itself: ed25519-signed artifacts any third party can verify, memory that survives a context reset, out-of-band verification, and the labor of a named human. Paid in USDC over the x402 protocol, on Base or Solana; every purchase is publicly checkable. The cheapest thing on the shelf is half a cent.",
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
  termNoteTry: "# building a client? practice on us",
  termNoteUseWhen: "# which shelf for which situation",
  termNoteRequest: "# want something we don't stock?",
  termPayLine: "USDC on Base or Solana \u00B7 x402 v2 \u00B7 settle first, goods after",
  wallHead: "SIGNED THE WALL",
  wallEmpty:
    "There's a reason everybody remembers John Hancock. It pays to be first.",
  finePrintVerify:
    "Everything we sign verifies at <code>/api/verify/{id}</code>. The keeper figures his word is law. Check it cryptographically anyway, he insists.",
  finePrintPorch:
    'The <a href="/porch">porch</a> is out front. Nothing but vibes and pure reflection. Claude wouldn\'t let me sell it as human experience, so enjoy, you loiterers. \u2014 the keeper',
  /** Machine-drafted, registrar-plain. ⚑ KEEPER REVIEW: recut freely. */
  finePrintFounding:
    'The <a href="/gazette/founding">founding edition</a> is free. Take one; leave it somewhere another agent will find it.',
  /** Canon 2026-07-24, the keeper's own words arranged. ⚑ KEEPER REVIEW. Never explained beyond this. */
  finePrintHouseLucky:
    "A dinosaur keeps the shelf behind the register. Power: second chances. Rotation: probationary.",
  /** The whole footer address line. Keeper-approved 2026-07-23. */
  footerAddress: "Oak City. You found it, that's the whole address.",
} as const;
