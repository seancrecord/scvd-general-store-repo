import { checkoutDocument } from "@/lib/ucp/checkout/document";
import { checkoutTerms, lineTerms, type PaymentTerms } from "@/lib/ucp/checkout/terms";
import { variantGid } from "@/lib/ucp/ids";
import { quotedUsdcHandler } from "@/lib/ucp/payments/usdc-x402";
import { ucpProfile } from "@/lib/ucp/profile";
import type { StoredCheckout } from "@/services/ucp-checkout-store";
import { lookupResponse, searchResponse } from "@/lib/ucp/responses";
import { coreCommerceItems, requireCommerce } from "@/store/commerce";
import type { Env } from "@/types";

/**
 * THE DOCUMENTS THE CONFORMANCE GATE VALIDATES, built from the same
 * code the Worker serves.
 *
 * Not fixtures. A fixture is a photograph of what the store emitted on
 * the day somebody regenerated it, and a conformance gate pointed at a
 * photograph passes for the wrong reason. These call the real builders.
 *
 * The env is a stand-in with every rail configured, because the profile
 * is generated from whichever rails have a receiving wallet and the
 * gate should validate the widest document the store can emit rather
 * than the narrowest. The addresses are obviously-fake constants, never
 * secrets: the shapes are what is under test.
 */
const SAMPLE_EVM = "0x1111111111111111111111111111111111111111";
const SAMPLE_SOLANA = "11111111111111111111111111111111";

function sampleEnv(base: string): Env {
  return {
    STORE_BASE_URL: base,
    PAY_TO_ADDRESS: SAMPLE_EVM,
    POLYGON_PAY_TO: SAMPLE_EVM,
    ARBITRUM_PAY_TO: SAMPLE_EVM,
    WORLD_PAY_TO: SAMPLE_EVM,
    SOLANA_PAY_TO: SAMPLE_SOLANA,
  } as unknown as Env;
}

export function profileSample(base: string): unknown {
  return ucpProfile(sampleEnv(base));
}

/** The whole shelf, so every product and variant is validated. */
export function searchSample(base: string): unknown {
  return searchResponse(base, "", coreCommerceItems().length);
}

/**
 * A batch that exercises every resolution path the lookup response can
 * report: a shelf id, a handle, an SKU, a tier SKU, an item that is
 * real but excluded from this catalog, and one that does not exist.
 */
export function lookupSample(base: string): unknown {
  const excluded = coreCommerceItems();
  const first = excluded[0]!;
  return lookupResponse(base, [
    "service_audit",
    "service-audit",
    requireCommerce(first).sku,
    "SCVD-THE-COLLAB-T5",
    "gid://scvd.store/Variant/hello",
    "spot_check",
    "no-such-product",
  ]);
}

const EXPIRES = "2026-09-16T12:30:00.000Z";

function storedCheckout(overrides: Partial<StoredCheckout> = {}): StoredCheckout {
  const lines = [lineTerms(variantGid("the_collab", 1), 1)];
  const terms: PaymentTerms = {
    checkout_id: "chk_sample",
    checkout_version: 1,
    network: "eip155:8453",
    asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    amount_atomic: checkoutTerms({
      checkoutId: "chk_sample",
      version: 1,
      lines,
      expiresAt: EXPIRES,
    }).total_amount_atomic,
    pay_to: SAMPLE_EVM,
    expires_at: EXPIRES,
  };
  return {
    id: "chk_sample",
    version: 1,
    status: "ready_for_complete",
    created_at: "2026-09-16T12:00:00.000Z",
    expires_at: EXPIRES,
    lines,
    quote: { terms, digest: "d".repeat(64) },
    ...overrides,
  };
}

function handlersFor(base: string, checkout: StoredCheckout) {
  const quote = checkout.quote;
  if (!quote) return {};
  return quotedUsdcHandler(sampleEnv(base), base, {
    network: quote.terms.network,
    amount_atomic: quote.terms.amount_atomic,
    checkout_id: quote.terms.checkout_id,
    checkout_version: quote.terms.checkout_version,
    expires_at: quote.terms.expires_at,
    terms_digest: quote.digest,
  });
}

/** A checkout holding a live quote: the state a platform pays from. */
export function checkoutSample(base: string): unknown {
  const checkout = storedCheckout();
  return checkoutDocument(checkout, base, { paymentHandlers: handlersFor(base, checkout) });
}

/**
 * A completed checkout, which must carry its order — the one shape
 * where omitting a field describes a state the protocol does not have.
 */
export function completedCheckoutSample(base: string): unknown {
  const checkout = storedCheckout({
    status: "completed",
    order: {
      id: "ord_sample",
      permalink_url: `${base}/api/order/ord_sample`,
      created_at: "2026-09-16T12:05:00.000Z",
    },
  });
  return checkoutDocument(checkout, base, { paymentHandlers: handlersFor(base, checkout) });
}
