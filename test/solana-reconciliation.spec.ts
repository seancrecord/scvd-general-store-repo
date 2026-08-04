import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SOLANA_RECONCILE_CURSOR_KEY,
  SOLANA_RECONCILE_OK_KEY,
  reconcileSolanaAgainstChain,
  runSolanaReconciliation,
} from "@/services/chain-reconciliation";
import { KV_KEYS } from "@/lib/kv-keys";
import { listAlerts } from "@/lib/alerts";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE SOLANA SIDE OF THE BANK RECONCILIATION — the walk that retires
 * the second rail's unreconciled cap. Same properties as the Base
 * spec, proved against a fake RPC for the same reason: what must
 * hold is that a chain answer we do not control cannot be silently
 * misread, and a real node cannot be asked to return nonsense.
 */

const OWNER = "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE";
const TOKEN_ACCOUNT = "TokAcc111111111111111111111111111111111111";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface FakeTx {
  signature: string;
  slot: number;
  err?: unknown;
  /** USDC units into the owner; sender wallet. */
  incoming?: { from: string; units: bigint };
}

function solanaRpc(handlers: {
  accounts?: string[];
  txs?: FakeTx[];
  fail?: "accounts" | "signatures" | "transaction";
}): typeof fetch {
  const txs = handlers.txs ?? [];
  return (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      method: string;
      params: unknown[];
    };
    const respond = (result: unknown) =>
      ({ ok: true, json: async () => ({ result }) }) as unknown as Response;
    if (body.method === "getTokenAccountsByOwner") {
      if (handlers.fail === "accounts") {
        return { ok: false, status: 500 } as unknown as Response;
      }
      return respond({
        value: (handlers.accounts ?? [TOKEN_ACCOUNT]).map((pubkey) => ({
          pubkey,
        })),
      });
    }
    if (body.method === "getSignaturesForAddress") {
      if (handlers.fail === "signatures") {
        return { ok: false, status: 429 } as unknown as Response;
      }
      const options = (body.params[1] ?? {}) as { until?: string };
      // Newest first, like the real RPC; `until` stops the walk.
      const until = options.until;
      const cut = until ? txs.findIndex((tx) => tx.signature === until) : -1;
      const visible = cut >= 0 ? txs.slice(0, cut) : txs;
      return respond(
        visible.map((tx) => ({
          signature: tx.signature,
          slot: tx.slot,
          err: tx.err ?? null,
        })),
      );
    }
    if (body.method === "getTransaction") {
      if (handlers.fail === "transaction") {
        return { ok: false, status: 500 } as unknown as Response;
      }
      const signature = body.params[0] as string;
      const tx = txs.find((entry) => entry.signature === signature);
      if (!tx || !tx.incoming) {
        return respond(null);
      }
      return respond({
        meta: {
          err: tx.err ?? null,
          preTokenBalances: [
            {
              accountIndex: 0,
              mint: USDC_MINT,
              owner: OWNER,
              uiTokenAmount: { amount: "0" },
            },
            {
              accountIndex: 1,
              mint: USDC_MINT,
              owner: tx.incoming.from,
              uiTokenAmount: { amount: String(tx.incoming.units) },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 0,
              mint: USDC_MINT,
              owner: OWNER,
              uiTokenAmount: { amount: String(tx.incoming.units) },
            },
            {
              accountIndex: 1,
              mint: USDC_MINT,
              owner: tx.incoming.from,
              uiTokenAmount: { amount: "0" },
            },
          ],
        },
      });
    }
    throw new Error(`unexpected Solana RPC ${body.method}`);
  }) as unknown as typeof fetch;
}

function envWith(fetchImpl: typeof fetch): Env {
  vi.stubGlobal("fetch", fetchImpl);
  return { ...testEnv, SOLANA_PAY_TO: OWNER } as Env;
}

async function clear(): Promise<void> {
  await testEnv.COUNTERS.delete(SOLANA_RECONCILE_CURSOR_KEY);
  await testEnv.COUNTERS.delete(SOLANA_RECONCILE_OK_KEY);
  const certs = await testEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix });
  for (const key of certs.keys) await testEnv.PATRONS.delete(key.name);
}

beforeEach(clear);
afterEach(() => vi.unstubAllGlobals());

async function putCert(certId: string, settlementTx: string): Promise<void> {
  await testEnv.PATRONS.put(
    KV_KEYS.cert(certId),
    JSON.stringify({
      certificate: {
        cert_id: certId,
        item: "hello",
        patron_number: 1,
        date: "2026-08-04",
        settlement_tx: settlementTx,
      },
      signature: "aa",
      public_key: "bb",
    }),
  );
}

describe("the closed door", () => {
  it("does not run without SOLANA_PAY_TO, and says so", async () => {
    const result = await reconcileSolanaAgainstChain({
      ...testEnv,
      SOLANA_PAY_TO: undefined,
    } as Env);
    expect(result.ran).toBe(false);
    expect(result.reason).toContain("SOLANA_PAY_TO");
  });
});

