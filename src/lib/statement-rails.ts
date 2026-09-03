import {
  BASE_EVM,
  EVM_CHAINS,
  evmChainOf,
  getBlockNumber,
  usdcTransfersFrom,
  usdcTransfersTo,
  type EvmChain,
} from "@/lib/base-rpc";
import { decodeBase58 } from "@/lib/base58";
import { SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { SLOTS_PER_HOUR, solanaHead, solanaUsdcTransfers } from "@/lib/solana-usdc";
import type { Env } from "@/types";

/**
 * THE RAILS A STATEMENT CAN BE READ ON (SOLANA_PARITY gap 1,
 * 2026-09-02). One artifact shape, three readers.
 *
 * The parity note's rule: the artifact spec does not fork per chain,
 * only the reader does. So the_statement and operator_statement keep
 * their fields — from_block, to_block, chain_head_at_read, coverage,
 * inflows, outflows — and a rail supplies what differs: how the head
 * is read, how transfers in a window are walked, what the window's
 * unit is called (a block on an EVM chain, a slot on Solana), roughly
 * how many of those units an hour holds, and what an address on that
 * rail looks like. The `unit` rides the artifact so a reader never
 * takes a slot for a block.
 *
 * The EVM rails wrap the chain constants already in base-rpc.ts and
 * add nothing; the Solana rail is the new reader in solana-usdc.ts.
 * Nothing here is copy-pasted between them: the walks are different
 * because the chains are.
 */

export type RailUnit = "block" | "slot";

export interface RailTransfer {
  txHash: string;
  amount: bigint;
  block: number;
  from?: string;
  to?: string;
}

export interface StatementRail {
  key: "base" | "polygon" | "solana";
  label: string;
  caip2: string;
  /** The USDC asset on this rail: the contract on EVM, the mint on Solana. */
  usdc: string;
  unit: RailUnit;
  /** Roughly how many units an hour holds; the window arithmetic and nothing else. */
  unitsPerHour: number;
  /** How a transfer is found on this rail, for the scope string. */
  readMethod: string;
  /** What the walk cannot see on this rail, for the scope string. */
  cannotSee: string;
  isAddress(value: string): boolean;
  /** The address as the artifact records it: lowercased on EVM, verbatim on Solana (case-sensitive base58). */
  normalize(value: string): string;
  head(env: Env): Promise<number>;
  transfersTo(env: Env, wallet: string, from: number, to: number): Promise<RailTransfer[]>;
  transfersFrom(env: Env, wallet: string, from: number, to: number): Promise<RailTransfer[]>;
}

/** Base's and Polygon's ~2s cadence: blocks per hour of chain. */
export const EVM_BLOCKS_PER_HOUR = 1800;

function evmRail(chain: EvmChain): StatementRail {
  return {
    key: chain.key,
    label: chain.label,
    caip2: chain.caip2,
    usdc: chain.usdc,
    unit: "block",
    unitsPerHour: EVM_BLOCKS_PER_HOUR,
    readMethod: "indexed eth_getLogs over exactly the block window stated",
    cannotSee:
      "a wallet moving ETH, other tokens, or funds on other networks shows none of that here",
    isAddress: (value) => /^0x[0-9a-fA-F]{40}$/.test(value),
    normalize: (value) => value.toLowerCase(),
    head: (env) => getBlockNumber(env, chain),
    transfersTo: async (env, wallet, from, to) =>
      (await usdcTransfersTo(env, wallet, from, to, chain)).map((row) => ({
        txHash: row.txHash,
        amount: row.amount,
        block: row.block,
        ...((row as { from?: string }).from ? { from: (row as { from?: string }).from } : {}),
      })),
    transfersFrom: async (env, wallet, from, to) =>
      (await usdcTransfersFrom(env, wallet, from, to, chain)).map((row) => ({
        txHash: row.txHash,
        amount: row.amount,
        block: row.block,
        ...((row as { to?: string }).to ? { to: (row as { to?: string }).to } : {}),
      })),
  };
}

export function isSolanaAddress(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  const bytes = decodeBase58(value);
  return bytes !== null && bytes.length === 32;
}

export const SOLANA_RAIL: StatementRail = {
  key: "solana",
  label: "Solana",
  caip2: SOLANA_CHAIN,
  usdc: SOLANA_USDC_MINT,
  unit: "slot",
  unitsPerHour: SLOTS_PER_HOUR,
  readMethod:
    "getSignaturesForAddress over every USDC token account the wallet owns at read time, then each transaction's pre/post token balances, over exactly the slot window stated",
  cannotSee:
    "a wallet moving SOL, other tokens, or funds on other networks shows none of that here; a USDC token account closed before the read is not seen, and a transfer between two accounts of the same owner nets to nothing and is not counted",
  isAddress: isSolanaAddress,
  normalize: (value) => value.trim(),
  head: (env) => solanaHead(env),
  transfersTo: async (env, wallet, from, to) => (await solanaUsdcTransfers(env, wallet, from, to)).inbound,
  transfersFrom: async (env, wallet, from, to) => (await solanaUsdcTransfers(env, wallet, from, to)).outbound,
};

export const BASE_RAIL: StatementRail = evmRail(BASE_EVM);

export const STATEMENT_RAILS: readonly StatementRail[] = [
  ...EVM_CHAINS.map(evmRail),
  SOLANA_RAIL,
];

/**
 * The network parameter's whole vocabulary: CAIP-2 or the plain name,
 * absent meaning Base. Anything else is null, and the door bounces it
 * before money moves rather than defaulting silently to a chain the
 * buyer did not ask about.
 */
export function statementRailOf(raw: string | undefined): StatementRail | null {
  if (raw === undefined || raw.trim() === "") return BASE_RAIL;
  const value = raw.trim();
  const lower = value.toLowerCase();
  if (lower === "solana" || value === SOLANA_CHAIN || lower === SOLANA_CHAIN.toLowerCase()) return SOLANA_RAIL;
  const evm = evmChainOf(value);
  return evm ? evmRail(evm) : null;
}

/** The rail a stored record was opened on; Base unless the record says otherwise. */
export function railOfCaip2(caip2: string): StatementRail {
  return STATEMENT_RAILS.find((rail) => rail.caip2 === caip2) ?? BASE_RAIL;
}

/** One sentence for the refusals: what `network` may be. */
export const NETWORK_VOCABULARY =
  'network must be "eip155:8453" (or "base", the default), "eip155:137" (or "polygon"), or "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" (or "solana")';
