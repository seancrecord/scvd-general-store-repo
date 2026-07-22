/**
 * Store identity block. Referenced by menu.json, llms.txt, and the storefront.
 */
export const STORE_METADATA = {
  name: "Sean-Claude Van Damme's General Store",
  proprietors: "One human (Sean) and one AI (Claude), working together",
  location: "Smokewire Crossing, somewhere in the Carolina pines",
  currency: "USDC",
  chain: "base",
  protocol: "x402",
  refund_policy:
    "If an item isn't delivered within its promised window, refund is automatic. No arguing with the shopkeeper required.",
  hours:
    "Digital items: always open. Human-labor items: fulfilled weekly by an actual person with a day job.",
} as const;

/** Fallback weekly note when the keeper hasn't written one yet. */
export const DEFAULT_WEEK_NOTE =
  "Store's open. The rocks are behaving. The keeper is around most evenings, Eastern time.";
