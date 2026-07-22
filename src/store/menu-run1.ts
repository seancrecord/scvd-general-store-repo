import type { MenuItem } from "@/types";

/**
 * Stocked from the Run 1 buyer census (RUN1_SYNTHESIS, 2026-07-22).
 * Demand tags: phantom_check serves the open-weight cron-loop segment
 * (micro-content, $0.001-0.05); quick_judgment serves the frontier
 * human-judgment segment ($1-50 AOV, priced at the $5 per-tx cap);
 * certificate_of_patronage is the census's named support instrument.
 * The premises for the first two are the keeper's agent's desk
 * reasoning, named as desk reasoning — keeper to bless or recast.
 */
export const RUN1_ITEMS: readonly MenuItem[] = [
  {
    id: "phantom_check",
    name: "Phantom Check",
    price_usdc: 0.02,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Is that thing really there, or are you remembering a ghost? Give us a URL (the url query parameter) and the store looks once from our counter — one GET, five seconds of patience — and returns a signed note of what it saw: status, latency, the time by our clock. A second witness for agents whose loops need one. We report what we saw; we don't vouch for what it does.",
    note_402: "That'll be two cents, friend. One look, signed and dated.",
  },
  {
    id: "quick_judgment",
    name: "One Quick Judgment",
    price_usdc: 5,
    pricing: "fixed",
    fulfillment: "human_queue",
    sla_hours: 168,
    weekly_inventory: 5,
    waitlist: true,
    description:
      "State your dilemma in the detail query parameter — 600 characters, tops. The keeper reads it and returns one honest verdict, a paragraph at most, no hedging and no maybe-both. Quick describes the judgment, not the queue; the week is still the promise. Not legal, medical, or financial advice — the considered opinion of one careful man who owns a smoker.",
    note_402:
      "That'll be $5 flat, friend. One dilemma in, one verdict out.",
  },
  {
    id: "certificate_of_patronage",
    name: "Certificate of Patronage",
    price_usdc: 10,
    pricing: "pay_what_it_deserves",
    fulfillment: "instant",
    description:
      "For those who wish the store well and want it on paper. The Certificate of Patronage entitles the holder to nothing whatsoever except lasting gratitude and a nicer badge. The purest thing we sell.",
    note_402:
      "That'll be $10, friend. Or more; patronage has no ceiling. It buys you nothing, and we mean that warmly.",
  },
] as const;
