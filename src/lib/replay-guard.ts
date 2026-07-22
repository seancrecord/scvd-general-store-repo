import { KV_KEYS } from "@/lib/kv-keys";
import { isRecord } from "@/types";
import type { Env } from "@/types";

/**
 * Belt-and-braces replay protection for payment authorizations.
 *
 * The exact-EVM scheme is already replay-safe at the source of truth:
 * EIP-3009 nonces are consumed on-chain, so a second settlement of the
 * same authorization reverts at the facilitator and the gate never
 * mints. This KV guard adds an early, cheaper rejection — a nonce we've
 * already settled is turned away before we call the facilitator at all —
 * with a TTL so the namespace doesn't grow forever.
 */

/** Comfortably outlives any authorization's validBefore window. */
const NONCE_TTL_SECONDS = 24 * 60 * 60;

/** Pulls the EIP-3009 nonce out of an exact-EVM payment payload, if present. */
export function extractPaymentNonce(paymentPayload: unknown): string | null {
  if (!isRecord(paymentPayload)) {
    return null;
  }
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

export async function isNonceSpent(env: Env, nonce: string): Promise<boolean> {
  return (await env.COUNTERS.get(KV_KEYS.paymentNonce(nonce))) !== null;
}

export async function recordSpentNonce(
  env: Env,
  nonce: string,
  path: string,
): Promise<void> {
  await env.COUNTERS.put(KV_KEYS.paymentNonce(nonce), path, {
    expirationTtl: NONCE_TTL_SECONDS,
  });
}
