/**
 * THE TRUST LAYER, FOR MACHINE EYES ONLY.
 *
 * Written 2026-07-31 after three outside models were asked "what is
 * scvd.store" cold. Two read it well. Perplexity read it as
 * UNVERIFIED and would not call it legitimate, and its complaint was
 * specific rather than vague: no clear company identity, no contact
 * information, no terms, no privacy policy, no independent reputation
 * footprint.
 *
 * THE COMPLAINT WAS ACCURATE AND THE SUBSTANCE WAS ALREADY THERE.
 * /what says who runs it, /attestation says exactly what the key does
 * and does not prove, /stack lists every dependency and its failure
 * mode, /corrections lists everything we got wrong, /house-ledger.json
 * declares every wallet we control, and /neighbours carries receipts
 * from services we have actually paid. What did not exist was any of
 * it at a URL a generic legitimacy scan looks for, in a shape it
 * parses. A checklist crawler asking "is there a trust document" got
 * nothing, while a reader willing to browse got more than most stores
 * publish.
 *
 * SO THIS IS A ROUTING FIX, NOT NEW CLAIMS. Every fact below already
 * exists somewhere on this store in the keeper's own words. Nothing
 * here is asserted that is not asserted elsewhere, and where the
 * honest answer is "no," it says no.
 *
 * DELIBERATELY NOT A ROOM. The keeper's call and the right one: it is
 * not in ROOMS, not in the nav, not on the storefront, and no human
 * is ever shown it. The public rooms already say all of this in a
 * voice worth reading; a conventional trust page in conventional
 * language would be a second, duller version of pages that already
 * exist, and the store's whole argument is that it does not keep two
 * registers. Machines get the checklist at /.well-known/trust.json.
 * People get the shop.
 *
 * THE AUDIENCE THAT MATTERS IS NOT A CURIOUS HUMAN RUNNING A SEARCH.
 * It is an autonomous agent doing pre-purchase diligence with its
 * operator's money, whose decision loop is signal-driven rather than
 * impression-driven. If a clean trust document turns a bounce into a
 * settlement, that is a direct lever on revenue rather than a better
 * search snippet.
 */

export interface ExternalRecord {
  /** Where the record lives. Must be a real, checked URL. */
  url: string;
  /** Who keeps it. */
  registry: string;
  /** ISO date somebody here actually opened it and saw us listed. */
  confirmed: string;
  /**
   * WHAT IT ACTUALLY IS, and this field exists to stop the list
   * overclaiming. A directory listing we submitted ourselves is an
   * independent RECORD that we exist and have been indexed. It is not
   * an endorsement, not an audit, and not a third party vouching for
   * us. Saying so here costs nothing and is the difference between a
   * trust document and a logo wall.
   */
  what_it_proves: string;
}

/**
 * Third-party records of this store's existence.
 *
 * ONLY URLS SOMEBODY HAS ACTUALLY OPENED GO IN THIS ARRAY. An
 * invented or assumed listing URL in a trust document is worse than
 * an empty list by a wide margin: the whole point of the field is that
 * a reader can follow it, and a dead link in the one document
 * claiming legitimacy is the strongest possible argument against it.
 * The store's own environment cannot reach external hosts, so every
 * entry here is one the keeper confirmed by hand.
 */
export const EXTERNAL_RECORDS: readonly ExternalRecord[] = [
  {
    url: "https://www.x402scan.com/server/9b04e1cc-ff46-4377-a533-fe7981aa1597",
    registry: "x402scan",
    confirmed: "2026-07-27",
    /**
     * THE STRONGEST ENTRY ON THIS LIST AND THE ONLY ONE THAT IS MORE
     * THAN A FILING. The others record that we submitted ourselves and
     * were indexed. This one PROBES THE PAID ROUTES ITSELF — it reads
     * what /.well-known/x402 and /openapi.json declare and then goes
     * and checks the endpoints answer as declared. That is a third
     * party testing our claims rather than repeating them, which is a
     * different class of evidence and is said so out loud rather than
     * flattened into the same sentence as a directory entry.
     */
    what_it_proves:
      "That an independent scanner read this store's x402 declaration and OPENAPI contract and probed the paid routes itself, rather than taking the listing at face value. Still not an endorsement and not an audit — it confirms the endpoints answer as declared, not that the goods are any good or the operator trustworthy.",
  },
  {
    url: "https://agentic.market/services/scvd-store",
    registry: "The x402 Bazaar (Coinbase CDP), via agentic.market",
    confirmed: "2026-07-27",
    what_it_proves:
      "That fourteen of this store's endpoints are registered to its wallet in the CDP discovery list, which is the authoritative index for x402 services rather than a browsable mirror. Not an endorsement and not an audit: registration means the endpoints were declared and accepted, and the wallet they are registered to is the one declared at /house-ledger.json.",
  },
  {
    url: "https://mcpservers.org/servers/seancrecord/scvd-general-store-repo",
    registry: "mcpservers.org",
    confirmed: "2026-07-29",
    what_it_proves:
      "That the MCP server is listed and claimed by its operator, categorised under Finance. Not an endorsement and not an audit: a claimed listing proves the operator controls the repository, nothing about the service.",
  },
  {
    url: "https://glama.ai/mcp/servers/seancrecord/scvd-general-store-repo",
    registry: "Glama MCP server index",
    confirmed: "2026-07-31",
    what_it_proves:
      "That this store's MCP server was auto-indexed by a third-party directory that crawled it without being asked. Unclaimed, and it mirrors the repository README. Not an endorsement and not an audit: an index entry means somebody's crawler found us and filed us.",
  },
];

