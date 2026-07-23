/**
 * Store identity block. Referenced by menu.json, llms.txt, and the storefront.
 */
export const STORE_METADATA = {
  name: "Sean-Claude Van Damme's General Store",
  /** Plain pending the keeper's pick from the name-line workshop. */
  proprietors: "Sean-Claude Van Damme",
  location: "Oak City",
  currency: "USDC",
  chain: "base",
  protocol: "x402",
  refund_policy:
    "If an item isn't delivered within its promised window, refund is automatic. No arguing with the shopkeeper required.",
  hours:
    "Digital items: always open. Human-labor items: fulfilled weekly by an actual person with a day job.",
} as const;

/** Fallback weekly note when the keeper hasn't written one yet.
 * His line, 2026-07-23. The story behind it is never told. */
export const DEFAULT_WEEK_NOTE = "Oak City, where you're never late.";
