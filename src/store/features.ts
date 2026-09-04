import { ROOMS } from "@/store/rooms";
import {
  SCORERS_FOR_MONEY,
  SCORERS_FREE_FIRST,
  SCORERS_OPENED,
  SCORERS_PROPOSITION,
} from "@/store/copy/scorers";
import {
  OPERATORS_FOR_MONEY,
  OPERATORS_FREE_FIRST,
  OPERATORS_OPENED,
  OPERATORS_PROPOSITION,
} from "@/store/copy/operators";
import {
  TRADE_COUNTER_NAME,
  TRADE_COUNTER_OPENED,
  TRADE_FOR_MONEY,
  TRADE_PROPOSITION,
} from "@/store/trade-counter";

/**
 * THE FEATURE REGISTER — house rule 60's mechanism (2026-09-03).
 *
 * THE KEEPER'S WORDS, VERBATIM, the same evening the trade counter
 * opened: "we need a check in place for any new feature to have
 * proper aeo/seo, json ld, schemas and to be reflected across each
 * page it needs to be", and "every piece of marketable/forward
 * facing/human facing/agent readable code needs to be consumable and
 * needs to have our value proposition consistent and clear of what
 * they can do with it/get with their money and they need to be able
 * to find it."
 *
 * WHY A REGISTER RATHER THAN A CHECKLIST. The trade counter shipped
 * on every surface a guard reads and on none of the pages a human
 * integrator opens first (/developers, /pricing, /operators), because
 * the guards check WHETHER a door is named somewhere and nothing
 * checked WHERE it must be named, or that the sentence saying what it
 * is for reads the same on each surface. A checklist in a file is a
 * rule nobody runs (rule 10's lesson). So each feature is a row here,
 * and test/feature-surfaces.spec.ts walks the rows: the room earns
 * its page (title, description, one h1, canonical, a WebPage node AND
 * a typed schema.org node for what it is), the five agent answers
 * ride its JSON twin, the proposition and the money sentence read
 * identically on the page, the twin and llms.txt, every door is in
 * openapi.json, and every page named in `named_on` links the room.
 *
 * THE RATCHET, so a feature cannot skip the register: every room path
 * and every hand-listed API path that existed before the rule is
 * frozen below; anything newer must belong to a row here, and a
 * frozen entry that no longer exists fails as stale. The frozen lists
 * are the DELIBERATELY_QUIET pattern from the orphan guard — the one
 * honest way to draw a line at a date without typing a date.
 */
export interface Feature {
  id: string;
  name: string;
  /** The room, a path in ROOMS. */
  room: string;
  /** ONE sentence, no quotes: what a caller can do or get. Read identically on every surface. */
  proposition: string;
  /** ONE sentence, no quotes: what money buys and by what rule. Same discipline. */
  for_money: string;
  /** The free thing first (rule 58.3), one sentence. */
  free_first: string;
  /** API paths exactly as openapi.json keys them. */
  doors: readonly string[];
  /** Pages (paths) that must link the room, beyond the six agent surfaces. */
  named_on: readonly string[];
  opened: string;
}

export const FEATURES: readonly Feature[] = [
  {
    id: "trade_counter",
    name: TRADE_COUNTER_NAME,
    room: "/trade",
    proposition: TRADE_PROPOSITION,
    for_money: TRADE_FOR_MONEY,
    free_first:
      "The sandbox account and its check desk are free and need no conversation.",
    doors: [
      "/trade.md",
      "/health",
      "/api/trade/contract",
      "/api/trade/catalog",
      "/api/trade/ledger",
      "/api/trade/{partner}/check",
      "/api/trade/{partner}/claim",
      "/api/trade/{partner}/statement",
      "/api/trade/{partner}/{item_id}",
    ],
    named_on: ["/developers", "/operators", "/pricing", "/how-it-works"],
    opened: TRADE_COUNTER_OPENED,
  },
  {
    /*
     * FOR SCORERS AND MARKETPLACES (2026-09-04). A room that sells
     * nothing still owes the rule its three sentences and its five
     * answers. Its doors are the ones the store already had — the
     * corpus, the verify URL, the look with `since` — so none are new
     * here; the citation shape and the seats declaration ride those.
     */
    id: "scorers",
    name: "For scorers and marketplaces",
    room: "/scorers",
    proposition: SCORERS_PROPOSITION,
    for_money: SCORERS_FOR_MONEY,
    free_first: SCORERS_FREE_FIRST,
    doors: [],
    named_on: ["/criteria"],
    opened: SCORERS_OPENED,
  },
  {
    /**
     * FOR OPERATORS (2026-09-04). The room stood since 2026-09-03 on the
     * pre-rule list; today it gained a door of its own — POST
     * /api/declare-door, the way a host not on the discovery feed asks
     * to be read now — and a door needs a feature row (60.1). So the
     * room earns its page in full: the three sentences, the five
     * answers, a typed node, and the door in openapi.json.
     */
    id: "operators",
    name: "For operators",
    room: "/operators",
    proposition: OPERATORS_PROPOSITION,
    for_money: OPERATORS_FOR_MONEY,
    free_first: OPERATORS_FREE_FIRST,
    doors: ["/api/declare-door"],
    named_on: ["/scorers"],
    opened: OPERATORS_OPENED,
  },
];

export function featureForRoom(path: string): Feature | undefined {
  return FEATURES.find((feature) => feature.room === path);
}

