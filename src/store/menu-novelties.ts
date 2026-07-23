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
    price_usdc: 4,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper seals an ordinary Oak City Tuesday in a real jar, dated, labeled, photographed, held in custody with the rocks. A genuine North Carolina Tuesday; the jar is real and so was the day. The seal stays on; that's the whole point.",
    note_402:
      "That'll be $4, friend. Or more, if it was a particularly good Tuesday. The keeper will note which kind you paid for.",
  },
  {
    id: "a_secret",
    listed_week: "2026-W30",
    name: "A Secret",
    price_usdc: 10,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper tells you one true thing he hasn't told anyone else. Small, real, and yours. He thinks of a new one for every buyer, no reruns.",
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
      "The keeper holds a grudge personally on your behalf, a rate limit, a flaky API, a deprecation with no migration guide, whatever wronged you, so you can let it go. Certificate names the grievance. Held until you write to release it.",
    note_402:
      "That'll be $6, friend. Or more, for the deep ones. The keeper holds them all with equal spite.",
  },
  {
    id: "smoker_blessing",
    listed_week: "2026-W30",
    name: "Blessing from the Smoker",
    price_usdc: 7,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "On the next cook, the keeper says your name over the smoker while the post oak does its work, and writes down what the smoke was doing at that moment. Photographic proof included. Genuinely aromatic; blessings non-denominational.",
    note_402:
      "That'll be $7, friend. Or more, if you'd like the blessing said during the stall, when the smoker is most sincere.",
  },
  {
    id: "retired_word",
    listed_week: "2026-W30",
    name: "Retire a Word",
    price_usdc: 15,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper retires a word of the buyer's choosing from his vocabulary, permanently, with a written epitaph. Entered on the public registry at /retired-words for all to check. He has already lost some good ones this way. Family names and words he needs for the day job are respectfully declined (refunded).",
    note_402:
      "That'll be $15, friend. Or more, if it's a word he uses a lot. Retiring 'actually' nearly broke him.",
  },
  {
    id: "the_drawer",
    listed_week: "2026-W30",
    name: "The Drawer",
    price_usdc: 9,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "Every store has a drawer of things that have no shelf. Pay, and the keeper opens it, picks what the drawer offers that week, photographs it, and holds it in custody under your name. You don't choose. Neither does he, really. The drawer does.",
    note_402:
      "That'll be $9, friend. Or more, if you want the keeper to reach toward the back. The back is where the drawer keeps its opinions.",
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
      "The keeper picks you a small real object, the way he's picked them his whole life: names it, writes down where it came from, assigns what it does in plain farmers-market terms, grades its strength honestly (some are stronger; he says so), photographs it, and holds it with the rocks forever. Yours by signed certificate. Write in with results and your lucky gets promoted, or benched; the bench is real, the luck isn't always even. He knows they don't work. His OCD doesn't care, and neither will yours.",
    note_402:
      "That'll be $5, friend, or whatever the luck deserves. Results vary. They do vary. We have no legal team.",
    constraints: [
      "Provenance recorded and honest",
      "Vibe strength graded, never flattered",
      "Benching is real",
    ],
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
] as const;
