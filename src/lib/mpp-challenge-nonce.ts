/** Keep all 32 random bytes while fitting the native challenge header budget. */
function encodeNonce(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The lightweight issuer cannot import the settlement SDK. */
export function freshChallengeNonce(): string {
  return encodeNonce(crypto.getRandomValues(new Uint8Array(32)));
}

/** mppx 0.13.4 emits 32 bytes as hex. Re-encode, never truncate or discard them. */
export function compactSdkChallengeNonce(nonce: unknown): string {
  if (typeof nonce !== "string" || !/^0x[0-9a-f]{64}$/i.test(nonce)) {
    throw new Error("Unsupported MPP challenge nonce");
  }
  return encodeNonce(Uint8Array.from(nonce.slice(2).match(/../g)!, byte => Number.parseInt(byte, 16)));
}
