import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  BASE_NETWORK,
  SOLANA_NETWORK,
  railAccepts,
  solanaPayTo,
} from "@/lib/payments";
import { mintCertificate } from "@/services/certificates";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE SECOND RAIL (PAYMENT_RAILS.md, gates run 2026-08-04): USDC on
 * Solana through the SAME facilitator, flag-gated on SOLANA_PAY_TO.
 * What these pin: the flag unset changes NOTHING; the flag set
 * appends entries without moving accepts[0]; a malformed address
 * mints no offer; and the cert records which rail settled rather
 * than reconstructing it.
 */

// A valid-shaped base58 pubkey (USDC's own mint address, 44 chars).
const SOL_ADDR = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function envWith(solana: string | undefined): Env {
  return { ...testEnv, SOLANA_PAY_TO: solana } as Env;
}

describe("the flag gate", () => {
  it("unset: accepts are exactly the Base entries, nothing else", () => {
    const accepts = railAccepts(envWith(undefined), [0.005, 0.01]);
    expect(accepts).toHaveLength(2);
    expect(accepts.every((entry) => entry.network === BASE_NETWORK)).toBe(true);
  });

  it("set: Solana entries append, one per tier, same amounts", () => {
    const accepts = railAccepts(envWith(SOL_ADDR), [0.005, 0.01, 0.025]);
    expect(accepts).toHaveLength(6);
    const solana = accepts.filter((entry) => entry.network === SOLANA_NETWORK);
    expect(solana).toHaveLength(3);
    expect(solana.map((entry) => entry.price)).toEqual([
      "$0.005",
      "$0.01",
      "$0.025",
    ]);
    expect(solana.every((entry) => entry.payTo === SOL_ADDR)).toBe(true);
  });

  it("accepts[0] stays the Base minimum tier — the compatibility promise", () => {
    /**
     * Clients that blindly sign the first offer exist and were
     * working before the rail did. The first entry may never move.
     */
    const accepts = railAccepts(envWith(SOL_ADDR), [0.005, 0.01]);
    expect(accepts[0]).toMatchObject({
      network: BASE_NETWORK,
      price: "$0.005",
    });
  });

  it("a malformed address mints no offer nobody can pay", () => {
    // 0x-hex is an EVM address pasted in the wrong slot — the
    // likeliest real mistake, refused rather than offered.
    expect(solanaPayTo(envWith("0x137ae5e3c7ed176744226f67223de50ca3a19e5a"))).toBeNull();
    expect(solanaPayTo(envWith("too-short"))).toBeNull();
    expect(solanaPayTo(envWith("  "))).toBeNull();
    expect(solanaPayTo(envWith(SOL_ADDR))).toBe(SOL_ADDR);
    const accepts = railAccepts(envWith("not-base58-0OIl"), [0.005]);
    expect(accepts).toHaveLength(1);
    expect(accepts[0]!.network).toBe(BASE_NETWORK);
  });
});

describe("the cert records which rail settled", () => {
  it("a Solana settle writes the Solana network into the signed artifact", async () => {
    const minted = await mintCertificate(testEnv, {
      itemId: "small_blessing",
      paidUsdc: 0.005,
      payer: SOL_ADDR,
      settlementTx: "5".repeat(64),
      network: SOLANA_NETWORK,
    });
    expect(minted.certificate.network).toBe(SOLANA_NETWORK);
  });

  it("a settle with no network recorded falls back to Base — what every pre-rail settle was", async () => {
    const minted = await mintCertificate(testEnv, {
      itemId: "small_blessing",
      paidUsdc: 0.005,
    });
    expect(minted.certificate.network).toBe(BASE_NETWORK);
  });
});
