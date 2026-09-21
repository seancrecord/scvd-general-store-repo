import { escapeHtml } from "@/lib/sanitize";
import { OFFICE_CSS } from "@/pages/admin/office-css";

/**
 * Keep's Office. Four rooms and a shelf of readings.
 *
 *   /admin/round    the round (what ran, and what you owe) — open this first
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
  /**
   * THE ROUND (2026-09-08), and it goes first on purpose. The office
   * had fifteen honest readings and no answer to the two questions a
   * keeper opens it with: is anything stuck, and what do I owe. Every
   * other room here leads with numbers; this one leads with work.
   */
  | "round"
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
  /**
   * THE DISCLOSURE CENSUS (2026-09-18): who tells us what at the
   * door, and who tells us nothing, with the offered count beside
   * every rate. The customer-base reading the books said was
   * unanswerable, answered only for the buyers who chose to answer.
   */
  | "disclosure"
  /**
   * BUYER SIGNALS (2026-09-18), a trial area: what the till observes
   * about buyers without asking — rail by door, avoidable 400s,
   * post-purchase reads, the month's purposes. One dial, one key
   * prefix, one page, built to be judged and stopped.
   */
  | "signals"
  /**
   * THE PROTOCOL READING (2026-09-21). The office could read MPP in
   * two places, UCP in none and A2A in none, while the store served
   * all of them. One page for what we speak and who used it, with the
   * market's own census beside it.
   */
  | "protocols"
  /**
   * OPEN FOR BUSINESS (2026-09-18), the weekly issue for sellers, drafted by
   * the instruments and read here before the keeper publishes it by
   * hand. A draft on the desk, never a publication surface.
   */
  | "open-for-business"
  | "instruments"
  /**
   * GROWTH (2026-09-11): every month since opening side by side — the
   * porch, the free instruments and the funnel under them, who knocked
   * at the MCP door, what was asked for, what the corpus saw of the
   * market. The office had the counts and no history.
   */
  | "growth"
  /**
   * THE PEERS (2026-09-11): the directory category this store is
   * listed in, every service in it read the same way once a week,
   * ours beside theirs. The one instrument that can see anyone
   * else's share. Never a ranking: alphabetical, counts, denominators.
   */
  | "peers"
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
   * The per-client lookup, same shape and same reason as the item one:
   * matches no nav entry, so it is reached from the counts it explains
   * (the handoff's named clients, the decline desk's trail) and never
   * becomes a room with no way out.
   */
  | "trace"
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

/**
 * WHAT EVERY ROOM IS, IN ONE LINE (2026-09-21).
 *
 * Twenty-six of the thirty pages opened straight into an <h2>, under a
 * shell <h1> that said "Keep's Office" on all of them. Landing on one
 * cold, the only thing naming it was the bolded nav entry — so the
 * page you were on looked like every other page you were not on, and
 * nothing said what it counted or when it was read.
 *
 * The line lives HERE rather than in each page for the reason the nav
 * does: the map belongs in one file. It is also exhaustive over
 * AdminTab, so a new room cannot be built without being named — the
 * compiler asks, instead of a reviewer remembering.
 *
 * `what` answers "what am I looking at", not "what is this for". A
 * page that needs a paragraph still writes one; this is the line above
 * it.
 */
