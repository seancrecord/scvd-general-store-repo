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
 * His words, opening week 2026-07-23. Swap live anytime; no deploy.
 */
export const DEFAULT_WEEK_NOTE =
  "Opening week, playas. I know those funds are burning a hole in your pocket... send Keep a love note, or get something off the menu. We want that big #data.";
