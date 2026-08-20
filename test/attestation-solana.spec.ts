import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { markKeeperPresent } from "./helpers/keeper";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import {
  observeSettlement,
  SOLANA_FINALITY_SLOTS,
} from "@/services/attestation";
import { isSolanaSignature, SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { SOLANA_NETWORK } from "@/lib/payments";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE SECOND RAIL REACHES THE ATTESTATION (2026-08-19, forced by the
 * Solana directory's review): the store has settled on Solana since
 * 08-04, the provider metadata says so, and the one product whose
 * whole job is observing settlements could only read Base. The
 * identifier's own shape picks the chain — a base58 signature can
 * never look like an 0x-hex hash — and the artifact keeps the exact
 * same shape either way, with slots where Base has blocks and a scope
 * that says so.
 */

// A well-formed 87-char base58 signature (alphabet excludes 0,O,I,l).
const SIG = "5".repeat(87);
const BUYER = "BuYeRWaLLeT1111111111111111111111111111111a";
const SELLER = "SeLLeRWaLLeT111111111111111111111111111111b";

function tokenBalance(owner: string, amount: string, index: number) {
  return {
    accountIndex: index,
    mint: SOLANA_USDC_MINT,
    owner,
    uiTokenAmount: { amount },
  };
}

/** Stub every Solana RPC endpoint; everything else fails loudly. */
function stubSolanaRpc(options: {
  tx: unknown;
  headSlot: number;
  passthrough?: typeof fetch;
}) {
  const hosts = ["publicnode.com", "drpc.org", "1rpc.io", "mainnet-beta.solana.com"];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (hosts.some((host) => url.includes(host))) {
      const request = input instanceof Request ? input : null;
      const raw = request ? await request.text() : String(init?.body ?? "{}");
      const { method } = JSON.parse(raw) as { method: string };
      if (method === "getSlot") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: options.headSlot });
      }
      if (method === "getTransaction") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: options.tx });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: null });
    }
    if (options.passthrough) {
      return options.passthrough(input as never, init as never);
    }
    throw new Error(`unexpected fetch in solana attestation test: ${url}`);
  });
}

function settledTx(slot: number, amountUnits: string) {
  return {
    slot,
    meta: {
      err: null,
      preTokenBalances: [
        tokenBalance(BUYER, amountUnits, 0),
        tokenBalance(SELLER, "0", 1),
      ],
      postTokenBalances: [
        tokenBalance(BUYER, "0", 0),
        tokenBalance(SELLER, amountUnits, 1),
      ],
    },
    transaction: { message: { accountKeys: [] } },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the identifier's shape picks the chain", () => {
  it("recognizes base58 signatures and never an 0x hash", () => {
    expect(isSolanaSignature(SIG)).toBe(true);
    expect(isSolanaSignature(`0x${"ab".repeat(32)}`)).toBe(false);
    // The base58 alphabet has no 0, O, I or l.
    expect(isSolanaSignature("0".repeat(87))).toBe(false);
  });

  it("names the chain with the same CAIP-2 id the payment rail uses", () => {
    // An attestation and a settlement must never disagree about which
    // chain "solana" means.
    expect(SOLANA_CHAIN).toBe(SOLANA_NETWORK);
  });
});

describe("the Solana observation, statuses one by one", () => {
  it("SETTLED: a deep matching transfer, slots where Base has blocks", async () => {
    stubSolanaRpc({ tx: settledTx(1000, "5000000"), headSlot: 2000 });
    const result = await observeSettlement(testEnv, { txHash: SIG });
    expect(result.chain).toBe(SOLANA_CHAIN);
    expect(result.status).toBe("SETTLED");
    expect(result.recipient).toBe(SELLER);
    expect(result.payer).toBe(BUYER);
    expect(result.amount_usdc).toBe(5);
    expect(result.block_height).toBe(1000);
    expect(result.chain_head).toBe(2000);
    expect(result.confirmations).toBe(1000);
    // The scope owns its method and its one non-facility out loud.
    expect(result.scope).toContain("balance outcomes");
    expect(result.scope).toContain("not evaluated on Solana");
    // Dual-emit rides this class like every artifact in the race.
    expect(result.signature_jcs).toBeTruthy();
  });

  it("PENDING_FINALITY under the slot rule, stated not smoothed", async () => {
    stubSolanaRpc({
      tx: settledTx(2000 - SOLANA_FINALITY_SLOTS + 1, "5000000"),
      headSlot: 2000,
    });
    const result = await observeSettlement(testEnv, { txHash: SIG });
    expect(result.status).toBe("PENDING_FINALITY");
  });

  it("NOT_FOUND when the chain has no such signature", async () => {
    stubSolanaRpc({ tx: null, headSlot: 2000 });
    const result = await observeSettlement(testEnv, { txHash: SIG });
    expect(result.status).toBe("NOT_FOUND");
    expect(result.reading).toContain("says nothing about later");
  });

  it("REVERTED when the transaction landed and failed", async () => {
    const failed = { ...settledTx(1000, "5000000"), meta: { ...settledTx(1000, "5000000").meta, err: { InstructionError: [0, "Custom"] } } };
    stubSolanaRpc({ tx: failed, headSlot: 2000 });
    const result = await observeSettlement(testEnv, { txHash: SIG });
    expect(result.status).toBe("REVERTED");
  });

  it("INSUFFICIENT_MATCH when the asked-about recipient never got paid", async () => {
    stubSolanaRpc({ tx: settledTx(1000, "5000000"), headSlot: 2000 });
    const result = await observeSettlement(testEnv, {
      txHash: SIG,
      recipient: "SomeoneElse11111111111111111111111111111111",
    });
    expect(result.status).toBe("INSUFFICIENT_MATCH");
    // The gap is the finding: what actually moved is still reported.
    expect(result.recipient).toBe(SELLER);
  });
});

describe("the paid door, both rails", () => {
  it("sells a Solana attestation end to end, the buyer paying on Base", async () => {
    const state = installFacilitatorMock();
    void state;
    const facilitatorFetch = globalThis.fetch;
    stubSolanaRpc({
      tx: settledTx(1000, "5000000"),
      headSlot: 2000,
      passthrough: facilitatorFetch,
    });
    const url = `${BASE}/api/buy/settlement_attestation?tx_hash=${SIG}`;
    const challenge = await SELF.fetch(url);
    expect(challenge.status).toBe(402);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const paid = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;
    const attestation = body["attestation"] ?? body;
    expect(attestation.chain).toBe(SOLANA_CHAIN);
    expect(attestation.status).toBe("SETTLED");
  });

  it("refuses a nonce beside a Solana signature, before any money moves", async () => {
    installFacilitatorMock();
    const url = `${BASE}/api/buy/settlement_attestation?tx_hash=${SIG}&nonce=0xabc`;
    const challenge = await SELF.fetch(`${BASE}/api/buy/settlement_attestation?tx_hash=${SIG}`);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const refused = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as { error: string };
    expect(body.error).toContain("EIP-3009");
    expect(body.error).toContain("Nothing charged");
  });

  it("still refuses garbage that is neither rail's identifier", async () => {
    installFacilitatorMock();
    const challenge = await SELF.fetch(`${BASE}/api/buy/settlement_attestation?tx_hash=${SIG}`);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const refused = await SELF.fetch(
      `${BASE}/api/buy/settlement_attestation?tx_hash=not-a-hash-at-all`,
      { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) } },
    );
    expect(refused.status).toBe(400);
  });
});

