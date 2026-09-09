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
 * preserved byte-for-byte. Matching follows the same rule: EVM is
 * case-insensitive, while base58 identities must match exactly.
 * Use this canonical form for storage, display and lookup.
 */
export function canonicalAddress(address: string): string {
  const trimmed = address.trim();
  return /^0x/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}
