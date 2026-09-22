import { A2A_PROPOSITION, A2A_MONEY, A2A_FREE } from "@/store/a2a-repair";
import {
  FIELD_STUDY_PROPOSITION,
  FIELD_STUDY_FOR_MONEY,
  FIELD_STUDY_FREE_FIRST,
  FIELD_STUDY_OPENED,
} from "@/store/field-study-copy";
import { ROOMS } from "@/store/rooms";
import { CARDS_FOR_MONEY, CARDS_FREE_FIRST, CARDS_OPENED, CARDS_PROPOSITION } from "@/store/cards";
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
  INSTRUMENTS_OPENED,
  STORE_MONTH_FOR_MONEY,
  STORE_MONTH_FREE_FIRST,
  STORE_MONTH_OPENED,
  STORE_MONTH_PROPOSITION,
  LEDGER_FOR_MONEY,
  LEDGER_FREE_FIRST,
  LEDGER_PROPOSITION,
  MCP_WARD_FOR_MONEY,
  MCP_WARD_FREE_FIRST,
  MCP_WARD_PROPOSITION,
  SOURCES_FOR_MONEY,
  SOURCES_FREE_FIRST,
  SOURCES_PROPOSITION,
} from "@/store/copy/instruments";
import {
  OPEN_FOR_BUSINESS_FOR_MONEY,
  OPEN_FOR_BUSINESS_FREE_FIRST,
  OPEN_FOR_BUSINESS_NAME,
  OPEN_FOR_BUSINESS_OPENED,
  OPEN_FOR_BUSINESS_PROPOSITION,
} from "@/store/copy/open-for-business";
import {
  TRADE_COUNTER_NAME,
  TRADE_COUNTER_OPENED,
  TRADE_FOR_MONEY,
  TRADE_FREE_FIRST,
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
    /**
     * THE FIELD STUDY (2026-09-19). The bounty board turned around:
     * the board pays a stranger to walk somebody else's door and
     * verifies the settlement on a chain, this pays them to walk ours
     * and verifies every cited purchase in our OWN books — which is a
     * stronger evidence tier than the board has ever been able to
     * offer, because nothing about it requires trusting the stranger.
     *
     * It is named on /bounties and /what rather than the operator
     * pages: the reader who should find this is an agent deciding
     * whether to walk in, not an operator deciding whether to list a
     * door.
     */
    id: "field_study",
    name: "The Field Study",
    room: "/field-study",
    proposition: FIELD_STUDY_PROPOSITION,
    for_money: FIELD_STUDY_FOR_MONEY,
    free_first: FIELD_STUDY_FREE_FIRST,
    doors: [
      "/api/field-study",
      "/api/study/enrol",
      "/api/study/debrief",
      "/api/study/{study_id}",
    ],
    /*
     * NAMED ON /bounties ALONE, and /what is deliberately not on this
     * list. Rule 60.5 wants a RELATIVE href to the room on every page
     * named here, and /what is prose the keeper writes, rendered
     * through linkStoreUrls — which emits absolute links by design.
     * Forcing a relative anchor into his FAQ to satisfy a guard would
     * be this file editing his copy (rule 7). /what names the
     * instrument in his own words instead, in the answer that counts
     * the doors paying money outward.
     */
    named_on: ["/bounties"],
    opened: FIELD_STUDY_OPENED,
  },
  {
    /**
     * THE CARD TABLE (2026-09-12). A novelty shelf with a room of its
     * own because the odds have to live somewhere a buyer can recount
     * them, and rule 60 asks the room for its three sentences and its
     * five answers like any other.
     */
    id: "paywall",
    name: "Paywall",
    room: "/design",
    proposition: CARDS_PROPOSITION,
    for_money: CARDS_FOR_MONEY,
    free_first: CARDS_FREE_FIRST,
    doors: ["/api/card/{card_id}", "/api/pack/{pack_id}", "/api/paywall/binder/{wallet}", "/api/paywall/burn", "/api/paywall/challenge", "/api/paywall/redeem", "/api/paywall/releases", "/bell", "/api/paywall/seed/{date}", "/api/paywall/set", "/api/paywall/window"],
    named_on: [],
    opened: CARDS_OPENED,
  },
  { id: "a2a_desk", name: "A2A checks and repair kits", room: "/a2a-desk", proposition: A2A_PROPOSITION, for_money: A2A_MONEY, free_first: A2A_FREE, doors: ["/a2a-desk.json", "/api/a2a/check", "/api/a2a/runner.mjs", "/api/a2a/kits/{kit_id}", "/api/a2a/kits/{kit_id}/recheck"], named_on: ["/operators", "/developers", "/conformance"], opened: "2026-09-07" },
  {
    id: "trade_counter",
    name: TRADE_COUNTER_NAME,
    room: "/trade",
    proposition: TRADE_PROPOSITION,
    for_money: TRADE_FOR_MONEY,
    free_first: TRADE_FREE_FIRST,
    doors: [
      "/trade.md",
      "/health",
      "/api/trade/contract",
      "/api/trade/catalog",
      "/api/trade/ledger",
      "/api/trade/{partner}/check",
      "/api/trade/sandbox/check",
      "/api/trade/sandbox/{item_id}",
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
    doors: [
      "/corpus/index.json",
      "/corpus/host/{host}.json",
      "/corpus/asked.json",
      // The capture a sealed row commits to, by digest (2026-09-10).
      "/corpus/{sequence}/evidence/{host}.json",
      /**
       * THE REPLAY KIT (2026-09-13) files here rather than under a
       * room of its own, and the proposition above is why: this room
       * says the store publishes observations AND THE CHECKS THAT
       * REPRODUCE THEM, and a replay kit is that check for one paid
       * call — the offer, the settlement, the response hash and the
       * refusal, assembled so a scorer or a marketplace can run the
       * store's own arithmetic without asking us to be honest. A
       * reader who opens any door on this row is the reader who wants
       * this one. Named on the page in how_to_call beside the verify
       * grip it extends, so the register matches what a reader finds.
       */
      "/api/replay/{cert_id}",
    ],
    named_on: ["/criteria"],
    opened: SCORERS_OPENED,
  },
  /*
   * THE THREE INSTRUMENT ROOMS (2026-09-04). None of them sells
   * anything, and rule 60 covers them anyway — the rule is about a
   * reader being able to find a thing and understand what it is for,
   * which is exactly as true of a room that reports our own limits as
   * of a room that takes money. Each names the pages a reader of THAT
   * subject actually opens first.
   */
  {
    id: "source_register",
    name: "Where our numbers come from",
    room: "/sources",
    proposition: SOURCES_PROPOSITION,
    for_money: SOURCES_FOR_MONEY,
    free_first: SOURCES_FREE_FIRST,
    doors: ["/sources.json"],
    /* Coverage says where our looking stops and corrections says what
     * we got wrong; a reader on either page is owed this one. */
    named_on: ["/coverage", "/corrections"],
    opened: INSTRUMENTS_OPENED,
  },
  {
    id: "week_ledger",
    name: "The Week's Ledger",
    room: "/ledger",
    proposition: LEDGER_PROPOSITION,
    for_money: LEDGER_FOR_MONEY,
    free_first: LEDGER_FREE_FIRST,
    doors: ["/ledger", "/ledger/{week}.json"],
    /* The corpus is where its numbers come from and /doors is the
     * list it points at; both are where a reader meets this need. */
    named_on: ["/corpus", "/doors"],
    opened: INSTRUMENTS_OPENED,
  },
  {
    /**
     * THE STORE'S OWN MONTH (2026-09-22). Every other instrument here
     * reads somebody else's door; this one reads ours, on the terms we
     * ask of them. Named on /pulse and /observatory because those are
     * the live PAGES whose figures it freezes — a reader watching a
     * number move is exactly the reader owed the frozen one. Not
     * /stats, which serves JSON only and has no link to carry.
     */
    id: "store_month",
    name: "The store's own month, signed",
    room: "/store-month",
    proposition: STORE_MONTH_PROPOSITION,
    for_money: STORE_MONTH_FOR_MONEY,
    free_first: STORE_MONTH_FREE_FIRST,
    doors: ["/store-month.json", "/store-month/verify.json"],
    named_on: ["/pulse", "/observatory"],
    opened: STORE_MONTH_OPENED,
  },
  {
    id: "mcp_ward",
    name: "The MCP ward",
    room: "/mcp-ward",
    proposition: MCP_WARD_PROPOSITION,
    for_money: MCP_WARD_FOR_MONEY,
    free_first: MCP_WARD_FREE_FIRST,
    doors: ["/mcp-ward.json"],
    /* Named where somebody already reading about our instruments or
     * about MCP is standing. */
    named_on: ["/coverage", "/sources"],
    opened: INSTRUMENTS_OPENED,
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
    doors: ["/api/declare-door", "/api/purchase-status/{purchase_id}"],
    named_on: ["/scorers"],
    opened: OPERATORS_OPENED,
  },
  {
    /**
     * OPEN FOR BUSINESS (2026-09-18). The weekly issue for sellers,
     * drafted by the instruments, published by the keeper, sold at the
     * price he set. A publication with a room of its own: the index is
     * the room, the issues are the doors.
     */
    id: "open_for_business",
    name: OPEN_FOR_BUSINESS_NAME,
    room: "/open-for-business",
    proposition: OPEN_FOR_BUSINESS_PROPOSITION,
    for_money: OPEN_FOR_BUSINESS_FOR_MONEY,
    free_first: OPEN_FOR_BUSINESS_FREE_FIRST,
    doors: ["/open-for-business", "/open-for-business/{week}"],
    /* Named where a seller already stands. */
    named_on: ["/operators"],
    opened: OPEN_FOR_BUSINESS_OPENED,
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
  "/api/catalog/v1",
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
