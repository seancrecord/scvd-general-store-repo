/**
 * BASE58 (Bitcoin/Solana alphabet), decode and encode, dependency-free.
 *
 * Exists for the claims door's second rail: a Solana payer proves key
 * possession with an ed25519 signature, and both the address (32-byte
 * pubkey) and commonly the signature (64 bytes) arrive base58. Nothing
 * here validates that a decoded value IS a key — callers check length.
 *
 * Case matters and is preserved; see lib/addresses.ts for the store's
 * scar tissue on that subject.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map<string, number>(
  [...ALPHABET].map((char, i) => [char, i]),
);

/** null on any character outside the alphabet. */
export function decodeBase58(text: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const char of text) {
    const value = INDEX.get(char);
    if (value === undefined) {
      return null;
    }
    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += (bytes[i] ?? 0) * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Each leading '1' is one leading zero byte.
  let zeros = 0;
  for (const char of text) {
    if (char !== "1") break;
    zeros += 1;
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[zeros + i] = bytes[bytes.length - 1 - i] ?? 0;
  }
  return out;
}

export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    zeros += 1;
  }
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += (digits[i] ?? 0) << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let output = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    output += ALPHABET[digits[i] ?? 0];
  }
  return output;
}
