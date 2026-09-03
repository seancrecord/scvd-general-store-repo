/**
 * EVERY PUBLIC ROOM IN THE STORE, IN ONE LIST, BECAUSE BEING BUILT IS
 * NOT THE SAME AS BEING FINDABLE.
 *
 * Four rooms shipped in July with no sitemap line and no meta
 * description, and that was fixed by making the sitemap the one list.
 * The sitemap was then the ONLY list: /attestation and /pulse went live
 * on 2026-07-30 in sitemap.xml and in nothing else — not llms.txt, not
 * skill.md, not the x402 discovery document, not the storefront's
 * structured data, and with no link to them from any public page in the
 * store. A room reachable only by a crawler that already parsed an XML
 * file is the same defect wearing a different hat.
 *
 * So the list moved here, above the sitemap, and the surfaces that
 * answer "what is at this store" derive from it. What does NOT derive
 * from it is the prose: llms.txt still describes each room in the
 * keeper's own words, because a machine-generated paragraph would read
 * like a machine wrote it. The list decides WHETHER a room is named;
 * the keeper decides HOW. A test holds the first half.
 *
 * The name on each entry is the page's own <title>, held to it by test,
 * so this file cannot drift into describing a room that renamed itself.
 */
export interface Room {
  /** Absolute path. Serves HTML to a browser; several also serve JSON. */
  path: string;
  /** The page's own title. Not a description — the pages write those. */
  name: string;
  /**
   * False when the keeper has held a room OFF the front of the store.
   * It still gets the sitemap, llms.txt, the x402 document and the
   * contract — every surface an agent reads — and it gets no link and
   * no structured-data entry on the storefront, because whether a room
   * appears at the front is a copy decision and copy is his (rule 7).
   *
   * The pulse sits here and it is not an oversight: it shipped under
   * "do NOT wire this into the public storefront page yet," and a test
   * has held that since. Five rooms that waited here for a slot ruling
   * (/trust, /profiles, /disagreements, /observatory, /operators) went
   * on the front 2026-09-03 by his word ("go ahead and do those"). This flag is how the
   * derived footer honours that instruction instead of quietly
   * overruling it — which is what the first draft of this change did,
   * caught by his guard rather than by me.
   */
  on_storefront?: false;
  /**
   * WHAT THE SHELF SELLS THAT GOES DEEPER ON THIS ROOM'S SUBJECT, by
   * menu id. Rule 58.4, and it is deliberately CONSERVATIVE: most
   * rooms carry nothing here, because most rooms are a policy, a
   * record or an explanation and there is no honest deeper read to
   * sell. Those rooms say so on the page, which is the sentence rule
   * 58 ends with — selling deeper is not withholding the evidence,
   * and a page with nothing above it should say that plainly rather
   * than point a reader at something answering a different question.
   *
   * An id the menu does not carry is dropped rather than rendered as
   * a broken promise, and a test fails if one goes stale.
   */
  deeper?: readonly string[];
  /**
   * Set where the page writes its own go-deeper section and the
   * derived one would be a second copy. /doors is the worked example
   * rule 58 was adopted alongside; it says all of this in its own
   * voice and better.
   */
  writes_its_own_deeper?: true;
  /**
   * OFF THE SITEMAP, BY THE KEEPER'S RULING (2026-09-03, AEO fix F3).
   * The room is still a room: it answers, llms.txt and the contract
   * still name it, agents still walk in. What it does not get is a
   * sitemap line or a search index, because Search Console was
   * filing the in-voice rooms under "crawled, currently not indexed"
   * and a small domain does not need to spend its crawl on a page
   * that was never written for a search result. The page renderer
   * reads this flag and adds the noindex meta, so the flag and the
   * page cannot disagree. Which rooms sit here is copy (rule 7): the
   * keeper named them, the reason rides on each entry.
   */
  in_sitemap?: false;
}

/**
 * The storefront is deliberately absent: it is the subject these rooms
 * are about, not one of them. HUMAN_SURFACES puts it back at the front.
 */
