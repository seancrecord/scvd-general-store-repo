import type { Env } from "@/types";

/**
 * THE DOCUMENT PRODUCTION SERVES, NOT THE ONE THE FIXTURE BUILDS
 * (2026-09-19). Three guards went green that night against surfaces the
 * live store served past their budgets: the OpenAPI document (716,135
 * bytes against 700,000), the widest 402's header block (14,017 of
 * Node's 16,384, measured 11,494 here) and the largest single-item
 * contract (17,543 against 16,000, measured 15,903 here). Each fixture
 * enabled fewer checkout rails than production, and none enabled the
 * native lane, whose per-door rows and challenges are exactly the bytes
 * that grew. A byte budget measured on a smaller document than the one
 * served is a green light with no bulb behind it.
 *
 * September 23: the OpenAPI guard now reuses this fixture too. It had kept
 * a shorter Solana recipient in its own copy. Explicit UCP and public-proof
 * sized fixture values cover the enabled root metadata as well; saved
 * almanac growth is exercised separately by the headroom test.
 *
 * Every checkout rail the store can quote and the native lane, with
 * fixture recipients and a fixture challenge key. The x402 facilitator
 * mock lists Base and Solana; a spec that quotes the other three rails
 * through the payment stack adds them to /x402/supported the way
 * test/five-network-header-budget.spec.ts does.
 */
export const PRODUCTION_RECIPIENT = "0x3333333333333333333333333333333333333333";
export const PRODUCTION_SOLANA_RECIPIENT = "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE";
export const PRODUCTION_CHALLENGE_KEY = "fixture-native-checkout-hmac-key";

export function productionShape(env: Env): Env {
  return {
    ...env,
    POLYGON_PAY_TO: PRODUCTION_RECIPIENT,
    ARBITRUM_PAY_TO: PRODUCTION_RECIPIENT,
    WORLD_PAY_TO: PRODUCTION_RECIPIENT,
    SOLANA_PAY_TO: PRODUCTION_SOLANA_RECIPIENT,
    UCP_CHECKOUT_ENABLED: "true",
    // Signature-shaped public provenance values, fixture bytes only.
    ORIGIN_OWNERSHIP_PROOFS: `0x${"1".repeat(130)},${"2".repeat(88)}`,
    MPP_CHECKOUT_ENABLED: "true",
    MPP_CHALLENGE_KEY: PRODUCTION_CHALLENGE_KEY,
  };
}
