import { IDEMPOTENCY_TTL_SECONDS } from "@/lib/idempotency";

/**
 * THE CLAIM THAT STOPS A RETRIED CREATE BECOMING A SECOND CHECKOUT.
 *
 * The pinned transport contract marks `Idempotency-Key` REQUIRED on
 * every mutating checkout operation, for the reason it gives in one
 * line: "Ensures duplicate operations don't happen during retries."
 * Three of the four this store serves already keep that promise by
 * other means — Complete through the admitted payment identity, Cancel
 * because cancelling a cancelled checkout is the same fact, Update
 * because a replacement identical to what is held changes nothing.
 *
 * CREATE WAS THE ONE THAT ACTUALLY DUPLICATED. `newCheckoutId()` mints
 * a fresh id per call, so a platform whose response was lost and
 * retried got a second checkout with a second quote, and no way to
 * tell which one its buyer was looking at.
 *
 * ONE INSTANCE PER (AGENT, KEY), NOT PER KEY. An idempotency key is
 * unique to the client that generated it and to nobody else, so a
 * store that keyed on the key alone would hand one platform's checkout
 * — its line items, its quote — to whichever stranger happened to
 * generate the same string. The scope is the `UCP-Agent` the contract
 * already requires on every request, hashed together with the key
 * through the same one-way derivation the x402 door's slots use, so
 * this instance's name never contains either value.
 *
 * THE CLAIM IS NOT THE CHECKOUT. It records an id and nothing else:
 * no line items, no quote, no buyer. A reader who somehow opened this
 * instance learns one opaque checkout id, which is the same thing the
 * caller that created it already had.
 */

export interface UcpCheckoutClaim {
  checkout_id: string;
  claimed_at: string;
  /** The same 24 hours the rest of the store's keys are honoured for. */
  expires_at: string;
}

export type UcpCheckoutClaimOutcome = {
  checkout_id: string;
  /** False when this key already named a checkout: the caller is retrying. */
  created: boolean;
};

const ROW = "ucp:create-claim";

export class UcpCheckoutClaims {
  constructor(private storage: DurableObjectStorage) {}

  /**
   * Hand back the checkout this key already names, or claim it for the
   * proposed one. Serialized by the instance, so two Creates racing on
   * one key cannot both win — the loser is told the winner's id and
   * reads that checkout instead of creating its own.
   *
   * An expired claim is treated as absent rather than refused: the key
   * has outlived the window the store honours, and a buyer sending it
   * again a day later means a new purchase.
   */
  async claim(input: { proposed: string; nowMs: number }): Promise<UcpCheckoutClaimOutcome> {
    return this.storage.transaction(async (txn) => {
      const held = await txn.get<UcpCheckoutClaim>(ROW);
      if (held && Date.parse(held.expires_at) > input.nowMs) {
        return { checkout_id: held.checkout_id, created: false };
      }
      const claim: UcpCheckoutClaim = {
        checkout_id: input.proposed,
        claimed_at: new Date(input.nowMs).toISOString(),
        expires_at: new Date(input.nowMs + IDEMPOTENCY_TTL_SECONDS * 1000).toISOString(),
      };
      await txn.put(ROW, claim);
      return { checkout_id: input.proposed, created: true };
    });
  }
}