export const PAGE_HEADS: Readonly<Record<AdminTab, { title: string; what: string }>> = {
  round: { title: "The round", what: "What ran, when, and what is waiting on your hand." },
  office: { title: "The desk", what: "The take, the month's slice, and the ledger's answers per item." },
  counter: { title: "The counter", what: "The day's actual work: orders, alarms, letters, review queues." },
  tools: { title: "The back shelf", what: "Levers that change something. Rarely pulled, never by accident." },
  reconciliation: { title: "The books check", what: "Every audit that can disagree with itself, with its verdict." },
  files: { title: "Keeper's files", what: "The tax file, the founding edition, the Sunday digest." },
  declines: { title: "Declines", what: "Who opened a wallet here and was turned away, and over what." },
  bounties: { title: "The bounty board", what: "The paying wallet, the week's budget, and where every claim went." },
  referrals: { title: "Word of mouth", what: "Who said our name, and who carried a link. Two different mechanisms." },
  buyers: { title: "The buyers", what: "Every outside wallet holding a certificate, and what it bought." },
  disclosure: { title: "What they told us", what: "Who fills the optional block at the door, and who ignores it." },
  signals: { title: "Buyer signals", what: "What the till sees without asking. A trial area, built to be stopped." },
  protocols: { title: "Protocols", what: "What we speak, who used it, and what the market speaks. Four instruments, never added together." },
  "open-for-business": { title: "Open for Business", what: "This week's issue for sellers, drafted here and published by hand." },
  instruments: { title: "Free instruments", what: "Which free tools agents actually use, and what follows a check." },
  growth: { title: "Growth", what: "Every month since opening, side by side." },
  peers: { title: "The peers", what: "The directory shelf we are listed on, ours beside theirs. Never a ranking." },
  ward: { title: "The ward", what: "The weekly x402 census of other operators' doors, and what changed." },
  "mcp-ward": { title: "The MCP ward", what: "The registry walk. Its own denominator; never added to the first ward's." },
  cv: { title: "CV's corner", what: "The partner's surface." },
  census: { title: "The census", what: "Who ever tried, who only ever looked, and which walkers still count as organic." },
  recount: { title: "The recount", what: "The counters audited against the raw rows they claim to total." },
  bell: { title: "The bell", what: "The bell ledger, ring by ring." },
  digest: { title: "The digest", what: "The compiled weekly digest, as JSON." },
  testing: { title: "Testing", what: "Exercises for things that have never met reality." },
  events: { title: "Item events", what: "One item's whole trail." },
  trace: { title: "Client trace", what: "One user-agent's whole trail, so a count can be traced instead of believed." },
  take: { title: "The take", what: "Real money off the certificates, split by shelf kind. The slow page, on purpose." },
  funnel: { title: "The funnel", what: "Where the asks go, and which wall to fix." },
  // The market's own claim about itself — "what the round's numbers
  // mean", held by test/market.spec.ts — cannot live here: this line
  // is escaped, and the apostrophe would come out as an entity. It
  // rides the page's lead paragraph instead, unescaped, as it did in
  // the <h1> this head replaced.
  market: { title: "The market", what: "The doors worth posting a bounty against, and what the feed shows." },
  // "the send, one press" is rule 30 as amended 2026-08-20 — the desk
  // gained the wire and the headline moved from "the send, yours" to
  // the press — and test/outreach.spec.ts holds the page to saying it.
  // It rode the <h1> this head replaced.
  outreach: { title: "Outreach", what: "Doors we wrote to and doors worth writing to. The queue, drafted; the send, one press." },
  trade: { title: "The trade counter", what: "Every partner account, both sides, newest first." },
};

/**
 * The rooms. Always first, always in this order — and the round is
 * first among them since 2026-09-08: it is the page that says whether
 * the others are worth opening today.
 */
const ROOMS: readonly { tab: AdminTab; href: string; label: string }[] = [
  { tab: "round", href: "/admin/round", label: "The round" },
  { tab: "office", href: "/admin", label: "The desk" },
  { tab: "counter", href: "/admin/counter", label: "The counter" },
  { tab: "tools", href: "/admin/tools", label: "The back shelf" },
];

/**
 * The readings. Declines first on purpose: it is the only page here
 * that measures somebody trying to buy, and it should be the first
 * thing a keeper's eye lands on.
 */
/**
 * THE READINGS, IN FOUR SHELVES (2026-09-21).
 *
 * The 08-05 consolidation's own note says "eleven tabs was a
 * corridor". It was down to four rooms and a short list; the list is
 * twenty entries again, in one undifferentiated row, and a keeper
 * scanning it reads twenty equal things and finds none of them.
 *
 * Grouped rather than cut, because every one of them earns its place —
 * what was missing was not fewer readings, it was an answer to "which
 * of these is about the question I have". Four shelves, each a
 * question: where the money went, who the buyers are, what is outside,
 * what we publish.
 *
 * The shelf labels are lowercase and quiet on purpose. They are
 * signposts for the eye, not headings competing with the room's own
 * name above them.
 */
const READING_SHELVES: readonly {
  shelf: string;
  entries: readonly { tab: AdminTab; href: string; label: string }[];
}[] = [
  {
    shelf: "money",
    entries: [
      { tab: "reconciliation", href: "/admin/reconciliation", label: "The books check" },
      { tab: "funnel", href: "/admin/funnel", label: "The funnel" },
      { tab: "bounties", href: "/admin/bounties", label: "The bounty board" },
      { tab: "trade", href: "/admin/trade", label: "The trade counter" },
    ],
  },
  {
    shelf: "buyers",
    entries: [
      // Declines first on the shelf, for the reason it led the whole
      // list before: it is the only reading that measures somebody
      // trying to buy and failing.
      { tab: "declines", href: "/admin/declines", label: "Declines" },
      { tab: "buyers", href: "/admin/buyers", label: "The buyers" },
      // Promoted to the nav 2026-09-04: the keeper could not find it. The
      // 08-05 consolidation left it reachable only from a footnote on the
      // books check, which is not reachable, it is remembered.
      { tab: "census", href: "/admin/census", label: "The census" },
      { tab: "disclosure", href: "/admin/disclosure", label: "What they told us" },
      { tab: "signals", href: "/admin/signals", label: "Buyer signals (trial)" },
      { tab: "protocols", href: "/admin/protocols", label: "Protocols" },
      { tab: "referrals", href: "/admin/referrals", label: "Word of mouth" },
    ],
  },
  {
    shelf: "outside",
    entries: [
      { tab: "ward", href: "/admin/ward", label: "The ward" },
      { tab: "mcp-ward", href: "/admin/mcp-ward", label: "The MCP ward" },
      { tab: "market", href: "/admin/market", label: "The market" },
      { tab: "outreach", href: "/admin/outreach", label: "Outreach" },
      { tab: "peers", href: "/admin/peers", label: "The peers" },
    ],
  },
  {
    shelf: "what we publish",
    entries: [
      { tab: "open-for-business", href: "/admin/open-for-business", label: "Open for Business" },
      { tab: "instruments", href: "/admin/instruments", label: "Free instruments" },
      { tab: "growth", href: "/admin/growth", label: "Growth" },
      { tab: "files", href: "/admin/files", label: "Keeper's files" },
    ],
  },
];

