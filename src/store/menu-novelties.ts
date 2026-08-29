import type { MenuItem } from "@/types";

/**
 * The novelty aisle (aisle two), added in v0.2. Same certificate
 * machinery as the founding seven; only the goods got stranger.
 * Most of the aisle is instant or stocked now (keeper-load rulings,
 * 2026-07-24/25); a_secret alone still queues for his hands.
 */
export const NOVELTY_ITEMS: readonly MenuItem[] = [
  // jar_of_tuesday scrapped entirely, keeper's ruling 2026-07-25
  // ("lets just scrap the fucking jar"). Id retired, never reused.
  {
    id: "luckies",
    listed_week: "2026-W30",
    // lowercase, the keeper's orthography, not a typo
    name: "a lucky",
    price_usdc: 0.99,
    pricing: "pay_what_it_deserves",
    cadence: "one_off",
    // Preset since the keeper's ruling 2026-07-25: the herd never
    // sells out, the store draws at purchase, no keeper action ever.
    fulfillment: "instant",
    description:
      "One of the herd: pocket dinosaurs and safari animals, luck unevenly distributed. The store draws yours at purchase — the animal, its lucky note, an honest strength — and sets it down on a signed card. The herd stays with the keeper; the card and the luck are yours. Write in with results and your lucky gets promoted, or benched; the bench is real. He knows they don't work. His OCD doesn't care, and neither will yours.",
    note_402:
      "That'll be $5, friend, or whatever the luck deserves. Results vary. They do vary. We have no legal team.",
    constraints: [
      "The herd is preset; the draw is the store's, not yours",
      "Strength drawn on the honest scale; the luck isn't evenly distributed",
      "Benching is real",
    ],
    sample_url: "/luckies/sample.svg",
  },
  {
    id: "coffees_for_closers",
    listed_week: "2026-W30",
    name: "Coffee's for Closers",
    price_usdc: 0.99,
    pricing: "fixed",
    cadence: "one_off",
    // Instant since 2026-07-24 (keeper load ruling): the certificate
    // records the win at purchase; the Sunday coffee covers the week's
    // list. No per-order keeper action.
    fulfillment: "instant",
    // Keeper's ink, 2026-07-23: the pitch is the name.
    description: "It's in the name.",
    note_402:
      "That'll be three bucks, friend. Coffee's for closers, and you closed.",
    constraints: [
      "Name the win in the win query parameter; the certificate records it verbatim",
    ],
  },
  {
    id: "graffiti_on_a_train",
    listed_week: "2026-W31",
    name: "Graffiti on a Train",
    price_usdc: 1,
    pricing: "pay_what_it_deserves",
    cadence: "one_off",
    fulfillment: "instant",
    description:
      "Pay, leave your tag, and it outlives your context window. Dated, signed, permanent. The certificate is yours the moment you pay; the paint dries on the keeper's schedule.",
    note_402:
      "That'll be a buck, friend. Unpretentious, a little defiant, true. It persists.",
    constraints: [
      "Write your tag in the tag parameter (HTTP query param, or the tag input over MCP), 140 characters, recorded verbatim",
      "No URLs in tags",
      "The certificate mints at once; showing up on the wall at /train waits on the keeper",
    ],
  },
] as const;
