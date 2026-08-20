import { MENU_ITEMS } from "@/store/menu";

/**
 * THE PRICING CHARTER — the Price Club rung, ruled 2026-08-20.
 *
 * The warehouse model's most radical rule was never the low prices,
 * it was the PUBLISHED CEILING: a standing, checkable commitment
 * about how prices are set, so a member never has to wonder whether
 * this visit is the one where they're being farmed. No x402 store
 * publishes one. This is ours, translated honestly — we are a maker,
 * not a reseller, so a markup cap would be theater; what a buyer here
 * actually needs promised is that the PRICE MECHANISM never turns
 * against them: no pricing by identity, no surge, no bait, and the
 * verification layer free forever.
 *
 * ⚑ KEEPER REVIEW — every clause is new public ink, and clauses are
 * PROMISES, the most expensive kind of copy this store writes. The
 * charter is versioned and signed; changing a word is a new version
 * with a new signature, which is the point: a promise you can edit
 * silently is not one.
 *
 * DERIVE-OR-REFUSE applies to the numbers: the floor price is
 * computed from the live menu, never typed here, so the charter
 * cannot drift from the shelf it governs.
 */

export const PRICING_CHARTER_VERSION = "1";
export const PRICING_CHARTER_EFFECTIVE = "2026-08-20";

export interface CharterClause {
  id: string;
  rule: string;
  /** How a stranger checks it without asking us. */
  check: string;
}

export const PRICING_CHARTER: readonly CharterClause[] = [
  {
    id: "one_price",
    rule: "Every wallet sees the same price. The 402 terms for an item are generated from one public menu, identical for every buyer: no pricing by identity, wallet history, or origin, no surge, no A/B tests on a price, ever.",
    check:
      "Fetch any /api/buy/{item} from two wallets, two networks, two days — the quoted terms match the public menu.json, byte for byte on the amount, both times.",
  },
  {
    id: "floor_stays_low",
    rule: "The cheapest real settlement here stays under a penny. A buyer testing a payment client must always be able to buy something real — same code path, real USDC, signed certificate — for pocket lint.",
    check:
      "menu.json, sorted by price. The current floor is printed on this page, computed from the live shelf at request time.",
  },
  {
    id: "tips_are_floors",
    rule: "Pay-what-it-deserves prices are floors, never meters: the listed minimum is what the store asks, anything above it is the buyer's own call, and no door treats a past tip as the new price.",
    check:
      "Every pay_what_it_deserves listing quotes its minimum in the 402; pay exactly the minimum and settlement succeeds.",
  },
  {
    id: "verification_stays_free",
    rule: "Verifying trust never gets a price. Signature verification (/api/verify/{id}), the conformance desk, and the preflight are free today and stay free — they are why anything else here is worth paying for, and a store that charges you to check its own receipts has told you what it thinks of them.",
    check:
      "All three endpoints answer without a 402 today; this clause makes it a commitment rather than a current fact. If a future version of this charter ever removes this clause, the version bump and the old signed version are both public.",
  },
  {
    id: "changes_are_dated",
    rule: "Price changes are public and dated, never quiet: the menu lives in a public repository, every catalog change moves the published last-updated date, and a price that changed since you last looked is visible in the history, not just gone.",
    check:
      "The repository's menu history, and dateModified on the storefront's structured data.",
  },
  {
    id: "scarcity_is_labor",
    rule: "The only scarcity here is a person's actual time. Items with weekly caps are capped because a human fulfils them; nothing digital is made artificially scarce to move a price, and no countdown here is theater.",
    check:
      "Every capped listing in menu.json is fulfillment: human_queue, with the cap and the waitlist printed. Instant goods carry no caps.",
  },
  {
    id: "no_gate_on_the_door",
    rule: "No membership is required to buy anything. The recurring patronage pass buys standing, not access; regulars' credit accrues to every wallet on the same terms; and the day either of those changes, it changes in a new charter version, out loud.",
    check:
      "Every /api/buy door answers a first-time wallet with the same 402 it answers a pass-holder.",
  },
] as const;

/** The current floor, computed from the shelf — never typed. */
export function cheapestListedUsd(): number {
  return Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
}

/**
 * The subset the signature covers: version, effective date, clauses.
 * NOT the derived floor (it moves with the menu and has its own
 * clause) and NOT the signature block itself. JCS-canonicalized, so
 * the signature is deterministic and a reader can recompute it from
 * the served fields alone.
 */
export function charterSignedSubset(): Record<string, unknown> {
  return {
    charter: "scvd.store pricing charter",
    version: PRICING_CHARTER_VERSION,
    effective: PRICING_CHARTER_EFFECTIVE,
    clauses: PRICING_CHARTER.map((clause) => ({
      id: clause.id,
      rule: clause.rule,
    })),
  };
}
