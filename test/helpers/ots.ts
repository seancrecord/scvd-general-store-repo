/**
 * The smallest proof a calendar could honestly return: a pending
 * attestation directly on the submitted digest, no ops. Valid OTS
 * serialization, parseable by the walker in services/ots-proof.ts
 * (commitment = the digest itself, calendar = the URI below).
 *
 * Exists because the 2026-08-20 upgrade fix made the walker refuse
 * junk bytes — correctly — and every mock that stored [9,9,9] as a
 * "proof" then expected an upgrade was relying on the old code never
 * reading its own evidence.
 */
const PENDING_MAGIC = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];

export const MOCK_CALENDAR_URI = "https://cal.test";

export function pendingProofBytes(): Uint8Array {
  const uri = new TextEncoder().encode(MOCK_CALENDAR_URI);
  return new Uint8Array([
    0x00,
    ...PENDING_MAGIC,
    uri.length + 1,
    uri.length,
    ...uri,
  ]);
}
