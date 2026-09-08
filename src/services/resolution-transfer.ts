import { evmChainOf, getFinalizedBlockNumber, getReceipt, isSameAddress, usdcTransfers } from "@/lib/base-rpc";
import { SOLANA_CHAIN, SOLANA_USDC_MINT, isSolanaSignature, rpcUrlsOf } from "@/lib/solana-rpc";
import { USDC_DECIMALS } from "@/lib/payments";
import { outboundHeaders } from "@/lib/identity";
import { isRecord, type Env } from "@/types";

export interface ResolutionTransfer {
  transaction: string; network: string; payer: string; recipient: string;
  amount_units: string; block: number; finality: "finalized";
}

/** A refund closes an obligation only against successful, finalized native
 * USDC movement. An RPC outage or a plausible transaction id proves nothing. */
export async function resolutionTransfer(env: Env, network: string, transaction: string,
  payer: string, recipient: string | undefined, amount: number): Promise<ResolutionTransfer> {
  const smallest = Math.round(amount * 10 ** USDC_DECIMALS);
  if (!Number.isSafeInteger(smallest)) throw new Error("Invalid resolution amount");
  const units = BigInt(smallest);
  if (units <= 0n) throw new Error("Invalid resolution amount");
  const chain = evmChainOf(network);
  if (chain) {
    if (!/^0x[0-9a-f]{64}$/i.test(transaction)) throw new Error("Invalid transaction");
    const [head, receipt] = await Promise.all([getFinalizedBlockNumber(env, chain), getReceipt(env, transaction, chain)]);
    const block = Number.parseInt(receipt?.blockNumber ?? "", 16);
    if (!receipt || receipt.status !== "0x1" || !Number.isSafeInteger(block) || block < 0 || block > head ||
      !("transactionHash" in receipt) || String(receipt.transactionHash).toLowerCase() !== transaction.toLowerCase()) throw new Error("Finalized transaction unavailable");
    const matches = usdcTransfers(receipt, chain).filter(t => isSameAddress(t.from, payer) &&
      (!recipient || isSameAddress(t.to, recipient)) && t.amount === units);
    if (matches.length !== 1) throw new Error("Transfer is missing or ambiguous");
    const match = matches[0]!;
    return { transaction, network, payer: match.from, recipient: match.to, amount_units: units.toString(), block, finality: "finalized" };
  }
  if (network !== SOLANA_CHAIN || !isSolanaSignature(transaction)) throw new Error("Unsupported resolution network");
  for (const url of rpcUrlsOf(env)) {
    try {
      const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
        const response = await fetch(url, { method: "POST", headers: outboundHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("RPC unavailable");
        const body: unknown = await response.json();
        if (!isRecord(body) || body.error || !("result" in body)) throw new Error("RPC unavailable");
        return body.result;
      };
      const genesis = await rpc("getGenesisHash", []);
      if (typeof genesis !== "string" || genesis.slice(0, 32) !== SOLANA_CHAIN.split(":")[1]) throw new Error("Wrong network");
      const status = await rpc("getSignatureStatuses", [[transaction], { searchTransactionHistory: true }]);
      const row = isRecord(status) && Array.isArray(status.value) ? status.value[0] : null;
      if (!isRecord(row) || row.err !== null || row.confirmationStatus !== "finalized") throw new Error("Not finalized");
      const tx = await rpc("getTransaction", [transaction, { commitment: "finalized", encoding: "json", maxSupportedTransactionVersion: 0 }]);
      if (!isRecord(tx) || !Number.isSafeInteger(tx.slot) || tx.slot !== row.slot || !isRecord(tx.transaction) ||
        !Array.isArray(tx.transaction.signatures) || tx.transaction.signatures[0] !== transaction ||
        !isRecord(tx.meta) || tx.meta.err !== null) throw new Error("Transaction unavailable");
      const balances = new Map<string, bigint>();
      for (const [field, sign] of [["preTokenBalances", -1n], ["postTokenBalances", 1n]] as const) {
        const entries = tx.meta[field];
        if (!Array.isArray(entries)) throw new Error("Balances unavailable");
        const seen = new Set<number>();
        for (const entry of entries) {
          if (!isRecord(entry) || !Number.isSafeInteger(entry.accountIndex) || seen.has(Number(entry.accountIndex))) throw new Error("Invalid balances");
          seen.add(Number(entry.accountIndex));
          if (entry.mint !== SOLANA_USDC_MINT) continue;
          if (typeof entry.owner !== "string" || !isRecord(entry.uiTokenAmount) || entry.uiTokenAmount.decimals !== USDC_DECIMALS ||
            typeof entry.uiTokenAmount.amount !== "string" || !/^\d+$/.test(entry.uiTokenAmount.amount)) throw new Error("Invalid token amount");
          balances.set(entry.owner, (balances.get(entry.owner) ?? 0n) + sign * BigInt(entry.uiTokenAmount.amount));
        }
      }
      const movements = [...balances].filter(([, delta]) => delta !== 0n);
      const credit = movements.filter(([owner, delta]) => (!recipient || recipient === owner) && delta === units);
      if (movements.length !== 2 || balances.get(payer) !== -units || credit.length !== 1) throw new Error("Transfer is missing or ambiguous");
      return { transaction, network, payer, recipient: credit[0]![0], amount_units: units.toString(), block: Number(tx.slot), finality: "finalized" };
    } catch { /* Try another genesis-checked node; never expose an RPC URL. */ }
  }
  throw new Error("Finalized Solana transfer unavailable");
}
