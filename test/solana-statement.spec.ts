import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { SLOTS_PER_HOUR, SOLANA_PAGE_CAP, SOLANA_SIGNATURE_CAP, solanaUsdcTransfers } from "@/lib/solana-usdc";
import { BASE_RAIL, SOLANA_RAIL, isSolanaAddress, statementRailOf } from "@/lib/statement-rails";
import { maxUnitsPerPass, passOnce, startOperatorStatement } from "@/services/operator-statement";
import { performWalletStatement } from "@/services/wallet-statement";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

/**
 * THE STATEMENT ON SOLANA (SOLANA_PARITY gap 1, the keeper's "agreed
 * do em", 2026-09-02). One artifact shape, a third reader. What this
 * file holds:
 *
 *   - the rail vocabulary: "solana" and its CAIP-2 resolve, the unit
 *     is the slot, an EVM address is not a Solana address and the
 *     other way round;
 *   - the walk: every USDC token account the wallet owns, signatures
 *     paged by `before` until the window's first slot, each
 *     transaction's settled outcome read off pre/post balances;
 *     failed transactions dropped, same-owner moves netted to nothing;
 *   - the bounds are loud: past the page cap or the signature cap the
 *     read is window_unreadable with the reason, never a partial
 *     statement that misstates its own coverage;
 *   - the_statement and operator_statement both read it, stating
 *     `unit: "slot"` beside the same from/to fields the EVM rails use;
 *   - the doors refuse a mismatched address before money moves, and a
 *     Solana statement can actually be bought.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const WALLET = "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE";
const ATA = "7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi";
const OTHER_ACCOUNT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const PAYER = "BENrLoUbndxoNMUS5JXApGMtNykLjFXXixMtpDwDR9SP";
const PAYER_TWO = "D6ZhtNQ5nT9ZnTHUbqXZsTx5MH2rPFiBBggX4hY1WePM";

interface Tx {
  signature: string;
  slot: number;
  err?: unknown;
  /** owner -> delta in atomic USDC, the settled outcome. */
  deltas: Record<string, bigint>;
}

interface Chain {
  head: number;
  accounts: string[];
  txs: Tx[];
}

/** A fake Solana node: getSlot, the wallet's token accounts, paged signatures newest first, and transactions from balances. */
function fakeSolana(chain: Chain, calls: Record<string, number> = {}): typeof fetch {
  const byAccount = (account: string) => chain.txs.filter((tx) => chain.accounts.includes(account)).sort((a, b) => b.slot - a.slot);
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
    calls[body.method] = (calls[body.method] ?? 0) + 1;
    const reply = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    if (body.method === "getSlot") return reply(chain.head);
    if (body.method === "getTokenAccountsByOwner") {
      return reply({ value: chain.accounts.map((pubkey) => ({ pubkey, account: { data: { parsed: { info: { state: "initialized" } } } } })) });
    }
    if (body.method === "getSignaturesForAddress") {
      const [account, options] = body.params as [string, { limit: number; before?: string }];
      let rows = byAccount(account);
      if (options.before) {
        const index = rows.findIndex((tx) => tx.signature === options.before);
        rows = index >= 0 ? rows.slice(index + 1) : [];
      }
      return reply(rows.slice(0, options.limit).map((tx) => ({ signature: tx.signature, slot: tx.slot, err: tx.err ?? null })));
    }
    if (body.method === "getTransaction") {
      const [signature] = body.params as [string];
      const tx = chain.txs.find((entry) => entry.signature === signature);
      if (!tx) return reply(null);
      const owners = Object.keys(tx.deltas);
      const pre = owners.map((owner, index) => ({ accountIndex: index, mint: SOLANA_USDC_MINT, owner, uiTokenAmount: { amount: "1000000000" } }));
      const post = owners.map((owner, index) => ({ accountIndex: index, mint: SOLANA_USDC_MINT, owner, uiTokenAmount: { amount: (1_000_000_000n + tx.deltas[owner]!).toString() } }));
      return reply({ slot: tx.slot, meta: { err: tx.err ?? null, preTokenBalances: pre, postTokenBalances: post }, transaction: { message: { accountKeys: [] } } });
    }
    return reply(null);
  }) as typeof fetch;
}

/** Route Solana RPC bodies to the fake node and everything else to the facilitator mock underneath. */
function useSolana(chain: typeof fetch): void {
  installFacilitatorMock();
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const bodyText = String(init?.body ?? "");
    if (/"method":"(getSlot|getTokenAccountsByOwner|getSignaturesForAddress|getTransaction)"/.test(bodyText)) {
      return chain(input as never, init as never);
    }
    return inner(input as never, init as never);
  }) as typeof fetch);
}

beforeAll(installFacilitatorMock);
afterEach(() => {
  vi.unstubAllGlobals();
  installFacilitatorMock();
});

function chainWith(txs: Tx[], head = 300_000_000): Chain {
  return { head, accounts: [ATA], txs };
}

