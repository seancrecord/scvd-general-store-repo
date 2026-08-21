import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256, toHex } from "viem";
import { observeSettlement } from "@/services/attestation";
import { POLYGON_USDC, TRANSFER_TOPIC } from "@/lib/base-rpc";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * A 0x HASH NAMES AN EVM TRANSACTION, NOT A CHAIN — the parity gap the
 * 2026-08-21 freshness order surfaced. The attestation's rail dispatch
 * reads the identifier's shape: base58 is Solana, 0x-hex was Base. The
 * day Polygon lit, that second arm became a coin flip wearing a rule's
 * clothing: a Polygon settlement is 0x-hex too, and the old code would
 * have signed NOT_FOUND about a payment sitting in plain view one
 * chain over — the exact false-negative class this product must never
 * produce. Now: Base first, Polygon before any NOT_FOUND is signed,
 * and a hash on neither names both reads on the artifact.
 */

const HASH = keccak256(toHex("scvd.store polygon parity check, 2026-08-21"));
const PAYER = "0x843b544bf5f0aa6cbf13e94563874878c98cc4a7";
const PAY_TO = "0xdd350976b8cffc65938c0464d39a2c78be079bd0";

const pad = (address: string) =>
  `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

/** Half a dollar of USDC in atomic units, as log data. */
const HALF_DOLLAR = `0x${(500000n).toString(16).padStart(64, "0")}`;

function polygonReceipt(): unknown {
  return {
    status: "0x1",
    blockNumber: "0x3f0f5c43",
    logs: [
      {
        address: POLYGON_USDC,
        topics: [TRANSFER_TOPIC, pad(PAYER), pad(PAY_TO)],
        data: HALF_DOLLAR,
      },
    ],
  };
}

/**
 * Answers Base reads and Polygon reads differently, keyed on the
 * endpoint's host — the same way production differs: they are
 * different networks, not different parameters.
 */
function stubTwoChains(options: {
  baseReceipt: unknown;
  polygonReceipt: unknown;
}): { polygonAsked: () => boolean } {
  let polygonAsked = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      const isPolygon = String(url).includes("polygon");
      if (isPolygon) polygonAsked = true;
      const body = JSON.parse(init?.body ?? "{}") as { method?: string };
      const result =
        body.method === "eth_blockNumber"
          ? "0x3f0f5d00"
          : isPolygon
            ? options.polygonReceipt
            : options.baseReceipt;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return { polygonAsked: () => polygonAsked };
}

describe("the EVM rails share one identifier shape", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds a Polygon settlement a Base-only read would have called NOT_FOUND", async () => {
    stubTwoChains({ baseReceipt: null, polygonReceipt: polygonReceipt() });
    const observation = await observeSettlement(testEnv, { txHash: HASH });
    expect(observation.status).toBe("SETTLED");
    expect(observation.chain).toBe("eip155:137");
    expect(observation.payer).toBe(PAYER);
    expect(observation.recipient).toBe(PAY_TO);
    expect(observation.amount_usdc).toBe(0.5);
    expect(observation.reading).toContain("Polygon");
    expect(observation.scope).toContain("Polygon");
  });

  it("signs NOT_FOUND only after reading both EVM chains, and says so", async () => {
    const probe = stubTwoChains({ baseReceipt: null, polygonReceipt: null });
    const observation = await observeSettlement(testEnv, { txHash: HASH });
    expect(observation.status).toBe("NOT_FOUND");
    expect(probe.polygonAsked()).toBe(true);
    expect(
      (observation as unknown as { chains_checked?: string[] }).chains_checked,
    ).toEqual(["eip155:8453", "eip155:137"]);
    expect(observation.reading).toContain("Neither Base nor Polygon");
  });

  it("never bothers Polygon when Base already holds the receipt", async () => {
    const baseReceipt = {
      ...polygonReceipt(),
      logs: [], // present but USDC-free: INSUFFICIENT_MATCH on Base
    };
    const probe = stubTwoChains({ baseReceipt, polygonReceipt: null });
    const observation = await observeSettlement(testEnv, { txHash: HASH });
    expect(observation.chain).toBe("eip155:8453");
    expect(observation.status).toBe("INSUFFICIENT_MATCH");
    expect(probe.polygonAsked()).toBe(false);
  });
});
