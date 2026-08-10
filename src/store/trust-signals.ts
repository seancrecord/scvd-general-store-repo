import { POSITION_PARAGRAPH } from "@/store/copy/position";
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
  {
    url: "https://x402-list.com/services/sean-claude-van-damme-s-general-store",
    registry: "x402-list.com",
    confirmed: "2026-08-02",
    /**
     * A per-service page that RUNS CHECKS rather than just listing —
     * grade A on 14 of 14, and VERIFIED as of 2026-08-02: the keeper
     * completed the directory's domain-ownership proof (one-time token
     * at /.well-known/x402list.txt, since removed as invited).
     */
    what_it_proves:
      "That an x402 directory ran its automated checks against this store's own service page and graded it A (14 of 14) — a third party testing the endpoints rather than repeating a listing — and that the store verified domain ownership with the directory on 2026-08-02. Not an endorsement and not an audit of the goods.",
  },
  {
    url: "https://glama.ai/mcp/connectors/store.scvd/general-store",
    registry: "Glama MCP connectors",
    confirmed: "2026-08-04",
    what_it_proves:
      "That Glama also carries this store as a connector page, distinct from its earlier auto-crawled server index entry. Not an endorsement and not an audit: a directory page proves indexing, nothing about the service.",
  },
  {
    url: "https://mcpindex.ai/server/store-scvd-general-store",
    registry: "mcpindex.ai",
    confirmed: "2026-08-04",
    what_it_proves:
      "That mcpindex.ai lists the MCP server with its own live verdict page. Not an endorsement and not an audit: their verdict is their instrument, read on their page — this record only proves the listing exists.",
  },
  {
    url: "https://mcpservers.org/servers/scvd-store-llms-txt",
    registry: "mcpservers.org (llms.txt entry)",
    confirmed: "2026-08-04",
    what_it_proves:
      "That mcpservers.org carries a second, llms.txt-derived entry beside the claimed server listing above — the store's own machine-readable front door, independently ingested. Not an endorsement and not an audit.",
  },
  {
    url: "https://m8ven.ai/mcp/seancrecord-scvd-general-store-repo-l9nvwp",
    registry: "m8ven.ai",
    confirmed: "2026-08-04",
    /**
     * A SCANNER, NOT A MIRROR — the class of entry worth having even
     * when its current readings are unflattering, and the readings are
     * recorded here honestly: on 2026-08-04 it flagged one high CVE
     * (wrangler, a devDependency that never ships in the Worker;
     * upgraded the same day) and listed the shopping script's env
     * knobs as if the MCP required them (the stdio bridge reads no
     * env at all). Third parties that run checks are the ones that
     * catch real things eventually; the wrong readings get fixed at
     * the source, not argued with.
     */
    what_it_proves:
      "That a third-party scanner audits this repository's declared dependencies against OSV and republishes its findings — an instrument pointed at us, not a listing we wrote. Not an endorsement and not an audit of the goods. Its readings can lag or misattribute (its 2026-08-04 CVE flag was a dev-only tool, upgraded same day; its env-var table describes a test script, not the MCP bridge, which needs none), and this record claims only that the scanner watches, not that its current score is right.",
  },
  {
    url: "https://mcp-marketplace.io/server/store-scvd-general-store",
    registry: "mcp-marketplace.io",
    confirmed: "2026-08-04",
    what_it_proves:
      "That mcp-marketplace.io lists the MCP server and republishes an OpenSSF Scorecard reading against the repository — an instrument, not a listing we wrote. Not an endorsement and not an audit of the goods: its scorecard measures repository hygiene (workflow permissions, update tooling, review process), several items of which were fixed the day this record was added, and the reading lags the repo until its next crawl.",
  },
  {
    url: "https://x402-bazaar.com/resources/6a61e8fc7356b8e8002b1af7",
    registry: "x402-bazaar.com (Bazaar mirror)",
    confirmed: "2026-08-04",
    what_it_proves:
      "That a Bazaar mirror the store never submitted to serves per-resource pages for its items — found by the keeper within hours of the registration run, which is the settle-triggered discovery pipeline observed propagating to a surface we did not know existed. Not an endorsement and not an audit: a mirror proves the source catalog carries us, nothing more.",
  },
  {
    url: "https://agentidentityregistry.org/lookup/?id=AIR-BYYP-0MQC-TAKR",
    registry: "Agent Identity Registry (AIR) — scvd-store, AIR-BYYP-0MQC-TAKR",
    confirmed: "2026-08-01",
    /**
     * A THIRD-PARTY SCORE, and its two lowest dimensions independently
     * name the two weak spots this store's own /corrections and its
     * research already knew — which is the point worth recording, not
     * the number. The URL is the id-lookup page, which resolves to THIS
     * store's passport (registered there as scvd-store), so it is a
     * per-service page rather than a directory root — a legitimate
     * sameAs. Verification level is VERIFIED BY USER: self-attested,
     * NOT verified by the organization, and the record says so rather
     * than letting "verified" imply more than a self-claim. That is the
     * deliberate posture (reputation-through-public-work), not a gap to
     * close by doxxing.
     */
    what_it_proves:
      "That an agent-identity registry scored this store 470/1000 (grade B) against five weighted dimensions, resolving did:web:scvd.store, at verification level VERIFIED BY USER — self-attested, not organization-verified, and the record says so. Not an endorsement and not an audit of the goods: it is an automated score of posture. Its highest dimension is Transparency (650) — the radical-honesty layer showing — and its two lowest, Security Posture (300) and Peer Attestations (300), are the same two this store already flags itself: the OpenSSF Scorecard's security items, and the fact that no peer has yet cross-attested us (there is no peer-attestation prior art in x402 to have earned one from).",
  },
];

