import { extractPaymentNonce, getSpentNonce, type SpentNonceRecord } from "@/lib/replay-guard";
import { solanaPaymentEvidence } from "@/lib/solana-payment-evidence";
import { getOpenDeliveryIntent } from "@/services/delivery-audit";
import { isRecord, type Env } from "@/types";

/** Call only after verification. This locates an obligation, not proof of its
 * owner or a license to recreate its goods. Each recovery read authenticates
 * the payer separately. Solana uses its signed transaction, never an EVM nonce.
 */
export async function legacyPaidAttempt(env: Env, network: string, payload: unknown): Promise<SpentNonceRecord | null> {
  const nonce = extractPaymentNonce(payload);
  if (nonce) return getSpentNonce(env, nonce);
  if (!network.startsWith("solana:") || !isRecord(payload) || !isRecord(payload.payload) ||
    typeof payload.payload.transaction !== "string") return null;
  const { transaction } = await solanaPaymentEvidence(payload.payload.transaction);
  if (!transaction) return null;
  const open = await getOpenDeliveryIntent(env, transaction);
  // Presence is enough to stop a second sale; malformed rows are not proof of payment.
  return open ? { path: typeof open.intent.path === "string" ? open.intent.path : "", transaction } : null;
}
