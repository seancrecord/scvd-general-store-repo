import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeHost } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE CITATION, HELD BY BEHAVIOR (the instrument audit, 2026-08-28).
 *
 * The 2026-08-26 correction promised "a test that holds the citation
 * to account… requires that the round can actually fail a door on
 * each" check the cited battery adds. The test that shipped compared
 * BATTERY_ADDS[v2] to a function that returned BATTERY_ADDS[v2] — a
 * constant checked against itself. Delete the trio fold from
 * probeHost and it stayed green: rule 46's exact shape (a guard that
 * cannot fail argues for the lie), standing inside a published
 * correction's own what_changed.
 *
 * These are the tests that promise actually requires: one stubbed
 * door per trio check, each walked through the census's own
 * probeHost, each REQUIRED to come back not_ready with the check
 * named in failed[]. The rail fold has its own behavioral suite
 * (ward-round-rail.spec.ts); together the four cover everything the
 * v2 citation adds. Now the fold can only be deleted by turning
 * these red.
 */

function stubDoor(accept: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      let isDoor = false;
      try {
        const parsed = new URL(String(url));
        isDoor =
          parsed.protocol === "https:" && parsed.hostname === "door.example";
      } catch {
        isDoor = false;
      }
      if (!isDoor) {
        return new Response("not the door", { status: 503 });
      }
      return new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({ x402Version: 2, accepts: [accept] }),
          ),
        },
      });
    }),
  );
}

const SOUND_ACCEPT = {
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0x0000000000000000000000000000000000000001",
  amount: "5000",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the census can actually fail a door on every check its citation adds", () => {
  it("payto-payable: a name for a payTo scores not_ready", async () => {
    stubDoor({ ...SOUND_ACCEPT, payTo: "seller.eth" });
    const result = await probeHost(testEnv, "https://door.example/paid");
    expect(result.verdict).toBe("not_ready");
    expect(result.failed).toContain("payto-payable");
  });

  it("amount-atomic: a decimal amount scores not_ready", async () => {
    stubDoor({ ...SOUND_ACCEPT, amount: "0.005" });
    const result = await probeHost(testEnv, "https://door.example/paid");
    expect(result.verdict).toBe("not_ready");
    expect(result.failed).toContain("amount-atomic");
  });

  it("network-mainnet: a testnet offer scores not_ready", async () => {
    stubDoor({ ...SOUND_ACCEPT, network: "eip155:84532" });
    const result = await probeHost(testEnv, "https://door.example/paid");
    expect(result.verdict).toBe("not_ready");
    expect(result.failed).toContain("network-mainnet");
  });

  it("and a sound door still scores ready — the fold must not manufacture defects", async () => {
    stubDoor(SOUND_ACCEPT);
    const result = await probeHost(testEnv, "https://door.example/paid");
    expect(result.verdict).toBe("ready");
    expect(result.failed).toEqual([]);
  });
});
