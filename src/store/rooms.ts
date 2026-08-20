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
   * Exactly one room sits here today and it is not an oversight: the
   * pulse shipped under "do NOT wire this into the public storefront
   * page yet," and a test has held that since. This flag is how the
   * derived footer honours that instruction instead of quietly
   * overruling it — which is what the first draft of this change did,
   * caught by his guard rather than by me.
   */
  on_storefront?: false;
}

/**
 * The storefront is deliberately absent: it is the subject these rooms
 * are about, not one of them. HUMAN_SURFACES puts it back at the front.
 */
export const ROOMS: readonly Room[] = [
  { path: "/what", name: "What is this?" },
  { path: "/try", name: "The Practice Counter" },
  /**
   * The two differentiators, given crawlable rooms 2026-08-10. Both
   * capabilities are older than these pages; what was missing was a
   * landing an answer engine could read — the desk lived at an API
   * path and the corpus in a JSON file, and a five-model check found
   * neither. The rooms carry the prose; the instruments stay where
   * they were.
   */
  { path: "/conformance", name: "The conformance desk" },
  { path: "/corpus", name: "The corpus" },
  /**
   * The WBA line's room, 2026-08-11: what signed crawler identity is,
   * the free directory check, and the paid card. On the front like the
   * conformance desk it is modeled on — the keeper's call, same day it
   * shipped. (Holding it back would be awkward anyway: the menu item's
   * own description names /api/bot-auth/check, so the string reaches
   * the storefront through the shelf either way.)
   */
  { path: "/bot-auth", name: "The Web Bot Auth desk" },
  /**
   * OFF THE FRONT OF THE STORE 2026-08-06, the keeper's call: the
   * footer stopped linking the Gazette. The rack is still open, still
   * free, still in the sitemap, llms.txt, the x402 document and the
   * contract — every surface an agent reads. It just stopped taking a
   * slot on the one surface a person reads, now that weekly
   * self-drafting is retired and the Almanac carries the writing.
   */
  { path: "/gazette", name: "The Gazette", on_storefront: false },
  { path: "/almanac", name: "The Keeper's Almanac" },
  { path: "/directory", name: "Town Directory" },
  { path: "/train", name: "The train" },
  { path: "/zodiac", name: "The Systems Almanac" },
  { path: "/porch", name: "The Porch" },
  { path: "/neighbours", name: "What we bought from the neighbours" },
  { path: "/stack", name: "What this store rests on" },
  { path: "/corrections", name: "Corrections" },
  { path: "/visitors", name: "The visitors' register" },
  { path: "/pulse", name: "The pulse", on_storefront: false },
  /**
   * The public registry tally, 2026-08-19 — the keeper's own design
   * ("keep a page with this... every week publicly without naming
   * names"). Held off the storefront the same way the pulse was until
   * he rules on giving it a front slot; every agent-read surface
   * carries it from day one.
   */
  { path: "/registry", name: "State of the registry", on_storefront: false },
  { path: "/attestation", name: "What we sign" },
  /**
   * Rule 43's gate, opened 2026-08-10 on the keeper's badge ruling.
   * Held off the storefront pending his nod on giving it a slot — the
   * sitemap, llms.txt and the room contract all carry it either way.
   */
  { path: "/criteria", name: "What 'verified' means", on_storefront: false },
  /**
   * The two money-out rooms, given crawlable landings 2026-08-20. Both
   * mechanisms shipped as API paths only — a bounty board nobody can
   * find pays nobody, and a rebate you can only read by already
   * knowing the URL rewards nobody. Held off the storefront pending
   * the keeper's nod on a front slot (rule 7: whether a room appears
   * at the front is a copy decision, and copy is his), which is the
   * same course /pulse, /registry and /criteria took. ⚑ KEEPER REVIEW
   * — these two are the store's acquisition surfaces and there is a
   * real argument they belong at the front; that argument is his to
   * settle, not mine to assume.
   */
  { path: "/bounties", name: "The Bounty Board", on_storefront: false },
  { path: "/credit", name: "Regulars' credit", on_storefront: false },
  { path: "/rights", name: "What's yours" },
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