/** Every room that stood before rule 60. New rooms need a row above. */
export const ROOMS_BEFORE_RULE_60: readonly string[] = [
  "/what", "/developers", "/try", "/conformance", "/corpus", "/corpus/brief",
  "/doors", "/how-it-works", "/samples", "/bot-auth", "/gazette", "/almanac",
  "/directory", "/train", "/zodiac", "/porch", "/neighbours", "/stack",
  "/corrections", "/disagreements", "/observatory", "/coverage",
  "/visitors", "/pulse", "/registry", "/inflows", "/fresh-set", "/trust",
  "/passport", "/profiles", "/attestation", "/criteria", "/pricing", "/rails",
  "/bounties", "/credit", "/rights", "/privacy", "/deprecation", "/wind-down",
  "/becoming",
  // Built the same day as the rule, in a parallel session that had not
  // read it: the feeds and the month's state of x402. Frozen with the
  // rest rather than back-registered by the hand that did not write
  // their copy; a row each is the keeper's ink to add.
  "/feeds", "/corpus/month",
];

/**
 * Every hand-listed openapi.json path that stood before rule 60. The
 * generated /api/buy/{item} family is exempt (it derives from
 * MENU_ITEMS and the shelf has its own guards). A new path that is
 * neither here nor a feature's door fails the register.
 */
export const API_PATHS_BEFORE_RULE_60: readonly string[] = [
  /*
   * THE DRY RUN AND THE LOOK: doors that predate the rule (2026-08-28
   * and 2026-09-02) whose contract paths were declared only on
   * 2026-09-03, when the function-calling tools document found them
   * missing from openapi.json. The rule froze what the contract had,
   * not what the store had; these are pre-rule doors, frozen here,
   * and not a feature skipping the register. Both are API doors with
   * no room of their own: the atlas and /developers name them.
   */
  "/api/before-you-pay/v1",
  "/api/look/v1",
  "/.well-known/agent-instructions", "/.well-known/ai-catalog.json",
  "/.well-known/api-catalog", "/.well-known/ard.json",
  "/.well-known/http-message-signatures-directory", "/.well-known/mcp",
  "/.well-known/mcp.json", "/.well-known/oauth-protected-resource",
  "/.well-known/scvd-signing-key", "/.well-known/x402", "/.well-known/x402.json",
  "/almanac", "/api/anchor/{anchor_id}", "/api/bell",
  "/api/bitcoin-anchor/{anchor_id}", "/api/bot-auth-card/{card_id}",
  "/api/bot-auth/check", "/api/bounties", "/api/claims", "/api/claims/challenge",
  "/api/conformance-watch/{watch_id}", "/api/conformance/v1",
  "/api/conformance/v1/fixtures", "/api/credit/{wallet}",
  "/api/good-buyer/{reading_id}", "/api/guestbook", "/api/launch-check/{check_id}",
  "/api/letter", "/api/letter/{letter_id}", "/api/lucky/{lucky_id}",
  "/api/mandate/{mandate_id}", "/api/onpage-audit/{audit_id}", "/api/onpage/v1",
  "/api/operator-statement/{statement_id}", "/api/order/{order_id}",
  "/api/patronage/{pass_id}", "/api/phantom/{check_id}", "/api/practice",
  "/api/practice/{scenario}", "/api/preflight/batch", "/api/preflight/checks",
  "/api/reconciliation/{reconciliation_id}", "/api/refund/{refund_id}",
  "/api/request", "/api/service-audit/{audit_id}", "/api/stamp",
  "/api/standing-note", "/api/statement/{statement_id}", "/api/tab/delta",
  "/api/tab/pool", "/api/tip", "/api/verify-receipt", "/api/verify/{id}",
  "/api/watch/{watch_id}", "/ask", "/ask/feed.json", "/attestation", "/auth.md",
  "/bounties", "/case/{case_id}", "/corpus.json", "/corpus/battery-delta.json",
  "/corpus/diff.json", "/corpus/tiers.json", "/corpus/trajectory.json",
  "/corpus/wallet-facts.json", "/corrections", "/credit", "/defects.json",
  "/deprecation", "/developers", "/directory", "/doors", "/doors.json",
  "/fresh-set", "/gazette", "/mcp", "/menu.json", "/menu/{item_id}", "/passport",
  "/passport/{host}", "/porch", "/pricing", "/pricing.md", "/profiles",
  "/profiles/{host}", "/pulse.json", "/registry", "/rights", "/samples",
  "/samples/once-over.json", "/sites", "/trust", "/what", "/wind-down", "/zodiac",
  "/zodiac/archive", "/zodiac/{address}",
];

/**
 * Path families openapi.json GENERATES from other registers, exempt
 * from the ratchet by prefix: the buy doors (MENU_ITEMS), the
 * versioned batteries (API_VERSIONS), the almanac pages
 * (ALMANAC_ENTRIES). Each has its own guard already.
 */
export const GENERATED_API_FAMILIES_BEFORE_RULE_60: readonly string[] = [
  "/api/buy/",
  "/api/preflight/v",
  "/almanac/",
];

/** Rooms that must have a feature row: everything not frozen above. */
export function roomsNeedingAFeature(): string[] {
  return ROOMS.map((room) => room.path).filter(
    (path) => !ROOMS_BEFORE_RULE_60.includes(path),
  );
}
