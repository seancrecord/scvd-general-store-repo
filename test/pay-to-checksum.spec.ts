import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  arbitrumPayTo,
  basePayTo,
  evmCheckoutPayTo,
  polygonPayTo,
  worldPayTo,
} from "@/lib/payment-networks";
import { manifestAccepts, railAccepts } from "@/lib/payments";
import type { Env } from "@/types";

/**
 * ONE WALLET, ONE SPELLING, ON BOTH WORKERS (2026-09-12).
 *
 * The doors Worker had its Polygon and World secrets typed lowercase
 * and the store had them checksummed. Nothing in the tree could see
 * it: the parity spec runs both apps against ONE env, and the live
 * comparator lowercases addresses before it compares. The day two
 * doors moved to the store, the shelf quoted the same wallet two ways
 * and x402-list filed a payTo rotation. So this spec hands the helpers
 * every spelling a keeper could type and requires the wire to carry
 * exactly one: EIP-55, the form the SDK already uses for the asset
 * beside it.
 */
const WALLET = "0xDD350976B8cfFc65938C0464d39A2C78BE079bd0";
const SPELLINGS = [WALLET, WALLET.toLowerCase(), `0x${WALLET.slice(2).toUpperCase()}`, `  ${WALLET.toLowerCase()}  `];

function withRails(spelling: string): Env {
  return {
    ...(env as unknown as Env),
    PAY_TO_ADDRESS: spelling,
    POLYGON_PAY_TO: spelling,
    ARBITRUM_PAY_TO: spelling,
    WORLD_PAY_TO: spelling,
  };
}

describe("every EVM pay-to is quoted in EIP-55, however the secret was typed", () => {
  it("the helpers agree on one spelling", () => {
    for (const spelling of SPELLINGS) {
      const rails = withRails(spelling);
      expect(basePayTo(rails), spelling).toBe(WALLET);
      expect(polygonPayTo(rails), spelling).toBe(WALLET);
      expect(arbitrumPayTo(rails), spelling).toBe(WALLET);
      expect(worldPayTo(rails), spelling).toBe(WALLET);
      for (const key of ["base", "polygon", "arbitrum", "world"]) {
        expect(evmCheckoutPayTo(rails, key), `${key} ${spelling}`).toBe(WALLET);
      }
    }
  });

  it("what is not an address is still refused", () => {
    for (const bad of ["", "0x1234", "DD350976B8cfFc65938C0464d39A2C78BE079bd0", `${WALLET}0`, "not-an-address"]) {
      const rails = withRails(bad);
      expect(polygonPayTo(rails), bad).toBeNull();
      expect(arbitrumPayTo(rails), bad).toBeNull();
      expect(worldPayTo(rails), bad).toBeNull();
      expect(basePayTo(rails), bad).toBeNull();
    }
  });

  it("the 402 terms and the discovery accepts carry the checksummed wallet on every EVM entry", () => {
    for (const spelling of SPELLINGS) {
      const rails = withRails(spelling);
      const evmTerms = railAccepts(rails, [0.005]).filter((option) => String(option.network).startsWith("eip155:"));
      expect(evmTerms.length, spelling).toBe(4);
      for (const option of evmTerms) {
        expect(option.payTo, `${option.network} ${spelling}`).toBe(WALLET);
      }
      const evmManifest = manifestAccepts(rails, [0.005]).filter((entry) => entry.network.startsWith("eip155:"));
      expect(evmManifest.length, spelling).toBe(4);
      for (const entry of evmManifest) {
        expect(entry.payTo, `${entry.network} ${spelling}`).toBe(WALLET);
      }
    }
  });

  it("a Base wallet that is not an address goes out as typed rather than vanishing", () => {
    const rails = { ...(env as unknown as Env), PAY_TO_ADDRESS: "not-an-address" };
    const base = railAccepts(rails, [0.005]).find((option) => option.network === "eip155:8453");
    expect(base?.payTo).toBe("not-an-address");
  });
});
