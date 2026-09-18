import { supportsObservationRecovery } from "@/lib/artifact-checkpoint";
import { observationCheckpoint, type ObservationCheckpoint } from "@/services/purchase-observation";
import type { Env, MenuItem } from "@/types";

/**
 * WHICH ORDERING A PRODUCT REQUIRES, ANSWERED ONCE.
 *
 * This store has two legitimate purchase orderings, and the difference
 * is a fact about the goods rather than about the protocol carrying
 * the request:
 *
 *   after_admission   verify -> own -> prepare -> settle -> fulfil
 *   before_admission  verify -> prepare -> checkpoint -> own -> settle
 *
 * The second is not special handling bolted on for awkward items. It
 * is a house invariant with teeth: for goods that are fully prepared
 * before settlement, the shared purchase admission REFUSES ownership
 * unless the prepared observation is already retained under the same
 * payment identity, path and request digest. A completion that tried
 * to take ownership first would simply be told "Original observation
 * must precede settlement", which is the invariant doing its job.
 *
 * WHAT THIS FILE EXISTS TO PREVENT is every caller growing its own
 * catalogue of which twenty products are which. `supportsObservationRecovery`
 * already knows, and the checkpoint machinery already knows how to
 * address the journal. A protocol adapter should ask what ordering to
 * use and be told; it should never contain the list.
 *
 * THE PREPARATION ITSELF DOES NOT HAPPEN IN A TRANSACTION, and should
 * not. Probing an endpoint, reading a chain and signing a report are
 * network and compute work that no storage transaction should be
 * holding open. The atomic part is narrower and is the part that
 * matters: the prepared bytes are durably retained under the verified
 * payment identity BEFORE admission, and the admission transaction
 * refuses to grant ownership unless exactly that observation, path and
 * digest are already there.
 */

export type PurchasePreparation =
  | {
      mode: "after_admission";
      /** Nothing has to exist before ownership; the goods follow it. */
      checkpoint?: undefined;
    }
  | {
      mode: "before_admission";
      /**
       * The journal these goods must be retained in before ownership
       * can be taken. Addressed by payment identity, path and request
       * digest — the same three values the admission will check.
       */
      checkpoint: ObservationCheckpoint;
    };

/**
 * @param paymentIdentity the store's settlement identity for the verified payment
 * @param path            the resource path the admission will record
 * @param requestDigest   the digest the admission will record and compare
 */
export function purchasePreparation(
  env: Env,
  item: MenuItem | undefined,
  paymentIdentity: string,
  path: string,
  requestDigest: string,
): PurchasePreparation {
  if (!supportsObservationRecovery(item)) return { mode: "after_admission" };
  return {
    mode: "before_admission",
    checkpoint: observationCheckpoint(env, paymentIdentity, path, requestDigest),
  };
}

/**
 * True when this product's goods must exist before anybody owns the
 * payment for them. Exported for tests and for surfaces that need to
 * describe the ordering without performing it.
 */
export function preparesBeforeAdmission(item: MenuItem | undefined): boolean {
  return supportsObservationRecovery(item);
}
