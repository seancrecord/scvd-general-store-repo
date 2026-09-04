import { usdcBalanceOf } from "@/lib/base-rpc";
import { fieldSignerFromKey } from "@/services/launch-check";
import type { Env } from "@/types";

/**
 * THE PAYING WALLET, READ OFF THE CHAIN (2026-09-04).
 *
 * Every payout this store makes — bounty rewards, credit cash-outs,
 * the launch check's purchase — is a signed EIP-3009 authorization
 * from the field wallet, redeemed by the recipient against the USDC
 * contract. An authorization is only worth what the wallet holds when
 * it is redeemed, and until today the only way to know what it held
 * was to open a block explorer. The keeper asked for the number on
 * the desk; this is the one read that puts it there.
 *
 * READ, NEVER CACHED HERE: the balance is the chain's fact at the
 * moment of the call, stamped with when. A reading that could not be
 * taken says so in `problem` and leaves `usdc` null — never zero.
 */
export interface FieldWalletReading {
  /** False when FIELD_WALLET_KEY is unset: the board is read-only. */
  provisioned: boolean;
  address: string | null;
  /** USDC on Base, or null when the read did not happen. */
  usdc: number | null;
  chain: "eip155:8453";
  read_at: string;
  /** Why `usdc` is null, in words. Absent when it was read. */
  problem?: string;
}

export async function readFieldWallet(env: Env): Promise<FieldWalletReading> {
  const read_at = new Date().toISOString();
  const chain = "eip155:8453" as const;
  if (!env.FIELD_WALLET_KEY) {
    return {
      provisioned: false,
      address: null,
      usdc: null,
      chain,
      read_at,
      problem:
        "FIELD_WALLET_KEY is not set on this deployment, so there is no paying wallet: the bounty board is read-only and no claim can pay.",
    };
  }
  let address: string;
  try {
    address = (await fieldSignerFromKey(env.FIELD_WALLET_KEY)).address;
  } catch {
    return {
      provisioned: true,
      address: null,
      usdc: null,
      chain,
      read_at,
      problem: "FIELD_WALLET_KEY is set but did not parse as a secp256k1 key; nothing can sign a payout.",
    };
  }
  try {
    const atomic = await usdcBalanceOf(env, address);
    return {
      provisioned: true,
      address,
      usdc: Number(atomic) / 1e6,
      chain,
      read_at,
    };
  } catch (error) {
    // rpc() names hosts only in its message; a key never rides here.
    return {
      provisioned: true,
      address,
      usdc: null,
      chain,
      read_at,
      problem: `the balance could not be read just now: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`,
    };
  }
}
