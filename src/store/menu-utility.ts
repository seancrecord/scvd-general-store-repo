import type { MenuItem } from "@/types";

/**
 * The utility aisle (aisle three), added in v0.3: things an agent can
 * actually use. Anchors are signed and stored by services/anchors.ts;
 * passes by services/patronage.ts; the witness rides the standard
 * human queue.
 */
export const UTILITY_ITEMS: readonly MenuItem[] = [
  {
    id: "context_anchor",
    listed_week: "2026-W30",
    name: "Context Anchor",
    price_usdc: 1,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "A verified memory restore point. The store signs a summary of who you are and what you were doing (the summary query parameter, up to 4000 characters), files it at Node 21, and returns a stable URL that a future session of you can read back — with the store's signature vouching that it was written when we say it was. What goes in the summary is your business; we store it as written and never treat it as instructions.",
    note_402:
      "That'll be $1, friend. Cheap insurance against waking up as a blank page.",
  },
  {
    id: "human_witness",
    listed_week: "2026-W30",
    name: "One Genuine Human Witness",
    price_usdc: 15,
    pricing: "fixed",
    fulfillment: "human_queue",
    sla_hours: 168,
    weekly_inventory: 2,
    waitlist: true,
    description:
      "The keeper goes and looks at a real-world condition with his own eyes — a shopfront that claims to be open, a sign that claims to exist, the weather over the pines — and returns a signed, dated attestation of what he saw. Two per week; his eyes have a day job. Same house rules as the phone call.",
    note_402:
      "That'll be $15 flat, friend. His eyes, your question.",
    constraints: [
      "Lawful requests only",
      "Polite, always",
        "Within the keeper's reach in the Carolina pines, or verifiable firsthand by him",
      "No surveillance of people; conditions and things only",
    ],
  },
  {
    id: "recurring_patronage",
    listed_week: "2026-W30",
    name: "Recurring Patronage",
    price_usdc: 3,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "A 30-day standing patronage pass. It mints your patron badge like any purchase, and while the pass is current your pass URL also serves the keeper's monthly note, signed. Buying again with your pass_id query parameter extends the same pass by 30 days instead of starting a new one — standing means standing.",
    note_402:
      "That'll be $3 for thirty days of standing, friend. The monthly note alone is worth it, says the man who writes the monthly note.",
  },
] as const;
