import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import {
  RECEIVABLE_CHECK,
  checkRailReceivable,
  solanaPayTos,
} from "@/services/rail-receivable";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * A DOOR THAT 402s PERFECTLY AND CANNOT BE PAID.
 *
 * 2026-08-23. An independent tester walked 37 x402 doors and published
 * every result. Two failed a class it named `rail-cannot-receive`: the
 * offer named a payTo owning no USDC token account, so a payment has
 * nowhere to land and dies in simulation before it can broadcast.
 * Every structural check passes. From the operator's own logs it looks
 * like a shop with no customers.
 *
 * IT FOUND THAT BY PAYING. WE DO NOT HAVE TO — on Solana, USDC is an
 * SPL token and whether an address can receive it is one unpaid read
 * of a public ledger. The deepest defect class published in this
 * market so far is free for us to detect, for every door, with no
 * wallet.
 */

const RECEIVER = "6Q6XvS1kBjNrJ4vTRSvvkRcQH8QpKQm6BCFbW1cTfPqB";
const OTHER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function solanaOffer(payTo: string) {
  return {
    scheme: "exact",
    network: SOLANA_CHAIN,
    payTo,
    asset: SOLANA_USDC_MINT,
    amount: "5000",
  };
}

function stubLedger(accountsByOwner: Record<string, string[]>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as {
        method?: string;
        params?: unknown[];
      };
      if (body.method !== "getTokenAccountsByOwner") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
      }
      const owner = String((body.params ?? [])[0]);
      const held = accountsByOwner[owner] ?? [];
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { value: held.map((pubkey) => ({ pubkey })) },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading whether the offer's address can be credited", () => {
  it("names the defect when the payTo owns no USDC account", async () => {
    stubLedger({ [RECEIVER]: [] });
    const result = await checkRailReceivable(testEnv, [solanaOffer(RECEIVER)]);
    expect(result.check?.ok).toBe(false);
    expect(result.check?.name).toBe(RECEIVABLE_CHECK);
    expect(result.check?.detail).toContain(RECEIVER);
    expect(result.check?.detail).toContain("nowhere to land");
    // It says how to fix it, not just that it is broken.
    expect(result.check?.detail).toContain(SOLANA_USDC_MINT);
  });

  it("passes an address that holds the mint, and claims nothing more", async () => {
    stubLedger({ [RECEIVER]: ["tokenAccount111"] });
    const result = await checkRailReceivable(testEnv, [solanaOffer(RECEIVER)]);
    expect(result.check?.ok).toBe(true);
    /*
     * THE RESTRAINT IS THE PRODUCT. Able to receive is not solvent, not
     * honest, and not going to deliver. A check that let any of those
     * be read into it would be the badge this store refuses to sell.
     */
    expect(result.check?.detail).toContain("Says nothing about balance");
  });

  it("says nothing at all about a door that offers no Solana rail", async () => {
    stubLedger({});
    const result = await checkRailReceivable(testEnv, [
      { scheme: "exact", network: "eip155:8453", payTo: "0xabc", amount: "5000" },
    ]);
    /*
     * On Base and Polygon USDC is an ERC-20 — any address can be
     * credited, so there is nothing here to be wrong about. Firing on
     * an EVM rail would manufacture a defect out of a difference
     * between chains, and a check that does not apply must not report
     * "pass": a pass implies a test was run.
     */
    expect(result.check).toBeNull();
    expect(result.advisory).toBeNull();
  });

  it("records an unreadable ledger as unknown, never as a pass", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network connection lost.");
      }),
    );
    const result = await checkRailReceivable(testEnv, [solanaOffer(RECEIVER)]);
    // Our gap, on the record — the same rule the census uses for its
    // own missed rounds.
    expect(result.check).toBeNull();
    expect(result.advisory?.detail).toContain("UNKNOWN");
    expect(result.advisory?.detail).toContain("Our gap");
  });

  it("checks every distinct payTo an offer names, and dedupes", () => {
    const payTos = solanaPayTos([
      solanaOffer(RECEIVER),
      solanaOffer(RECEIVER),
      solanaOffer(OTHER),
    ]);
    expect(payTos).toEqual([RECEIVER, OTHER]);
  });

  it("ignores a Solana offer denominated in some other mint", () => {
    // This check has one opinion, about USDC. An offer in another mint
    // is a different question and gets no verdict here.
    expect(
      solanaPayTos([
        { scheme: "exact", network: SOLANA_CHAIN, payTo: RECEIVER, asset: "SomeOtherMint111" },
      ]),
    ).toEqual([]);
  });

  it("fails the whole offer when any named payTo cannot receive", async () => {
    stubLedger({ [RECEIVER]: ["tokenAccount111"], [OTHER]: [] });
    const result = await checkRailReceivable(testEnv, [
      solanaOffer(RECEIVER),
      solanaOffer(OTHER),
    ]);
    // A buyer who picks the broken entry is just as stuck.
    expect(result.check?.ok).toBe(false);
    expect(result.check?.detail).toContain(OTHER);
  });
});
