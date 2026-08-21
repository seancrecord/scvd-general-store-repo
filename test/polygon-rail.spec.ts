import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { railOf } from "@/lib/metrics";
import {
  BASE_NETWORK,
  POLYGON_NETWORK,
  POLYGON_SETTLED_TOTAL_KEY,
  SOLANA_NETWORK,
  acceptedNetworks,
  polygonPayTo,
  railAccepts,
  recordPolygonSettle,
} from "@/lib/payments";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE THIRD RAIL (2026-08-20): USDC on Polygon PoS through the SAME
 * facilitator, flag-gated on POLYGON_PAY_TO, mirroring the Solana
 * rail's whole discipline — because PAYMENT_RAILS.md's rules are
 * per-rail, not per-incident. What these pin: the flag unset changes
 * NOTHING; the flag set appends entries without moving accepts[0];
 * a malformed address mints no offer; the books give Polygon its own
 * bucket instead of the silent-Base bug this build caught; and the
 * unreconciled cap counts from the first settle.
 */

const POLY_ADDR = "0x843b544bf5f0AA6cbf13E94563874878C98cc4a7";

function envWith(polygon: string | undefined): Env {
  return {
    ...testEnv,
    POLYGON_PAY_TO: polygon,
    SOLANA_PAY_TO: undefined,
  } as Env;
}

describe("the flag gate", () => {
  it("unset: accepts are exactly the Base entries — byte-identical to before the rail", () => {
    const accepts = railAccepts(envWith(undefined), [0.005, 0.01]);
    expect(accepts).toHaveLength(2);
    expect(accepts.every((entry) => entry.network === BASE_NETWORK)).toBe(true);
  });

  it("set: Polygon entries append, one per tier, same amounts, same address shape", () => {
    const accepts = railAccepts(envWith(POLY_ADDR), [0.005, 0.01, 0.025]);
    expect(accepts).toHaveLength(6);
    const polygon = accepts.filter(
      (entry) => entry.network === POLYGON_NETWORK,
    );
    expect(polygon).toHaveLength(3);
    expect(polygon.map((entry) => entry.price)).toEqual([
      "$0.005",
      "$0.01",
      "$0.025",
    ]);
    expect(polygon.every((entry) => entry.payTo === POLY_ADDR)).toBe(true);
  });

  it("accepts[0] stays the Base minimum tier — the compatibility promise survives a third rail", () => {
    const accepts = railAccepts(envWith(POLY_ADDR), [0.005, 0.01]);
    expect(accepts[0]).toMatchObject({
      network: BASE_NETWORK,
      price: "$0.005",
    });
  });

  it("with all three rails lit, EVM entries precede Solana and Base still leads", () => {
    const both = {
      ...testEnv,
      POLYGON_PAY_TO: POLY_ADDR,
      SOLANA_PAY_TO: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    } as Env;
    const networks = railAccepts(both, [0.01]).map((entry) => entry.network);
    expect(networks).toEqual([BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK]);
    expect(acceptedNetworks(both)).toEqual([
      BASE_NETWORK,
      POLYGON_NETWORK,
      SOLANA_NETWORK,
    ]);
  });

  it("a malformed address mints no offer", () => {
    for (const bad of ["843b544bf5f0", "0x12345", " ", "polygon-please"]) {
      expect(polygonPayTo(envWith(bad))).toBeNull();
      expect(
        railAccepts(envWith(bad), [0.01]).every(
          (entry) => entry.network === BASE_NETWORK,
        ),
      ).toBe(true);
    }
  });
});

describe("the books know the difference", () => {
  it("routes eip155:137 to its own bucket, never to Base", () => {
    // The bug this build caught: railOf mapped EVERY eip155 network to
    // "base", which would have silently booked Polygon income as Base
    // income. Structural, so it gets a structural pin.
    expect(railOf("eip155:137")).toBe("polygon");
    expect(railOf(BASE_NETWORK)).toBe("base");
    expect(railOf("eip155:8453")).toBe("base");
    expect(railOf(SOLANA_NETWORK)).toBe("solana");
    // Legacy behavior for every other EVM network is preserved: the
    // stored history was written under it and must keep meaning what
    // it meant.
    expect(railOf("eip155:42161")).toBe("base");
  });
});

describe("the unreconciled cap", () => {
  it("counts from the first settle, bounded and named", async () => {
    await testEnv.COUNTERS.delete(POLYGON_SETTLED_TOTAL_KEY);
    await recordPolygonSettle(testEnv, 0.25);
    await recordPolygonSettle(testEnv, 0.5);
    expect(await testEnv.COUNTERS.get(POLYGON_SETTLED_TOTAL_KEY)).toBe("0.75");
    await testEnv.COUNTERS.delete(POLYGON_SETTLED_TOTAL_KEY);
  });
});
