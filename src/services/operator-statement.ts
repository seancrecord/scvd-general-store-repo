import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { signMessage } from "@/lib/signing";
import { BASE_EVM, getBlockNumber, usdcFromUnits, usdcTransfersFrom, usdcTransfersTo, type EvmChain } from "@/lib/base-rpc";
import { ladderRung } from "@/services/menu-markdown";
import { sweepWatches } from "@/services/watch-sweep";
import { newEntryId } from "@/lib/ids";
import type { Env } from "@/types";

/**
 * THE OPERATOR'S STATEMENT (roadmap S10; the keeper's name, price and
 * cadence, ruled 2026-09-02).
 *
 * the_statement reads one wallet's USDC transfers over a window of at
 * most eleven hours, once, for a buyer who wants the chain's side of
 * an agent's books. An operator with real payers wants the same read
 * pointed at their RECEIVING address and kept up for a month: every
 * transfer in and out, who paid, how many of them there were, and how
 * concentrated they were — from a party that is neither the operator
 * nor the payer, and never from the operator's own dashboard.
 *
 * SHAPE. A 30-day term, bought once. The store's hourly rounds take
 * one bounded chain read every six hours — from the block after the
 * last pass to the chain head, never more than the engine's eleven
 * hour ceiling in one read — so the passes stitch into one continuous
 * block range with no overlap. A pass the rounds miss leaves a gap
 * the next pass closes if it can and the summary counts against us
 * if it cannot. Each pass is signed alone, so any one of them can be
 * quoted without the rest, and the history is served free forever.
 *
 * PAYER FACTS, AS COUNTS. Distinct payers, transfers in, the largest
 * payer's transfers and USDC beside the totals they are part of.
 * Never a percentage, never a share: the two numbers travel together
 * and the reader divides, which is the house sentence.
 *
 * NEVER A RENEWAL. The term ends on its own date; the history carries
 * the rule-23a pointer (`the_next_month`) — the same item, its price
 * read off the shelf, the same address pre-filled — and a second
 * purchase starts a second history rather than extending this one.
 *
 * Reads: public chain state only (chain_read). Nothing of the
 * operator's is fetched; the address is the whole input.
 */

/** The term, in days. The keeper's cadence. */
export const OPERATOR_STATEMENT_TERM_DAYS = 30;
/** Hours between passes: four a day, each reading the hours since the last. */
export const OPERATOR_PASS_HOURS = 6;
/** Floor between passes, so a doubled tick cannot double-read. */
const MIN_PASS_SPACING_MS = (OPERATOR_PASS_HOURS - 0.25) * 3600_000;
/** Base's ~2s cadence: blocks per hour of chain. Polygon is faster; the ceiling below still bounds one read. */
const BLOCKS_PER_HOUR = 1800;
/** One read never spans more than this: the statement engine's ceiling, in blocks. */
export const MAX_BLOCKS_PER_PASS = 11 * BLOCKS_PER_HOUR;
/** Distinct payers tallied per pass before the tally says it stopped counting names. */
export const PAYER_TALLY_CAP = 500;
/** Open terms scanned per sweep — kv-list's law: an unnamed cap is a silent one. */
export const OPERATOR_STATEMENT_SCAN_CAP = 500;
/**
 * Passes taken per hourly tick. Three RPC calls each, against an
 * invocation budget the reconciliation walk already spends ~50 of;
 * a shelf past this drops to the next tick rather than exhausting it.
 */
export const OPERATOR_PASSES_PER_SWEEP = 20;

export interface PayerTally {
  transfers: number;
  total_atomic: string;
  total_usdc: number;
}

export interface OperatorStatementPass {
  at: string;
  from_block: number;
  to_block: number;
  chain_head_at_read: number;
  coverage: "complete" | "window_unreadable";
  read_error?: string;
  inflows: { count: number; total_atomic: string; total_usdc: number };
  outflows: { count: number; total_atomic: string; total_usdc: number };
  /** Sender → tally, for the inflows of this pass; capped and says so. */
  payers: Record<string, PayerTally>;
  payers_capped: boolean;
  evidence_hash: string;
  signature: string;
  public_key: string;
}

export interface OperatorStatementRecord {
  statement_id: string;
  /** The receiving address the operator named, lowercased. */
  wallet: string;
  chain: string;
  asset: string;
  started_at: string;
  ends_at: string;
  /** The wallet that paid, for the claims door. */
  payer?: string;
  cert_id?: string;
  /** The first block the term covers: the head at purchase, plus one. */
  opened_at_block: number;
  passes: OperatorStatementPass[];
}

