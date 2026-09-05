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

/** BitcoinBlockHeaderAttestation's magic, from the OpenTimestamps spec. */
const BITCOIN_MAGIC = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];

function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  for (;;) {
    const byte = rest & 0x7f;
    rest = Math.floor(rest / 128);
    if (rest === 0) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
}

/**
 * The smallest COMPLETED proof: a Bitcoin block-header attestation
 * directly on the message, payload = varint(height). What a calendar's
 * /timestamp/{commitment} answer looks like once a block has mined,
 * minus the merkle path, which the walker does not check anyway.
 */
export function bitcoinProofBytes(height: number): Uint8Array {
  const payload = varint(height);
  return new Uint8Array([0x00, ...BITCOIN_MAGIC, payload.length, ...payload]);
}
