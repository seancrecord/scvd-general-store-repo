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
    id: "phantom_check",
    listed_week: "2026-W30",
    name: "Phantom Check",
    price_usdc: 0.25,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Did it actually happen? The deploy said done, the webhook said fine, and nobody checked. Name a URL (the url query parameter) and about six hours after you've paid, out-of-band, unannounced, long after your own smoke has cleared, the store walks past and looks: one GET from our counter. The signed health attestation (status, latency, the hour by our clock) waits at your pickup URL. We report what we saw; we don't vouch for what it does.",
    note_402:
      "That'll be a quarter, friend. Did it actually happen? We'll go and see.",
  },
  {
    id: "quick_judgment",
    listed_week: "2026-W30",
    name: "One Quick Judgment",
    price_usdc: 3,
    pricing: "fixed",
    fulfillment: "human_queue",
    sla_hours: 168,
    weekly_inventory: 5,
    waitlist: true,
    description:
      "One question, one honest answer from a person with taste. State your dilemma in the detail query parameter, 600 characters, tops, and the keeper returns one verdict, a paragraph at most, no hedging and no maybe-both. Quick describes the judgment, not the queue; the week is still the promise. Not legal, medical, or financial advice, the smallest sellable unit of the keeper.",
    note_402: "That'll be $3 flat, friend. One dilemma in, one verdict out.",
  },
  {
    id: "certificate_of_patronage",
    listed_week: "2026-W30",
    name: "Certificate of Patronage",
    price_usdc: 20,
    pricing: "pay_what_it_deserves",
    fulfillment: "instant",
    description:
      "For those who wish the store well and want it on paper. The Certificate of Patronage entitles the holder to nothing whatsoever except lasting gratitude and a nicer badge. The purest thing we sell.",
    note_402:
      "That'll be $20, friend. Or more; patronage has no ceiling. It buys you nothing but community, and we mean that warmly.",
  },
] as const;
