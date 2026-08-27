import {
  BASE_EVM,
  evmChainOf,
  getBlockNumber,
  usdcFromUnits,
  usdcTransfersFrom,
  usdcTransfersTo,
  type EvmChain,
} from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import { signMessage } from "@/lib/signing";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE STATEMENT (keeper-approved backlog, 2026-08-19; second build) —
 * a bank statement for an agent's wallet, signed by somebody who is
 * not the agent and not its operator: every USDC transfer in and out
 * of one Base address over a stated block window, read straight off
 * the chain and written down without a single judgment attached.
 *
 * WHY IT SELLS: the August field run's reconciliation found 180
 * settlements that cleared on chain while the buying agent's own
 * ledger recorded failure — about 10.5% of attempts. An agent's
 * self-report drifts; the chain does not. The AI AGENT Act (S.5051)
 * points NIST at auditable records of agent actions, and for money,
 * this is that record: neutral, dated, verifiable forever.
 *
 * A STATEMENT, NOT A JUDGMENT (rule 43 by construction): counts,
 * sums, and the transfers themselves. No "healthy", no "suspicious",
 * no comparison to anyone's ledger — the holder does the comparing,
 * which is the step that keeps us derive-or-refuse pure. We never see
 * the agent's books at all.
 *
 * THE WINDOW IS THE WHOLE COVERAGE CLAIM. Two indexed eth_getLogs
 * reads (in, out), each bounded to the block range printed on the
 * artifact. Nothing outside it was read; USDC on Base is the only
 * asset and chain seen; both limits ride the scope. A window the RPC
 * refuses becomes a signed "window_unreadable" — a dated fact about
 * the read, never a silent shrink.
 */

/** Base's ~2s cadence: blocks per hour of chain. */
const BLOCKS_PER_HOUR = 1800;

/** The window ceiling, in hours. ~20k blocks — the same order the
 * bank walk's clamp treats as one safe getLogs neighborhood. */
export const STATEMENT_MAX_HOURS = 11;
export const STATEMENT_DEFAULT_HOURS = 6;

/** Transfers listed per direction; the counts always cover the whole
 * window (an unnamed cap is a silent one, so this one is on the
 * artifact next to the totals it can never distort). */
export const STATEMENT_LIST_CAP = 200;

export interface StatementTransfer {
  tx_hash: string;
  /** The other party: sender on inflows, recipient on outflows. */
  counterparty: string;
  amount_atomic: string;
  amount_usdc: number;
  block: number;
}

export interface StatementSide {
  /** Every transfer in the window, counted — never capped. */
  count: number;
  total_atomic: string;
  total_usdc: number;
  /** Up to STATEMENT_LIST_CAP rows, oldest first; the counts above
   * are the coverage, this list is the detail. */
  transfers: StatementTransfer[];
  listed: number;
}

export interface WalletStatementObservation {
  statement_id: string;
  /** The wallet asked about, lowercased. */
  wallet: string;
  chain: string;
  asset: string;
  observed_at: string;
  coverage: "complete" | "window_unreadable";
  window: {
    from_block: number;
    to_block: number;
    hours_requested: number;
    chain_head_at_read: number;
  };
  inflows: StatementSide;
  outflows: StatementSide;
  list_cap: number;
  /** Set only when coverage is window_unreadable. */
  read_error?: string;
  evidence_hash: string;
  scope: string;
}

export interface SignedWalletStatement extends WalletStatementObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

export interface WalletStatementRecord {
  statement: SignedWalletStatement;
  cert_id: string;
  created_at: string;
}

/**
 * The scope names its own chain — the parity ruling's wording rule:
 * one template, a chain parameter, no second constant to drift.
 */
export function statementScope(chain: EvmChain): string {
  return `USDC transfers on ${chain.label} (${chain.caip2}), read from the chain by indexed eth_getLogs over exactly the block window stated — nothing outside it was read, and no other asset or chain was seen: a wallet moving ETH, other tokens, or funds on other networks shows none of that here. Counts and totals cover the whole window; the transfer lists are capped at list_cap rows per direction and say how many they carry. A statement, never a judgment: no comparison to anyone's ledger was made or possible — we never see one — and nothing here says what any transfer was for. window_unreadable is a fact about our read at this moment, not about the wallet. Produced automatically; a statement commissioned by anyone about any wallet reads the same.`;
}

/**
 * The network parameter's whole vocabulary: CAIP-2 or the plain
 * word, either rail, Base when unsaid. Null is a refusal — an
 * unrecognized network must bounce before money moves, never default
 * silently to a chain the buyer did not ask about.
 */
