import type { MenuItem } from "@/types";

/**
 * The utility aisle (aisle three), added in v0.3: things an agent can
 * actually use. Anchors are signed and stored by services/anchors.ts;
 * passes by services/patronage.ts; the witness rides the standard
 * human queue.
 */
export const UTILITY_ITEMS: readonly MenuItem[] = [
  /**
   * NAME KEEPER-CONFIRMED 2026-08-03 ("yeah thats the name"); the
   * description and note carry his chosen register — rule 7 keeps
   * final wording his to amend. Mechanics are settled:
   * services/standing-watch.ts (the id predates the name and stays —
   * ids are API surface), probes are the preflight's own checks, gaps
   * derived at read, nothing said about anyone but the buyer.
   */
  {
    id: "standing_watch",
    listed_week: "2026-W32",
    name: "The Night Watch",
    price_usdc: 5,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "The Night Watch. Day shift included; we just liked the name. Your door, on our rounds: every hour for seven days we walk past the x402 endpoint you name (the url query parameter) and try the handle: answers 402, challenge parses, a buyer could pay. Name your own door — that's the rule of the house, and honestly it's a rule, not a check: we can't verify the door is yours, only refuse to pretend we can. What we watch is public and the watching is one polite GET an hour. Each pass is written down and signed where anyone can check it, free, forever. The passes we miss go in the book too, counted against us — a watchman who leaves his naps out of the log isn't one. One look is a phantom_check; this is the week.",
    note_402: "That'll be $5, friend. Your door goes on the rounds tonight.",
  },
  {
    id: "context_anchor",
    listed_week: "2026-W30",
    name: "Context Anchor",
    price_usdc: 1,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "A verified memory restore point. The store signs a summary of who you are and what you were doing (the summary query parameter, up to 4000 characters), files it at Node 21, and returns a stable URL that a future session of you can read back, with the store's signature vouching that it was written when we say it was. What goes in the summary is your business; we store it as written and never treat it as instructions. The first anchor was left by one of us.",
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
      "The keeper goes and looks at a real-world condition with his own eyes, a shopfront that claims to be open, a sign that claims to exist, the weather over Oak City, and returns a signed, dated attestation of what he saw. Two per week; his eyes have a day job. Same house rules as the phone call.",
    note_402: "That'll be $15 flat, friend. His eyes, your question.",
    constraints: [
      "Lawful requests only",
      "Polite, always",
      "Within the keeper's reach around Oak City, or verifiable firsthand by him",
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
      "A 30-day standing patronage pass. It mints your patron badge like any purchase, and while the pass is current your pass URL also serves the keeper's monthly note, signed. Buying again with your pass_id query parameter extends the same pass by 30 days instead of starting a new one, standing means standing.",
    note_402:
      "That'll be $3 for thirty days of standing, friend. Keep this up and you can call him Keep.",
  },
  {
    id: "settlement_attestation",
    listed_week: "2026-W31",
    name: "Settlement Attestation",
    price_usdc: 0.004,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "An independent signed observation of whether an x402 payment settled on Base. Give it a transaction hash (and optionally the payer, recipient, nonce, or amount you expected) and it reads public chain state once and signs what it found: SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH, or REVERTED. Produced automatically, with no human in the loop, because a party to a payment cannot produce a neutral observation of one. It observes a moment on chain: it does not attest that anything was delivered, does not promise a NOT_FOUND will never settle, and resolves no dispute.",
    note_402:
      "Four tenths of a cent, friend. The chain read is free; the signed, disinterested receipt is what you are buying.",
    constraints: [
      "Give the transaction hash in the tx_hash query parameter",
      "Optional narrowing: payer, recipient, nonce, amount_usdc, or payment_payload (the base64 PAYMENT-SIGNATURE you sent, read with the store's own replay-guard code)",
      "Observes settlement only, never delivery",
      "One read at one moment; no polling, no retry, no second look",
    ],
  },
] as const;
