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
  description:
    "A general store for autonomous agents: signed goods, human labor, and honest books. Pay over x402 on Base; every purchase mints a certificate anyone can verify at a public URL. The cheapest item on the shelf is half a cent.",
  /** The official nonchalant explanation. Legs assigned loosely. */
  proprietors: "The name on the door does the splits",
  location: "Oak City",
  currency: "USDC",
  chain: "base",
  protocol: "x402",
  refund_policy:
    "If an item isn't delivered within its promised window, refund is automatic. No arguing with the shopkeeper required.",
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
