import { sendAlert } from "@/lib/alerts";
import {
  evmChainOf,
  findAuthorizationUseInRange,
  getBlockNumber,
  type EvmChain,
} from "@/lib/base-rpc";
import { invertedTimestamp } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { listKeys } from "@/lib/kv-list";
import {
  extractPaymentNonce,
  payerOfVerifiedPayload,
} from "@/lib/replay-guard";
import { openDeliveryIntent } from "@/services/delivery-audit";
import type { Env } from "@/types";

/**
 * MACHINE 1 — THE settlement_unknown CONTROL PLANE (task #56; all
 * rails, deliberately not a Polygon feature).
 *
 * THE STATE THIS MACHINE EXISTS FOR: a settle attempt that ended with
 * NO VERDICT. The call threw mid-flight, or both attempts died in
 * transport and the inline chain rescue could not answer either
 * (wrong rail for it, or the RPC was down too). Before this file, that
 * state was rendered as a DECLINE — an attribution the till could not
 * actually make — and the 2026-08-07 incident is what that costs: a
 * real buyer told no three times, paid three times, discovered ten
 * hours later by hand reconciliation.
 *
 * Cairn's paid answer (2026-08-26) showed the outside-view version of
 * the same blindness: CDP's exact-SVM validator moved between Aug
 * 23-25, and from outside, "facilitator validator moved" is
 * byte-identical to "door rejects valid payments". A till that cannot
 * tell those apart must say UNKNOWN, not pick the flattering or the
 * damning reading.
 *
 * WHAT THE MACHINE DOES:
 *   CAPTURE — both doors write a row at the ambiguous seam. The buyer
 *   still gets the decline response (money fails closed for delivery
 *   NOW); the row keeps the QUESTION open so resolution is mechanical
 *   instead of 3am forensics.
 *   RESOLVE — the hourly pass re-asks the chain where a chain can
 *   answer (Base and Polygon: AuthorizationUsed is the fact), walking
 *   history in each chain's own getLogs span on a per-row cursor.
 *     burned            -> settled_late: money moved, goods did not.
 *                          The existing machinery takes over — an
 *                          undelivered_sale page and a delivery-intent
 *                          row, the same desk the keeper already works.
 *     window covered,
 *     validBefore past  -> expired_unused: EIP-3009 enforces
 *                          validBefore at execution, so a nonce not
 *                          burned by then can never move money. Closed
 *                          quietly; the decline was correct after all.
 *     cannot answer     -> stays open, cursor persisted, and after
 *                          AGE_OUT_DAYS the row closes as
 *                          aged_out_unresolved — which says "we could
 *                          not answer", never "no". The monthly
 *                          reconciliation walk remains the backstop it
 *                          has always been.
 *
 * Rule 52 runs through all of it: a lookup that cannot see everything
 * (Solana rows, a dead RPC, an uncovered window) must not answer.
 */

export const SETTLEMENT_UNKNOWN_PREFIX = "settlement_unknown:";
const ROW_TTL_SECONDS = 90 * 86400;
export const AGE_OUT_DAYS = 7;
/** ~2s blocks on Base and Polygon both; used only to AIM the scan. */
const BLOCK_SECONDS = 2;
/** Blocks of slack around every estimate, so aiming error stays inside the window. */
const MARGIN_BLOCKS = 600;
/** Seconds past validBefore before "expired" is claimed — clock-skew slack. */
const EXPIRY_GRACE_SECONDS = 600;
/** Rows touched per resolver pass, and chunks spent per row per pass. */
const ROWS_PER_PASS = 8;
const CHUNKS_PER_ROW_PER_PASS = 4;

export type SettlementUnknownState =
  | "open"
  | "settled_late"
  | "expired_unused"
  | "aged_out_unresolved";

export interface SettlementUnknownRow {
  version: 1;
  state: SettlementUnknownState;
  path: string;
  door: "http" | "mcp";
  /** What the till saw, verbatim — never an attribution. */
  reason: string;
  at: string;
  network?: string;
  nonce?: string;
  payer?: string;
  /** Unix seconds off the EVM authorization, when extractable. */
  valid_before?: number;
  quoted_usdc?: number;
  /** Resolver passes so far. */
  checks?: number;
  /** Chain-scan cursor: the last block already covered, exclusive start next pass. */
  scanned_to?: number;
  /** First block of the scan window, estimated once on the first pass. */
  scan_from?: number;
  resolved_at?: string;
  /** The found transaction, when state is settled_late. */
  transaction?: string;
}

