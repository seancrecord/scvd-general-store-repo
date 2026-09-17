import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { x402PurchasePayment, type PurchasePayment } from "@/lib/purchase-payment";
import { isRecord } from "@/types";

/**
 * THE UCP VERIFIED-PAYMENT ADAPTER, and what it deliberately is not.
 *
 * UCP is a third way of asking to buy, not a third way of buying. Its
 * job ends at producing the same verified `PurchasePayment` the x402
 * door and the MPP seam produce, so that the one durable admission
 * downstream — beginVerifiedPurchaseIntent — arbitrates between all
 * three. Replay ownership, idempotency, capacity, decline accounting,
 * recovery and settlement policy stay where they are; this file must
 * never grow a second copy of any of them.
 *
 * Shaped after createMppEvmAdapter, on purpose. That seam already
 * established the boundary: snapshot the terms, take the verifier as a
 * callback, hand back a PurchasePayment, and refuse to submit anything
 * during validation. The convergence is the point — two protocols
 * reaching one admission through the same shape is easier to reason
 * about than two clever adapters.
 *
 * WHAT MAKES THE UCP CASE SIMPLER than MPP's: the credential a UCP
 * buyer presents IS an x402 payment payload. There is no challenge to
 * bind, no second envelope to parse, and no separate receipt. So this
 * adapter is mostly a frozen-terms guard around the verification the
 * store already runs.
 */

export type FacilitatorVerify = (
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) => Promise<{ isValid: boolean; payer?: string; invalidReason?: string }>;

export type FacilitatorSettle = (
  payload: PaymentPayload,
  requirements: PaymentRequirements,
) => Promise<SettleResponse>;

export class UcpPaymentRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "UcpPaymentRefused";
  }
}

/** A success-shaped reply without matching evidence is uncertainty. */
export class UcpSettlementEvidenceUnavailable extends Error {
  constructor() {
    super("Settlement evidence is unavailable");
    this.name = "UcpSettlementEvidenceUnavailable";
  }
}

function sameAddress(network: string, a: string, b: string): boolean {
  return network.startsWith("eip155:")
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

export function createUcpX402Adapter(config: {
  /** The checkout's frozen requirements. Cloned, so a later mutation cannot reach settlement. */
  requirements: PaymentRequirements;
  /**
   * Optional because the settlement producer builds an adapter only
   * to bind and settle: it never verifies, admission already did, and
   * an adapter with no verifier refuses validate() rather than
   * pretending.
   */
  verify?: FacilitatorVerify;
}) {
  const terms = structuredClone(config.requirements);
  if (
    terms.scheme !== "exact" ||
    !/^[0-9]+$/.test(terms.amount) ||
    BigInt(terms.amount) <= 0n ||
    !terms.asset ||
    !terms.payTo ||
    !terms.network
  ) {
    throw new Error("Unsupported UCP checkout terms");
  }

  /**
   * THE CREDENTIAL IS RE-ACCEPTED AGAINST THE FROZEN TERMS, NOT ITS
   * OWN.
   *
   * An x402 payload carries the `accepted` requirements it was signed
   * against. Trusting that field would let a buyer present a payment
   * signed against terms they wrote themselves. So the payload handed
   * to the facilitator is rebuilt with THIS checkout's frozen terms in
   * the `accepted` slot, and a payload whose own `accepted` disagrees
   * on anything the money depends on is refused before the facilitator
   * is asked.
   */
  function boundPayload(credential: unknown): PaymentPayload {
    if (!isRecord(credential) || !isRecord(credential.payload)) {
      throw new UcpPaymentRefused("The payment credential is not an x402 payload.");
    }
    const accepted = isRecord(credential.accepted) ? credential.accepted : undefined;
    if (accepted) {
      const disagreement =
        (typeof accepted.network === "string" && accepted.network !== terms.network && "network") ||
        (typeof accepted.amount === "string" && accepted.amount !== terms.amount && "amount") ||
        (typeof accepted.asset === "string" &&
          !sameAddress(terms.network, accepted.asset, terms.asset) && "asset") ||
        (typeof accepted.payTo === "string" &&
          !sameAddress(terms.network, accepted.payTo, terms.payTo) && "payTo") ||
        (typeof accepted.scheme === "string" && accepted.scheme !== terms.scheme && "scheme");
      if (disagreement) {
        throw new UcpPaymentRefused(
          `This payment was signed against different ${disagreement}. This checkout's terms are the ones it quoted; read the checkout again.`,
        );
      }
    }
    return {
      x402Version: 2,
      accepted: structuredClone(terms),
      payload: credential.payload,
    } as PaymentPayload;
  }

  return {
    /** The frozen terms, for a caller that needs to prove what it verified against. */
    terms(): PaymentRequirements {
      return structuredClone(terms);
    },

    /**
     * The credential rebound to the frozen terms, and nothing else: no
     * I/O, no verification, no submission. What settle() is handed.
     */
    bind(credential: unknown): PaymentPayload {
      return boundPayload(credential);
    },

    /**
     * Verify only. Submits nothing, settles nothing, claims nothing.
     * The caller must hold durable purchase admission before settling.
     */
    async validate(credential: unknown): Promise<{
      payment: PurchasePayment;
      payload: PaymentPayload;
    }> {
      if (!config.verify) throw new Error("This adapter was built without a verifier");
      const payload = boundPayload(credential);
      const checked = await config.verify(payload, structuredClone(terms));
      if (!checked.isValid || !checked.payer) {
        throw new UcpPaymentRefused(
          checked.invalidReason
            ? `The payment was refused: ${checked.invalidReason}`
            : "The payment was refused.",
        );
      }
      /**
       * x402PurchasePayment derives the store's historical settlement
       * identity from the VERIFIED payer and the authorization nonce.
       * It is the same function the /api/buy door calls, so a payment
       * presented at both doors produces one identity and competes for
       * one admission.
       */
      const payment = await x402PurchasePayment(
        structuredClone(terms),
        checked.payer,
        payload,
      );
      return { payment, payload };
    },

    /**
     * SETTLE ONCE. The caller must already hold durable admission for
     * this payment identity, and must already have prepared the goods:
     * this store produces first and presents the payment at the last
     * moment, so a preparation that fails costs the buyer nothing.
     *
     * A reply that says success without evidence that matches the
     * frozen terms is treated as UNCERTAINTY, not as payment. That is
     * the one distinction the whole unknown-settlement path rests on.
     */
    async settle(
      payload: PaymentPayload,
      submit: FacilitatorSettle,
      payer: string,
    ): Promise<SettleResponse> {
      const result = await submit(payload, structuredClone(terms));
      if (!result.success) return result;
      if (
        typeof result.transaction !== "string" ||
        result.transaction.length === 0 ||
        (result.network && result.network !== terms.network) ||
        (result.payer && !sameAddress(terms.network, result.payer, payer))
      ) {
        throw new UcpSettlementEvidenceUnavailable();
      }
      return result;
    },
  };
}
