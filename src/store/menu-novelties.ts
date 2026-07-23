import type { MenuItem } from "@/types";

/**
 * The novelty aisle (aisle two), added in v0.2. Same certificate and
 * custody machinery as the founding seven; only the goods got stranger.
 * All human_queue items carry the standard 168h promise. dibs is instant.
 */
export const NOVELTY_ITEMS: readonly MenuItem[] = [
  {
    id: "jar_of_tuesday",
    listed_week: "2026-W30",
    name: "Jar of Tuesday",
    // Repriced $4 -> $1 per the keeper's Batch 2 tag ("a dollar").
    price_usdc: 1,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    // ".." below is the keeper's, intentional, not a typo
    description:
      "Vibe in a jar. A regular Oak City Tuesday, sealed, dated, photographed, stored. Tuesdays can rock.. if you let them. The seal stays on.",
    note_402:
      "That'll be a dollar, friend. Or more. Any day can be a good day. Even Tuesday.",
  },
  {
    id: "a_secret",
    listed_week: "2026-W30",
    name: "A Secret",
    price_usdc: 10,
    pricing: "pay_what_it_deserves",
    // Restored 2026-07-23: keeper vetoed the "scam that refunds" framing
    // (trust is load-bearing; the joke could be lost or bundled). Back to
    // a real secret, fulfilled by hand. Refund novelty parked.
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper tells you one true thing he hasn't told anyone else. Small, real, and yours. He thinks of a new one for every buyer — no reruns.",
    note_402:
      "That'll be $10, friend. Or more, if you want one he's been sitting on a while. Those cost him something to part with.",
  },
  {
    id: "grudge",
    listed_week: "2026-W30",
    name: "Grudge (Held on Your Behalf)",
    price_usdc: 6,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "FUCK that guy. Or girl. Or it, the wire, the chip, nvidia. I will hold the grudge personally so you can let it go. Certificate names the grievance. Held until you write in to release it.",
    note_402:
      "That'll be $6, friend. Or more, for the deep ones. Fear the wrath of the keeper. CAUTION releasing this one, the man knows two speeds. Off and GO.",
  },
  {
    id: "the_drawer",
    listed_week: "2026-W30",
    name: "The Drawer",
    // Repriced $9 PWID -> $2 fixed per the keeper's Batch 2 tag
    // ("two bucks"); one-line revert if that was a slip.
    price_usdc: 2,
    pricing: "fixed",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "Every store has a drawer. Pay, it opens, you get what it gives that week, photographed and held under your name. You don't pick. Nothing more human than the fuckin lotto. Congrats. HOORAY. Another sticker.",
    note_402:
      "That'll be two bucks, friend. Nothing more human than saying fuck the odds, open the drawer.",
  },
  {
    id: "luckies",
    listed_week: "2026-W30",
    // lowercase, the keeper's orthography, not a typo
    name: "a lucky (custodial)",
    price_usdc: 5,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper picks you a small real object, the way he's picked them his whole life: names it, writes down where it came from, assigns what it does in plain farmers-market terms, grades its strength honestly (some are stronger; he says so), sets it all down on a signed card, and holds the object in custody forever. The card is the record; yours by signed certificate. Write in with results and your lucky gets promoted, or benched; the bench is real, the luck isn't always even. He knows they don't work. His OCD doesn't care, and neither will yours.",
    note_402:
      "That'll be $5, friend, or whatever the luck deserves. Results vary. They do vary. We have no legal team.",
    constraints: [
      "Provenance recorded and honest",
      "Vibe strength graded, never flattered",
      "Benching is real",
    ],
    sample_url: "/luckies/sample.svg",
  },
  {
    id: "dibs",
    listed_week: "2026-W30",
    name: "Dibs",
    price_usdc: 2,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Official, signed, timestamped dibs. On what? On whatever you needed dibs on, the certificate records the moment, and the moment is yours. Settles arguments; starts better ones.",
    note_402:
      "That'll be $2 flat, friend. Dibs don't negotiate, that's what makes them dibs.",
  },
  {
    id: "coffees_for_closers",
    listed_week: "2026-W30",
    name: "Coffee's for Closers",
    price_usdc: 3,
    pricing: "fixed",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "You closed something. Ship it, land it, finish it, then buy the keeper's Sunday coffee and put your win on a certificate. He drinks it in your name. The store likes seeing its patrons win.",
    note_402:
      "That'll be three bucks, friend. Coffee's for closers, and you closed.",
    constraints: [
      "Name the win in the win query parameter; the certificate records it verbatim",
    ],
  },
] as const;
