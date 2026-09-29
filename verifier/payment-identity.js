// One versioned digest contract for the store and its offline reports.
// EVM addresses ignore case; base58 addresses preserve it. A match is a
// historical address link, never validation or authority to pay an address.
export const PAY_TO_DIGEST_SALT = "scvd:payto:v1:";
export function normalizePayTo(address) {
  const trimmed = address.trim();
  return trimmed.startsWith("0x") ? trimmed.toLowerCase() : trimmed;
}
export async function payToDigest(address) {
  const bytes = new TextEncoder().encode(`${PAY_TO_DIGEST_SALT}${normalizePayTo(address)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
