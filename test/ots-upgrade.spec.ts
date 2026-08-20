import { describe, expect, it, vi } from "vitest";
import {
  findPendingCommitments,
  spliceUpgrade,
} from "@/services/ots-proof";
import { upgradeDigestOts } from "@/services/anchor-submit";
import type { OtsAnchor } from "@/services/anchor-log";

/**
 * THE EIGHTEEN-DAY 404 (2026-08-20). Every anchor in the store sat
 * "pending" for up to eighteen days because the upgrade polled
 * /timestamp/{digest} — a key the calendar never files anything
 * under. The calendar's index key is the COMMITMENT its own ops
 * chain produces from the digest, and the address to poll is the
 * calendar the attestation names, not the pool host the digest was
 * submitted through.
 *
 * The fixture below is not synthetic: it is the actual proof the
 * a.pool aggregator returned for the store's 2026-08-02 anchor,
 * lifted from the live /.well-known/anchor-log.json. The expected
 * commitment and calendar were derived by hand-walking those bytes,
 * so if the walker ever disagrees with the reference parse of a real
 * proof, this fails.
 */

const REAL_DIGEST =
  "a1b184e981d36ee24593792446c930ccd7f014de728c107c83898675cc775ea6";
const REAL_PROOF_HEX =
  "f00801a327c0f3bcbfb208f010f1d776d6a38bf5b44b801c621b81f1c408f1207bbe78bcb5767ff5c520d8038278f687a817c414804dfb6cc7eba30729fdda3b08f12094bb64120231926228df0c3d264ed026f2a1b8562090a6d3d0e95735cdbda63c08f1046a6eabaaf008c10ba274242359240083dfe30d2ef90c8e2e2d68747470733a2f2f616c6963652e6274632e63616c656e6461722e6f70656e74696d657374616d70732e6f7267";
const REAL_COMMITMENT =
  "6a6eabaa234220792c78a84f145d67e8e5066cd55c54bf40bc8bcbcd9b227f939fe8630dc10ba27424235924";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("the proof walker, against a real calendar proof", () => {
  it("derives the calendar's commitment, not the digest", async () => {
    const pendings = await findPendingCommitments(
      hexToBytes(REAL_PROOF_HEX),
      REAL_DIGEST,
    );
    expect(pendings).toHaveLength(1);
    expect(pendings?.[0]?.commitment_hex).toBe(REAL_COMMITMENT);
    expect(pendings?.[0]?.commitment_hex).not.toBe(REAL_DIGEST);
  });

  it("reads the calendar the attestation names, not the pool host", async () => {
    const pendings = await findPendingCommitments(
      hexToBytes(REAL_PROOF_HEX),
      REAL_DIGEST,
    );
    expect(pendings?.[0]?.calendar_uri).toBe(
      "https://alice.btc.calendar.opentimestamps.org",
    );
  });

  it("locates the attestation node for the splice", async () => {
    const proof = hexToBytes(REAL_PROOF_HEX);
    const pendings = await findPendingCommitments(proof, REAL_DIGEST);
    const pending = pendings?.[0];
    expect(pending?.splice_end).toBe(proof.length);
    // The node starts at its 0x00 tag.
    expect(proof[pending?.splice_start ?? -1]).toBe(0x00);
  });

  it("refuses garbage rather than guessing a key", async () => {
    expect(
      await findPendingCommitments(hexToBytes("f0ff"), REAL_DIGEST),
    ).toBeNull();
    expect(
      await findPendingCommitments(hexToBytes(REAL_PROOF_HEX), "not hex"),
    ).toBeNull();
  });
});

describe("the splice", () => {
  it("replaces exactly the attestation node", async () => {
    const proof = hexToBytes(REAL_PROOF_HEX);
    const pendings = await findPendingCommitments(proof, REAL_DIGEST);
    const pending = pendings![0]!;
    const upgraded = hexToBytes("08f004deadbeef");
    const spliced = spliceUpgrade(proof, pending, upgraded);
    const expected =
      REAL_PROOF_HEX.slice(0, pending.splice_start * 2) + "08f004deadbeef";
    expect(
      [...spliced].map((b) => b.toString(16).padStart(2, "0")).join(""),
    ).toBe(expected);
  });
});

describe("the upgrade poll", () => {
  const pendingAnchor: OtsAnchor = {
    status: "pending",
    submitted_at: "2026-08-02T02:30:01.553Z",
    proof_base64: toBase64(hexToBytes(REAL_PROOF_HEX)),
    calendar: "https://a.pool.opentimestamps.org",
  };

  it("asks the named calendar for the commitment, never the digest", async () => {
    const fetchMock = vi.fn(
      async (..._args: unknown[]) => new Response(null, { status: 404 }),
    );
    const result = await upgradeDigestOts(REAL_DIGEST, pendingAnchor, {
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result).toBeNull();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe(
      `https://alice.btc.calendar.opentimestamps.org/timestamp/${REAL_COMMITMENT}`,
    );
    expect(url).not.toContain(REAL_DIGEST);
  });

  it("splices a 200 into a complete digest-to-Bitcoin proof", async () => {
    const subtree = hexToBytes("08f004deadbeef");
    const fetchMock = vi.fn(
      async () =>
        new Response(subtree.slice().buffer as ArrayBuffer, { status: 200 }),
    );
    const result = await upgradeDigestOts(REAL_DIGEST, pendingAnchor, {
      fetch: fetchMock as unknown as typeof fetch,
      now: new Date("2026-08-20T15:00:00Z"),
    });
    expect(result?.status).toBe("complete");
    expect(result?.upgraded_at).toBe("2026-08-20T15:00:00.000Z");
    const raw = atob(result?.proof_base64 ?? "");
    const hex = [...raw]
      .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    // Starts with the original ops chain, ends with the subtree —
    // the pending attestation is gone.
    expect(hex.startsWith("f00801a327")).toBe(true);
    expect(hex.endsWith("08f004deadbeef")).toBe(true);
    expect(hex).not.toContain("83dfe30d2ef90c8e");
  });

  it("still treats 404 on the right key as pending, not failed", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    const result = await upgradeDigestOts(REAL_DIGEST, pendingAnchor, {
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it("upgrades nothing when the stored proof cannot be parsed", async () => {
    const fetchMock = vi.fn();
    const result = await upgradeDigestOts(
      REAL_DIGEST,
      { ...pendingAnchor, proof_base64: toBase64(hexToBytes("f0ff")) },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
