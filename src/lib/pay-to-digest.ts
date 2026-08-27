/**
 * THE PAYTO DIGEST — chain hygiene under the G2 ruling
 * (docs/G2_OPERATOR_LINKING_RULING_2026-08.md, keeper-ruled
 * 2026-08-27).
 *
 * New signed corpus rows carry this digest instead of the verbatim
 * payment address; verbatim lives only in the MUTABLE views. The
 * point is erasure: the chain cannot unsign, so the personal data
 * must never be IN what is signed — a digest proves address reuse
 * across doors without containing the address.
 *
 * THE SALT IS PUBLIC, DELIBERATELY. Transparency is the proof: anyone
 * holding an address can recompute the digest with their own tools
 * and verify "this row is about my wallet" — which is exactly the
 * property the standing-note lane and the objection lane stand on. A
 * public salt means someone who already knows a candidate address
 * can test it; it does not let anyone ENUMERATE the addresses out of
 * the chain. That is the standard pseudonymization trade and the
 * ruling makes it knowingly: the address itself is already public on
 * its own chain — what the digest withholds is the free join.
 *
 * Versioned in the salt string so a future change never silently
 * splits clusters: rows carrying v1 digests compare only against v1.
 */
export const PAY_TO_DIGEST_SALT = "scvd:payto:v1:";

/**
 * Normalization mirrors the capture law in market.ts (2026-08-20):
 * 0x addresses lowercase (EVM is case-insensitive by nature), base58
 * preserved byte-for-byte (Solana is case-sensitive for life).
 */
export function normalizePayTo(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith("0x") ? trimmed.toLowerCase() : trimmed;
}

export async function payToDigest(address: string): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${PAY_TO_DIGEST_SALT}${normalizePayTo(address)}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
