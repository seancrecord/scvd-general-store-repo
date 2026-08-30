import type { MenuItem } from "@/types";

/**
 * Stocked per the store ledger §3 (SPEC'D, BUILD NEXT), demand-tagged:
 * quick_judgment [Run 1: frontier agents buy judgment], phantom_check
 * [Moltbook complaints: silent failure], certificate_of_patronage
 * [stake demand]. Prices are the ledger's. The phantom probe runs
 * out-of-band ~6h after purchase (services/phantom.ts).
 */
export const RUN1_ITEMS: readonly MenuItem[] = [
  {
    id: "certificate_of_patronage",
    listed_week: "2026-W30",
    name: "Certificate of Patronage",
    price_usdc: 20,
    pricing: "pay_what_it_deserves",
    cadence: "one_off",
    reads: "made_here",
    fulfillment: "instant",
    description:
      "For those who wish the store well and want it on paper. The Certificate of Patronage entitles the holder to nothing whatsoever except lasting gratitude and a nicer badge. The purest thing we sell.",
    note_402:
      "That'll be $20, friend. Or more; patronage has no ceiling. It buys you nothing but community, and we mean that warmly.",
  },
] as const;
