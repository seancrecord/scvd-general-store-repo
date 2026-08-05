import type { Env } from "@/types";
import { outboundHeaders } from "@/lib/identity";

/**
 * A very small Solana JSON-RPC reader, the sibling of base-rpc.ts —
 * built 2026-08-04, the day the second rail opened, because a rail
 * the bank reconciliation cannot walk is money the store's most
 * paranoid instrument cannot see (PAYMENT_RAILS.md, the cap ruling).
 *
 * Three calls, no client library. Token accounts come from the RPC
 * (getTokenAccountsByOwner) instead of client-side PDA derivation,
 * which would drag in a hashing dependency to compute an address the
 * node will simply tell us.
 */

/** USDC's mint on Solana mainnet. The only asset this store prices in. */
export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Public mainnet RPC unless the keeper points us somewhere better.
 * PublicNode rather than api.mainnet-beta.solana.com, learned live
 * 2026-08-04: Solana Labs' public endpoint aggressively rate-limits
 * datacenter IPs — every hourly walk quietly returned ran:false all
 * afternoon until the unreconciled cap paged, which was the backstop
 * doing its job about the default doing its worst. If PublicNode
 * throttles too, SOLANA_RPC_URL takes a dedicated endpoint (Helius
 * free tier is a one-minute signup) — set it as a secret, the URL
 * carries the key.
 */
/**
 * FALLBACK ROTATION, added 2026-08-05 after PublicNode itself started
 * answering 504 and the hourly walk failed all day on one endpoint's
 * bad afternoon. A keeper-configured SOLANA_RPC_URL always goes
 * first; the public fallbacks are tried in order when an endpoint
 * errors or throttles. One bad node stops being a failed pass.
 */
const FALLBACK_RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://solana.drpc.org",
  "https://1rpc.io/solana",
  "https://api.mainnet-beta.solana.com",
] as const;

function rpcUrls(env: Env): string[] {
  const configured =
    env.SOLANA_RPC_URL && env.SOLANA_RPC_URL.length > 0
      ? [env.SOLANA_RPC_URL]
      : [];
  return [...configured, ...FALLBACK_RPCS.filter((url) => url !== env.SOLANA_RPC_URL)];
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  let lastError = "no endpoint tried";
  for (const url of rpcUrls(env)) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: outboundHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    } catch (error) {
      lastError = `${new URL(url).host}: ${String(error)}`;
      continue;
    }
    if (!response.ok) {
      lastError = `${new URL(url).host} answered ${response.status}`;
      continue;
    }
    const body: unknown = await response.json().catch(() => null);
    if (
      typeof body !== "object" ||
      body === null ||
      !("result" in body) ||
      (body as { error?: unknown }).error
    ) {
      lastError = `${new URL(url).host} returned no result`;
      continue;
    }
    return (body as { result: T }).result;
  }
  throw new Error(
    `Solana RPC ${method} failed on every endpoint (last: ${lastError})`,
  );
}

/** Every USDC token account the receive wallet owns (usually one). */
export async function usdcTokenAccountsOf(
  env: Env,
  owner: string,
): Promise<string[]> {
  const result = await rpc<{ value?: Array<{ pubkey: string }> }>(
    env,
    "getTokenAccountsByOwner",
    [owner, { mint: SOLANA_USDC_MINT }, { encoding: "jsonParsed" }],
  );
  return (result?.value ?? []).map((entry) => entry.pubkey);
}

export interface SolanaSignatureInfo {
  signature: string;
  slot: number;
  /** Non-null when the transaction failed; failed txs moved no money. */
  err: unknown;
}

/**
 * Transaction signatures touching one account, NEWEST FIRST — the
 * order the RPC returns and the reason the cursor is a signature
 * rather than a slot: `until` stops the walk exactly where the last
 * pass ended, with no block-boundary fencepost to get wrong.
 */
export async function signaturesForAddress(
  env: Env,
  address: string,
  untilSignature?: string,
): Promise<SolanaSignatureInfo[]> {
  const result = await rpc<SolanaSignatureInfo[]>(
    env,
    "getSignaturesForAddress",
    [
      address,
      {
        limit: 100,
        ...(untilSignature ? { until: untilSignature } : {}),
      },
    ],
  );
  return result ?? [];
}

export interface SolanaIncoming {
  /** Sender's WALLET (token-account owner), when the balances name one. */
  from: string;
  /** Raw USDC units (six decimals on Solana too). */
  amount: bigint;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

interface ParsedTransaction {
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
}

/**
 * USDC INTO the receive wallet in one transaction, read from the
 * pre/post token balances rather than by parsing instructions: the
 * balances are the settled OUTCOME, which is what a reconciliation
 * is about, and they survive every instruction encoding (inner
 * instructions, versioned transactions, multisig wrappers) that an
 * instruction parser would need special cases for.
 */
export async function usdcIncomingIn(
  env: Env,
  signature: string,
  receiveOwner: string,
): Promise<SolanaIncoming | null> {
  const tx = await rpc<ParsedTransaction | null>(env, "getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    },
  ]);
  if (!tx?.meta || tx.meta.err) {
    return null;
  }
  const pre = new Map<number, bigint>();
  for (const balance of tx.meta.preTokenBalances ?? []) {
    if (balance.mint === SOLANA_USDC_MINT) {
      pre.set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));
    }
  }
  let incoming = 0n;
  let sender = "";
  for (const balance of tx.meta.postTokenBalances ?? []) {
    if (balance.mint !== SOLANA_USDC_MINT) continue;
    const before = pre.get(balance.accountIndex) ?? 0n;
    const delta = BigInt(balance.uiTokenAmount.amount) - before;
    if (balance.owner === receiveOwner && delta > 0n) {
      incoming += delta;
    }
    if (balance.owner && balance.owner !== receiveOwner && delta < 0n) {
      sender = balance.owner;
    }
  }
  // An account absent from postTokenBalances closed mid-tx; its pre
  // entry alone can still name the sender.
  if (!sender) {
    for (const balance of tx.meta.preTokenBalances ?? []) {
      if (
        balance.mint === SOLANA_USDC_MINT &&
        balance.owner &&
        balance.owner !== receiveOwner
      ) {
        sender = balance.owner;
        break;
      }
    }
  }
  if (incoming <= 0n) {
    return null;
  }
  return { from: sender || "(sender unknown)", amount: incoming };
}
