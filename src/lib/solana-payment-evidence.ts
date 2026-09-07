import { sha256Hex } from "@/lib/idempotency";
import { encodeBase58 } from "@/lib/base58";

/** Hash the signed message, excluding signatures the facilitator may add.
 * The same framing surrounds legacy and v0 messages. No executable payment
 * bytes are retained; the digest alone cannot be broadcast or re-signed.
 */
export async function solanaPaymentEvidence(transaction: string) {
  const bytes = Uint8Array.from(atob(transaction), c => c.charCodeAt(0));
  // Solana's 1232-byte wire limit bounds the compact signature count to one
  // byte. Refuse malformed framing instead of guessing where a message starts.
  const count = bytes[0] ?? 0, offset = 1 + count * 64;
  if (bytes.length > 1232 || count < 1 || count > 19 || offset + 4 >= bytes.length) {
    throw new Error("Invalid Solana payment framing");
  }
  const version = bytes[offset]!;
  if ((version & 128) && version !== 128) throw new Error("Unsupported Solana message version");
  if (bytes[offset + (version === 128 ? 1 : 0)] !== count) throw new Error("Invalid Solana signer count");
  return {
    message_hash: await sha256Hex(btoa(String.fromCharCode(...bytes.subarray(offset)))),
    transaction: bytes.subarray(1, 65).some(b => b !== 0) ? encodeBase58(bytes.subarray(1, 65)) : null,
  };
}
