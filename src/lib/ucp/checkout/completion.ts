import { jcsCanonicalize } from "@/lib/jcs";
import type { StoredCheckout } from "@/services/ucp-checkout-store";

/**
 * WHAT IDENTIFIES A UCP COMPLETION, AND WHY IT IS RECOMPUTABLE.
 *
 * The store's purchase record matches a recovered purchase against the
 * digest of the request that bought it. An HTTP purchase has a query
 * string and an MCP purchase has tool arguments; a UCP completion has
 * neither. What it has is the checkout it completes.
 *
 * So the completion identity is the checkout, its version and the
 * terms it was quoted at — three values that all live in durable
 * checkout state. That is the property that matters: a recovery can
 * rebuild this identity from the stored checkout ALONE, without the
 * original request body, which is exactly the situation a recovery is
 * in. An identity that needed the request would be an identity no
 * recovery could reproduce, and a purchase whose digest cannot be
 * reproduced is a paid buyer refused for an input mismatch.
 *
 * It carries no credential, no signature and no payer. It is not a
 * secret and is not meant to be one: it identifies WHICH commercial
 * transaction is being completed, never who may complete it. What
 * decides that is the verified payment.
 */
export interface CompletionIdentity {
  checkout_id: string;
  checkout_version: number;
  terms_digest: string;
}

export function completionIdentity(checkout: StoredCheckout): CompletionIdentity {
  const digest = checkout.quote?.digest;
  if (!digest) {
    throw new Error(`Checkout ${checkout.id} has no quote to complete against.`);
  }
  return {
    checkout_id: checkout.id,
    checkout_version: checkout.version,
    terms_digest: digest,
  };
}

/**
 * The canonical serialization handed to the purchase record as its
 * `request`. JCS, so key order cannot change the digest, and the
 * digest itself is computed by purchaseRequestDigest's `ucp` case —
 * one decision, in one place, per door.
 */
export function completionRequest(checkout: StoredCheckout): string {
  return jcsCanonicalize(completionIdentity(checkout));
}
