import { getBlockNumber, usdcTransfersTo, usdcFromUnits } from "@/lib/base-rpc";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sendAlert } from "@/lib/alerts";
import { listPayers } from "@/lib/metrics";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import { MENU_ITEMS } from "@/store";
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
  /**
   * "possible_sale" is the case this instrument was built for: money
   * that might be an undelivered purchase. "dust" is a transfer BELOW
   * every price on the shelf — no 402 flow can settle under the
   * cheapest listing, so it cannot be a purchase that lost its
   * certificate, and the mechanical "fulfil or refund" advice is
   * WRONG for it (refunding dust is interacting with a probable
   * address-poisoning attempt, which is its goal).
   */
  classification: "possible_sale" | "dust";
  /**
   * Set when the sender's address visually mimics a known
   * counterparty (same leading and trailing characters, different
   * address) — the address-poisoning profile. First seen live
   * 2026-08-04: 0x843bc0df…88a4a7 imitating CV's 0x843b544b…C98cc4a7,
   * dust-sized, hoping to be copied out of transaction history later.
   */
  lookalike_of?: string;
}

/** No 402 settles below the cheapest listing; under this is dust. */
export function cheapestListingUsdc(): number {
  return Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
}

/**
 * Address-poisoning check: same first four and last two hex
 * characters as a known counterparty, but not actually them. Odds of
 * a legitimate stranger matching by chance are ~16^-6 per known
 * address — when this fires, it is a grinder, not a coincidence.
 */
export function findLookalike(
  sender: string,
  known: Iterable<string>,
): string | null {
  const s = sender.toLowerCase();
  for (const candidate of known) {
    const k = candidate.toLowerCase();
    if (k === s) continue;
    if (k.slice(0, 6) === s.slice(0, 6) && k.slice(-2) === s.slice(-2)) {
      return candidate;
    }
  }
  return null;
}

/** Every address the store knows: the register plus the payer rows. */
async function knownCounterparties(env: Env): Promise<string[]> {
  const registered = HOUSE_WALLET_FILE.wallets.map((entry) => entry.address);
  const payers = await listPayers(env, 200).catch(() => []);
  return [...registered, ...payers.map((payer) => payer.address)];
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
  const floor = cheapestListingUsdc();
  let counterparties: string[] | null = null;
  for (const transfer of transfers) {
    if (hashes.has(transfer.txHash)) continue;
    const usdc = usdcFromUnits(transfer.amount);
    const orphan: OrphanTransfer = {
      tx_hash: transfer.txHash,
      from: transfer.from,
      usdc,
      block: transfer.block,
      classification: usdc < floor ? "dust" : "possible_sale",
    };
    if (orphan.classification === "dust") {
      // Only reach for the payer rows when there is dust to explain.
      counterparties ??= await knownCounterparties(env);
      const mimicked = findLookalike(transfer.from, counterparties);
      if (mimicked) {
        orphan.lookalike_of = mimicked;
      }
    }
    orphans.push(orphan);
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
    const detail =
      orphan.classification === "dust"
        ? `${orphan.usdc} USDC of DUST arrived from ${orphan.from} in transaction ${orphan.tx_hash} (block ${orphan.block}). Below every price on the shelf, so it cannot be a purchase that lost its certificate — no 402 settles under the cheapest listing. ${
            orphan.lookalike_of
              ? `The sender MIMICS ${orphan.lookalike_of} (same leading and trailing characters, different address): the address-poisoning profile. Its goal is to sit in transaction history and be copied later. `
              : ""
          }DO NOT refund it and DO NOT copy the sender's address for anything — addresses come from the register and the payer rows, never from transaction history. No action needed; this is recorded.`
        : `${orphan.usdc} USDC arrived from ${orphan.from} in transaction ${orphan.tx_hash} (block ${orphan.block}) and NO certificate names it. The chain says we were paid; our own records do not. Check whether an artifact was minted under a different hash, then fulfil or refund by hand.${
            result.cert_scan_truncated
              ? " NOTE: the certificate scan hit its cap, so this may be a false alarm from a partial read."
              : ""
          }`;
    await sendAlert(env, {
      condition:
        orphan.classification === "dust" ? "chain_dust" : "undelivered_sale",
      detail,
      key: orphan.tx_hash,
    }).catch(() => {
      // The alert is the courtesy; the finding is recomputed next pass.
    });
  }
  return result;
}