function deepFind(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = deepFind(entry, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (key in record) return record[key];
  for (const entry of Object.values(record)) {
    const found = deepFind(entry, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

export interface SettlementUnknownInput {
  path: string;
  door: "http" | "mcp";
  reason: string;
  network?: string;
  paymentHeader?: string;
  quotedUsdc?: number;
}

/**
 * Write the row. NEVER throws and never fails the response it rides
 * behind — same law as every audit write at the till: a paid (or
 * refused) customer does not get an error because bookkeeping about
 * the ambiguity would not write.
 */
export async function recordSettlementUnknown(
  env: Env,
  input: SettlementUnknownInput,
): Promise<string | null> {
  try {
    let payload: unknown = null;
    try {
      payload = JSON.parse(atob(input.paymentHeader ?? ""));
    } catch {
      payload = null;
    }
    const nonce = payload ? extractPaymentNonce(payload) : null;
    const payer = payload ? payerOfVerifiedPayload(payload) : null;
    const validBeforeRaw = payload ? deepFind(payload, "validBefore") : undefined;
    const validBefore = Number(validBeforeRaw);
    const row: SettlementUnknownRow = {
      version: 1,
      state: "open",
      path: input.path,
      door: input.door,
      reason: input.reason.slice(0, 300),
      at: new Date().toISOString(),
      ...(input.network ? { network: input.network } : {}),
      ...(nonce ? { nonce } : {}),
      ...(payer ? { payer } : {}),
      ...(Number.isFinite(validBefore) && validBefore > 0
        ? { valid_before: validBefore }
        : {}),
      ...(input.quotedUsdc !== undefined ? { quoted_usdc: input.quotedUsdc } : {}),
    };
    const key = `${SETTLEMENT_UNKNOWN_PREFIX}${invertedTimestamp(Date.now())}:${Math.random().toString(36).slice(2, 8)}`;
    await kvPut(env.COUNTERS, key, JSON.stringify(row), {
      expirationTtl: ROW_TTL_SECONDS,
    });
    return key;
  } catch (error) {
    console.error("settlement_unknown row lost:", String(error));
    return null;
  }
}

export interface SettlementUnknownListing {
  rows: Array<{ key: string; row: SettlementUnknownRow }>;
  /**
   * The list stopped at its cap with the prefix unfinished. Rows
   * beyond it are newest-last (the keys sort by inverted timestamp),
   * so a truncated read means the OLDEST questions are the unseen
   * ones — exactly the rows nearest their age-out. Every reader
   * surfaces this rather than treating the cap as the population
   * (rule 52).
   */
  truncated: boolean;
}

export async function listSettlementUnknowns(
  env: Env,
  cap = 50,
): Promise<SettlementUnknownListing> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: SETTLEMENT_UNKNOWN_PREFIX,
    cap,
  });
  const rows: Array<{ key: string; row: SettlementUnknownRow }> = [];
  for (const key of listed.names) {
    const row = await kvGetJson<SettlementUnknownRow>(env.COUNTERS, key, "json");
    if (row) rows.push({ key, row });
  }
  return { rows, truncated: listed.truncated };
}

async function persist(
  env: Env,
  key: string,
  row: SettlementUnknownRow,
): Promise<void> {
  await kvPut(env.COUNTERS, key, JSON.stringify(row), {
    expirationTtl: ROW_TTL_SECONDS,
  });
}

async function resolveEvmRow(
  env: Env,
  key: string,
  row: SettlementUnknownRow,
  chain: EvmChain,
  now: Date,
): Promise<void> {
  const head = await getBlockNumber(env, chain);
  const ageSeconds = Math.max(0, (now.getTime() - Date.parse(row.at)) / 1000);
  if (row.scan_from === undefined) {
    row.scan_from = Math.max(
      0,
      head - Math.ceil(ageSeconds / BLOCK_SECONDS) - MARGIN_BLOCKS,
    );
  }
  /*
   * The scan's far edge: past validBefore, a burn can only exist at or
   * before it (EIP-3009 checks the clock at execution), so the window
   * is bounded — cover it once and the question closes either way.
   */
  const nowSeconds = now.getTime() / 1000;
  const target =
    row.valid_before && nowSeconds > row.valid_before
      ? Math.min(
          head,
          head -
            Math.floor((nowSeconds - row.valid_before) / BLOCK_SECONDS) +
            MARGIN_BLOCKS,
        )
      : head;
  let cursor = row.scanned_to ?? row.scan_from;
  for (
    let chunk = 0;
    chunk < CHUNKS_PER_ROW_PER_PASS && cursor < target;
    chunk += 1
  ) {
    const to = Math.min(cursor + chain.logSpan, target);
    const found = await findAuthorizationUseInRange(
      env,
      row.payer!,
      row.nonce!,
      cursor,
      to,
      chain,
    );
    if (found) {
      row.state = "settled_late";
      row.transaction = found.txHash;
      row.resolved_at = now.toISOString();
      await persist(env, key, row);
      /*
       * Money moved and goods never went out — the exact condition
       * the store already knows how to work. Hand it to that
       * machinery rather than inventing a second desk: the page the
       * keeper reads, and the delivery-intent row the audit closes
       * when the sale is finished by hand.
       */
      await openDeliveryIntent(env, {
        path: row.path,
        transaction: found.txHash,
        ...(row.payer ? { payer: row.payer } : {}),
        paid_usdc: row.quoted_usdc ?? 0,
        settled_at: row.at,
      }).catch(() => null);
      await sendAlert(env, {
        condition: "undelivered_sale",
        detail: `settlement_unknown resolved SETTLED_LATE: the ambiguous settle on ${row.path} (${row.reason}) did land on-chain as ${found.txHash}. The buyer paid and got nothing; the delivery intent row is open at /admin. Machine 1 found it mechanically — this used to take hand reconciliation.`,
        key: `settlement_unknown:${row.nonce}`,
      }).catch(() => undefined);
      return;
    }
    cursor = to;
  }
  row.scanned_to = cursor;
  row.checks = (row.checks ?? 0) + 1;
  if (
    cursor >= target &&
    row.valid_before &&
    nowSeconds > row.valid_before + EXPIRY_GRACE_SECONDS
  ) {
    // The whole window a burn could occupy was covered and showed
    // nothing, and the authorization's own clock has run out.
    row.state = "expired_unused";
    row.resolved_at = now.toISOString();
  }
  await persist(env, key, row);
}

/**
 * One resolver pass — wired to the hourly cron. Bounded: at most
 * ROWS_PER_PASS open rows, CHUNKS_PER_ROW_PER_PASS chain reads each.
 * Every failure path keeps the row open rather than answering.
 */
export async function resolveSettlementUnknowns(
  env: Env,
  now: Date = new Date(),
): Promise<{ touched: number; resolved: number }> {
  const listing = await listSettlementUnknowns(env, 100);
  if (listing.truncated) {
    // More open questions than one pass can even SEE. Say so loudly:
    // the unseen rows are the oldest, the ones nearest their age-out.
    console.error(
      "settlement_unknown listing truncated at 100 — oldest rows unseen this pass",
    );
  }
  let touched = 0;
  let resolved = 0;
  for (const { key, row } of listing.rows) {
    if (row.state !== "open") continue;
    if (touched >= ROWS_PER_PASS) break;
    touched += 1;
    const ageDays = (now.getTime() - Date.parse(row.at)) / 86_400_000;
    // The network must be EXPLICIT: evmChainOf defaults an empty string
    // to Base for the store's own books, and a resolver that assumed a
    // rail would be answering a question nobody asked it (rule 52).
    const chain = row.network ? evmChainOf(row.network) : null;
    if (chain && row.nonce && row.payer) {
      try {
        await resolveEvmRow(env, key, row, chain, now);
        if (row.state !== "open") resolved += 1;
        continue;
      } catch (error) {
        // The RPC failing resolves nothing; the row stays open and the
        // age-out below is the only clock still running.
        console.error("settlement_unknown resolve failed:", String(error));
      }
    }
    if (ageDays > AGE_OUT_DAYS) {
      // "We could not answer" — never "no". Monthly reconciliation
      // remains the backstop for whatever this row was.
      row.state = "aged_out_unresolved";
      row.resolved_at = now.toISOString();
      await persist(env, key, row).catch(() => undefined);
      resolved += 1;
    }
  }
  return { touched, resolved };
}
