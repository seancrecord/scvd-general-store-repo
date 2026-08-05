/**
 * One rule for wallet addresses, learned the night the first Solana
 * buyer's address showed up in the office unusable: EVM addresses
 * are case-insensitive hex, so lowercase is a safe canonical form —
 * but Solana addresses are case-SENSITIVE base58, and lowercasing
 * one destroys it. A blanket .toLowerCase() on payers was fine for
 * eleven months of Base-only books and silently corrupting from the
 * first Solana settle.
 *
 * Canonical form: EVM (0x-prefixed) lowercased, everything else
 * preserved byte-for-byte. MATCHING may still be case-insensitive
 * (lowercasing both sides of a compare loses nothing); STORAGE and
 * DISPLAY must go through this instead.
 */
export function canonicalAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith("0x") ? trimmed.toLowerCase() : trimmed;
}
