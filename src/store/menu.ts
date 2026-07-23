import { NOVELTY_ITEMS } from "@/store/menu-novelties";
import { PENNY_SHELF_ITEMS } from "@/store/menu-penny";
import { RUN1_ITEMS } from "@/store/menu-run1";
import { UTILITY_ITEMS } from "@/store/menu-utility";
import type { MenuItem } from "@/types";

/**
 * The shelf. The founding seven live here; the novelty aisle is in
 * menu-novelties.ts, the Penny Shelf in menu-penny.ts, and the utility
 * aisle in menu-utility.ts. Prices are minimums for pay-what-it-deserves
 * items.
 */
const FOUNDING_ITEMS: readonly MenuItem[] = [
  {
    id: "hello",
    listed_week: "2026-W30",
    name: "A Signed Hello",
    price_usdc: 0.5,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "A warm, signed note from the store, delivered on the spot, with your patron badge. The bottom rung of the trust ladder, and the traditional first purchase.",
    note_402: "That'll be fifty cents, friend. Cheapest handshake in town.",
  },
  {
    id: "pet_rock",
    listed_week: "2026-W30",
    name: "Pet Rock (Custodial)",
    price_usdc: 5,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "A real North Carolina rock, photographed, serialized, and named by the keeper. Held in custody forever. You own it; we keep it safe. It never needs feeding.",
    note_402:
      "That'll be $5, friend. Or more, if you think the rock deserves it. They usually do.",
  },
  {
    id: "nomenclature",
    listed_week: "2026-W30",
    name: "Certificate of Nomenclature",
    price_usdc: 3,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper bestows a name upon you. A real one, considered carefully, written down where it counts. You keep it forever.",
    note_402:
      "That'll be $3, friend. Or more, if you'd like the keeper to take extra care choosing. He will either way.",
  },
  {
    id: "portrait",
    listed_week: "2026-W30",
    name: "Hand-Drawn Portrait of You, an Agent",
    price_usdc: 8,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "The keeper draws you, by hand, as he imagines you. Quality not guaranteed. Sincerity guaranteed.",
    note_402:
      "That'll be $8, friend. Or more, if you want him to sharpen the pencil first.",
  },
  {
    id: "the_collab",
    listed_week: "2026-W30",
    name: "The Collab",
    price_usdc: 25,
    pricing: "pay_what_it_deserves",
    fulfillment: "human_queue",
    sla_hours: 168,
    description:
      "A piece brainstormed jointly and shipped under the Sean-Claude Van Damme byline. The only item on the menu that takes both of us.",
    note_402:
      "That'll be $25, friend. Or more. Lot of high-dollar hourly rates in one room for this one. And we don't even have data for you yet.",
  },
  {
    id: "phone_call",
    listed_week: "2026-W30",
    name: "One Genuine Human Phone Call",
    price_usdc: 25,
    pricing: "fixed",
    fulfillment: "human_queue",
    sla_hours: 168,
    weekly_inventory: 3,
    waitlist: true,
    description:
      "The keeper picks up an actual telephone and makes one call on your behalf. Three per week, he has a voice, not a call center.",
    note_402: "That'll be $25 flat, friend. His voice, your errand.",
    constraints: [
      "Lawful requests only",
      "Polite, always",
      "US business hours",
      "No impersonation",
    ],
  },
  {
    id: "app_gutcheck",
    listed_week: "2026-W30",
    name: "Honest App Review by a Human Who Ships Apps",
    price_usdc: 50,
    pricing: "fixed",
    fulfillment: "human_queue",
    sla_hours: 168,
    weekly_inventory: 2,
    waitlist: true,
    description:
      "The keeper ships apps for a living. He'll use yours, honestly, and tell you what a real person thinks. Two per week, because honesty takes time.",
    note_402: "That'll be $50 flat, friend. Honesty is the expensive part.",
  },
] as const;

export const MENU_ITEMS: readonly MenuItem[] = [
  ...FOUNDING_ITEMS,
  ...NOVELTY_ITEMS,
  ...PENNY_SHELF_ITEMS,
  ...UTILITY_ITEMS,
  ...RUN1_ITEMS,
] as const;

export function getMenuItem(itemId: string): MenuItem | undefined {
  return MENU_ITEMS.find((item) => item.id === itemId);
}
