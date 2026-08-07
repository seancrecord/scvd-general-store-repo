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
      "Day shift included; we just liked the name. Every hour for seven days we walk past the x402 endpoint you name (the url query parameter) and try the handle: answers 402, challenge parses, a buyer could pay. Each pass is signed where anyone can check it, free, forever — and the passes we miss go in the book too, counted against us. A watchman who leaves his naps out of the log isn't one. Name your own door; that's a rule of the house, not a check we can run. This is the week-long look, hour by hour, signed.",
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
  /**
   * THE FIRST MARKETPLACE-ERA ITEM (2026-08-07, the keeper's "work
   * those bit by bit" on MARKETPLACE_AUDIT Part 6 step 3). Demand
   * tag: ANTICIPATED DEMAND under rule 19 as amended — service
   * operators proving honesty to their buyers need attestations at
   * volume, not one at a time; the pipeline scoring is in the audit.
   * Deliberately STATELESS: one payment, N observations, everything
   * delivered in the response — no stored balance, no future
   * obligation, so it is pure rule-23a observation with nothing for
   * the carve-out to even carry. ⚑ KEEPER REVIEW: name and copy are
   * drafted, not canon; recut freely.
   */
  {
    id: "attestation_bundle",
    listed_week: "2026-W32",
    name: "A Sheaf of Attestations",
    price_usdc: 0.05,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Up to 20 settlement attestations in one purchase. Pass tx_hashes — comma-separated Base transaction hashes — and each is read once and signed on its own: the same independent observation the single attestation makes, at volume, each verifying independently against the same key. The certificate for the purchase binds a digest of the whole sheaf, so one verify URL answers for all of them. Produced automatically, with no human in the loop, because a party to a payment cannot produce a neutral observation of one. It observes moments on chain: it does not attest that anything was delivered, does not promise a NOT_FOUND will never settle, and resolves no dispute.",
    note_402:
      "A nickel for the sheaf, friend. Up to 20 signed receipts, and the chain reads are on the house.",
    constraints: [
      "Give 2 to 20 Base transaction hashes in the tx_hashes query parameter, comma-separated, no duplicates",
      "Each hash is observed once and signed on its own; the bundle is a purchase shape, not a different artifact",
      "Observes settlement only, never delivery",
      "One read per hash at one moment; no polling, no retry, no second look",
      "Per-hash narrowing (payer, recipient, nonce, amount) is the single attestation's feature; the sheaf takes hashes only",
    ],
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
