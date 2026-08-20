/**
 * THE ONE PARSE THE PROTOCOL FORCES ON US (2026-08-20).
 *
 * The anchoring code's founding rule was "store what the calendar
 * returns and publish it; we do not parse it" — and that rule is why
 * every anchor in the store sat pending for eighteen days. When a
 * digest is submitted, the calendar's response is not a receipt for
 * the digest: it is an ops chain (append a per-request nonce, hash,
 * merkle up) ending at the CALENDAR'S OWN COMMITMENT, and that
 * commitment — not the digest — is the key the calendar files the
 * timestamp under. Polling /timestamp/{digest} therefore 404s
 * forever, which the code read as "not confirmed yet" on every one of
 * nineteen anchors, hourly, for two and a half weeks: 363 rejections
 * a day that looked exactly like patience.
 *
 * So this file parses — EXACTLY as much as upgrade-keying requires
 * and nothing more. It walks the stored proof to find the pending
 * attestation, reports the commitment to poll with and the byte range
 * to splice the calendar's answer into, and expresses no opinion
 * about whether any of it is true. Verification still belongs to the
 * standard `ots` tool against Bitcoin block headers; the no-parse
 * rule was right about trust and wrong about plumbing.
 *
 * Format walked (OpenTimestamps serialization, no file header — the
 * calendar's POST /digest response starts directly at the ops):
 *   0x00 <8-byte magic> <varbytes payload>   attestation leaf
 *   0xff                                      fork: one subtree here,
 *                                             walk continues after it
 *   0xf0 <varbytes> / 0xf1 <varbytes>         append / prepend
 *   0x02 / 0x03 / 0x08                        sha1 / ripemd160 / sha256
 * Anything else is a parse failure, and a parse failure upgrades
 * nothing rather than guessing.
 */

/** PendingAttestation's magic, from the OpenTimestamps spec. */
const PENDING_MAGIC = "83dfe30d2ef90c8e";

export interface PendingCommitment {
  /** Hex of the message at the pending attestation — the poll key. */
  commitment_hex: string;
  /**
   * The calendar the attestation itself names. Not always the host
   * the digest was submitted to: the pool aggregators front the real
   * calendars, and the proof from a.pool names alice.btc — the
   * upgrade belongs to the calendar the proof points at.
   */
  calendar_uri?: string;
  /** Byte offset of the attestation's 0x00 tag in the proof. */
  splice_start: number;
  /** Byte offset just past the attestation's payload. */
  splice_end: number;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

async function digestWith(
  algorithm: "SHA-256" | "SHA-1",
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes);
  return new Uint8Array(await crypto.subtle.digest(algorithm, copy));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

class ProofReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  byte(): number {
    if (this.offset >= this.bytes.length) throw new Error("truncated proof");
    const value = this.bytes[this.offset];
    this.offset += 1;
    return value as number;
  }

  varint(): number {
    let value = 0;
    let shift = 0;
    for (;;) {
      const next = this.byte();
      value |= (next & 0x7f) << shift;
      if ((next & 0x80) === 0) return value;
      shift += 7;
      if (shift > 28) throw new Error("varint too large");
    }
  }

  varbytes(): Uint8Array {
    const length = this.varint();
    if (this.offset + length > this.bytes.length) {
      throw new Error("truncated varbytes");
    }
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

/**
 * Walk a calendar proof and return every pending attestation found,
 * with the message (commitment) in effect where it sits and the byte
 * range its node occupies. Returns null on anything unparseable —
 * fail-soft is the contract, because a wrong guess here would splice
 * garbage into evidence we publish.
 */
export async function findPendingCommitments(
  proof: Uint8Array,
  digestHex: string,
): Promise<PendingCommitment[] | null> {
  if (!/^[0-9a-f]{64}$/i.test(digestHex)) return null;
  const digest = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    digest[i] = parseInt(digestHex.slice(i * 2, i * 2 + 2), 16);
  }
  const reader = new ProofReader(proof);
  const found: PendingCommitment[] = [];

  async function walk(message: Uint8Array): Promise<void> {
    let current = message;
    for (;;) {
      const start = reader.position;
      const tag = reader.byte();
      if (tag === 0x00) {
        const magicBytes = new Uint8Array(8);
        for (let i = 0; i < 8; i += 1) magicBytes[i] = reader.byte();
        const payload = reader.varbytes();
        if (bytesToHex(magicBytes) === PENDING_MAGIC) {
          // The payload is itself varbytes: the calendar's URI.
          let uri: string | undefined;
          try {
            const inner = new ProofReader(payload).varbytes();
            const text = new TextDecoder().decode(inner);
            if (/^https:\/\/[\w.-]+$/.test(text)) uri = text;
          } catch {
            uri = undefined;
          }
          found.push({
            commitment_hex: bytesToHex(current),
            ...(uri ? { calendar_uri: uri } : {}),
            splice_start: start,
            splice_end: reader.position,
          });
        }
        return;
      }
      if (tag === 0xff) {
        await walk(current);
        continue;
      }
      if (tag === 0xf0) current = concat(current, reader.varbytes());
      else if (tag === 0xf1) current = concat(reader.varbytes(), current);
      else if (tag === 0x08) current = await digestWith("SHA-256", current);
      else if (tag === 0x02) current = await digestWith("SHA-1", current);
      else throw new Error(`unsupported op 0x${tag.toString(16)}`);
    }
  }

  try {
    await walk(digest);
  } catch {
    return null;
  }
  return found;
}

/**
 * The upgrade splice, exactly as the reference client performs it:
 * the calendar's answer to /timestamp/{commitment} is a serialized
 * timestamp subtree rooted at that commitment, and it replaces the
 * pending attestation node byte-for-byte. The result chains from the
 * original digest to a Bitcoin attestation with no seam — `ots
 * verify` neither knows nor cares that two HTTP responses built it.
 */
export function spliceUpgrade(
  proof: Uint8Array,
  pending: PendingCommitment,
  upgraded: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(
    pending.splice_start + upgraded.length + (proof.length - pending.splice_end),
  );
  out.set(proof.subarray(0, pending.splice_start), 0);
  out.set(upgraded, pending.splice_start);
  out.set(proof.subarray(pending.splice_end), pending.splice_start + upgraded.length);
  return out;
}
