import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { priceTiersUsdc } from "@/lib/payments";
import { parseVariantGid, variantGid } from "@/lib/ucp/ids";
import { toAtomicUsdc, toUcpUsdPrice, type UcpMoney } from "@/lib/ucp/money";
import { requireCommerce } from "@/store/commerce";
import { getMenuItem } from "@/store/menu";
import type { MenuItem } from "@/types";

/**
 * WHAT A BUYER AGREED TO, FROZEN, AND THE HASH THAT PROVES IT.
 *
 * The commercial transaction and the payment are different facts, and
 * the failure this separation exists to stop is precise: a verifier
 * that reconstructs what was bought FROM the amount that arrived. On a
 * shelf with three exact tiers per pay-what-it-deserves item, "$600
 * turned up, therefore the generous tier" means paying another tier's
 * legitimate price silently buys a different thing, and an
 * overpayment upgrades an order nobody upgraded.
 *
 * So the tier is chosen in the checkout BY ID, frozen into the
 * snapshot below, and the amount is re-derived from that id
 * server-side. A Complete payload never supplies a price; it supplies
 * a payment, which is then checked against the price this store
 * already decided.
 *
 * THE DIGEST IS NOT NEW MACHINERY. The store already binds a receipt to
 * the accepted x402 terms with a JCS-canonical sha256 (`quote`, signed
 * into every certificate). This is the same construction one level up:
 * it binds the COMMERCIAL terms — which checkout, which version, which
 * variant, which price — so that a settlement decision can be shown to
 * have been made against the terms the store actually issued rather
 * than against a convenient reading of them.
 */

export interface CheckoutLineTerms {
  /** The catalog variant id, exactly as Catalog handed it out. */
  variant_id: string;
  item_id: string;
  sku: string;
  /** Present only for pay-what-it-deserves items. */
  tier_index?: number;
  quantity: number;
  /** Re-derived from variant_id. Never taken from a request. */
  unit_price: UcpMoney;
  unit_amount_atomic: string;
  /** Which licence class and wording version this purchase is under. */
  license: { class: string; status: string; version: string };
}

export interface CheckoutTerms {
  checkout_id: string;
  checkout_version: number;
  currency: "USD";
  lines: CheckoutLineTerms[];
  total: UcpMoney;
  total_amount_atomic: string;
  expires_at: string;
}

export class UnknownVariant extends Error {
  constructor(readonly variantId: string) {
    super(`No purchasable variant "${variantId}" in this catalog.`);
    this.name = "UnknownVariant";
  }
}

/**
 * The licence wording is still a draft and the terms say so on the
 * wire. A checkout freezes WHICH version it bought under, so that
 * adopting the final wording later cannot retroactively change what a
 * past buyer agreed to.
 */
export const LICENSE_TERMS_VERSION = "2026-09-16-draft";

/**
 * Resolve a catalog variant id to the shelf item and the exact price
 * that variant means. This is the only place a price is derived, and
 * it derives it from `priceTiersUsdc` — the till's own tiers — rather
 * than from a table of its own.
 */
export function resolveVariant(variantId: string): {
  item: MenuItem;
  tierIndex?: number;
  usdc: number;
} {
  const parsed = parseVariantGid(variantId);
  if (!parsed) throw new UnknownVariant(variantId);
  const item = getMenuItem(parsed.itemId);
  if (!item || requireCommerce(item).visibility !== "core") {
    throw new UnknownVariant(variantId);
  }
  const tiers = priceTiersUsdc(item);
  if (parsed.tierIndex === undefined) {
    // A bare variant id on a tiered item is ambiguous, and guessing
    // the minimum would sell the cheapest thing to somebody who may
    // have meant otherwise. Refuse and let them name a tier.
    if (item.pricing === "pay_what_it_deserves") throw new UnknownVariant(variantId);
    const usdc = tiers[0];
    if (usdc === undefined) throw new UnknownVariant(variantId);
    return { item, usdc };
  }
  if (item.pricing !== "pay_what_it_deserves") throw new UnknownVariant(variantId);
  const usdc = tiers[parsed.tierIndex];
  if (usdc === undefined) throw new UnknownVariant(variantId);
  return { item, tierIndex: parsed.tierIndex, usdc };
}

export function lineTerms(variantId: string, quantity: number): CheckoutLineTerms {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error(`Line quantity must be a positive integer, not ${quantity}`);
  }
  const { item, tierIndex, usdc } = resolveVariant(variantId);
  const commerce = requireCommerce(item);
  return {
    // Canonicalised through variantGid so a checkout stores the store's
    // own spelling rather than whatever spelling arrived.
    variant_id: variantGid(item.id, tierIndex),
    item_id: item.id,
    sku:
      tierIndex === undefined
        ? commerce.sku
        : `${commerce.sku}-T${Math.round(usdc / item.price_usdc)}`,
    ...(tierIndex === undefined ? {} : { tier_index: tierIndex }),
    quantity,
    unit_price: toUcpUsdPrice(usdc),
    unit_amount_atomic: toAtomicUsdc(usdc),
    license: {
      class: commerce.license_policy,
      status: "draft",
      version: LICENSE_TERMS_VERSION,
    },
  };
}

/**
 * ONE LINE PER CHECKOUT, and the refusal is the honest kind.
 *
 * This shelf has no cart. Every item is a made thing or a service on a
 * named subject, several take required inputs that belong to one
 * purchase, and the till settles one exact amount per authorization.
 * A multi-line checkout would be a shape the store cannot fulfil,
 * offered because the protocol has a field for it.
 */
export const MAX_CHECKOUT_LINES = 1;

export function checkoutTerms(args: {
  checkoutId: string;
  version: number;
  lines: CheckoutLineTerms[];
  expiresAt: string;
}): CheckoutTerms {
  const total = args.lines.reduce(
    (sum, line) => sum + line.unit_price.amount * line.quantity,
    0,
  );
  const atomic = args.lines.reduce(
    (sum, line) => sum + BigInt(line.unit_amount_atomic) * BigInt(line.quantity),
    0n,
  );
  return {
    checkout_id: args.checkoutId,
    checkout_version: args.version,
    currency: "USD",
    lines: args.lines,
    total: { amount: total, currency: "USD" },
    total_amount_atomic: atomic.toString(),
    expires_at: args.expiresAt,
  };
}

/**
 * THE PAYMENT OBLIGATION A QUOTE COMMITS TO, and the digest over it.
 *
 * Every field the settlement decision depends on is in here, so a
 * later reader can prove the decision was made against the terms that
 * were issued. Nothing presentational is: a changed description must
 * not invalidate a signature, and a changed price must.
 */
export interface PaymentTerms {
  checkout_id: string;
  checkout_version: number;
  network: string;
  asset: string;
  amount_atomic: string;
  pay_to: string;
  expires_at: string;
}

export async function termsDigest(terms: PaymentTerms): Promise<string> {
  return sha256Hex(
    jcsCanonicalize({
      checkout_id: terms.checkout_id,
      checkout_version: terms.checkout_version,
      network: terms.network,
      /**
       * EVM addresses lowercased before hashing, Solana left alone —
       * the same rule discovery/receipt-surface.ts applies to the
       * x402 quote, for the same reason: an EVM address is one
       * identifier however it is cased, and base58 is not.
       */
      asset: terms.network.startsWith("eip155:")
        ? terms.asset.toLowerCase()
        : terms.asset,
      amount_atomic: terms.amount_atomic,
      pay_to: terms.network.startsWith("eip155:")
        ? terms.pay_to.toLowerCase()
        : terms.pay_to,
      expires_at: terms.expires_at,
    }),
  );
}
