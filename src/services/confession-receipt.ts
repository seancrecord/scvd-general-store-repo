import type { ArtifactCheckpoint } from "@/lib/artifact-checkpoint";
import { jcsCanonicalize } from "@/lib/jcs";
import { signMessage } from "@/lib/signing";
import type { ConfessionRecord, Env } from "@/types";

export const CONFESSION_RECEIPT_TYPE = "scvd.confession-receipt.v1";

/** The buyer may share this proof. Neither the public certificate nor the
 * anonymous drawer contains it: even a public text hash would enable guessing.
 */
export async function privateConfessionReceipt(env: Env, record: ConfessionRecord, certId: string | undefined, checkpoint?: ArtifactCheckpoint) {
  const retained = await checkpoint?.read<ConfessionReceipt>("confession_receipt");
  if (retained) return retained;
  if (!certId) throw new Error("Confession receipt requires its purchase certificate");
  const receipt = { type: CONFESSION_RECEIPT_TYPE, cert_id: certId, confession_id: record.id,
    confession: record.confession, recorded_at: record.date, ...(record.sign_as ? { sign_as: record.sign_as } : {}) };
  const signed_payload = jcsCanonicalize(receipt);
  const signed = await signMessage(signed_payload, env.SIGNING_KEY);
  const value = { receipt, signed_payload, signature: signed.signature, public_key: signed.publicKey,
    signature_covers: "ed25519 over the UTF-8 bytes of signed_payload (JCS of receipt). Private proof; share only by choice." };
  return checkpoint ? checkpoint.save("confession_receipt", value) : value;
}
export interface ConfessionReceipt {
  receipt: { type: string; cert_id: string; confession_id: string; confession: string; recorded_at: string; sign_as?: string };
  signed_payload: string;
  signature: string;
  public_key: string;
  signature_covers: string;
}
