import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import { ownershipProofs } from "@/routes/openapi";

/**
 * OWNERSHIP OF THIS ORIGIN, PROVED THE WAY THE READER CHECKS IT.
 *
 * `@agentcash/discovery` v1.7.5 — the validator x402scan, mppscan and
 * AgentCash share — reads `x-agentcash-provenance.ownershipProofs`
 * from this document's root and verifies each entry with viem's
 * `recoverMessageAddress` against the payTo addresses the accepts
 * name, having signed nothing but THE BARE ORIGIN STRING. A match
 * moves the origin from `origin_hosted` to `ownership_verified`.
 *
 * WHAT THIS FILE CAN AND CANNOT GUARD, said plainly rather than
 * implied. It can prove the mechanism: that the message a keeper is
 * told to sign is the message that verifies, that a signature by a
 * NON-payTo wallet fails, and that an unset secret leaves the
 * extension off the document instead of publishing an empty proof
 * list. It CANNOT verify the production proof, which lives in a
 * secret this suite does not hold — that is
 * `scripts/ownership-check.mjs`, which re-reads the live document and
 * fails when a published proof stops matching the payTo currently
 * advertised. Both exist because a rotated wallet silently un-proves
 * an origin and no other surface here would notice.
 */
const ORIGIN = "https://scvd.store";

describe("the origin ownership proof", () => {
  it("verifies when the bare origin is signed by the payTo wallet", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const signature = await account.signMessage({ message: ORIGIN });

    // Exactly what the reader does: recover from the origin string.
    const recovered = await recoverMessageAddress({ message: ORIGIN, signature });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("fails for a trailing slash, a path, or another wallet", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const stranger = privateKeyToAccount(`0x${"22".repeat(32)}`);

    for (const wrong of [`${ORIGIN}/`, `${ORIGIN}/openapi.json`, "scvd.store"]) {
      const signature = await account.signMessage({ message: wrong });
      const recovered = await recoverMessageAddress({ message: ORIGIN, signature });
      expect(recovered.toLowerCase(), wrong).not.toBe(account.address.toLowerCase());
    }

    const strangerSig = await stranger.signMessage({ message: ORIGIN });
    const recovered = await recoverMessageAddress({ message: ORIGIN, signature: strangerSig });
    expect(recovered.toLowerCase()).not.toBe(account.address.toLowerCase());
  });

  it("parses a proof list from whitespace, commas, or both", () => {
    expect(ownershipProofs({ ORIGIN_OWNERSHIP_PROOFS: "0xaa, 0xbb" } as never)).toEqual(["0xaa", "0xbb"]);
    expect(ownershipProofs({ ORIGIN_OWNERSHIP_PROOFS: "0xaa\n0xbb" } as never)).toEqual(["0xaa", "0xbb"]);
    expect(ownershipProofs({ ORIGIN_OWNERSHIP_PROOFS: "  0xaa  " } as never)).toEqual(["0xaa"]);
  });

  it("claims nothing when the secret is unset, empty, or only separators", () => {
    for (const value of [undefined, "", "   ", " , , "]) {
      expect(ownershipProofs({ ORIGIN_OWNERSHIP_PROOFS: value } as never), String(value)).toEqual([]);
    }
  });

  /**
   * The served document, on a suite that holds no proof secret: the
   * extension must be ABSENT, never present-and-empty. A reader that
   * finds `ownershipProofs: []` is told a proof mechanism is in use
   * and handed nothing to check.
   */
  it("omits the extension entirely rather than publishing an empty proof list", async () => {
    const response = await SELF.fetch("https://scvd.store/openapi.json");
    expect(response.status).toBe(200);
    const doc = (await response.json()) as Record<string, unknown>;
    const provenance = doc["x-agentcash-provenance"] as { ownershipProofs?: unknown } | undefined;
    if (provenance === undefined) {
      expect(doc).not.toHaveProperty("x-agentcash-provenance");
      return;
    }
    // If a proof IS configured here, it must be a non-empty list of strings.
    expect(Array.isArray(provenance.ownershipProofs)).toBe(true);
    expect((provenance.ownershipProofs as unknown[]).length).toBeGreaterThan(0);
    for (const proof of provenance.ownershipProofs as unknown[]) {
      expect(typeof proof).toBe("string");
      expect((proof as string).length).toBeGreaterThan(0);
    }
  });
});