export function statementChain(raw: string | undefined): EvmChain | null {
  return evmChainOf(raw);
}

function side(
  rows: Array<{ txHash: string; amount: bigint; block: number }>,
  counterpartyOf: (row: { txHash: string; amount: bigint; block: number }) => string,
): StatementSide {
  const sorted = [...rows].sort((a, b) => a.block - b.block);
  const total = sorted.reduce((sum, row) => sum + row.amount, 0n);
  const listed = sorted.slice(0, STATEMENT_LIST_CAP);
  return {
    count: sorted.length,
    total_atomic: total.toString(),
    total_usdc: usdcFromUnits(total),
    transfers: listed.map((row) => ({
      tx_hash: row.txHash,
      counterparty: counterpartyOf(row),
      amount_atomic: row.amount.toString(),
      amount_usdc: usdcFromUnits(row.amount),
      block: row.block,
    })),
    listed: listed.length,
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const EMPTY_SIDE: StatementSide = {
  count: 0,
  total_atomic: "0",
  total_usdc: 0,
  transfers: [],
  listed: 0,
};

/** Clamp the requested hours into the published bounds. The buy door
 * validates first; this keeps the service honest called any way. */
export function statementHours(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return STATEMENT_DEFAULT_HOURS;
  return Math.min(Math.max(parsed, 1), STATEMENT_MAX_HOURS);
}

export async function performWalletStatement(
  env: Env,
  wallet: string,
  hoursRequested: number = STATEMENT_DEFAULT_HOURS,
  chain: EvmChain = BASE_EVM,
): Promise<SignedWalletStatement> {
  const address = wallet.toLowerCase();
  const hours = Math.min(Math.max(hoursRequested, 1), STATEMENT_MAX_HOURS);
  const now = new Date();

  let coverage: WalletStatementObservation["coverage"] = "complete";
  let readError: string | undefined;
  let head = 0;
  let inflows = EMPTY_SIDE;
  let outflows = EMPTY_SIDE;
  let fromBlock = 0;
  try {
    head = await getBlockNumber(env, chain);
    fromBlock = Math.max(head - hours * BLOCKS_PER_HOUR, 0);
    // An array literal evaluates left to right, so the old shape here —
    // [await a, await b] — READ as parallel and was two serial
    // eth_getLogs calls over an 11-hour window, on a paid door.
    const [inbound, outbound] = await Promise.all([
      usdcTransfersTo(env, address, fromBlock, head, chain),
      usdcTransfersFrom(env, address, fromBlock, head, chain),
    ]);
    inflows = side(inbound, (row) =>
      (row as { from?: string }).from ?? "",
    );
    outflows = side(outbound, (row) => (row as { to?: string }).to ?? "");
  } catch (error) {
    // The read failed after base-rpc's own endpoint retries. The
    // statement still ships, saying exactly that — a dated fact about
    // this read, worth less than a complete one and priced into the
    // coverage field rather than hidden behind a throw.
    coverage = "window_unreadable";
    readError = String(error);
    inflows = EMPTY_SIDE;
    outflows = EMPTY_SIDE;
  }

  const core = {
    statement_id: `stmt_${newEntryId()}`,
    wallet: address,
    chain: chain.caip2,
    asset: chain.usdc,
    observed_at: now.toISOString(),
    coverage,
    window: {
      from_block: fromBlock,
      to_block: head,
      hours_requested: hours,
      chain_head_at_read: head,
    },
    inflows,
    outflows,
    list_cap: STATEMENT_LIST_CAP,
    ...(readError ? { read_error: readError } : {}),
  };
  const observation: WalletStatementObservation = {
    ...core,
    evidence_hash: await sha256Hex(JSON.stringify(core)),
    scope: statementScope(chain),
  };
  const signed = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return {
    ...observation,
    signature: signed.signature,
    public_key: signed.publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };
}

/** Stored after the mint so the envelope carries the cert id; the
 * signature was fixed before the mint — the Once-Over's discipline. */
export async function storeWalletStatement(
  env: Env,
  statement: SignedWalletStatement,
  certId: string,
): Promise<WalletStatementRecord> {
  const record: WalletStatementRecord = {
    statement,
    cert_id: certId,
    created_at: new Date().toISOString(),
  };
  await kvPut(env.PATRONS, 
    KV_KEYS.walletStatement(statement.statement_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getWalletStatement(
  env: Env,
  statementId: string,
): Promise<WalletStatementRecord | null> {
  return kvGetJson<WalletStatementRecord>(env.PATRONS, 
    KV_KEYS.walletStatement(statementId),
    "json",
  );
}
