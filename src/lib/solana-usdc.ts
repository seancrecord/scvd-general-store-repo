import {
  SOLANA_USDC_MINT,
  getSlot,
  solanaTransactionFacts,
  usdcTokenAccountsDetailed,
} from "@/lib/solana-rpc";
import type { Env } from "@/types";

/**
 * USDC TRANSFERS IN AND OUT OF ONE SOLANA WALLET OVER A SLOT WINDOW
 * (SOLANA_PARITY gap 1, the keeper's "agreed do em", 2026-09-02).
 *
 * NOT THE EVM WALK WITH THE NOUNS CHANGED. EVM has indexed Transfer
 * logs and one call answers a block range. Solana has no logs: the
 * walk is getSignaturesForAddress over each of the wallet's USDC
 * token accounts, newest first, paged by `before` until a page dips
 * under the window's first slot, then getTransaction per signature
 * and the settled outcome read off pre/post token balances — the
 * same parsing the reconciliation walker already trusts
 * (solanaTransactionFacts). Failed transactions moved nothing and
 * are dropped by their own err field.
 *
 * WHAT IS WALKED, AND SAID. Every USDC token account the wallet OWNS
 * at read time — the canonical associated account and any other —
 * which is wider than the parity note's "canonical ATA" floor. An
 * account closed before the read is not seen, and a transfer that
 * moved USDC between two accounts of the same owner nets to zero
 * and is not a transfer in or out. Both limits are in the scope
 * string the statement prints.
 *
 * BOUNDED, AND LOUD WHEN THE BOUND BINDS. A window with more than
 * SIGNATURE_CAP signatures across the wallet's accounts, or more
 * than PAGE_CAP pages on one account, is not half-read: it comes
 * back as a thrown error the statement turns into window_unreadable
 * with the reason, the same word the EVM read uses for a refused
 * range. A silent partial read would be a statement that lies about
 * its own coverage, which is the one thing a statement must not do.
 */

/** getSignaturesForAddress serves at most 1,000 per page; this is that page. */
const PAGE_SIZE = 1000;
/** Pages walked per token account before the read is refused as too wide. */
export const SOLANA_PAGE_CAP = 5;
/** Signatures resolved per statement before the read is refused as too wide: one getTransaction each. */
export const SOLANA_SIGNATURE_CAP = 400;
/**
 * Solana's cadence, roughly: ~2.5 slots a second, so ~9,000 slots an
 * hour. A slot is a scheduling unit, not a mined block, and some are
 * skipped, so the hour is approximate and the window is stated in
 * slots on the artifact rather than in hours.
 */
export const SLOTS_PER_HOUR = 9000;

export interface SolanaSignatureRow {
  signature: string;
  slot: number;
  err: unknown;
}

export interface SolanaUsdcTransfer {
  /** The transaction signature, the chain's own identifier. */
  txHash: string;
  /** Raw USDC units (six decimals). */
  amount: bigint;
  /** The slot the transaction landed in — the statement's `block`. */
  block: number;
  /** The wallet on the other side, when the balances name one. */
  from?: string;
  to?: string;
}

async function rpcRaw<T>(env: Env, method: string, params: unknown[], fetchImpl: typeof fetch): Promise<T> {
  // The transport in solana-rpc.ts is private; this mirrors its
  // endpoint order for the one method it does not expose paged.
  const { rpcUrlsOf } = await import("@/lib/solana-rpc");
  let lastError = "no endpoint tried";
  for (const url of rpcUrlsOf(env)) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    if (typeof body !== "object" || body === null || !("result" in body) || (body as { error?: unknown }).error) {
      lastError = `${new URL(url).host} returned no result`;
      continue;
    }
    return (body as { result: T }).result;
  }
  throw new Error(`Solana RPC ${method} failed on every endpoint (last: ${lastError})`);
}

/**
 * Every successful signature touching one account whose slot is in
 * [fromSlot, toSlot], newest first as the RPC serves them. Pages
 * until a page's oldest slot is below the window or the page is
 * short; refuses past SOLANA_PAGE_CAP.
 */
export async function signaturesInWindow(
  env: Env,
  account: string,
  fromSlot: number,
  toSlot: number,
  fetchImpl: typeof fetch = fetch,
): Promise<SolanaSignatureRow[]> {
  const out: SolanaSignatureRow[] = [];
  let before: string | undefined;
  for (let page = 0; page < SOLANA_PAGE_CAP; page += 1) {
    const rows = await rpcRaw<SolanaSignatureRow[]>(
      env,
      "getSignaturesForAddress",
      [account, { limit: PAGE_SIZE, commitment: "confirmed", ...(before ? { before } : {}) }],
      fetchImpl,
    );
    const list = rows ?? [];
    for (const row of list) {
      if (row.slot > toSlot) continue;
      if (row.slot < fromSlot) return out;
      if (row.err) continue;
      out.push({ signature: row.signature, slot: row.slot, err: row.err });
    }
    if (list.length < PAGE_SIZE) return out;
    before = list[list.length - 1]!.signature;
  }
  throw new Error(
    `more than ${SOLANA_PAGE_CAP * PAGE_SIZE} signatures on ${account} inside the window; narrow the window — a partial read would misstate its own coverage`,
  );
}

/**
 * The transfers in and out of one wallet over a slot window. Reads
 * every USDC token account the wallet owns at read time; resolves
 * each signature once even when several accounts share it.
 */
export async function solanaUsdcTransfers(
  env: Env,
  owner: string,
  fromSlot: number,
  toSlot: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ inbound: SolanaUsdcTransfer[]; outbound: SolanaUsdcTransfer[]; accounts: string[] }> {
  const accounts = (await usdcTokenAccountsDetailed(env, owner)).map((entry) => entry.pubkey);
  const signatures = new Map<string, number>();
  for (const account of accounts) {
    for (const row of await signaturesInWindow(env, account, fromSlot, toSlot, fetchImpl)) {
      signatures.set(row.signature, row.slot);
      if (signatures.size > SOLANA_SIGNATURE_CAP) {
        throw new Error(
          `more than ${SOLANA_SIGNATURE_CAP} USDC transactions inside the window; narrow the window — a partial read would misstate its own coverage`,
        );
      }
    }
  }
  const inbound: SolanaUsdcTransfer[] = [];
  const outbound: SolanaUsdcTransfer[] = [];
  for (const [signature, slot] of signatures) {
    const facts = await solanaTransactionFacts(env, signature);
    if (!facts || facts.err) continue;
    const mine = facts.deltas.find((delta) => delta.owner === owner);
    if (!mine || mine.delta === 0n) continue;
    // The counterparty: the largest opposite-signed delta, when one is named.
    const others = facts.deltas
      .filter((delta) => delta.owner !== owner && (mine.delta > 0n ? delta.delta < 0n : delta.delta > 0n))
      .sort((a, b) => (a.delta < b.delta ? (mine.delta > 0n ? -1 : 1) : mine.delta > 0n ? 1 : -1));
    const counterparty = others[0]?.owner;
    if (mine.delta > 0n) {
      inbound.push({ txHash: signature, amount: mine.delta, block: facts.slot || slot, ...(counterparty ? { from: counterparty } : {}) });
    } else {
      outbound.push({ txHash: signature, amount: -mine.delta, block: facts.slot || slot, ...(counterparty ? { to: counterparty } : {}) });
    }
  }
  return { inbound, outbound, accounts };
}

/** The chain head in slots, confirmed. */
export async function solanaHead(env: Env): Promise<number> {
  return getSlot(env);
}

export { SOLANA_USDC_MINT };
