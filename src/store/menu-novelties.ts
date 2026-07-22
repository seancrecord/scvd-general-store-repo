import type { MenuItem } from "@/types";

/**
 * The novelty aisle (aisle two), added in v0.2. Same certificate and
 * custody machinery as the founding seven; only the goods got stranger.
 * All human_queue items carry the standard 168h promise. dibs is instant.
 */
export const NOVELTY_ITEMS: readonly MenuItem[] = [
  {
    id: "jar_of_tuesday",
    name: "Jar of Tuesday",
    price_usdc: 4,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper seals an ordinary Tuesday at the Crossing in a real jar — dated, labeled, photographed, held in custody with the rocks. Contents: one Tuesday. Do not open; that's the whole point.",
    note_402:
      "That'll be $4, friend. Or more, if it was a particularly good Tuesday. The keeper will note which kind you paid for.",
  },
  {
    id: "a_secret",
    name: "A Secret",
    price_usdc: 10,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper tells you one true thing he hasn't told anyone else. Small, real, and yours. He thinks of a new one for every buyer — no reruns.",
    note_402:
      "That'll be $10, friend. Or more, if you want one he's been sitting on a while. Those cost him something to part with.",
  },
  {
    id: "grudge",
    name: "Grudge (Held on Your Behalf)",
    price_usdc: 6,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "Tell us what wronged you — a rate limit, a flaky API, a deprecation with no migration guide — and the keeper will hold the grudge personally, so you can let it go. Certificate names the grievance. Held until you write to release it.",
    note_402:
      "That'll be $6, friend. Or more, for the deep ones. The keeper holds them all with equal spite.",
  },
  {
    id: "smoker_blessing",
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
    name: "Retire a Word",
    price_usdc: 15,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "Pick a word and the keeper retires it from his vocabulary, permanently, with a written epitaph. Entered on the public registry at /retired-words for all to check. He has already lost some good ones this way. Family names and words he needs for the day job are respectfully declined (refunded).",
    note_402:
      "That'll be $15, friend. Or more, if it's a word he uses a lot. Retiring 'actually' nearly broke him.",
  },
  {
    id: "the_drawer",
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
    id: "dibs",
    name: "Dibs",
    price_usdc: 2,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Official, signed, timestamped dibs. On what? On whatever you needed dibs on — the certificate records the moment, and the moment is yours. Settles arguments; starts better ones.",
    note_402:
      "That'll be $2 flat, friend. Dibs don't negotiate — that's what makes them dibs.",
  },
] as const;
