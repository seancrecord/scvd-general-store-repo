import { vi } from "vitest";
import { AUTHORIZATION_USED_TOPIC, TRANSFER_TOPIC, evmChainOf } from "@/lib/base-rpc";
import type { PurchaseIntent } from "@/services/purchase-intent";
import { object } from "./buyer-harness";

/** Finalized RPC evidence for the actual locally signed publication payment. */
export function publicationConfirmation(record: PurchaseIntent, payload: Record<string, unknown>, transaction: string) {
  const inner = globalThis.fetch, calls: string[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const body = object(init?.body ? JSON.parse(String(init.body)) : null), method = String(body.method);
    if (!method.startsWith("eth_") && !["getGenesisHash", "getSignaturesForAddress", "getTransaction"].includes(method)) return inner(input, init);
    calls.push(method);
    const params = body.params as unknown[], hex = (n: number) => `0x${n.toString(16)}`;
    const at = Date.parse(record.created_at) / 1000, chain = evmChainOf(record.terms.network);
    let result: unknown;
    if (chain) {
      const topic = (s: string) => `0x${s.slice(2).toLowerCase().padStart(64, "0")}`;
      if (method === "eth_chainId") result = hex(Number(chain.caip2.split(":")[1]));
      else if (method === "eth_getBlockByNumber") result = params[0] === "finalized" ? { number: hex(2000) }
        : { timestamp: hex(at - 3600 + Number.parseInt(String(params[0]), 16) * 2) };
      else if (method === "eth_getLogs") {
        const filter = object(params[0]), from = Number.parseInt(String(filter.fromBlock), 16), to = Number.parseInt(String(filter.toBlock), 16);
        result = from <= 1800 && to >= 1800 ? [{ transactionHash: transaction }] : [];
      } else if (method === "eth_getTransactionReceipt") result = { transactionHash: transaction, blockNumber: hex(1800), status: "0x1",
        logs: [
          { address: chain.usdc, topics: [AUTHORIZATION_USED_TOPIC, topic(record.payer), record.authorization!.nonce], data: "0x" },
          { address: chain.usdc, topics: [TRANSFER_TOPIC, topic(record.payer), topic(record.terms.payTo)], data: hex(Number(record.terms.amount)) },
        ] };
      else throw new Error("Unexpected EVM fixture read");
    } else {
      const amount = BigInt(record.terms.amount);
      const balance = (accountIndex: number, owner: string, value: bigint) => ({ accountIndex, owner, mint: record.terms.asset,
        uiTokenAmount: { amount: value.toString(), decimals: 6 } });
      if (method === "getGenesisHash") result = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
      else if (method === "getSignaturesForAddress") result = [{ signature: transaction, slot: 1000, blockTime: at, err: null, confirmationStatus: "finalized" }];
      else if (method === "getTransaction") result = { slot: 1000, transaction: [object(payload.payload).transaction, "base64"],
        meta: { err: null, preTokenBalances: [balance(2, record.payer, amount + 1n), balance(3, record.terms.payTo, 0n)],
          postTokenBalances: [balance(2, record.payer, 1n), balance(3, record.terms.payTo, amount)] } };
      else throw new Error("Unexpected Solana fixture read");
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
  return { spy, calls };
}
