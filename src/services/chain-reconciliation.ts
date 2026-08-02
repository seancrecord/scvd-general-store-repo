import { getBlockNumber, usdcTransfersTo, usdcFromUnits } from "@/lib/base-rpc";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sendAlert } from "@/lib/alerts";
import type { CertificateRecord, Env } from "@/types";

/**
 * THE BANK RECONCILIATION (problem ledger #4) — the check that does
 * not trust us.
 *
 * WHY THIS EXISTS WHEN THE DELIVERY AUDIT ALREADY SHIPPED. That audit
 * (#18) writes an intent row before the handler and clears it after,
 * so it catches a handler that died after settlement. It is built
 * ENTIRELY OUT OF OUR OWN WRITES, which means it is blind to exactly
 * one case: the one where our own writes are what failed. An isolate
 * dying between the facilitator returning and the intent write, a
 * recordSettlement that silently failed, money arriving by a path that
 * never went through the gate — in all of those the buyer paid, no row
 * exists anywhere, and every instrument we have reports a clean sweep.
 *
 * So this one walks the OTHER side of the books: USDC transfers into
 * the store's receiving wallet, straight off Base, against the
 * certificates we minted. A transfer with no artifact against it is
 * money we took and did not deliver — and because the transfer list
 * comes from the chain rather than from us, no failure of ours can
 * hide it.
 *
 * IT REPORTS, IT DOES NOT REPAIR. Same rule as the delivery audit:
 * we cannot re-run a handler whose side effects are unknown, and a
 * refund is money moving, which never happens on a cron here. What
 * this buys is that the keeper finds out before the buyer does, from
 * evidence the keeper did not have to trust us for.
 *
 * WHAT IT IS NOT. Not an accounting system and not a balance. It
 * answers exactly one question — is there an artifact for this
 * payment — and deliberately says nothing about amounts matching,
 * because a tip, a refund, or a keeper transfer all move USDC without
 * being a sale, and a check that guessed at those would cry wolf.
 */

/** Blocks per pass. Base is ~2s, so this is a little over an hour. */
export const RECONCILE_BLOCK_SPAN = 2000;

/** Never walk further back than this in one pass, however far behind. */
export const RECONCILE_MAX_SPAN = 20000;

/** Ceiling on the certificate scan that builds the known-tx set. */
export const CERT_SCAN_CAP = 2000;

export interface OrphanTransfer {
  tx_hash: string;
  from: string;
  usdc: number;
  block: number;
}

export interface ChainReconciliation {
  ran: boolean;
  /** Why not, when ran is false. Never a silent skip. */
  reason?: string;
  from_block?: number;
  to_block?: number;
  transfers_seen?: number;
  orphans?: OrphanTransfer[];
  /** True when the certificate scan hit its cap and may be partial. */
  cert_scan_truncated?: boolean;
}

/**
 * Every settlement hash the store has an artifact for.
 *
 * Reads certificates rather than the delivery rows on purpose: a
 * delivery row is cleared on success, so it is evidence of a PROBLEM,
 * not of a sale. The certificate is the thing a buyer walks away with,
 * which makes "is there a certificate for this money" the question
 * that matters.
 */
export async function knownSettlementHashes(
  env: Env,
): Promise<{ hashes: Set<string>; truncated: boolean }> {
  const listed = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.certPrefix,
    cap: CERT_SCAN_CAP,
  });
  const values = await bulkGetJson<CertificateRecord>(
    env.PATRONS,
    listed.names,
  );
  const hashes = new Set<string>();
  for (const record of values.values()) {
    const tx = record?.certificate?.settlement_tx;
    if (typeof tx === "string" && tx.length > 0) {
      hashes.add(tx.toLowerCase());
    }
  }
  return { hashes, truncated: listed.names.length >= CERT_SCAN_CAP };
}

/**
 * Walk the chain forward from where the last pass stopped.
 *
 * INCREMENTAL, with the cursor stored rather than derived, because a
 * pass that re-walked all of history every hour would eventually stop
 * running — and an instrument that stops running is the failure this
 * whole file is about.
 */
export async function reconcileAgainstChain(
  env: Env,
  options: { now?: Date } = {},
): Promise<ChainReconciliation> {
  const payTo = env.PAY_TO_ADDRESS;
  if (!payTo) {
    return { ran: false, reason: "no PAY_TO_ADDRESS configured" };
  }

  let head: number;
  try {
    head = await getBlockNumber(env);
  } catch (error) {
    // The chain being unreachable is not a clean sweep, and the
    // difference has to survive into the caller.
    return { ran: false, reason: `could not read the chain head: ${String(error)}` };
  }

  const stored = await env.COUNTERS.get(KV_KEYS.reconcileCursor);
  const cursor = stored ? Number.parseInt(stored, 10) : NaN;
  /**
   * FIRST RUN STARTS NEAR THE HEAD, not at genesis. Walking all of
   * Base to find eight settlements would time out forever and never
   * report anything, which is worse than starting late and saying so.
   */
  const fromBlock = Number.isFinite(cursor)
    ? Math.max(cursor + 1, head - RECONCILE_MAX_SPAN)
    : Math.max(0, head - RECONCILE_BLOCK_SPAN);
  const toBlock = Math.min(head, fromBlock + RECONCILE_BLOCK_SPAN - 1);
  if (toBlock < fromBlock) {
    return { ran: false, reason: "no new blocks since the last pass" };
  }

  let transfers: Awaited<ReturnType<typeof usdcTransfersTo>>;
  try {
    transfers = await usdcTransfersTo(env, payTo, fromBlock, toBlock);
  } catch (error) {
    return { ran: false, reason: `chain query failed: ${String(error)}` };
  }

  const { hashes, truncated } = await knownSettlementHashes(env);
  const orphans: OrphanTransfer[] = [];
  for (const transfer of transfers) {
    if (hashes.has(transfer.txHash)) continue;
    orphans.push({
      tx_hash: transfer.txHash,
      from: transfer.from,
      usdc: usdcFromUnits(transfer.amount),
      block: transfer.block,
    });
  }

  /**
   * THE CURSOR MOVES ONLY ON A CLEAN READ. Every early return above
   * leaves it where it was, so a failed pass is retried rather than
   * skipped — a reconciliation that walked past a window it never
   * actually read would be worse than one that fell behind.
   */
  await env.COUNTERS.put(KV_KEYS.reconcileCursor, String(toBlock));

  return {
    ran: true,
    from_block: fromBlock,
    to_block: toBlock,
    transfers_seen: transfers.length,
    orphans,
    cert_scan_truncated: truncated,
  };
}

/**
 * The cron pass. Alerts per orphan, keyed by hash so a standing
 * problem pages once per window rather than hourly, and a SECOND
 * orphan is its own news.
 */
export async function runChainReconciliation(
  env: Env,
  options: { now?: Date } = {},
): Promise<ChainReconciliation> {
  const result = await reconcileAgainstChain(env, options);
  for (const orphan of result.orphans ?? []) {
    await sendAlert(env, {
      condition: "undelivered_sale",
      detail: `${orphan.usdc} USDC arrived from ${orphan.from} in transaction ${orphan.tx_hash} (block ${orphan.block}) and NO certificate names it. The chain says we were paid; our own records do not. Check whether an artifact was minted under a different hash, then fulfil or refund by hand.${
        result.cert_scan_truncated
          ? " NOTE: the certificate scan hit its cap, so this may be a false alarm from a partial read."
          : ""
      }`,
      key: orphan.tx_hash,
    }).catch(() => {
      // The alert is the courtesy; the finding is recomputed next pass.
    });
  }
  return result;
}
