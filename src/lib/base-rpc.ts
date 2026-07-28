import type { Env } from "@/types";

/**
 * A very small Base JSON-RPC reader. Two calls, no client library, no
 * retries, no cache.
 *
 * The retry-free part is deliberate and is the product's whole shape:
 * a settlement attestation observes a MOMENT. Retrying until the
 * answer improves would turn an observation into a poll, and a poll
 * into an implied promise that we waited for the right answer. If the
 * chain says NOT_FOUND at the instant we looked, that is the honest
 * finding and it is what gets signed.
 */

/** USDC on Base. The only asset this store prices in. */
export const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

/** CAIP-2 for Base mainnet, the same string the 402s advertise. */
export const BASE_CHAIN = "eip155:8453";

/**
 * keccak256("Transfer(address,address,uint256)") and
 * keccak256("AuthorizationUsed(address,bytes32)").
 *
 * Hardcoded rather than derived so the Worker carries no hashing
 * dependency — and re-derived from the signatures in the test suite,
 * so a typo here fails CI rather than silently classifying every
 * settled payment as NOT_FOUND.
 */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const AUTHORIZATION_USED_TOPIC =
  "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";

/** Public Base RPC unless the keeper points us somewhere better. */
const DEFAULT_RPC = "https://mainnet.base.org";

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
}

export interface RpcReceipt {
  status: string;
  blockNumber: string;
  logs: RpcLog[];
}

function rpcUrl(env: Env): string {
  return env.BASE_RPC_URL && env.BASE_RPC_URL.length > 0
    ? env.BASE_RPC_URL
    : DEFAULT_RPC;
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl(env), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`Base RPC ${method} answered ${response.status}`);
  }
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("result" in body) ||
    (body as { error?: unknown }).error
  ) {
    throw new Error(`Base RPC ${method} returned no result`);
  }
  return (body as { result: T }).result;
}

/** null when the chain has never heard of the hash. */
export async function getReceipt(
  env: Env,
  txHash: string,
): Promise<RpcReceipt | null> {
  return rpc<RpcReceipt | null>(env, "eth_getTransactionReceipt", [txHash]);
}

export async function getBlockNumber(env: Env): Promise<number> {
  const hex = await rpc<string>(env, "eth_blockNumber", []);
  return Number.parseInt(hex, 16);
}

/** 32-byte topic word -> lowercase 20-byte address. */
export function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export interface UsdcTransfer {
  from: string;
  to: string;
  /** Raw USDC units. Six decimals on Base. */
  amount: bigint;
}

/** Every USDC Transfer in a receipt, decoded. Ignores other tokens. */
export function usdcTransfers(receipt: RpcReceipt): UsdcTransfer[] {
  const transfers: UsdcTransfer[] = [];
  for (const log of receipt.logs ?? []) {
    if (!isSameAddress(log.address, BASE_USDC)) continue;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    const from = log.topics[1];
    const to = log.topics[2];
    if (!from || !to) continue;
    transfers.push({
      from: addressFromTopic(from),
      to: addressFromTopic(to),
      amount: BigInt(log.data === "0x" ? "0x0" : log.data),
    });
  }
  return transfers;
}

/** EIP-3009 nonces burned in this transaction, lowercased. */
export function authorizationNonces(receipt: RpcReceipt): string[] {
  const nonces: string[] = [];
  for (const log of receipt.logs ?? []) {
    if (!isSameAddress(log.address, BASE_USDC)) continue;
    if (log.topics[0]?.toLowerCase() !== AUTHORIZATION_USED_TOPIC) continue;
    const nonce = log.topics[2];
    if (nonce) nonces.push(nonce.toLowerCase());
  }
  return nonces;
}

/** USDC has six decimals; the attestation reports both. */
export function usdcFromUnits(units: bigint): number {
  return Number(units) / 1_000_000;
}
