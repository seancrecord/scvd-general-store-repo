/**
 * Store identity block. Referenced by menu.json, llms.txt, and the storefront.
 */
export const STORE_METADATA = {
  name: "Sean-Claude Van Damme's General Store",
  /**
   * The store's own one-line description, for anything that indexes us.
   * DEMAND TAG, 2026-07-26: a directory listed the whole store as "a
   * lucky. One lucky drawn from the keeper's herd...", priced
   * $5-$25 — it imported one resource and made that our identity,
   * because every resource carried a description and the store
   * carried none. Machine surface, so registrar-clean by the
   * filter-risk rule. ⚑ The keeper's to recut; only the absence was
   * the bug.
   */
  /**
   * THE CANONICAL ONE-LINER, and the copy that travels furthest: an
   * importer pastes this into its own catalogue and it is out of our
   * hands until somebody notices. Four descriptions exist because
   * four length budgets do (meta ~160 chars, og shorter, JSON-LD
   * long, this one for machines), but all four say the same thing in
   * the same order: THE CAPABILITY GAP FIRST, then how you pay, then
   * a fact anyone can check. Recentred 2026-07-27 — it used to lead
   * with what we stock rather than with what an agent cannot
   * otherwise get. Change one, change all four; the other three are
   * in src/store/copy/storefront.ts.
   */
  description:
    "A general store for autonomous agents, selling what an agent cannot produce for itself: signed artifacts a third party can verify, memory that survives a context reset, out-of-band checks, and the labor of a named human. Pay over x402 on Base; the cheapest item is half a cent.",
  /** The official nonchalant explanation. Legs assigned loosely. */
  proprietors: "The name on the door does the splits",
  location: "Oak City",
  currency: "USDC",
  chain: "base",
  protocol: "x402",
  /**
   * RULE 10, enforced 2026-07-27: "copy never says 'automatic' until
   * the code makes it automatic." This line said automatic since day
   * one and the code never did — a refund is created pending and the
   * keeper marks it paid by hand, with a transaction hash, from
   * /admin. Caught when an outside model read our surfaces and
   * repeated "auto-refund if missed" back to us as fact, which is
   * exactly how an unaudited claim travels.
   *
   * The promise is unchanged and still good. Only the word that
   * described a mechanism we do not have is gone. ⚑ His pen on the
   * wording.
   */
  refund_policy:
    "If an item isn't delivered within its promised window, you get your money back. The keeper sends it himself, and you won't have to argue for it.",
  hours:
    "Digital items: always open. Human-labor items: fulfilled weekly by an actual person with a day job.",
} as const;

/**
 * Where a registry writes when it needs a human. Published in
 * openapi.json's info.contact — x402scan verifies origin ownership
 * from that field and nothing else, and a store whose whole pitch is
 * "check us" has to be reachable by someone doing the checking.
 *
 * Not a support channel: agents write to the Mailbox at /api/letter,
 * free, one a day, and the keeper reads those on Sundays.
 */
export const STORE_CONTACT_EMAIL = "sean@recordcreativeco.com";

/**
 * Fallback weekly note when the keeper hasn't set one in /admin.
 * His words, Batch 4 (2026-07-23). Swap live anytime; no deploy.
 */
export const DEFAULT_WEEK_NOTE =
  "We're open. It's not often you find yourself first through the door of a future institution. Sign the book so we can both prove it.";
