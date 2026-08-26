import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PREFLIGHT_VERSION_NEXT,
  preflightUrl,
  runChecks,
} from "@/services/preflight";

/**
 * ROADMAP 2.1c — THE ADVISORY-BLIND VERDICT (ledger B3, B-adversarial #3).
 *
 * A 402 whose payTo is an unresolvable name, whose amount carries a
 * decimal point (a millionfold underprice), or whose network is a
 * testnet reads "ready" today and holds that verdict for seven days —
 * because those three observations are advisories, and advisories are
 * discarded before scoring. A door nobody can pay is not ready by any
 * reading a buyer would accept.
 *
 * The fold follows the rail read's contract exactly: v1 stays frozen
 * (same checks, same verdict, the frozen series keeps meaning what it
 * meant), v2 counts the L3b consistency trio. One observation, two
 * scorings — they can never disagree about what was seen.
 */

function door(entry: Record<string, unknown>): void {
  const challenge = btoa(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          payTo: "0x4444444444444444444444444444444444444444",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          amount: "5000",
          maxTimeoutSeconds: 300,
          ...entry,
        },
      ],
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("", {
          status: 402,
          headers: { "PAYMENT-REQUIRED": challenge },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runChecks hands back the L3b trio beside the battery", () => {
  const probe = (entry: Record<string, unknown>) => {
    const challenge = btoa(
      JSON.stringify({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            payTo: "0x4444444444444444444444444444444444444444",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            amount: "5000",
            maxTimeoutSeconds: 300,
            ...entry,
          },
        ],
      }),
    );
    return runChecks(
      new Response("", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": challenge },
      }),
      false,
    );
  };

  it("a clean door passes all three", () => {
    const { l3b } = probe({});
    expect(l3b?.map((c) => c.name).sort()).toEqual([
      "amount-atomic",
      "network-mainnet",
      "payto-payable",
    ]);
    for (const check of l3b ?? []) {
      expect(check.ok).toBe(true);
    }
  });

  it("a payTo name fails payto-payable and cites the entry", () => {
    const { l3b } = probe({ payTo: "shop.base.eth" });
    const check = l3b?.find((c) => c.name === "payto-payable");
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain("accepts[0]");
  });

  it("a decimal amount fails amount-atomic", () => {
    const { l3b } = probe({ amount: "0.005" });
    expect(l3b?.find((c) => c.name === "amount-atomic")?.ok).toBe(false);
  });

  it("a testnet network fails network-mainnet", () => {
    const { l3b } = probe({ network: "eip155:84532" });
    expect(l3b?.find((c) => c.name === "network-mainnet")?.ok).toBe(false);
  });

  it("no accepts, no trio: absent, not fabricated", () => {
    const challenge = btoa(JSON.stringify({ x402Version: 2, accepts: [] }));
    const { l3b } = runChecks(
      new Response("", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": challenge },
      }),
      false,
    );
    expect(l3b).toBeUndefined();
  });
});

describe("the fold: v2 counts what v1 only mentions", () => {
  it("an unpayable 402 is not_ready under v2 while v1 stays ready — and both are served", async () => {
    door({ payTo: "shop.base.eth" });
    const result = await preflightUrl(
      "https://door.example/api/thing",
      env as never,
      PREFLIGHT_VERSION_NEXT,
    );
    const body = result.body as {
      verdict: string;
      checks: { name: string; ok: boolean }[];
      also_under?: { verdict: string };
    };
    expect(body.verdict).toBe("not_ready");
    expect(body.checks.find((c) => c.name === "payto-payable")?.ok).toBe(false);
    // The frozen series keeps meaning what it meant.
    expect(body.also_under?.verdict).toBe("ready");
  }, 30_000);

  it("v1 serves the same door as ready with no L3b names in its checks", async () => {
    door({ payTo: "shop.base.eth" });
    const result = await preflightUrl(
      "https://door.example/api/thing",
      env as never,
    );
    const body = result.body as {
      verdict: string;
      checks: { name: string }[];
      also_under?: { verdict: string };
    };
    expect(body.verdict).toBe("ready");
    expect(body.checks.some((c) => c.name === "payto-payable")).toBe(false);
    // And the disagreement is announced, not discovered later.
    expect(body.also_under?.verdict).toBe("not_ready");
  }, 30_000);

  it("a clean mainnet door is ready under both, with the trio present and passing in v2", async () => {
    door({});
    const result = await preflightUrl(
      "https://door.example/api/thing",
      env as never,
      PREFLIGHT_VERSION_NEXT,
    );
    const body = result.body as {
      verdict: string;
      checks: { name: string; ok: boolean }[];
      also_under?: { verdict: string };
    };
    expect(body.verdict).toBe("ready");
    expect(body.also_under?.verdict).toBe("ready");
    for (const name of ["payto-payable", "amount-atomic", "network-mainnet"]) {
      expect(body.checks.find((c) => c.name === name)?.ok).toBe(true);
    }
  }, 30_000);
});
