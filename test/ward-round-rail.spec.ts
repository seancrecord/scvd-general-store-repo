import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { probeHost } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * ROADMAP 0.14 — THE CENSUS CERTIFIED DOORS THAT COULD NOT BE PAID.
 *
 * Found live 2026-08-24. Two of this store's own surfaces contradicted
 * each other in public about the same door on the same day:
 *
 *   /corpus/host/hypernatt.com.json   ready,     failed: []
 *   /api/preflight/v2                 not_ready, solana-rail-receivable
 *
 * The Solana payTo owned no USDC token account, so the door answered a
 * perfect 402 and could not be credited. The corpus — signed,
 * hash-chained, OpenTimestamps-anchored — was the one that was wrong,
 * and the anchoring is what made it serious: a durable false verdict
 * with a proof of authorship attached.
 *
 * The cause was not a missing check. The check existed, was free, was
 * live, and was correct — `runChecks` even hands back `accepts`
 * specifically so a caller needing the network read would not have to
 * decode the challenge twice. The ward round simply never called it.
 *
 * These tests are the acceptance criteria from roadmap item 0.14, and
 * the third one is the one that matters most: an unreadable ledger is
 * its own gap, never a pass.
 */

const UNFUNDED = "6Q6XvS1kBjNrJ4vTRSvvkRcQH8QpKQm6BCFbW1cTfPqB";
const FUNDED = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

/** A well-formed x402 v2 challenge on the Solana rail. */
function challenge(payTo: string): string {
  return btoa(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: SOLANA_CHAIN,
          payTo,
          asset: SOLANA_USDC_MINT,
          amount: "5000",
        },
      ],
      extensions: { bazaar: { info: { name: "probe fixture" } } },
    }),
  );
}

/**
 * One stub for two very different callees: the door being probed, and
 * the Solana ledger the rail check reads. `ledger: null` is the
 * outage case — every RPC in the fallback chain refusing.
 */
function stubWorld(payTo: string, ledger: Record<string, string[]> | null): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      /*
       * HOSTNAME, NOT PREFIX. `startsWith("https://door.example")`
       * also matches https://door.example.evil.com — CodeQL flagged
       * it high, correctly, and it is the second time this exact
       * shape has appeared in this repo (the first was
       * startsWith("https://scvd.store") in the developer-portal
       * spec, same morning).
       *
       * It is "only a test", and that is the reason to fix it rather
       * than suppress it: a fake seller that answers for hosts it was
       * never meant to answer for can make a test pass for a request
       * the code should never have sent. A stub with a loose matcher
       * is a stub that hides routing bugs.
       */
      const target = String(url);
      let isDoor = false;
      try {
        const parsed = new URL(target);
        isDoor =
          parsed.protocol === "https:" && parsed.hostname === "door.example";
      } catch {
        isDoor = false;
      }
      if (isDoor) {
        return new Response(null, {
          status: 402,
          headers: { "PAYMENT-REQUIRED": challenge(payTo) },
        });
      }
      if (ledger === null) return new Response("upstream down", { status: 503 });
      const body = JSON.parse(init?.body ?? "{}") as {
        method?: string;
        params?: unknown[];
      };
      if (body.method !== "getTokenAccountsByOwner") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
      }
      const owner = String((body.params ?? [])[0]);
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { value: (ledger[owner] ?? []).map((pubkey) => ({ pubkey })) },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the census stops certifying doors that cannot be paid", () => {
  it("refuses READY when the Solana payTo owns no USDC account", async () => {
    /*
     * THE RED TEST. Before the fix this asserted `ready` with an empty
     * failed[] — a perfect 402 whose money has nowhere to land, signed
     * and anchored as sound.
     */
    stubWorld(UNFUNDED, { [UNFUNDED]: [] });
    const result = await probeHost(testEnv, "https://door.example/paid");

    expect(result.verdict).toBe("not_ready");
    expect(result.failed).toContain("solana-rail-receivable");
  });

  it("still passes a door whose payTo can actually be credited", async () => {
    // The fix must not manufacture a defect out of a working rail.
    stubWorld(FUNDED, { [FUNDED]: ["tokenAccount111"] });
    const result = await probeHost(testEnv, "https://door.example/paid");

    expect(result.verdict).toBe("ready");
    expect(result.failed).toEqual([]);
  });

  it("records an unreadable ledger as OUR gap, never as a pass", async () => {
    /*
     * The third state, and the reason this item was worth a roadmap
     * entry rather than a one-line patch. The RPC path already fails
     * over four deep — SOLANA_RPC_URL, PublicNode, dRPC,
     * mainnet-beta — so a total outage is rare. Rare is not never, and
     * a missing answer rendered as a clean one is the exact defect
     * this whole item exists to remove.
     */
    stubWorld(UNFUNDED, null);
    const result = await probeHost(testEnv, "https://door.example/paid");

    // We could not tell, so we do not claim the door failed...
    expect(result.failed).not.toContain("solana-rail-receivable");
    // ...and we do not quietly claim it passed either.
    expect(result.advisories.join(" ")).toContain("rail");
  });

  it("says nothing at all about a door with no Solana rail", async () => {
    // A check that does not apply must not imply a test was run.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 402,
            headers: {
              "PAYMENT-REQUIRED": btoa(
                JSON.stringify({
                  x402Version: 2,
                  accepts: [
                    {
                      scheme: "exact",
                      network: "eip155:8453",
                      payTo: "0x1111111111111111111111111111111111111111",
                      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                      amount: "5000",
                    },
                  ],
                  extensions: { bazaar: { info: { name: "evm fixture" } } },
                }),
              ),
            },
          }),
      ),
    );
    const result = await probeHost(testEnv, "https://door.example/paid");

    expect(result.failed).not.toContain("solana-rail-receivable");
    expect(result.advisories.join(" ")).not.toContain("rail");
  });
});
