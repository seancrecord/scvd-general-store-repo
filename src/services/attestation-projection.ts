import { jcsCanonicalize } from "@/lib/jcs";
import { signDetachedJws } from "@/lib/offer-receipt";
import type {
  SettlementBinding,
  SettlementStatus,
  SignedAttestation,
} from "@/services/attestation";
import type { Env } from "@/types";

/**
 * THE PROJECTION (2026-09-11). One artifact of record — the native
 * settlement attestation — and beside it a second shape in the
 * vocabulary an IETF Internet-Draft is converging on, so the same
 * observation can be read by tooling that speaks that dialect and the
 * store can be named where adopters are listed.
 *
 * Rules, each load-bearing:
 *   - It carries no field the native artifact did not derive. Every
 *     value here is copied or renamed from the signed native object;
 *     nothing is computed fresh.
 *   - It points back. projection_of names the native artifact by its
 *     evidence hash and battery, and primary is false. Nothing
 *     downstream cites the projection as the record.
 *   - Same key. It is signed by the store's ed25519 key as a detached
 *     JWS with the did:web kid, over the RFC 8785 bytes of its own
 *     fields, so the conformance desk's verifier can check it.
 *   - Same expiry. expires is the native stale_after.
 *   - Pinned. The format string names the draft revision it targets.
 *     If the draft moves, this changes or is withdrawn without
 *     ceremony; the native artifact does not.
 *
 * WHAT WE DID NOT SEE, said here first: the draft text itself was not
 * reachable from the environment that built this. The field names
 * used (settled_payment_ref, settlement_chain, settlement_result) are
 * the ones public indexes quote from it. That is a shape borrowed in
 * good faith, not a conformance claim, and the projection says so on
 * every copy.
 */

export const PROJECTION_FORMAT = "draft-hopley-x402-settlement-attestation-01";
export const PROJECTION_CANONICALISATION =
  "RFC 8785 (JCS), per draft-hopley-x402-canonicalisation-jcs-v1";
export const PROJECTION_CONFORMANCE =
  "unverified: shaped on 2026-09-11 from the draft's field names as quoted in public indexes, because the draft text was not reachable from the environment that built this. Not a conformance claim. Where the draft's shape differs, the draft wins and this projection changes or is withdrawn; the native artifact it points to does not change.";
export const PROJECTION_CITE =
  "Cite the native settlement attestation, never this projection. This object exists so the same observation can be read in a second vocabulary; the record is the artifact named in projection_of.";

/** The draft's result vocabulary, as indexed. REVERSED is a payment reversal, not a reverted transaction, so REVERTED is not mapped onto it. */
export type ProjectedResult = "SETTLED" | "PENDING_FINALITY";

export interface SettlementAttestationProjection {
  format: typeof PROJECTION_FORMAT;
  canonicalisation: string;
  conformance: string;
  primary: false;
  projection_of: {
    artifact: "settlement_attestation";
    battery: string;
    evidence_hash: string;
    cite: string;
  };
  issuer_did: string;
  settlement_chain: string;
  settlement_chain_format: "CAIP-2";
  transaction: string | null;
  settlement_result: ProjectedResult | null;
  native_status: SettlementStatus;
  settled_payment_ref: null;
  settled_payment_ref_note: string;
  payer: string | null;
  recipient: string | null;
  amount_usdc: number | null;
  block_height: number | null;
  confirmations: number | null;
  observed_at: string;
  expires: string;
  binding: SettlementBinding;
  signature_jws: string;
  signature_covers: string;
}

function projectedResult(status: SettlementStatus): ProjectedResult | null {
  return status === "SETTLED" || status === "PENDING_FINALITY" ? status : null;
}

export async function projectSettlementAttestation(
  env: Env,
  native: Omit<SignedAttestation, "projection">,
): Promise<SettlementAttestationProjection> {
  const body: Omit<SettlementAttestationProjection, "signature_jws" | "signature_covers"> = {
    format: PROJECTION_FORMAT,
    canonicalisation: PROJECTION_CANONICALISATION,
    conformance: PROJECTION_CONFORMANCE,
    primary: false,
    projection_of: {
      artifact: "settlement_attestation",
      battery: native.battery,
      evidence_hash: native.evidence_hash,
      cite: PROJECTION_CITE,
    },
    issuer_did: `did:web:${new URL(env.STORE_BASE_URL).host}`,
    settlement_chain: native.chain,
    settlement_chain_format: "CAIP-2",
    transaction: native.tx_hash,
    settlement_result: projectedResult(native.status),
    native_status: native.status,
    settled_payment_ref: null,
    settled_payment_ref_note:
      "This store does not hold the original payment record and will not reference bytes it did not see. The transaction identifier above is the reference this observation carries.",
    payer: native.payer,
    recipient: native.recipient,
    amount_usdc: native.amount_usdc,
    block_height: native.block_height,
    confirmations: native.confirmations,
    observed_at: native.observed_at,
    expires: native.stale_after,
    binding: native.binding,
  };
  const signature_jws = await signDetachedJws(
    env,
    jcsCanonicalize(body as unknown as Record<string, unknown>),
  );
  return {
    ...body,
    signature_jws,
    signature_covers:
      "Detached JWS (EdDSA, kid did:web) over the RFC 8785 canonical bytes of every field above signature_jws. Same ed25519 key as the native artifact; resolve it at /.well-known/did.json.",
  };
}
