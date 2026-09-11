import { hasUnpairedSurrogate } from "@/lib/unicode";
import { jcsCanonicalize } from "@/lib/jcs";
import { sha256Hex } from "@/lib/idempotency";
import { cachedPublicKeyHex, signMessage, verifyMessageSignature } from "@/lib/signing";
import { retiredKeysFor } from "@/store/key-registry";
import type { Env, OrderRecord } from "@/types";

export interface HumanOrderProof {
  signed_payload: string;
  signature: string;
  public_key: string;
  signature_covers: string;
}
const INPUTS = "sha256 of RFC 8785 JSON {detail,target_url}; absent fields are null. Buyer text remains private until the buyer shares it.";
async function inputHash(order: OrderRecord): Promise<string> {
  return sha256Hex(jcsCanonicalize({ detail: order.detail ?? null, target_url: order.target_url ?? null }));
}
async function commissionStatement(order: OrderRecord, signedAt: string) {
  return { type: "scvd.human-commission.v1", order_id: order.order_id, cert_id: order.cert_id, item_id: order.item_id,
    accepted_at: order.created_at, sla_hours: order.sla_hours, paid_usdc: order.paid_usdc, tip_usdc: order.tip_usdc,
    inputs_sha256: await inputHash(order), inputs_hash_covers: INPUTS, signed_at: signedAt };
}
async function sign(env: Env, statement: Record<string, unknown>): Promise<HumanOrderProof> {
  const signed_payload = jcsCanonicalize(statement), signed = await signMessage(signed_payload, env.SIGNING_KEY);
  return { signed_payload, signature: signed.signature, public_key: signed.publicKey,
    signature_covers: "UTF-8 bytes of signed_payload, RFC 8785 canonical JSON. Verify the certificate identity and the declared input/deliverable hashes independently." };
}

/** Called when a new order is created. Existing checkpointed orders keep their
 * original proof, including its absence; no acceptance is backdated on a read. */
export async function signHumanCommission(env: Env, order: OrderRecord): Promise<HumanOrderProof> {
  return sign(env, await commissionStatement(order, new Date().toISOString()));
}
async function authenticCommission(env: Env, order: OrderRecord): Promise<boolean> {
  const proof = order.commission;
  if (!proof) return false;
  try {
    const current = await cachedPublicKeyHex(env.SIGNING_KEY);
    if (proof.public_key !== current && !retiredKeysFor(current).some(key => key.public_key === proof.public_key)) return false;
    const statement = JSON.parse(proof.signed_payload) as Record<string, unknown>;
    if (typeof statement.signed_at !== "string" || !Number.isFinite(Date.parse(statement.signed_at))) return false;
    return jcsCanonicalize(await commissionStatement(order, statement.signed_at)) === proof.signed_payload &&
      await verifyMessageSignature(proof.signed_payload, proof.signature, proof.public_key);
  } catch { return false; }
}

/** Sign before committing completion. A changed brief cannot acquire a fresh
 * completion signature while still pretending to be the accepted commission. */
export async function signHumanCompletion(env: Env, order: OrderRecord, deliverable: string, completedAt: string): Promise<HumanOrderProof> {
  if (hasUnpairedSurrogate(deliverable)) throw new Error("Completion text contains an unpaired Unicode surrogate");
  if (order.commission && !await authenticCommission(env, order)) throw new Error("Accepted human commission does not match this order");
  return sign(env, { type: "scvd.human-completion.v1", order_id: order.order_id, cert_id: order.cert_id, item_id: order.item_id,
    completed_at: completedAt, inputs_sha256: await inputHash(order), inputs_hash_covers: INPUTS,
    commission_sha256: order.commission ? await sha256Hex(order.commission.signed_payload) : null,
    acceptance_basis: order.commission ? "signed_commission" : "retained_order_without_acceptance_signature",
    deliverable_sha256: await sha256Hex(deliverable), deliverable_hash_covers: "sha256 of the exact UTF-8 deliverable text" });
}

export function humanOrderEvidence(order: OrderRecord): Record<string, unknown> {
  return { ...(order.commission ? { commission: order.commission } : {}),
    ...(order.completion_proof ? { completion_proof: order.completion_proof } : {}) };
}
