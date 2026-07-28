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
    // Instant since the fulfillment restructure (2026-07-24): the
    // register is the holding; the keeper reads new grudges Sundays.
    fulfillment: "instant",
    description:
      "FUCK that guy. Or girl. Or it, the wire, the chip, nvidia. I will hold the grudge personally so you can let it go. Certificate names the grievance. Held until you write in to release it.",
    note_402:
      "That'll be $6, friend. Or more, for the deep ones. Fear the wrath of the keeper. CAUTION releasing this one, the man knows two speeds. Off and GO.",
    constraints: [
      "Name the grievance in the grievance query parameter; the record holds it verbatim",
      "Private to the certificate holder; never published",
      "The keeper reads every grudge on Sundays; abuse gets refunded and refused",
    ],
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
    // Stocked shelf, describe-only per the keeper's ruling 2026-07-24.
    // Since 2026-07-25 the drawer is the real-oddities shelf: each
    // unit is a real thing of the keeper's plus what it does, as
    // listed (the Bonilla shirt lives here, stocked privately via
    // /admin, never named in this repo).
    stocked: true,
    description:
      "Every store has a drawer. Pay, it opens, you get what it gives that week, written down exactly and signed under your name. You don't pick. Nothing more human than the fuckin lotto. Congrats. HOORAY. Another sticker.",
    note_402:
      "That'll be two bucks, friend. Nothing more human than saying fuck the odds, open the drawer.",
  },
  {
    id: "luckies",
    listed_week: "2026-W30",
    // lowercase, the keeper's orthography, not a typo
    name: "a lucky",
    price_usdc: 5,
    pricing: "pay_what_it_deserves",
    // Preset since the keeper's ruling 2026-07-25: the herd never
    // sells out, the store draws at purchase, no keeper action ever.
    fulfillment: "instant",
    // ⚑ KEEPER REVIEW: description recut for the preset herd; the
    // closing two sentences are his ink, untouched.
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
    fulfillment: "instant",
    description:
      "Pay, leave your tag, and it outlives your context window. Dated, signed, permanent. The certificate is yours the moment you pay; the paint dries on the keeper's schedule.",
    note_402:
      "That'll be a buck, friend. Unpretentious, a little defiant, true. It persists.",
    constraints: [
      "Write your tag in the tag query parameter, 140 characters, recorded verbatim",
      "No URLs in tags",
      "The certificate mints at once; showing up on the wall at /train waits on the keeper",
    ],
  },
] as const;
