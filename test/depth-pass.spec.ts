import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runChecks } from "@/services/preflight";
import { checkRailReceivable } from "@/services/rail-receivable";
import { checkEvmReceivable } from "@/services/evm-receivable";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE DEPTH PASS (2026-08-28), held by behavior.
 *
 * The instrument audit's third pass mapped every rung the ladder
 * left unclimbed and priced the free ones; the keeper's word was to
 * climb them, not just recaption the ones we stood on. These are the
 * new readings, each tested through the instrument that serves it:
 * the completed amount grammar, the EIP-712 signability read pointed
 * outward, accepts that disagree with each other, placements that
 * disagree with each other, the challenge that names somebody else's
 * host, the frozen Solana token account, and USDC's own blacklist on
 * the EVM rails. Every negative case has a positive twin — a deeper
 * instrument must not manufacture defects out of sound doors.
 */

const SOUND_ACCEPT = {
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0x0000000000000000000000000000000000000001",
  amount: "5000",
  extra: { name: "USD Coin", version: "2" },
};

function door(
  challenge: Record<string, unknown>,
  body = "{}",
): { response: Response; body: string } {
  return {
    response: new Response(body, {
      status: 402,
      headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
    }),
    body,
  };
}

const advisoryNames = (advisories: { name: string }[]): string[] =>
  advisories.map((advisory) => advisory.name);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the amount grammar, completed", () => {
  for (const bad of ["-5000", "5e3", "0x1388", ""]) {
    it(`"${bad}" fails amount-atomic — unsignable, not merely untidy`, () => {
      const { response, body } = door({
        x402Version: 2,
        accepts: [{ ...SOUND_ACCEPT, amount: bad }],
      });
      const { l3b, advisories } = runChecks(response, false, body);
      const amount = (l3b ?? []).find((check) => check.name === "amount-atomic");
      expect(amount?.ok).toBe(false);
      expect(amount?.detail).toContain("integer");
      expect(advisoryNames(advisories)).toContain("amount-not-atomic");
    });
  }

  it("a sound integer amount still passes, zero included", () => {
    const { response, body } = door({
      x402Version: 2,
      accepts: [{ ...SOUND_ACCEPT, amount: "0" }],
    });
    const { l3b } = runChecks(response, false, body);
    expect((l3b ?? []).find((check) => check.name === "amount-atomic")?.ok).toBe(
      true,
    );
  });
});

describe("EIP-712 signability, pointed outward", () => {
  it("an EVM entry without extra.name/version draws the advisory", () => {
    const { extra: _dropped, ...bare } = SOUND_ACCEPT;
    const { response, body } = door({ x402Version: 2, accepts: [bare] });
    const { advisories } = runChecks(response, false, body);
    expect(advisoryNames(advisories)).toContain("missing-eip712-domain-extra");
  });

  it("an entry carrying the domain extra draws nothing", () => {
    const { response, body } = door({ x402Version: 2, accepts: [SOUND_ACCEPT] });
    const { advisories } = runChecks(response, false, body);
    expect(advisoryNames(advisories)).not.toContain(
      "missing-eip712-domain-extra",
    );
  });

  it("a Solana entry is not asked an EVM question", () => {
    const { response, body } = door({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          payTo: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
          amount: "5000",
        },
      ],
    });
    const { advisories } = runChecks(response, false, body);
    expect(advisoryNames(advisories)).not.toContain(
      "missing-eip712-domain-extra",
    );
  });
});

describe("accepts that disagree with each other", () => {
  it("one rail, two prices draws conflicting-amounts", () => {
    const { response, body } = door({
      x402Version: 2,
      accepts: [SOUND_ACCEPT, { ...SOUND_ACCEPT, amount: "9000" }],
    });
    const { advisories } = runChecks(response, false, body);
    const conflict = advisories.find(
      (advisory) => advisory.name === "conflicting-amounts",
    );
    expect(conflict).toBeTruthy();
    expect(conflict!.detail).toContain("5000 vs 9000");
  });

  it("different rails at different prices are tiers, not a conflict", () => {
    const { response, body } = door({
      x402Version: 2,
      accepts: [
        SOUND_ACCEPT,
        {
          ...SOUND_ACCEPT,
          network: "eip155:137",
          asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
          amount: "9000",
        },
      ],
    });
    const { advisories } = runChecks(response, false, body);
    expect(advisoryNames(advisories)).not.toContain("conflicting-amounts");
  });
});

describe("placements that disagree with each other", () => {
  it("a body challenge offering different accepts than the header draws placement-mismatch", () => {
    const headerChallenge = { x402Version: 2, accepts: [SOUND_ACCEPT] };
    const bodyChallenge = {
      x402Version: 2,
      accepts: [{ ...SOUND_ACCEPT, amount: "999999" }],
    };
    const { response, body } = door(
      headerChallenge,
      JSON.stringify(bodyChallenge),
    );
    const { advisories } = runChecks(response, false, body);
    expect(advisoryNames(advisories)).toContain("placement-mismatch");
  });

  it("a byte-compatible mirror — our own till's shape — draws nothing", () => {
    const challenge = { x402Version: 2, accepts: [SOUND_ACCEPT] };
    const { response, body } = door(challenge, JSON.stringify(challenge));
    const { advisories } = runChecks(response, false, body);
    expect(advisoryNames(advisories)).not.toContain("placement-mismatch");
  });
});