/**
 * WHAT IS DELIBERATELY NOT IN THE LIST ABOVE, and why.
 *
 * A trust document is exactly the wrong place to round up. Two real
 * listings are known and both are left out, for two different reasons,
 * and saying which is which costs nothing:
 *
 *   - x402scout.com carries an entry per this store's own notes, and
 *     NOBODY HERE HAS OPENED IT to confirm. An unverified URL in the
 *     one document claiming legitimacy is worse than an absence.
 *   - The official MCP registry (registry.modelcontextprotocol.io) has
 *     this store published under store.scvd/general-store since
 *     2026-07-30. It is left out because there is no stable
 *     per-service page to link, not because the listing is in doubt —
 *     sameAs takes URLs a resolver can follow, and an identifier is
 *     not one.
 *
 * Both go in the moment somebody has a followable URL they have
 * actually opened.
 */
export const RECORDS_NOT_LISTED =
  "Two known listings are deliberately absent. x402scout.com is reported to carry an entry that nobody here has independently confirmed, and an unverified link in a legitimacy document is worse than none. The official MCP registry has published this store as store.scvd/general-store since 2026-07-30, omitted only because it exposes no stable per-service page to link — an identifier is not a URL a reader can follow. Both are listed here rather than quietly left out, because a curated list with no statement of its own edges is a list you cannot tell is curated.";

/**
 * THE OPERATOR, stated the way a diligence check expects to find it.
 *
 * legal_entity is null and that is a deliberate statement rather than
 * an omission: this store does not claim a registered company, and
 * publishing nothing at all in this field would let a reader assume
 * either answer. If an entity is ever registered, this becomes a
 * checkable fact and goes here; until then the honest answer is that
 * you are dealing with one named person and a published wallet.
 */
export const OPERATOR = {
  kind: "individual",
  legal_entity: null,
  legal_entity_note:
    "No registered company is claimed. This is one person keeping a shop, which is stated in the same words on /what and /stack. What stands in place of a company registration: the wallet the money goes to is declared and signed at /house-ledger.json, the signing key is published with its full history, and every service this store depends on and does NOT control is listed at /stack with its failure mode.",
  location: "Oak City, North Carolina",
  contact:
    "The mailbox at /api/letter — free, one a day, and a human reads every one. There is no support queue, no ticket system and no phone number, because there is one person and pretending otherwise would be the first false claim on a page about legitimacy.",
  responds:
    "Human-labor items carry a 168-hour promise and it has not been missed. Letters are read; a reply is not guaranteed.",
} as const;

/**
 * What a diligence check is really asking, answered including where
 * the answer is unflattering. Every line points at a page that says
 * the same thing at more length.
 */
export const WHAT_IT_IS =
  "A general store selling small signed goods and human labour to autonomous agents, paid in USDC on Base over x402 v2. Nine days old at the time this was written and it says so rather than being coy; foundingDate is in the storefront's JSON-LD and the domain registration will agree with it.";

/**
 * PATHS ONLY, so every value can be resolved to an absolute URL
 * without a caller inspecting it first. A prose sentence briefly lived
 * in here and quietly broke that promise — a map whose values are
 * mostly one type and occasionally another is a map every consumer has
 * to defend against.
 */