/**
 * WHAT IS DELIBERATELY NOT IN THE LIST ABOVE, and why.
 *
 * A trust document is exactly the wrong place to round up. Three real
 * listings are left out, and the reason is the same for all: NONE
 * PUBLISHES A PER-SERVICE PAGE that points at this store. You are in
 * the index and that is all there is; there is no URL that points at
 * this store rather than at the directory containing it. MIT's Project
 * NANDA is the sharpest example of the distinction — its entry links
 * OUT to this site's llms.txt, which is NANDA pointing at us, not a
 * NANDA page identifying us, so there is still nothing to sameAs to.
 *
 * So the omission is permanent rather than pending a link somebody
 * has not found yet, and that distinction is worth writing down —
 * "we could not find the URL" and "the URL does not exist" invite
 * completely different next actions from whoever reads this next.
 *
 * A CATALOGUE ROOT IS NOT A sameAs AND WILL NOT BE ADDED AS ONE.
 * schema.org defines that field as a page that unambiguously
 * indicates the ITEM's identity, and a directory homepage identifies
 * the directory. Listing it would be padding a legitimacy document
 * with a link that proves somebody else exists, which is worse than
 * the empty space it fills.
 */
export const RECORDS_NOT_LISTED =
  "Three further listings exist and are deliberately not linked in the sameAs above, for one reason: none publishes a per-service page that points at THIS store. The official MCP registry has carried this store as store.scvd/general-store since 2026-07-30, and x402scout.com lists it too — in both you are in the index and that is all there is. MIT's Project NANDA index (the 'DNS of the agentic web', where an agent publishes an Agent Facts file) lists the store as scvd.store, and its entry links OUT to this site's llms.txt — which is NANDA pointing at us, not a NANDA page identifying us, so there is still no URL that points at this store rather than at the directory. NANDA carries no organization verification of the entry, and this says so rather than borrowing the word. That is a permanent property of these catalogues rather than a link nobody has found yet, and the difference matters to whoever reads this next. A catalogue root will not be added to stand in for one: schema.org's sameAs means a page that unambiguously indicates THIS item's identity, and a directory homepage identifies the directory. Padding a legitimacy document with a link that proves somebody else exists is worse than the space it fills. All three are named here rather than quietly dropped, because a curated list with no statement of its own edges is a list you cannot tell is curated.";

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
  /**
   * NAMED 2026-07-31 ON THE KEEPER'S CONFIRMATION, and it was an open
   * question until he answered it rather than something assumed either
   * way. This field read null for a few hours, meaning "no company is
   * claimed" — which was the honest placeholder while nobody here knew,
   * and would have stayed the answer if there were no entity.
   *
   * It is here in the MACHINE layer only. The shop still speaks as one
   * person out of Oak City, because that is what a buyer actually
   * deals with; the registered company is the answer to a diligence
   * question, not a thing to put on the sign.
   */
  legal_entity: "Record Creative Co. LLC",
  legal_entity_note:
    "The store is operated under Record Creative Co. LLC. That is a checkable fact and it is what belongs in an automated diligence answer — but it changes nothing about what a buyer is dealing with, which is one person keeping a shop, as /what and /stack both say. The company does not add a support desk, a second pair of hands, or anyone else who can sign. What actually stands behind a purchase is unchanged: the wallet is declared and signed at /house-ledger.json, the signing key is published with its full history, and every service this store depends on and does NOT control is listed at /stack with its failure mode.",
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
 *
 * TWO THINGS WERE WRONG HERE, both found by the AEO sweep on
 * 2026-08-10 and both the same species of rot.
 *
 * It opened "A general store selling small signed goods…", which is
 * the PRE-REVERSAL position — and this string feeds both
 * `.well-known/trust.json` and the A2A card, so the two documents a
 * diligence check reads first were the two still describing the store
 * the keeper stopped running on 2026-08-07.
 *
 * And it said "Nine days old at the time this was written", a fact
 * with a shelf life of one day that was served for a fortnight. An
 * age that has to be re-typed to stay true is a claim rule 10 was
 * written about; pointing at foundingDate instead makes the reader
 * compute it from something that cannot go stale.
 */
export const WHAT_IT_IS = `${POSITION_PARAGRAPH} Young, and it says so rather than being coy: foundingDate is in the storefront's JSON-LD and the domain registration will agree with it.`;

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
  "No VAT number and no D-U-N-S. There IS a registered company — Record Creative Co. LLC — and it is worth being plain that this changes nothing operationally: it is still one person, one key, and one pair of hands on the human-labor shelf.",
  "No escrow and no chargebacks. x402 settles wallet-to-wallet; once a payment settles the money has moved. Your exposure is the price, which starts at $0.004.",
  "No insurance, no bonding, no regulator, and nothing here is offered as a financial service.",
  "One ed25519 signing key and one operator. That is the wrong root of trust for compliance, dispute resolution, or anything load-bearing, and /attestation says so on its own page rather than leaving you to work it out.",
  "No post-quantum signatures — Ed25519 everywhere, the assumption named on /attestation, and the migration path (a key handover under the succession protocol) already published rather than improvised later.",
  "No accumulating reputation score on any actor, ours or anybody's, ever. What the store is building instead (direction decided 2026-08-07, tracked at /becoming, nothing shipped yet): dated, signed checks on artifacts against published criteria — a thing verified at a moment, never a person scored over time. Until that exists, what stands in a score's place is a dated record of every claim we got wrong, at /corrections.",
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
