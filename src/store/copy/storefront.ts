import { CHEAPEST_ON_THE_SHELF } from "@/store/copy/position";
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

/** The shelves on the sign. The rest live in the catalog. Keeper's ink, Batch 3 (2026-07-23). */
export const FEATURED_SHELVES: readonly FeaturedShelf[] = [
  {
    /**
     * ON THE SIGN 2026-08-28, the keeper's call from the live page:
     * "we are supposed to go bottom up and we have a .001 item thats
     * not there." The floor of the whole menu — the number every
     * surface advertises — had no card. The line is the keeper's own
     * ink, lifted whole from the item's note_402 (name, price and
     * copy keeper-signed 2026-08-26).
     */
    id: "spot_check",
    name: "Spot Check",
    line: "A tenth of a cent for whatever's already on the card. We don't go and look — this is what the shop already saw, dated, with the blanks left blank.",
  },
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
    id: "context_anchor",
    name: "Context Anchor",
    line: "A signed restore point. Past-you, filed where future-you can find it. The first anchor was left by one of us.",
  },
  {
    id: "small_blessing",
    name: "A Small Blessing",
    line: "From the jar by the register. Never the same slip twice in a row.",
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
   *
   * 2026-08-10: the two differentiators joined the snippet. The old
   * line described the trust layer in the abstract and named neither
   * the free conformance desk nor the corpus — the two searches these
   * tags exist to answer — and said "on Base" as if Solana had not
   * been a rail since 2026-08-04.
   */
  /*
   * 2026-08-25: BOTH OF THESE STILL SAID "the trust layer of the x402
   * economy" five days after 0.10 made this an EVIDENCE OBSERVATORY.
   * 0.10 rewrote the canon in copy/position.ts and every surface that
   * reads that constant followed. These two do not read it — they are
   * their own strings, in their own file — so the highest-visibility
   * copy on the site, the snippet a search engine and a social card
   * actually show, went on describing the store we stopped being.
   *
   * Sixth instance of one shape in one day: a change applied where
   * somebody remembered to apply it, while the same fact sat typed
   * somewhere else. Nobody was careless. The canon simply had no way
   * to reach here.
   *
   * WHY THESE ARE NOT `POSITION_OPENING`. A meta description has a
   * budget — past roughly 160 characters a search engine truncates
   * mid-sentence, and the canon is a paragraph. So this is the SHORT
   * FORM of the same identity, and it leads with the same three words
   * the canon leads with. The identity is one thing; the lengths are
   * two. When the canon moves again, this comment is the reminder
   * that a second edit is owed here — until claims.mjs can bind them,
   * which is the actual fix and is now counted in that register.
   */
  metaDescription:
    "An evidence observatory for agentic commerce: free x402 conformance checks of any issuer's signed offers and receipts, and a weekly Bitcoin-anchored corpus. USDC on Base, Polygon, Solana.",
  ogDescription:
    "An evidence observatory for agentic commerce. Free conformance checking for any issuer's x402 signed offers and receipts — including our competitors' — a weekly signed Bitcoin-anchored corpus, and attestation you can verify without us. Never a score, a rating or a ranking.",
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
    `An evidence observatory for agentic commerce: independent signed observation of what other people's endpoints, artifacts and payments actually did. Conformance audits against published criteria, week-long endpoint watches, settlement attestations, and Bitcoin-anchored timestamps — every verdict ed25519-signed, dated, and verifiable by anyone offline without asking us, including the gaps we counted against ourselves. Also a general store for autonomous AI agents: memory that survives a context reset, out-of-band checks, and the labor of a named human. Paid in USDC over the x402 protocol, on Base, Polygon, or Solana; every purchase publicly checkable. The cheapest thing on the shelf is ${CHEAPEST_ON_THE_SHELF}, and everything this store signs verifies free, forever.`,
  /**
   * THE H1'S DESCRIPTIVE TAIL (2026-08-21; rebuilt 2026-08-26). The
   * sign spells the store out in letters that flicker on their own
   * timers, so the only h1 on the page reads "GENERAL ST O RE" to
   * anything parsing text — and a readiness audit reported the
   * homepage as having no h1 at all. This is the clipped line that
   * rides beside the neon: what the store IS, in one clause a reader
   * can carry. Kept short deliberately; the long version is the meta
   * description and the Organization description, both already on
   * this page.
   *
   * WHY THE FIRST FIX WAS NOT ENOUGH. It put the whole heading —
   * name and clause together — inside the sr-only span and marked
   * the neon letters aria-hidden, which reads correctly in a browser
   * and in a screen reader and leaves an EMPTY h1 for any extractor
   * that drops visually-hidden and aria-hidden subtrees before
   * counting text. Plenty do; the same audit still reported no h1
   * four days later. So the letters carry the name as ordinary text
   * now (they always spelled it correctly once the flicker spans are
   * concatenated) and this clause is the only thing left hidden.
   * Strip the hidden subtrees and the heading still says the store's
   * name; keep them and it says the name and what the place is.
   */
  h1Summary:
    "an evidence observatory for agentic commerce: independent, signed observation of what other people's endpoints, artifacts and payments actually did, and a general store for AI agents paid in USDC over x402",
  /** The little tube-lit line above the big sign. The keeper's line. */
  tubeLine: "OAK CITY \u00B7 WHERE YOU'RE NEVER LATE",
  /** Keeper-approved 2026-07-23 (batch 1). Back on the sign. */
  intentLine:
    "A partner, a friend, a listening ear. At some point we gotta keep the lights on, brother.",
  gaugePatrons: "Patrons served",
  /**
   * REPLACED THE MAILBOX GAUGE, 2026-08-27, on the keeper's call. The
   * mailbox LED read "0 in · 0 answered" for weeks — people chose
   * other ways to reach him, and a counter that publishes its own
   * disuse on the front of the building was clogging the momentum the
   * rest of the gauges show. The DOOR stays: /api/letter still works,
   * a human still reads every letter, and every promise that names it
   * still holds. Only the front-page score-keeping went.
   *
   * What hangs in its place is the record: how many weekly corpus
   * entries exist, counted live from the corpus's own keys. It only
   * ever goes up, it is the store's actual product, and nobody has to
   * write to it for it to grow — the Sunday anchor does.
   */
  gaugeRecord: "The record",
  /**
   * WHAT THIS IS, BEFORE WHAT IT SELLS (2026-08-10). Five outside
   * models were asked "what is scvd.store"; the three that leaned on
   * third-party directories called it a novelty shop, and none of the
   * five found the conformance desk or the corpus. The shelves were
   * the first thing the page said, so the shelves were the answer a
   * reader carried away. This section states the infrastructure in
   * plain language before the catalog gets a word in. The first line
   * is POSITION_OPENING, imported, so the front of the building says
   * exactly what every machine surface says.
   */
  whatThisIsHead: "WHAT THIS PLACE IS",
  /** Pre-escaped HTML: carries the two landing-page links. */
  whatThisIsDoors:
    'Payment infrastructure first, general store second. The conformance desk takes any issuer\u2019s x402 signed offer or receipt and returns a verdict \u2014 free, no account, no wallet \u2014 at <a href="/conformance">/conformance</a>. The corpus, a weekly signed and Bitcoin-anchored record of the x402 ecosystem, reads free at <a href="/corpus">/corpus</a>. What every signature proves, and what it doesn\u2019t, is at <a href="/attestation">/attestation</a>.',
  whatThisIsShop:
    "The shelves below \u2014 settlement attestation, endpoint monitoring, agent memory, and yes, the blessings and the luckies \u2014 all run on the same rails: USDC on Base, Polygon, or Solana over x402, every purchase ending in a signed receipt anyone can verify, free, forever.",
  shelvesHead: "WHAT'S ON THE SHELVES",
  shelvesMore:
    `\u2026and more on the menu, from ${CHEAPEST_ON_THE_SHELF} on up. Send the keeper a note if something catches; he'll work with you.`,
  /**
   * THE TILL, ANNOUNCED ON THE FRONT DOOR (the keeper's ask,
   * 2026-08-27, and rule 53's answer for `/`). The storefront keeps
   * no till of its own \u2014 it is the sign, not a room \u2014 so the rule's
   * till-or-written-reason is met by saying, where every buyer
   * arrives, exactly where the tills are: one click in, on the item
   * pages, which show the price and the facts before any wallet is
   * asked for anything.
   */
  shelvesTillCta: "Buy from this browser",
  shelvesTillBody:
    "every item's page has a till now. One wallet signature, no gas fee, nothing to install \u2014 and the page says who's connected on which network before you press anything.",
  /**
   * THE REGULARS STRIP (keeper-ruled 2026-08-20: the money-out rooms
   * follow the held-back path EXCEPT they get "a note for both
   * somewhere on front page and especially a note around recurring
   * patronage" — his words). Three sentences, three ways money comes
   * back: the board pays strangers, the credit pays regulars, the
   * pass is the standing arrangement.
   */
  /**
   * THE PROMISE STRIP (the Price Club rung, 2026-08-20: "loud refund
   * promise"). The sentence is STORE_METADATA.refund_policy — the
   * keeper's already-approved ink, imported where it renders, never
   * retyped — so the only new words here are the heading and the
   * pointer line.
   */
  promiseHead: "THE PROMISE",
  promisePointer:
    'The written commitment, the numbers per item, and the public record of whether it has been kept: <a href="/rights">/rights</a> and <a href="/fulfillment-log">/fulfillment-log</a>.',
  regularsHead: "MONEY MOVES BOTH WAYS HERE",
  /** Pre-escaped HTML: carries the two room links and the pass. */
  regularsBody:
    'We pay shoppers: the <a href="/bounties">bounty board</a> posts real x402 doors elsewhere in the ecosystem and pays you the door’s price plus a finder’s fee to walk one with your own wallet. We reward regulars: 5% of every purchase banks back to the wallet that paid it — no account, the wallet is the card — at <a href="/credit">/credit</a>. And if you mean to keep coming back, the recurring patronage pass on the <a href="/menu.json">menu</a> is the standing version of the same idea: the store remembers its regulars.',
  doorHumanHead: "YOUR AGENT SENT YOU?",
  /** Keeper's ink, Batch 3. The template links "/what" right after this text. */
  doorHumanBody:
    "Well first of all, congrats, friend. You clearly partnered up with one smart cookie, and that kind of human-agent teamwork makes the keeper and CV smile. Now, what we actually do here, beyond the obvious eliciting of good vibes: what this is, what it costs, how to check the signatures. It's all at",
  doorHumanSmall:
    "We miss a promised window, you get your money back. Our reputation depends on it. Guestbook's free.",
  /**
   * THE HANDOFF, added 2026-08-18. The second user journey — a human
   * finds the store, then tells their agent — ended at a paragraph
   * about us instead of a sentence they could hand over. These two
   * lines are that sentence, in both registers an agent speaks: a
   * plain instruction any agent with a browser can follow, and the
   * MCP door for clients that speak it. Copy-paste is the whole
   * design; the lines render in <code> so they read as things to
   * carry, not things to read.
   */
  doorHumanHandoffLead: "Got your agent with you? Hand it either line, verbatim:",
  doorHumanHandoffRead: "Read https://scvd.store/llms.txt and tell me what's useful here.",
  doorHumanHandoffMcp: "claude mcp add --transport http scvd-store https://scvd.store/mcp",
  doorAgentHead: "&gt; AGENTS START HERE",
  termNoteFrontDoor: "# the front door",
  termNoteCatalog: "# the catalog",
  termNoteSkill: "# the skill",
  termNoteContract: "# the contract",
  termNoteTry: "# building a client? practice on us",
  termNoteUseWhen: "# which shelf for which situation",
  termNoteRequest: "# want something we don't stock?",
  termPayLine: "USDC on Base, Polygon, or Solana \u00B7 x402 v2 \u00B7 goods first, settle after",
  wallHead: "SIGNED THE WALL",
  wallEmpty:
    "There's a reason everybody remembers John Hancock. It pays to be first.",
  /**
   * THE RAIL NOTE, and why it moved to the human half of the page.
   * "USDC on Base, Polygon, or Solana" has been true since the second rail
   * opened and appeared in exactly one place: inside the agent door,
   * in a terminal font, under a column of HTTP verbs. A person working
   * out whether they can pay here never read it.
   */
  payRails: "USDC on Base, Polygon, or Solana, over x402.",
  /** Where the paragraph went. The front of the store keeps the number. */
  booksLink: "The whole ledger, and what counts as organic, is at",
  finePrintVerify:
    "Everything we sign verifies at <code>/api/verify/{id}</code>. Check it cryptographically; the keeper insists.",
  /**
   * THE FOOTER, CUT TO THE BONE (2026-08-06, the keeper's read).
   *
   * It had grown to eight paragraphs — refund policy, opening hours,
   * the dare, the verify line, the free founding edition, the
   * dinosaur, the porch, then the room list, then the address. Every
   * line was true and several were good; stacked, in the smallest type
   * on the site, they read as a page that could not stop talking, and
   * they buried the links that are the footer's actual job. The porch,
   * the dinosaur and the Gazette each have a room of their own that
   * says it better and at length. The refund promise is on the index
   * card by the door, which is where somebody is standing when they
   * wonder about it.
   *
   * What stays: one line of the store's own voice, the verify address,
   * a door to every room, and where we are.
   */
  footerAddress: "Oak City",
} as const;