describe("walking the chain", () => {
  it("finds nothing to report when every settle has a certificate", async () => {
    await putCert("cert_sol", "SolSigKnown111");
    const result = await reconcileSolanaAgainstChain(
      envWith(
        solanaRpc({
          txs: [
            {
              signature: "SolSigKnown111",
              slot: 100,
              incoming: { from: "SenderWallet1111111111111111111111111111111", units: 5000n },
            },
          ],
        }),
      ),
    );
    expect(result.ran).toBe(true);
    expect(result.transfers_seen).toBe(1);
    expect(result.orphans).toEqual([]);
  });

  it("FLAGS money that arrived with no certificate naming it", async () => {
    const result = await reconcileSolanaAgainstChain(
      envWith(
        solanaRpc({
          txs: [
            {
              signature: "SolSigOrphan11",
              slot: 200,
              incoming: { from: "SenderWallet1111111111111111111111111111111", units: 20_000_000n },
            },
          ],
        }),
      ),
    );
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans![0]!.tx_hash).toBe("SolSigOrphan11");
    expect(result.orphans![0]!.usdc).toBe(20);
    expect(result.orphans![0]!.classification).toBe("possible_sale");
  });

  it("classifies sub-price Solana dust as dust — the poisoning playbook is chain-agnostic", async () => {
    const result = await reconcileSolanaAgainstChain(
      envWith(
        solanaRpc({
          txs: [
            {
              signature: "SolSigDust1111",
              slot: 300,
              incoming: { from: "DustSender11111111111111111111111111111111", units: 30n },
            },
          ],
        }),
      ),
    );
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans![0]!.classification).toBe("dust");
  });

  it("skips failed transactions — they moved no money", async () => {
    const result = await reconcileSolanaAgainstChain(
      envWith(
        solanaRpc({
          txs: [
            {
              signature: "SolSigFailed11",
              slot: 400,
              err: { InstructionError: [0, "Custom"] },
              incoming: { from: "X", units: 1000n },
            },
          ],
        }),
      ),
    );
    expect(result.transfers_seen).toBe(0);
    expect(result.orphans).toEqual([]);
  });
});

describe("the cursor and the ok-stamp", () => {
  it("advances to the newest signature and stops there next pass", async () => {
    const txs: FakeTx[] = [
      {
        signature: "SolSigNew22222",
        slot: 502,
        incoming: { from: "S2", units: 5000n },
      },
      {
        signature: "SolSigOld11111",
        slot: 501,
        incoming: { from: "S1", units: 5000n },
      },
    ];
    await reconcileSolanaAgainstChain(envWith(solanaRpc({ txs })));
    expect(await testEnv.COUNTERS.get(SOLANA_RECONCILE_CURSOR_KEY)).toBe(
      "SolSigNew22222",
    );
    // Second pass: `until` cuts everything already walked.
    const second = await reconcileSolanaAgainstChain(envWith(solanaRpc({ txs })));
    expect(second.transfers_seen).toBe(0);
  });

  it("stamps a clean pass, leaves cursor alone on failure, never stamps a failed pass", async () => {
    await reconcileSolanaAgainstChain(envWith(solanaRpc({ txs: [] })));
    expect(await testEnv.COUNTERS.get(SOLANA_RECONCILE_OK_KEY)).not.toBeNull();

    await testEnv.COUNTERS.delete(SOLANA_RECONCILE_OK_KEY);
    const failed = await reconcileSolanaAgainstChain(
      envWith(solanaRpc({ fail: "signatures" })),
    );
    expect(failed.ran).toBe(false);
    expect(await testEnv.COUNTERS.get(SOLANA_RECONCILE_OK_KEY)).toBeNull();
  });
});

describe("the cap stands down when the walk is alive", () => {
  it("a fresh ok-stamp silences the over-cap page; a stale one does not", async () => {
    const {
      SOLANA_SETTLED_TOTAL_KEY,
      SOLANA_UNRECONCILED_CAP_USDC,
      recordSolanaSettle,
    } = await import("@/lib/payments");
    await testEnv.COUNTERS.delete(SOLANA_SETTLED_TOTAL_KEY);
    await testEnv.COUNTERS.put(
      SOLANA_RECONCILE_OK_KEY,
      new Date().toISOString(),
    );
    await recordSolanaSettle(testEnv, SOLANA_UNRECONCILED_CAP_USDC + 5);
    const alerts = await listAlerts(testEnv, 20);
    expect(
      alerts.some(
        (entry) =>
          entry.detail.includes("unreconciled cap") &&
          entry.detail.includes("not completed a pass"),
      ),
      "a living walk means the cap has nothing to say",
    ).toBe(false);
    await testEnv.COUNTERS.delete(SOLANA_SETTLED_TOTAL_KEY);
  });
});
