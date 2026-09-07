import type { Env } from "@/types";
import { isRecord } from "@/types";
import { rpcUrlsOf, SOLANA_CHAIN, SOLANA_USDC_MINT, isSolanaSignature } from "@/lib/solana-rpc";
import { outboundHeaders } from "@/lib/identity";
import { solanaPaymentEvidence } from "@/lib/solana-payment-evidence";
import { atomicToUsdc, tipFromPaid } from "@/lib/payments";
import type { PurchaseIntent } from "@/services/purchase-intent";

/** Each pass stays on one genesis-checked node. A fallback cannot silently
 * switch chains between identifying the network and reading its evidence.
 */
export async function reconcileSolanaPurchase(env: Env, record: PurchaseIntent): Promise<Pick<PurchaseIntent, "payment" | "reconciliation">> {
  if (!record.solana || record.terms.network !== SOLANA_CHAIN || record.terms.asset !== SOLANA_USDC_MINT) return {};
  for (const url of rpcUrlsOf(env)) {
    try {
      const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
        const response = await fetch(url, { method: "POST", headers: outboundHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("Recovery RPC unavailable");
        const body: unknown = await response.json();
        if (!isRecord(body) || body.error || !("result" in body)) throw new Error("Recovery RPC result unavailable");
        return body.result;
      };
      const genesis = await rpc("getGenesisHash", []);
      // CAIP-2 identifies Solana by the first 32 characters of genesis hash.
      if (typeof genesis !== "string" || genesis.slice(0, 32) !== SOLANA_CHAIN.split(":")[1]) throw new Error("Recovery chain mismatch");
      const before = record.reconciliation?.before_signature;
      const rows = await rpc("getSignaturesForAddress", [record.payer,
        { commitment: "finalized", limit: 10, ...(before ? { before } : {}) }]);
      if (!Array.isArray(rows) || rows.length > 10) throw new Error("Recovery history unavailable");
      const since = Date.parse(record.created_at) / 1000 - 600;
      if (!Number.isFinite(since)) throw new Error("Purchase time unavailable");
      let cursor: string | undefined;
      for (const row of rows) {
        if (!isRecord(row) || typeof row.signature !== "string" || !isSolanaSignature(row.signature) ||
          !Number.isSafeInteger(row.slot) || row.confirmationStatus !== "finalized") throw new Error("Recovery history malformed");
        // Null block times are not evidence that we reached the time boundary.
        if (typeof row.blockTime === "number" && row.blockTime < since) { cursor = undefined; break; }
        cursor = row.signature;
        if (row.err !== null) continue;
        const tx = await rpc("getTransaction", [row.signature, { commitment: "finalized", encoding: "base64", maxSupportedTransactionVersion: 0 }]);
        // Do not advance past a temporarily missing indexed transaction.
        if (!isRecord(tx) || !isRecord(tx.meta) || tx.slot !== row.slot || !Array.isArray(tx.transaction) ||
          tx.transaction[1] !== "base64" || typeof tx.transaction[0] !== "string") throw new Error("Recovery transaction unavailable");
        if (tx.meta.err !== null) continue;
        const evidence = await solanaPaymentEvidence(tx.transaction[0]);
        if (evidence.transaction !== row.signature) throw new Error("Recovery transaction identity mismatch");
        if (evidence.message_hash !== record.solana.message_hash) continue;
        const balances = new Map<string, bigint>();
        for (const [field, sign] of [["preTokenBalances", -1n], ["postTokenBalances", 1n]] as const) {
          const entries = tx.meta[field];
          if (!Array.isArray(entries)) throw new Error("Recovery balances unavailable");
          const seen = new Set<number>();
          for (const entry of entries) {
            if (!isRecord(entry) || !Number.isSafeInteger(entry.accountIndex) || seen.has(Number(entry.accountIndex))) throw new Error("Recovery balances malformed");
            seen.add(Number(entry.accountIndex));
            if (entry.mint !== record.terms.asset) continue;
            if (typeof entry.owner !== "string" || !isRecord(entry.uiTokenAmount) || entry.uiTokenAmount.decimals !== 6 ||
              typeof entry.uiTokenAmount.amount !== "string" || !/^\d+$/.test(entry.uiTokenAmount.amount)) throw new Error("Recovery token amount unavailable");
            balances.set(entry.owner, (balances.get(entry.owner) ?? 0n) + sign * BigInt(entry.uiTokenAmount.amount));
          }
        }
        const amount = BigInt(record.terms.amount);
        if (amount <= 0n || balances.get(record.payer) !== -amount || balances.get(record.terms.payTo) !== amount) throw new Error("Recovery transfer does not match purchase");
        const paidUsdc = atomicToUsdc(record.terms.amount);
        return { payment: { payer: record.payer, network: record.terms.network, transaction: row.signature,
          paidUsdc, tipUsdc: tipFromPaid(paidUsdc, record.item?.price_usdc ?? paidUsdc), settleHeaders: {} },
          reconciliation: { checked_at: new Date().toISOString() } };
      }
      // Walk bounded pages, then revisit the window for delayed RPC indexing.
      return { reconciliation: { ...(rows.length === 10 && cursor ? { before_signature: cursor } : {}), checked_at: new Date().toISOString() } };
    } catch {
      // Another node may have indexed the finalized transaction. No raw RPC
      // error (or credential-bearing configured URL) leaves this reader.
    }
  }
  throw new Error("Solana purchase evidence unavailable");
}