export interface OperatorStatementSummary {
  passes_taken: number;
  /** One pass per OPERATOR_PASS_HOURS since the term opened, capped by the term. */
  passes_expected: number;
  passes_missed: number;
  blocks_covered: number;
  /** Blocks from the term's opening to the last chain head read. */
  blocks_since_open: number;
  /** blocks_since_open − blocks_covered: what we have not read, counted against us. */
  blocks_unread: number;
  windows_unreadable: number;
  inflows: { count: number; total_usdc: number };
  outflows: { count: number; total_usdc: number };
  distinct_payers: number;
  largest_payer: { address: string; transfers: number; total_usdc: number } | null;
  payer_tally_capped: boolean;
}

export interface OperatorStatementHistory {
  statement_id: string;
  wallet: string;
  chain: string;
  asset: string;
  started_at: string;
  ends_at: string;
  complete: boolean;
  summary: OperatorStatementSummary;
  passes: OperatorStatementPass[];
  how_to_verify: string;
  what_this_is_not: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newOperatorStatementId(): string {
  return `ostmt_${newEntryId()}`;
}

/** Open a term: one record, the head at purchase as the opening block, no passes yet. */
export async function startOperatorStatement(
  env: Env,
  wallet: string,
  chain: EvmChain = BASE_EVM,
  payer?: string,
): Promise<{ record: OperatorStatementRecord; historyUrl: string }> {
  const now = new Date();
  let head = 0;
  try {
    head = await getBlockNumber(env, chain);
  } catch {
    // An unreadable head at purchase opens the term from block 0's
    // successor of "whatever the first pass reads": the first pass
    // records from_block = 1 and its own head, and the summary's
    // blocks_since_open is measured from that pass. Never a throw at
    // the till for a chain moment.
    head = 0;
  }
  const record: OperatorStatementRecord = {
    statement_id: newOperatorStatementId(),
    wallet: wallet.toLowerCase(),
    chain: chain.caip2,
    asset: chain.usdc,
    started_at: now.toISOString(),
    ends_at: new Date(now.getTime() + OPERATOR_STATEMENT_TERM_DAYS * 86_400_000).toISOString(),
    ...(payer ? { payer: payer.toLowerCase() } : {}),
    opened_at_block: head + 1,
    passes: [],
  };
  await kvPut(env.ORDERS, KV_KEYS.operatorStatement(record.statement_id), JSON.stringify(record));
  return {
    record,
    historyUrl: `${env.STORE_BASE_URL}/api/operator-statement/${record.statement_id}`,
  };
}

export async function bindOperatorStatementCert(
  env: Env,
  statementId: string,
  certId: string,
): Promise<void> {
  const record = await readOperatorStatement(env, statementId);
  if (!record) return;
  record.cert_id = certId;
  await kvPut(env.ORDERS, KV_KEYS.operatorStatement(statementId), JSON.stringify(record));
}

export async function readOperatorStatement(
  env: Env,
  statementId: string,
): Promise<OperatorStatementRecord | null> {
  return kvGetJson<OperatorStatementRecord>(env.ORDERS, KV_KEYS.operatorStatement(statementId), "json");
}

/** The chain constant for a stored record; Base unless the record says otherwise. */
export async function chainOfRecord(record: OperatorStatementRecord): Promise<EvmChain> {
  const { evmChainOf } = await import("@/lib/base-rpc");
  return evmChainOf(record.chain) ?? BASE_EVM;
}

/**
 * One pass: the block after the last one read, to the head, capped
 * at one engine window. Signed alone. A failed read is a signed
 * window_unreadable pass whose block range is what it TRIED to read,
 * so the next pass tries the same range again rather than skipping
 * it — a gap is closed, never stepped over.
 */
export async function passOnce(
  env: Env,
  record: OperatorStatementRecord,
  now: Date = new Date(),
): Promise<OperatorStatementPass> {
  const chain = await chainOfRecord(record);
  const lastComplete = [...record.passes].reverse().find((pass) => pass.coverage === "complete");
  const fromBlock = lastComplete ? lastComplete.to_block + 1 : record.opened_at_block;
  let head = 0;
  let toBlock = fromBlock;
  let coverage: OperatorStatementPass["coverage"] = "complete";
  let readError: string | undefined;
  let inflows = { count: 0, total_atomic: "0", total_usdc: 0 };
  let outflows = { count: 0, total_atomic: "0", total_usdc: 0 };
  let payers: Record<string, PayerTally> = {};
  let payersCapped = false;
  try {
    head = await getBlockNumber(env, chain);
    toBlock = Math.min(head, fromBlock + MAX_BLOCKS_PER_PASS - 1);
    if (toBlock < fromBlock) {
      // The chain has not moved past the last pass; nothing to read
      // and nothing to claim. Recorded as an empty complete pass over
      // no blocks so the cadence stays visible.
      toBlock = fromBlock - 1;
    } else {
      const [inbound, outbound] = await Promise.all([
        usdcTransfersTo(env, record.wallet, fromBlock, toBlock, chain),
        usdcTransfersFrom(env, record.wallet, fromBlock, toBlock, chain),
      ]);
      const inTotal = inbound.reduce((sum, row) => sum + row.amount, 0n);
      const outTotal = outbound.reduce((sum, row) => sum + row.amount, 0n);
      inflows = { count: inbound.length, total_atomic: inTotal.toString(), total_usdc: usdcFromUnits(inTotal) };
      outflows = { count: outbound.length, total_atomic: outTotal.toString(), total_usdc: usdcFromUnits(outTotal) };
      const tally = new Map<string, { transfers: number; atomic: bigint }>();
      for (const row of inbound) {
        const from = String((row as { from?: string }).from ?? "").toLowerCase();
        if (!from) continue;
        const existing = tally.get(from);
        if (existing) {
          existing.transfers += 1;
          existing.atomic += row.amount;
        } else if (tally.size < PAYER_TALLY_CAP) {
          tally.set(from, { transfers: 1, atomic: row.amount });
        } else {
          payersCapped = true;
        }
      }
      payers = Object.fromEntries(
        [...tally.entries()].map(([address, entry]) => [
          address,
          { transfers: entry.transfers, total_atomic: entry.atomic.toString(), total_usdc: usdcFromUnits(entry.atomic) },
        ]),
      );
    }
  } catch (error) {
    coverage = "window_unreadable";
    readError = String(error);
    inflows = { count: 0, total_atomic: "0", total_usdc: 0 };
    outflows = { count: 0, total_atomic: "0", total_usdc: 0 };
    payers = {};
    payersCapped = false;
  }
  const core = {
    statement_id: record.statement_id,
    wallet: record.wallet,
    chain: record.chain,
    asset: record.asset,
    at: now.toISOString(),
    from_block: fromBlock,
    to_block: toBlock,
    chain_head_at_read: head,
    coverage,
    ...(readError ? { read_error: readError } : {}),
    inflows,
    outflows,
    payers,
    payers_capped: payersCapped,
  };
  const evidenceHash = await sha256Hex(JSON.stringify(core));
  const signed = await signMessage(JSON.stringify({ ...core, evidence_hash: evidenceHash }), env.SIGNING_KEY);
  return {
    at: core.at,
    from_block: fromBlock,
    to_block: toBlock,
    chain_head_at_read: head,
    coverage,
    ...(readError ? { read_error: readError } : {}),
    inflows,
    outflows,
    payers,
    payers_capped: payersCapped,
    evidence_hash: evidenceHash,
    signature: signed.signature,
    public_key: signed.publicKey,
  };
}

/** The hourly sweep: every open term whose last pass is old enough, within the tick's budget. */
export async function sweepOperatorStatements(env: Env, now: number = Date.now()): Promise<number> {
  return sweepWatches<OperatorStatementRecord, OperatorStatementPass>({
    kv: env.ORDERS,
    prefix: KV_KEYS.operatorStatementPrefix,
    scanCap: OPERATOR_STATEMENT_SCAN_CAP,
    minSpacingMs: MIN_PASS_SPACING_MS,
    budget: OPERATOR_PASSES_PER_SWEEP,
    entriesOf: (record) => record.passes,
    observe: (record) => passOnce(env, record, new Date(now)),
    now,
  });
}

/** Pure over the record: the summary a reader can recompute from the signed passes. */
export function operatorStatementHistoryOf(
  record: OperatorStatementRecord,
  now: number,
): OperatorStatementHistory {
  const end = Math.min(now, Date.parse(record.ends_at));
  const elapsedMs = Math.max(0, end - Date.parse(record.started_at));
  const passesExpected = Math.min(
    Math.floor(elapsedMs / (OPERATOR_PASS_HOURS * 3600_000)) + (elapsedMs > 0 ? 1 : 0),
    Math.floor((OPERATOR_STATEMENT_TERM_DAYS * 24) / OPERATOR_PASS_HOURS) + 1,
  );
  let blocksCovered = 0;
  let unreadable = 0;
  let lastHead = record.opened_at_block - 1;
  let inCount = 0;
  let inAtomic = 0n;
  let outCount = 0;
  let outAtomic = 0n;
  const payers = new Map<string, { transfers: number; atomic: bigint }>();
  let capped = false;
  for (const pass of record.passes) {
    if (pass.chain_head_at_read > lastHead) lastHead = pass.chain_head_at_read;
    if (pass.coverage !== "complete") {
      unreadable += 1;
      continue;
    }
    if (pass.to_block >= pass.from_block) blocksCovered += pass.to_block - pass.from_block + 1;
    inCount += pass.inflows.count;
    inAtomic += BigInt(pass.inflows.total_atomic);
    outCount += pass.outflows.count;
    outAtomic += BigInt(pass.outflows.total_atomic);
    if (pass.payers_capped) capped = true;
    for (const [address, tally] of Object.entries(pass.payers)) {
      const existing = payers.get(address);
      if (existing) {
        existing.transfers += tally.transfers;
        existing.atomic += BigInt(tally.total_atomic);
      } else {
        payers.set(address, { transfers: tally.transfers, atomic: BigInt(tally.total_atomic) });
      }
    }
  }
  const blocksSinceOpen = Math.max(0, lastHead - record.opened_at_block + 1);
  let largest: OperatorStatementSummary["largest_payer"] = null;
  for (const [address, tally] of payers) {
    if (!largest || tally.atomic > BigInt(Math.round(largest.total_usdc * 1_000_000)) || (tally.atomic === BigInt(Math.round(largest.total_usdc * 1_000_000)) && tally.transfers > largest.transfers)) {
      largest = { address, transfers: tally.transfers, total_usdc: usdcFromUnits(tally.atomic) };
    }
  }
  return {
    statement_id: record.statement_id,
    wallet: record.wallet,
    chain: record.chain,
    asset: record.asset,
    started_at: record.started_at,
    ends_at: record.ends_at,
    complete: now > Date.parse(record.ends_at),
    summary: {
      passes_taken: record.passes.length,
      passes_expected: passesExpected,
      passes_missed: Math.max(0, passesExpected - record.passes.length),
      blocks_covered: blocksCovered,
      blocks_since_open: blocksSinceOpen,
      blocks_unread: Math.max(0, blocksSinceOpen - blocksCovered),
      windows_unreadable: unreadable,
      inflows: { count: inCount, total_usdc: usdcFromUnits(inAtomic) },
      outflows: { count: outCount, total_usdc: usdcFromUnits(outAtomic) },
      distinct_payers: payers.size,
      largest_payer: largest,
      payer_tally_capped: capped,
    },
    passes: record.passes,
    how_to_verify:
      "Each pass is signed on its own: ed25519_verify over the JSON of statement_id, wallet, chain, asset, at, from_block, to_block, chain_head_at_read, coverage, read_error (when present), inflows, outflows, payers, payers_capped and evidence_hash, in that order, against the pass's public_key; the key's continuity policy is at /.well-known/scvd-signing-key. Every count re-derives from indexed eth_getLogs over exactly the block range the pass states, on the chain and asset it names. The summary is arithmetic over the passes — recount it without us.",
    what_this_is_not:
      "Not revenue, not a rating, not a share of anything: counts with their denominators beside them, and the reader divides. distinct_payers and largest_payer are read off the senders of USDC transfers into this address and say nothing about who those senders are or what the transfers were for. blocks_unread and passes_missed are our gaps, stated against us. A window_unreadable pass is a fact about our read, never about the address.",
  };
}

/** The rule-23a pointer for the history: the same item, the same address, a new history. */
export function theNextMonth(base: string, wallet: string, chain: string, endsAt: string, complete: boolean) {
  const rung = ladderRung(
    base,
    "operator_statement",
    "the same address read for another month, four signed passes a day, as a new history",
  );
  if (!rung) return null;
  const buyUrl = `${base}/api/buy/operator_statement?wallet=${encodeURIComponent(wallet)}${chain === BASE_EVM.caip2 ? "" : `&network=${encodeURIComponent(chain)}`}`;
  return {
    ended: complete,
    the_rule:
      "This statement ends on its own date and never renews itself: bounded, prepaid, the passes we miss published against us. Another month exists only if its buyer buys it — nothing here charges again by itself.",
    what_now: complete
      ? `This month is over. The history stays at this URL, free, forever. Another month on the same address is one purchase at ${buyUrl}; it starts a new history rather than extending this one.`
      : `This month ends at ${endsAt}. When it does, another month on the same address is one purchase at ${buyUrl}; until then there is nothing to do and nothing that will be charged.`,
    item: rung,
    buy_url: buyUrl,
  };
}
