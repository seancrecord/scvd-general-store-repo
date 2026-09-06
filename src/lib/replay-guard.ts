import { KV_KEYS } from "@/lib/kv-keys";
import { isRecord } from "@/types";
import type { Env } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";

/**
 * Belt-and-braces replay protection for payment authorizations.
 *
 * The exact-EVM scheme is already replay-safe at the source of truth:
 * EIP-3009 nonces are consumed on-chain, so a second settlement of the
 * same authorization reverts at the facilitator and the gate never
 * mints. This KV guard adds an early, cheaper rejection, a nonce we've
 * already settled is turned away before we call the facilitator at all —
 * with a TTL so the namespace doesn't grow forever.
 */

/** Comfortably outlives any authorization's validBefore window. */
const NONCE_TTL_SECONDS = 24 * 60 * 60;

function isExactEvmPayment(paymentPayload: Record<string, unknown>): boolean {
  const accepted = paymentPayload["accepted"];
  return (
    paymentPayload["x402Version"] === 2 &&
    isRecord(accepted) && accepted["scheme"] === "exact" &&
    typeof accepted["network"] === "string" &&
    /^eip155:[1-9][0-9]*$/.test(accepted["network"])
  );
}

/**
 * Pulls an EIP-3009 nonce from an exact-EVM envelope. Bare authorization
 * fragments remain readable as buyer-supplied attestation evidence;
 * they are not sufficient to identify an authenticated payer below.
 */
export function extractPaymentNonce(paymentPayload: unknown): string | null {
  if (!isRecord(paymentPayload)) {
    return null;
  }
  if (
    ("accepted" in paymentPayload || "x402Version" in paymentPayload) &&
    !isExactEvmPayment(paymentPayload)
  ) return null;
  const payload = paymentPayload["payload"];
  if (!isRecord(payload)) {
    return null;
  }
  const authorization = payload["authorization"];
  if (!isRecord(authorization)) {
    return null;
  }
  const nonce = authorization["nonce"];
  return typeof nonce === "string" && nonce.length > 0 ? nonce : null;
}

/**
 * The payer out of a VERIFIED exact-EVM payment payload.
 *
 * Deliberately distinct from `payerFromPaymentHeader`, which decodes
 * the raw request header and checks nothing — fine for books and
 * diagnostics, never for an authorization decision, because anyone can
 * write any address into a base64 blob. The caller must verify first.
 * Verification authenticates the selected scheme's fields, not arbitrary
 * adjacent metadata: a valid Solana transaction may carry an unsigned
 * authorization.from. Never interpret that as an EVM signer's identity.
 */
export function payerOfVerifiedPayload(
  paymentPayload: unknown,
): string | undefined {
  if (!isRecord(paymentPayload) || !isExactEvmPayment(paymentPayload)) {
    return undefined;
  }
  const payload = paymentPayload["payload"];
  if (!isRecord(payload)) return undefined;
  const authorization = payload["authorization"];
  if (!isRecord(authorization)) return undefined;
  const from = authorization["from"];
  return typeof from === "string" && /^0x[0-9a-fA-F]{40}$/.test(from)
    ? from
    : undefined;
}

export async function isNonceSpent(env: Env, nonce: string): Promise<boolean> {
  return (await kvGet(env.COUNTERS, KV_KEYS.paymentNonce(nonce))) !== null;
}

/**
 * What a spent nonce remembers. `transaction` is the link the paid
 * retry stands on: nonce → the settle that burned it → the delivery
 * intent that says whether goods ever left. Rows written before
 * 2026-08-08 stored the bare path string; getSpentNonce reads both
 * shapes forever, and an old row (no transaction) simply cannot take
 * the paid-retry lane — it gets the refusal it always got.
 */
export interface SpentNonceRecord {
  path: string;
  transaction?: string;
}

export async function getSpentNonce(
  env: Env,
  nonce: string,
): Promise<SpentNonceRecord | null> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.paymentNonce(nonce));
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed["path"] === "string") {
      const record: SpentNonceRecord = { path: parsed["path"] };
      if (typeof parsed["transaction"] === "string") {
        record.transaction = parsed["transaction"];
      }
      return record;
    }
  } catch {
    // Pre-upgrade row: the value IS the path.
  }
  return { path: raw };
}

export async function recordSpentNonce(
  env: Env,
  nonce: string,
  path: string,
  transaction?: string,
): Promise<void> {
  await kvPut(env.COUNTERS, 
    KV_KEYS.paymentNonce(nonce),
    JSON.stringify({ path, ...(transaction ? { transaction } : {}) }),
    { expirationTtl: NONCE_TTL_SECONDS },
  );
}
