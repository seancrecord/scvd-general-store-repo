import { checkoutDocument } from "@/lib/ucp/checkout/document";
import { orderDocument, type StoredUcpOrder } from "@/lib/ucp/order/document";
import { orderIdOf } from "@/lib/ucp/ids";
import { checkoutTerms, lineTerms, type PaymentTerms } from "@/lib/ucp/checkout/terms";
import { variantGid } from "@/lib/ucp/ids";
import { PWID_TIER_LABELS } from "@/lib/payments";
import { quotedUsdcHandler } from "@/lib/ucp/payments/usdc-x402";
import { ucpProfile } from "@/lib/ucp/profile";
import type { StoredCheckout } from "@/services/ucp-checkout-store";
import { lookupResponse, productResponse, searchResponse } from "@/lib/ucp/responses";
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

function sampleEnv(base: string, launch: "open" | "closed" = "open"): Env {
  return {
    STORE_BASE_URL: base,
    PAY_TO_ADDRESS: SAMPLE_EVM,
    POLYGON_PAY_TO: SAMPLE_EVM,
    ARBITRUM_PAY_TO: SAMPLE_EVM,
    WORLD_PAY_TO: SAMPLE_EVM,
    SOLANA_PAY_TO: SAMPLE_SOLANA,
    /**
     * The launch switch, both ways: the gate validates the profile a
     * launched deployment serves (checkout and order advertised) and
     * the one the shipped default serves (neither), because both are
     * documents this code emits and both must conform. The durable
     * binding is a truthy stand-in; the profile only asks whether it
     * is bound.
     */
    ...(launch === "open"
      ? { UCP_CHECKOUT_ENABLED: "true", PAID_RECOVERIES: {} }
      : { UCP_CHECKOUT_ENABLED: "false" }),
  } as unknown as Env;
}

/** The profile with checkout and order advertised: what a launched deployment serves. */
export function profileSample(base: string): unknown {
  return ucpProfile(sampleEnv(base, "open"));
}

/** The profile with the switch off: what ships until the launch is qualified. */
export function closedProfileSample(base: string): unknown {
  return ucpProfile(sampleEnv(base, "closed"));
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

/**
 * GET PRODUCT, on the one product that actually has an option axis:
 * the tier variants carry `options` and `selected`, which is the part
 * of detail_product a single-variant row never exercises.
 */
export function productSample(base: string): unknown {
  return productResponse(base, {
    id: "the_collab",
    // The label is read off the tier table rather than typed, so a
    // renamed tier fails the gate instead of quietly validating the
    // "your selection matched nothing" branch under the wrong name.
    selected: [{ name: "Tier", label: PWID_TIER_LABELS[1] }],
  }).body;
}

/** The same operation's refusal, which is an error_response, not an empty product. */
export function missingProductSample(base: string): unknown {
  return productResponse(base, { id: "spot_check" }).body;
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
      id: orderIdOf("chk_sample"),
      permalink_url: `${base}/ucp/v1/orders/${orderIdOf("chk_sample")}`,
      created_at: "2026-09-16T12:05:00.000Z",
    },
  });
  return checkoutDocument(checkout, base, { paymentHandlers: handlersFor(base, checkout) });
}

/**
 * The order behind that completion, in both fulfillment shapes the
 * store produces: instant goods delivered at settlement, and a human
 * work-order still in its queue. Built from the same frozen lines the
 * checkout sample carries, as a real order is.
 */
function storedOrder(base: string, fulfillment: StoredUcpOrder["fulfillment"]): StoredUcpOrder {
  const checkout = storedCheckout();
  return {
    id: orderIdOf(checkout.id),
    checkout_id: checkout.id,
    permalink_url: `${base}/ucp/v1/orders/${orderIdOf(checkout.id)}`,
    created_at: "2026-09-16T12:05:00.000Z",
    currency: "USD",
    lines: checkout.lines,
    line_titles: ["The Collab"],
    settlement: {
      purchase_id: "a".repeat(64),
      network: "eip155:8453",
      transaction: `0x${"b".repeat(64)}`,
      payer: SAMPLE_EVM,
      paid_usdc: 300,
      tip_usdc: 0,
    },
    fulfillment,
  };
}

export function instantOrderSample(base: string): unknown {
  return orderDocument(
    storedOrder(base, {
      kind: "instant",
      status: "fulfilled",
      delivered_at: "2026-09-16T12:05:00.000Z",
      goods: { certificate: { cert_id: "cert_sample" } },
    }),
    base,
  );
}

export function queuedOrderSample(base: string): unknown {
  return orderDocument(
    storedOrder(base, {
      kind: "human_queue",
      status: "processing",
      operational_order_id: "ord_operational",
      sla_hours: 168,
      goods: { order_id: "ord_operational", status: "queued" },
    }),
    base,
  );
}