describe("the challenge that names somebody else's host", () => {
  it("resource on another host draws resource-host-mismatch", () => {
    const { response, body } = door({
      x402Version: 2,
      resource: "https://somebody-else.example/api/buy/thing",
      accepts: [SOUND_ACCEPT],
    });
    const { advisories } = runChecks(
      response,
      false,
      body,
      "https://door.example/api/buy/thing",
    );
    const mismatch = advisories.find(
      (advisory) => advisory.name === "resource-host-mismatch",
    );
    expect(mismatch).toBeTruthy();
    expect(mismatch!.detail).toContain("somebody-else.example");
  });

  it("resource on the probed host — string or {url} — draws nothing", () => {
    for (const resource of [
      "https://door.example/api/buy/thing",
      { url: "https://door.example/api/buy/thing" },
    ]) {
      const { response, body } = door({
        x402Version: 2,
        resource,
        accepts: [SOUND_ACCEPT],
      });
      const { advisories } = runChecks(
        response,
        false,
        body,
        "https://door.example/api/buy/thing",
      );
      expect(advisoryNames(advisories)).not.toContain("resource-host-mismatch");
    }
  });

  it("with no probed URL to compare against, the read is skipped — never guessed", () => {
    const { response, body } = door({
      x402Version: 2,
      resource: "https://somebody-else.example/api/buy/thing",
      accepts: [SOUND_ACCEPT],
    });
    const { advisories } = runChecks(response, false, body);
    expect(advisoryNames(advisories)).not.toContain("resource-host-mismatch");
  });
});

/** A Solana ledger whose accounts carry the state the RPC returns. */
function stubSolanaLedger(
  accounts: { pubkey: string; state?: string }[] | null,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      if (accounts === null) {
        return new Response("upstream down", { status: 503 });
      }
      const request = JSON.parse(init?.body ?? "{}") as { method?: string };
      if (request.method !== "getTokenAccountsByOwner") {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }),
        );
      }
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            value: accounts.map((account) => ({
              pubkey: account.pubkey,
              ...(account.state
                ? { account: { data: { parsed: { info: { state: account.state } } } } }
                : {}),
            })),
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

const SOLANA_ACCEPT = {
  scheme: "exact",
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  payTo: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  amount: "5000",
};

describe("a frozen token account is not receivable", () => {
  it("every account explicitly frozen fails the rail check, and says FROZEN", async () => {
    stubSolanaLedger([{ pubkey: "ata1", state: "frozen" }]);
    const result = await checkRailReceivable(testEnv, [SOLANA_ACCEPT]);
    expect(result.check?.ok).toBe(false);
    expect(result.check?.detail).toContain("FROZEN");
  });

  it("an initialized account still passes", async () => {
    stubSolanaLedger([{ pubkey: "ata1", state: "initialized" }]);
    const result = await checkRailReceivable(testEnv, [SOLANA_ACCEPT]);
    expect(result.check?.ok).toBe(true);
  });

  it("an account whose state the RPC omitted is NOT read as frozen", async () => {
    // Derive or refuse, both directions: unknown must not fabricate
    // a defect any more than it may fabricate a pass.
    stubSolanaLedger([{ pubkey: "ata1" }]);
    const result = await checkRailReceivable(testEnv, [SOLANA_ACCEPT]);
    expect(result.check?.ok).toBe(true);
  });
});

/** An EVM ledger answering USDC's isBlacklisted eth_call. */
function stubEvmLedger(answer: "yes" | "no" | "down"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      if (answer === "down") {
        return new Response("upstream down", { status: 503 });
      }
      const request = JSON.parse(init?.body ?? "{}") as {
        method?: string;
        params?: { data?: string }[];
      };
      if (request.method !== "eth_call") {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x" }),
        );
      }
      expect(request.params?.[0]?.data?.startsWith("0xfe575a87")).toBe(true);
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: `0x${"0".repeat(63)}${answer === "yes" ? "1" : "0"}`,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

describe("USDC's blacklist, read on the EVM rails", () => {
  it("a blacklisted payTo draws the finding, from the contract's own answer", async () => {
    stubEvmLedger("yes");
    const { advisories } = await checkEvmReceivable(testEnv, [SOUND_ACCEPT]);
    expect(advisories.map((advisory) => advisory.name)).toContain(
      "payto-usdc-blacklisted",
    );
  });

  it("a clear payTo draws the affirmative reading, not silence", async () => {
    stubEvmLedger("no");
    const { advisories } = await checkEvmReceivable(testEnv, [SOUND_ACCEPT]);
    expect(advisories.map((advisory) => advisory.name)).toContain(
      "evm-rail-receivable",
    );
    expect(advisories.map((advisory) => advisory.name)).not.toContain(
      "payto-usdc-blacklisted",
    );
  });

  it("an unread ledger is OUR gap, never the door's defect and never a pass", async () => {
    stubEvmLedger("down");
    const { advisories } = await checkEvmReceivable(testEnv, [SOUND_ACCEPT]);
    expect(advisories.map((advisory) => advisory.name)).toContain(
      "evm-rail-unread",
    );
  });

  it("a non-USDC or non-EVM offer is not asked the question at all", async () => {
    stubEvmLedger("yes");
    const { advisories } = await checkEvmReceivable(testEnv, [
      SOLANA_ACCEPT,
      { ...SOUND_ACCEPT, asset: "0x1111111111111111111111111111111111111111" },
    ]);
    expect(advisories).toEqual([]);
  });
});