describe("the rail vocabulary", () => {
  it("resolves solana by name and by CAIP-2, counts in slots, and keeps Base the default", () => {
    expect(statementRailOf("solana")?.key).toBe("solana");
    expect(statementRailOf(SOLANA_CHAIN)?.key).toBe("solana");
    expect(statementRailOf(undefined)?.key).toBe("base");
    expect(statementRailOf("nope")).toBeNull();
    expect(SOLANA_RAIL.unit).toBe("slot");
    expect(BASE_RAIL.unit).toBe("block");
    expect(SOLANA_RAIL.usdc).toBe(SOLANA_USDC_MINT);
    expect(SOLANA_RAIL.unitsPerHour).toBe(SLOTS_PER_HOUR);
  });

  it("knows a Solana address from an EVM one, and keeps its case", () => {
    expect(isSolanaAddress(WALLET)).toBe(true);
    expect(isSolanaAddress("0x843b544bf5f0aa6cbf13e94563874878c98cc4a7")).toBe(false);
    expect(isSolanaAddress("not-base58-0OIl")).toBe(false);
    expect(SOLANA_RAIL.normalize(` ${WALLET} `)).toBe(WALLET);
    expect(BASE_RAIL.isAddress(WALLET)).toBe(false);
  });
});

describe("the walk", () => {
  it("reads both directions off settled balances, names counterparties, drops failed transactions, nets same-owner moves", async () => {
    const calls: Record<string, number> = {};
    useSolana(
      fakeSolana(
        chainWith([
          { signature: "sigIn1", slot: 299_999_900, deltas: { [WALLET]: 5_000n, [PAYER]: -5_000n } },
          { signature: "sigIn2", slot: 299_999_800, deltas: { [WALLET]: 1_000_000n, [PAYER_TWO]: -1_000_000n } },
          { signature: "sigOut", slot: 299_999_850, deltas: { [WALLET]: -250_000n, [PAYER]: 250_000n } },
          { signature: "sigFailed", slot: 299_999_890, err: { InstructionError: [0, "Custom"] }, deltas: { [WALLET]: 999n, [PAYER]: -999n } },
          { signature: "sigSelf", slot: 299_999_880, deltas: { [WALLET]: 0n } },
          { signature: "sigOld", slot: 200_000_000, deltas: { [WALLET]: 7n, [PAYER]: -7n } },
        ]),
        calls,
      ),
    );
    const read = await solanaUsdcTransfers(testEnv, WALLET, 299_999_000, 300_000_000);
    expect(read.accounts).toEqual([ATA]);
    expect(read.inbound.map((row) => row.txHash).sort()).toEqual(["sigIn1", "sigIn2"]);
    expect(read.inbound.find((row) => row.txHash === "sigIn2")?.from).toBe(PAYER_TWO);
    expect(read.outbound).toHaveLength(1);
    expect(read.outbound[0]?.to).toBe(PAYER);
    expect(read.outbound[0]?.amount).toBe(250_000n);
    // The old one was outside the window: the page stopped there and it was never resolved.
    expect(calls["getTransaction"]).toBe(4);
  });

  it("refuses past the page cap with the reason, never a partial read", async () => {
    const many: Tx[] = [];
    for (let index = 0; index < SOLANA_PAGE_CAP * 1000 + 1; index += 1) {
      many.push({ signature: `s${index}`, slot: 300_000_000 - index, deltas: { [WALLET]: 1n, [PAYER]: -1n } });
    }
    useSolana(fakeSolana(chainWith(many)));
    await expect(solanaUsdcTransfers(testEnv, WALLET, 1, 300_000_000)).rejects.toThrow(/narrow the window/);
  });

  it("refuses past the signature cap with the reason", async () => {
    const many: Tx[] = [];
    for (let index = 0; index < SOLANA_SIGNATURE_CAP + 1; index += 1) {
      many.push({ signature: `t${index}`, slot: 300_000_000 - index, deltas: { [WALLET]: 1n, [PAYER]: -1n } });
    }
    useSolana(fakeSolana(chainWith(many)));
    await expect(solanaUsdcTransfers(testEnv, WALLET, 299_000_000, 300_000_000)).rejects.toThrow(
      new RegExp(`more than ${SOLANA_SIGNATURE_CAP} USDC transactions`),
    );
  });
});