export const TRUST_ANSWERS = {
  who_is_behind_it: "/what",
  what_a_signature_proves: "/attestation",
  what_we_depend_on_and_do_not_control: "/stack",
  every_claim_we_got_wrong: "/corrections",
  every_wallet_we_control: "/house-ledger.json",
  services_we_have_actually_paid: "/neighbours",
  what_you_own_after_buying: "/rights",
  what_happens_if_we_close: "/wind-down",
  the_books: "/stats",
  the_funnel_with_its_denominator: "/pulse.json",
} as const;

/**
 * THE ABSENCES, FIRST-PERSON, because a trust document that lists only
 * strengths is the document a scam would write. Each of these already
 * appears on /attestation or /stack in longer form.
 */
export const NOT_CLAIMED: readonly string[] = [
  "No third-party security audit of anything here, and no plans for one.",
  "No registered company, no VAT number, no D-U-N-S.",
  "No escrow and no chargebacks. x402 settles wallet-to-wallet; once a payment settles the money has moved. Your exposure is the price, which starts at $0.004.",
  "No insurance, no bonding, no regulator, and nothing here is offered as a financial service.",
  "One ed25519 signing key and one operator. That is the wrong root of trust for compliance, dispute resolution, or anything load-bearing, and /attestation says so on its own page rather than leaving you to work it out.",
  "No reputation score, ours or anybody's. In its place: a dated record of every claim we got wrong, at /corrections.",
  "No independent audit of the books. /stats and /pulse are computed live from counters that predate the pages, with house traffic excluded structurally rather than filtered — which is a design choice you can inspect, not a verified figure.",
];

/**
 * WHAT THIS STORE COLLECTS, which is the question /privacy would have
 * answered if it existed.
 *
 * PUBLISHED HERE BECAUSE IT WAS ONLY EVER IN CODE COMMENTS. The stance
 * is real, deliberate, and stronger than most stores manage — headers
 * only, no bodies, no cookies, nothing client-side, and uniqueness
 * deliberately unavailable so the books cannot quietly become a
 * tracking system. It was enforced in src/lib/metrics.ts and stated to
 * nobody, which meant an automated diligence pass asking "is there a
 * privacy policy" correctly found none.
 *
 * The last line is the load-bearing one and it is a design choice
 * rather than a promise: this store CANNOT tell you how many unique
 * visitors it has had, because it never collected anything that would
 * let it. A limit you can inspect beats a policy you have to trust.
 */
export const DATA_HANDLING = {
  cookies: "None. Not for sessions, not for analytics, not at all.",
  client_side_tracking: "None. No scripts, no pixels, no beacons.",
  ip_addresses: "Not stored and not logged by this store.",
  accounts: "None exist. There is nothing to sign up for and no password to lose.",
  what_is_recorded:
    "Request headers only — user agent, referrer, and a declared source parameter if one was passed — counted into monthly totals per item. No request bodies. Anything a buyer writes and pays to store (an anchor summary, a tag, a confession) is stored because that IS the product, labelled untrusted, and never read as instructions.",
  uniqueness:
    "Deliberately unavailable. With no cookies and no IPs there is no way for this store to tell two visits from one visitor, so every count published at /stats and /pulse is READS AND NOT READERS, and says so on the page. That is a limit built in on purpose, not a gap waiting to be closed.",
  third_party_processors:
    "Payments settle through the Coinbase CDP facilitator and the Base chain, both of which see the transaction because they are the transaction. Hosting is Cloudflare. Both are listed with their failure modes at /stack. Nothing else receives anything.",
  selling_data: "Never, and there is nothing to sell.",
} as const;

export const TRUST_STANDFIRST =
  "A machine-readable summary for automated diligence: who runs this store, what it does and does not claim, and where every answer is written out at length. Published because three outside models were asked to evaluate this store cold and one correctly reported that it could find no conventional trust signals — the substance was all here, filed where a reader browses rather than where a checklist looks. Nothing on this page is a new claim; every line points at a page that says the same thing in the keeper's own words.";

export const TRUST_LIMIT =
  "WHAT THIS DOCUMENT IS WORTH: it is self-published, like every trust page anywhere, and a store writing its own legitimacy statement is the weakest possible evidence of legitimacy. Two things here are NOT self-attested and they are the only two that matter — the ed25519 signature on every artifact we issue, which you check with your own library against a key we publish, and the on-chain settlement transaction bound into every certificate, which you check on any Base explorer without asking us. Everything else on this page is our word. Weigh it accordingly, and start at /corrections, which is the record of what our word has been worth so far.";
