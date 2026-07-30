import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256, toHex } from "viem";
import { observeSettlement } from "@/services/attestation";
import { verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE NOT_FOUND PATH, WHICH CV'S LIVE TEST DELIBERATELY DID NOT COVER.
 *
 * On 2026-07-30 he validated settlement_attestation against the chain
 * twice and was precise about the boundary, which is why this file
 * exists: a real settled hash attested correctly (SETTLED, right payer,
 * right recipient, right amount, block 49267842), and a MALFORMED hash
 * was refused before any money moved — a harder result than he set out
 * to test, since input validation catches it before the chain read and
 * says outright that nothing was billed.
 *
 * WHAT NEITHER CASE REACHED is the middle: a hash that is syntactically
 * perfect and simply never existed on chain. That is the only path where
 * the store takes the money and returns a negative verdict, so it is the
 * one where an error would be most expensive and least visible — a bug
 * here bills a buyer for a false NOT_FOUND, or worse, reports NOT_FOUND
 * for something that did settle.
 *
 * Tested here against a stubbed RPC because a null receipt is exactly
 * what Base returns for an unknown hash; the live half is his to run,
 * and the hash below is well-formed, deterministic, and has never been
 * broadcast, so it needs no constructing by hand.
 */

/**
 * A syntactically valid transaction hash that has never existed. Derived
 * rather than typed, so it is reproducible and obviously not cherry
 * picked: keccak256 of a sentence. The odds of collision with a real
 * Base transaction are the odds of guessing a 256-bit value.
 */
export const NEVER_BROADCAST_TX_HASH = keccak256(
  toHex("scvd.store never broadcast this transaction, 2026-07-30"),
);

function stubRpc(receipt: unknown, blockNumberHex: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as { method?: string };
      const result =
        body.method === "eth_blockNumber" ? blockNumberHex : receipt;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

describe("a well-formed hash that never existed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a real 32-byte hash, so the test is testing the right thing", () => {
    // If this stops looking like a tx hash, the input guard would refuse
    // it first and this whole file would be re-testing the malformed
    // case CV already covered live.
    expect(NEVER_BROADCAST_TX_HASH).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns NOT_FOUND with every chain field null, not a guess", async () => {
    stubRpc(null, "0x2f00000");
    const observation = await observeSettlement(testEnv, {
      txHash: NEVER_BROADCAST_TX_HASH,
    });
    expect(observation.status).toBe("NOT_FOUND");
    expect(observation.recipient).toBeNull();
    expect(observation.payer).toBeNull();
    expect(observation.amount_usdc).toBeNull();
    expect(observation.block_height).toBeNull();
    expect(observation.confirmations).toBeNull();
    // The head is still reported: it is what we could observe, and it
    // dates the negative.
    expect(observation.chain_head).toBeGreaterThan(0);
    expect(observation.tx_hash).toBe(NEVER_BROADCAST_TX_HASH);
  });

  it("refuses to promise the payment will never settle", async () => {
    stubRpc(null, "0x2f00000");
    const observation = await observeSettlement(testEnv, {
      txHash: NEVER_BROADCAST_TX_HASH,
    });
    // The whole liability of selling a negative: an absent transaction
    // today is not an absent transaction tomorrow, and the artifact has
    // to say so in the reading a buyer quotes, not only in the scope.
    const said = `${observation.reading} ${observation.scope}`.toLowerCase();
    expect(said).toContain("not_found");
    expect(said).toMatch(/will never settle|had not at observed_at/);
    expect(observation.observed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("signs the negative as readily as the positive", async () => {
    stubRpc(null, "0x2f00000");
    const observation = await observeSettlement(testEnv, {
      txHash: NEVER_BROADCAST_TX_HASH,
    });
    // A buyer paid for an observation, not for a yes. An unsigned
    // negative would be worth nothing, which is the failure mode where
    // a store quietly only stands behind its good news.
    expect(observation.signature).toBeTruthy();
    // signature_covers says "every field above signature, in the order
    // served" — so strip the three that ride below it, and the rest
    // re-serializes to the exact bytes that were signed.
    const {
      signature,
      public_key,
      signature_covers: _covers,
      ...core
    } = observation;
    expect(
      await verifyMessageSignature(JSON.stringify(core), signature, public_key),
    ).toBe(true);
  });

  it("does not confuse a reverted transaction with a missing one", async () => {
    // Adjacent path, cheap to pin while the stub is here: a reverted
    // transaction EXISTS and moved nothing, which is a different fact
    // about the world than never having been broadcast.
    stubRpc({ status: "0x0", blockNumber: "0x64", logs: [] }, "0x2f00000");
    const observation = await observeSettlement(testEnv, {
      txHash: NEVER_BROADCAST_TX_HASH,
    });
    expect(observation.status).toBe("REVERTED");
    expect(observation.block_height).toBe(100);
  });
});