describe("the_statement on Solana", () => {
  it("states the slot window with its unit, counts and lists both sides oldest first, and signs it", async () => {
    useSolana(
      fakeSolana(
        chainWith([
          { signature: "sigIn1", slot: 299_999_900, deltas: { [WALLET]: 5_000n, [PAYER]: -5_000n } },
          { signature: "sigIn2", slot: 299_999_800, deltas: { [WALLET]: 1_000_000n, [PAYER_TWO]: -1_000_000n } },
          { signature: "sigOut", slot: 299_999_850, deltas: { [WALLET]: -250_000n, [PAYER]: 250_000n } },
        ]),
      ),
    );
    const statement = await performWalletStatement(testEnv, WALLET, 6, SOLANA_RAIL);
    expect(statement.coverage).toBe("complete");
    expect(statement.chain).toBe(SOLANA_CHAIN);
    expect(statement.asset).toBe(SOLANA_USDC_MINT);
    expect(statement.wallet).toBe(WALLET);
    expect(statement.window.unit).toBe("slot");
    expect(statement.window.to_block).toBe(300_000_000);
    expect(statement.window.from_block).toBe(300_000_000 - 6 * SLOTS_PER_HOUR);
    expect(statement.inflows.count).toBe(2);
    expect(statement.inflows.total_atomic).toBe("1005000");
    expect(statement.inflows.transfers[0]?.tx_hash).toBe("sigIn2");
    expect(statement.inflows.transfers[0]?.counterparty).toBe(PAYER_TWO);
    expect(statement.outflows.transfers[0]?.counterparty).toBe(PAYER);
    expect(statement.scope).toContain("getSignaturesForAddress");
    expect(statement.scope).toContain("slot window");
    expect(statement.scope).toContain("closed before the read");
    expect(statement.signature).toBeTruthy();
  });

  it("a refused read is a signed window_unreadable statement, with the reason", async () => {
    const many: Tx[] = [];
    for (let index = 0; index < SOLANA_SIGNATURE_CAP + 1; index += 1) {
      many.push({ signature: `u${index}`, slot: 300_000_000 - index, deltas: { [WALLET]: 1n, [PAYER]: -1n } });
    }
    useSolana(fakeSolana(chainWith(many)));
    const statement = await performWalletStatement(testEnv, WALLET, 6, SOLANA_RAIL);
    expect(statement.coverage).toBe("window_unreadable");
    expect(statement.read_error).toContain("narrow the window");
    expect(statement.inflows.count).toBe(0);
    expect(statement.window.unit).toBe("slot");
  });
});

describe("operator_statement on Solana", () => {
  it("opens at the head slot and a pass reads slots, stating the unit", async () => {
    useSolana(
      fakeSolana(
        chainWith(
          [{ signature: "sigIn1", slot: 300_000_050, deltas: { [WALLET]: 5_000n, [PAYER]: -5_000n } }],
          300_000_100,
        ),
      ),
    );
    const { record } = await startOperatorStatement(testEnv, WALLET, SOLANA_RAIL);
    expect(record.chain).toBe(SOLANA_CHAIN);
    expect(record.wallet).toBe(WALLET);
    expect(record.opened_at_block).toBe(300_000_101);
    // The chain moves on; the pass reads from the opening slot to the new head.
    useSolana(
      fakeSolana(
        chainWith(
          [{ signature: "sigIn1", slot: 300_000_150, deltas: { [WALLET]: 5_000n, [PAYER]: -5_000n } }],
          300_000_200,
        ),
      ),
    );
    const pass = await passOnce(testEnv, record);
    expect(pass.unit).toBe("slot");
    expect(pass.from_block).toBe(300_000_101);
    expect(pass.to_block).toBe(300_000_200);
    expect(pass.coverage).toBe("complete");
    expect(pass.inflows.count).toBe(1);
    expect(pass.payers[PAYER]?.transfers).toBe(1);
    expect(maxUnitsPerPass(SOLANA_RAIL)).toBe(11 * SLOTS_PER_HOUR);
  });
});

describe("the doors", () => {
  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuse an EVM address on the Solana rail, and a Solana address on the default rail, before money moves", async () => {
    for (const path of ["the_statement", "operator_statement"]) {
      const evmOnSolana = await SELF.fetch(`${BASE}/api/buy/${path}?wallet=0x843b544bf5f0aa6cbf13e94563874878c98cc4a7&network=solana`, { headers: buying });
      expect(evmOnSolana.status).toBe(400);
      const first = (await evmOnSolana.json()) as { error: string; charged: boolean };
      expect(first.charged).toBe(false);
      expect(first.error).toContain("base58");
      const solanaOnBase = await SELF.fetch(`${BASE}/api/buy/${path}?wallet=${WALLET}`, { headers: buying });
      expect(solanaOnBase.status).toBe(400);
      const second = (await solanaOnBase.json()) as { error: string };
      expect(second.error).toContain("network=solana");
    }
  });

  it("sells a Solana statement end to end", async () => {
    useSolana(
      fakeSolana(
        chainWith([{ signature: "sigIn1", slot: 299_999_900, deltas: { [WALLET]: 5_000n, [PAYER]: -5_000n } }]),
      ),
    );
    const path = `/api/buy/the_statement?wallet=${WALLET}&network=solana&hours=2`;
    const challenge = await SELF.fetch(`${BASE}${path}`);
    expect(challenge.status).toBe(402);
    const accepts = decodePaymentRequired(challenge).accepts as Parameters<typeof buildPaymentSignature>[0][];
    const paid = await SELF.fetch(`${BASE}${path}`, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepts[0]!) } });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;
    expect(body.statement.chain).toBe(SOLANA_CHAIN);
    expect(body.statement.window.unit).toBe("slot");
    expect(body.statement.inflows.count).toBe(1);
    expect(body.certificate.cert_id).toBeTruthy();
  });
});