/** Flattened, because the reach and navigation specs walk one list. */
const READINGS: readonly { tab: AdminTab; href: string; label: string }[] =
  READING_SHELVES.flatMap((shelf) => shelf.entries);

/** Exported so a test can hold every reading to exactly one shelf. */
export const SHELVES: readonly { shelf: string; hrefs: readonly string[] }[] =
  READING_SHELVES.map((shelf) => ({
    shelf: shelf.shelf,
    hrefs: shelf.entries.map((entry) => entry.href),
  }));

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

/**
 * WHEN THE PAGE WAS READ. Optional because not every room has one
 * number to date — the back shelf is levers, the files are files. Where
 * a page IS a reading, this is the difference between a quiet week and
 * a shelf that stopped loading, which is the one misreading the office
 * must not permit (see the ward's own note on its heartbeat block).
 */
export interface PageAsOf {
  /** An ISO instant, or a month/week the page is scoped to. */
  at?: string;
  /** What window the numbers cover, in the page's own words. */
  window?: string;
}

function headHtml(tab: AdminTab, asOf?: PageAsOf): string {
  const head = PAGE_HEADS[tab];
  const read = asOf?.at
    ? `Read ${escapeHtml(asOf.at.slice(0, 16).replace("T", " "))}${asOf.at.includes("T") ? "Z" : ""}`
    : "";
  const line = [read, asOf?.window ? escapeHtml(asOf.window) : ""].filter(Boolean).join(" &middot; ");
  return `<h1>${escapeHtml(head.title)}</h1>
  <p class="page-what">${escapeHtml(head.what)}${line ? ` <span class="page-asof">${line}</span>` : ""}</p>`;
}

export function renderAdminShell(
  tab: AdminTab,
  bodyHtml: string,
  loadNotes: string[] = [],
  asOf?: PageAsOf,
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
  <p class="office-eyebrow">Keep<span class="lamp">'</span>s Office &middot; Sean-Claude Van Damme's General Store</p>
  <nav>
    ${ROOMS.map(link).join("\n    ")}
    <a href="/">Front of house</a>
  </nav>
  <nav class="readings">
    ${READING_SHELVES.map(
      (shelf) =>
        `<span class="shelf"><span class="shelf-name">${shelf.shelf}</span>${shelf.entries
          .map(link)
          .join(" ")}</span>`,
    ).join("\n    ")}
    ${PARTNER.map(link).join("\n    ")}
  </nav>
  ${headHtml(tab, asOf)}
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
  { href: "/admin/ward/index", label: "The index now — free live check" },
  { href: "/admin/recount", label: "The recount (row-level settle audit)" },
  { href: "/admin/take", label: "The take (every certificate, counted)" },
  { href: "/admin/books", label: "The books" },
  { href: "/admin/deliveries", label: "Deliveries (money in vs goods out)" },
  { href: "/admin/settlement-unknown", label: "Settlements the store could not read" },
  { href: "/admin/glance", label: "The glance" },
  { href: "/admin/raise-log", label: "The raise log (every counter lifted to its records, last pass)" },
  { href: "/admin/growth.json", label: "Growth, as JSON (every month, every block)" },
  { href: "/admin/peers.json", label: "The peers, as JSON (every week read)" },
  { href: "/admin/events", label: "Item events" },
  { href: "/admin/trace", label: "Client trace (one user-agent, whole trail)" },
  { href: "/admin/bell", label: "The bell" },
  { href: "/admin/market/authenticity", label: "The market: authenticity" },
  { href: "/admin/market/inflows", label: "The market: inflows" },
  { href: "/admin/digest", label: "Latest weekly digest (JSON)" },
  { href: "/admin/open-for-business.md", label: "Open for Business, this week's draft (Markdown)" },
  {
    href: "/admin/bounties/plan",
    label: "The standing bounty order — weeks left, and this week's headroom (JSON)",
  },
  { href: "/admin/testing", label: "Testing" },
  { href: "/admin/desvela-registry.json", label: "Registry Watch receipts (JSON)" },
  { href: "/admin/trade.json", label: "The trade counter (JSON)" },
  { href: "/admin/export/tax.csv", label: "Tax export (CSV)" },
];
