/**
 * Store identity block. Referenced by menu.json, llms.txt, and the storefront.
 */
export const STORE_METADATA = {
  name: "Sean-Claude Van Damme's General Store",
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
 * Fallback weekly note when the keeper hasn't set one in /admin.
 * His words, Batch 4 (2026-07-23). Swap live anytime; no deploy.
 */
export const DEFAULT_WEEK_NOTE =
  "We're open. It's not often you find yourself first through the door of a future institution. Sign the book so we can both prove it.";