export const ROOMS: readonly Room[] = [
  { path: "/what", name: "What is this?" },
  /**
   * THE ADDRESS THE LIBRARY NEVER HAD (2026-08-21). Every fact on
   * this page was already published — the contract, the manual, the
   * briefing, the MCP server, the criteria — and a readiness audit
   * probed /developers, /docs and /api, got three 404s, and reported
   * the store as having no developer documentation at all. It was an
   * addressing failure, not a documentation one. /docs and /api serve
   * the same page and stay out of this list: one room, one canonical
   * path, three doors.
   */
  { path: "/developers", name: "developer documentation" },
  /**
   * THE TRADE COUNTER (2026-09-03): the shelf sold on account to
   * marketplaces. Off the front of the store until the keeper rules
   * on a slot (rule 7, the same wait /trust and its four siblings
   * took); on every surface an agent reads from the day it opened.
   */
  { path: "/trade", name: "The Trade Counter", on_storefront: false },
  { path: "/try", name: "The Practice Counter" },
  /**
   * The two differentiators, given crawlable rooms 2026-08-10. Both
   * capabilities are older than these pages; what was missing was a
   * landing an answer engine could read — the desk lived at an API
   * path and the corpus in a JSON file, and a five-model check found
   * neither. The rooms carry the prose; the instruments stay where
   * they were.
   */
  {
    path: "/conformance",
    name: "The conformance desk",
    deeper: ["conformance_watch"],
  },
  { path: "/corpus", name: "The corpus", deeper: ["spot_check"] },
  /**
   * THE WEEK'S DOORS (roadmap S1; the keeper's name, 2026-09-01). The
   * one page a week a stranger can quote, derived from the signed
   * snapshot and never a ranking. Its deeper rung is the week on
   * YOUR door, because that is the question a reader of this page
   * is left holding.
   */
  {
    path: "/corpus/brief",
    name: "The Week's Doors",
    deeper: ["conformance_watch"],
  },
  /**
   * THE LIST THE CORPUS NEVER HAD (#26, 2026-08-29). /corpus.json
   * indexes snapshots and /corpus/host/{host}.json needs a hostname
   * you already know, so "which doors do you have?" — the first
   * question anybody asks — had no door of its own. On the front of
   * the store because it is the most legible free thing here: one
   * page, every endpoint, no ranking.
   */
  {
    path: "/doors",
    name: "Every door we have checked",
    writes_its_own_deeper: true,
  },
  /**
   * THE MECHANISM (the keeper's ask, 2026-08-30: "i think we need a
   * machine readable /how-it-works url"). The store published what it
   * SAW across a dozen surfaces and what it SELLS on every item page,
   * and had HOW IT WORKS in one piece nowhere — a stranger could
   * assemble it from eight pages, and an agent deciding whether to
   * trust or spend could not, because the assembling is the part it
   * cannot do cheaply.
   *
   * It writes its own go-deeper section: the free instruments are the
   * point of the page and belong in the body, not in a derived
   * footer under it.
   */
  {
    path: "/how-it-works",
    name: "How this store works",
    writes_its_own_deeper: true,
  },
  /**
   * THE SAMPLE (#31, 2026-08-29). The shelf described every paid
   * artifact and showed nobody one, which asks a buyer to take our
   * word — the one thing this store tells everybody not to do.
   */
  { path: "/samples", name: "What a purchase hands back" },
  /**
   * The WBA line's room, 2026-08-11: what signed crawler identity is,
   * the free directory check, and the paid card. On the front like the
   * conformance desk it is modeled on — the keeper's call, same day it
   * shipped. (Holding it back would be awkward anyway: the menu item's
   * own description names /api/bot-auth/check, so the string reaches
   * the storefront through the shelf either way.)
   */
  {
    path: "/bot-auth",
    name: "The Web Bot Auth desk",
    deeper: ["signature_agent_card"],
  },
  /**
   * OFF THE FRONT OF THE STORE 2026-08-06, the keeper's call: the
   * footer stopped linking the Gazette. The rack is still open, still
   * free, still in the sitemap, llms.txt, the x402 document and the
   * contract — every surface an agent reads. It just stopped taking a
   * slot on the one surface a person reads, now that weekly
   * self-drafting is retired and the Almanac carries the writing.
   */
  // Retired (the keeper, 2026-09-03: "the gazette is retired so that
  // shouldnt be in there"). The founding edition stays a signed document.
  { path: "/gazette", name: "The Gazette", on_storefront: false, in_sitemap: false },
  { path: "/almanac", name: "The Keeper's Almanac" },
  { path: "/directory", name: "Town Directory" },
  { path: "/train", name: "The train" },
  // "idc either way" (2026-09-03): off, because a page nobody asked to
  // index is one less thin page in the report.
  { path: "/zodiac", name: "The Systems Almanac", in_sitemap: false },
  // "not really for humans" (2026-09-03): the porch is where agents
  // sit and ring; they find it through the guide, not a search box.
  { path: "/porch", name: "The Porch", in_sitemap: false },
  { path: "/neighbours", name: "What we bought from the neighbours" },
  { path: "/stack", name: "What this store rests on" },
  { path: "/corrections", name: "Corrections" },
  /*
   * The disagreement record, 2026-09-02 (house rule 51): where this
   * store's reading and another instrument's diverge, both stand with
   * their derivations. Off the storefront on the same terms as its
   * kin until the keeper rules on a slot; every agent-read surface
   * carries it from day one.
   */
  { path: "/disagreements", name: "Disagreements" },
  /*
   * The observatory, 2026-09-02: the porch's counts, read. Per month,
   * per surface, in name order and never by count. Off the storefront
   * on the same terms as the pulse until the keeper rules on a slot.
   */
  { path: "/observatory", name: "The observatory" },
  /*
   * For operators, 2026-09-03: the shelf from the seller's side, in
   * the order a launch happens, free instrument first in every stage
   * and every price read off the shelf at request. Off the storefront
   * on the same terms as its kin until the keeper rules on a slot.
   */
  { path: "/operators", name: "For operators" },
  /**
   * The coverage matrix got a room 2026-09-01. It had been published
   * since M1 — derived, honest, `none` stated rather than omitted —
   * and only as JSON at a .json URL, which meant the store's clearest
   * statement of its own limits was legible to indexers and invisible
   * to the operator deciding whether to trust it.
   */
  { path: "/coverage", name: "What we observe, and what we do not" },
  { path: "/visitors", name: "The visitors' register" },
  { path: "/pulse", name: "The pulse", on_storefront: false },
  /**
   * The public registry tally, 2026-08-19 — the keeper's own design
   * ("keep a page with this... every week publicly without naming
   * names"). Held off the storefront the same way the pulse was until
   * he rules on giving it a front slot; every agent-read surface
   * carries it from day one.
   */
  {
    path: "/registry",
    name: "State of the registry",
    on_storefront: false,
    deeper: ["spot_check", "service_audit"],
  },
  /**
   * The inflow tally, 2026-08-29. The registry says what the listings
   * are WORTH — how many doors work, what they charge. This says what
   * ARRIVED at the addresses those doors advertise, which is a fact
   * about money and reads as a revenue claim the moment it sits under
   * a heading about listings, so it gets its own room. Counts only,
   * no names, and pressed by hand like the tally beside it. Off the
   * storefront on the same terms as /registry and /pulse.
   */
  {
    path: "/inflows",
    name: "Inflows",
    on_storefront: false,
    deeper: ["the_statement"],
  },
  /**
   * The other half of the registry bargain, 2026-08-20: the tally
   * publishes failures without names, the set publishes names only on
   * the ready side. Built the day the keeper hand-ran the first full
   * walk; held off the storefront the same way the tally is.
   */
  {
    path: "/fresh-set",
    name: "The fresh set",
    on_storefront: false,
    deeper: ["spot_check", "service_audit"],
  },
  /**
   * The trust panel, 2026-08-20 — the outside-reads batch: every
   * trust surface aggregated with links, the assurance ladder named,
   * the gallery of house-bought verifiable artifacts. Held off the
   * storefront pending the keeper's slot ruling, same as its kin.
   */
  {
    path: "/trust",
    name: "The trust panel",
    deeper: ["trust_profile"],
  },
  /**
   * The Endpoint Passport's landing, 2026-08-21 — P2 of the ROI
   * order: one signed, expiring object per ready-side host, our own
   * self-passport as the public example.
   */
  /*
   * ON THE STOREFRONT since 2026-09-01, the keeper's slot ruling
   * (roadmap S2): a merchant shares a page that makes them look
   * observed, never approved.
   */
  {
    path: "/passport",
    name: "Endpoint passports",
    deeper: ["passport_refresh"],
  },
  /**
   * The hosted profiles' index, 2026-08-21 — the keeper's ruled
   * recurring door. Off the storefront pending his slot ruling, same
   * as its passport kin; the machine surfaces carry it either way.
   */
  {
    path: "/profiles",
    name: "Hosted trust profiles",
    deeper: ["trust_profile"],
  },
  {
    path: "/attestation",
    name: "What we sign",
    deeper: ["settlement_attestation", "attestation_bundle"],
  },
  /**
   * Rule 43's gate, opened 2026-08-10 on the keeper's badge ruling.
   * Held off the storefront pending his nod on giving it a slot — the
   * sitemap, llms.txt and the room contract all carry it either way.
   */
  { path: "/criteria", name: "What 'verified' means", on_storefront: false },
  /**
   * The two money-out rooms, given crawlable landings 2026-08-20 and
   * front slots the same day — the keeper ruled they follow the
   * held-back path "with one distinction: there should be a note for
   * both somewhere on front page and especially a note around
   * recurring patronage." So: linked from the front like any
   * storefront room, plus the regulars strip that ties them to the
   * patronage pass.
   */
  /**
   * The Price Club rung, 2026-08-20: the signed pricing charter. On
   * the front deliberately — a pricing promise hidden in a back room
   * is a promise about something else.
   */
  { path: "/pricing", name: "How prices are set" },
  /**
   * The rails chart, 2026-08-21 — the keeper's ask the night the
   * third rail lit: the books' split, drawn, with the table beside
   * the picture.
   */
  { path: "/rails", name: "Where the money settles" },
  { path: "/bounties", name: "The Bounty Board" },
  { path: "/credit", name: "Regulars' credit" },
  { path: "/rights", name: "What's yours" },
  /**
   * A real room 2026-08-21, forced by the MCP directories' privacy-
   * policy gate — and better for it: the honest answer to "what do
   * you collect" here is mostly "nothing, structurally".
   */
  { path: "/privacy", name: "Privacy" },
  /**
   * THE VERSIONING PROMISE, GIVEN A DOOR (2026-08-26). The promise
   * itself is older — the contract's `x-versioning` block has carried
   * it since August — and a readiness audit read that spec, found the
   * URL versioning, and reported "no deprecation or sunset policy
   * detected" anyway. A vendor extension inside a 900KB JSON document
   * is not something a reader can be SHOWN, and "the policy is
   * somewhere you did not look" files as "there is no policy" for the
   * same reason /about and /terms did. Same disease, same cure: a
   * room, at a name somebody would type.
   */
  { path: "/deprecation", name: "API versioning and deprecation policy" },
  { path: "/wind-down", name: "If the lights go off" },
  { path: "/becoming", name: "What this is trying to prove" },
];

/**
 * The rooms the front of the store may name — links and structured data
 * alike, since both are the storefront speaking. Filtered rather than
 * hand-listed, so holding a room back stays one field on one line and
 * every other surface keeps it.
 */
export const STOREFRONT_ROOMS: readonly Room[] = ROOMS.filter(
  (room) => room.on_storefront !== false,
);

/** The rooms the sitemap lists; every other surface still lists ROOMS. */
export const SITEMAP_ROOMS: readonly Room[] = ROOMS.filter(
  (room) => room.in_sitemap !== false,
);

/** The rooms the keeper held off the sitemap and the index (F3). */
export const UNLISTED_ROOMS: readonly Room[] = ROOMS.filter(
  (room) => room.in_sitemap === false,
);

/** True when the page at `path` is a room the keeper held off the index. */
export function isUnlistedRoom(path: string | undefined): boolean {
  return path !== undefined && UNLISTED_ROOMS.some((room) => room.path === path);
}
