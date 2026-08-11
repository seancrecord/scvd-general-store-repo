import { getBlockNumber, usdcTransfersTo, usdcFromUnits } from "@/lib/base-rpc";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sendAlert } from "@/lib/alerts";
import { listPayers, metricsMonth } from "@/lib/metrics";
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

/**
 * Passes one cron run may take toward the head (problem ledger #24).
 * One pass reads RECONCILE_BLOCK_SPAN blocks while Base mints ~1800
 * an hour, so a single pass per hour regained only ~200 blocks of any
 * backlog: an outage measured in hours took DAYS to walk back, and
 * the whole recovery was a window where a second stall pushed the
 * cursor past RECONCILE_MAX_SPAN and tore a hole (the 2026-08-11
 * page). Twelve full spans cover more than RECONCILE_MAX_SPAN, so
 * the worst backlog the clamp permits clears within the run that
 * finds it. Each pass keeps its own atomic cursor-and-inflow write:
 * a failure mid-catch-up keeps every window already read and resumes
 * exactly where it stopped.
 */
export const RECONCILE_CATCHUP_PASSES = 12;

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
   *
   * "self_initiated" is money the store's own key moved: the receive
   * wallet SIGNED the transaction, which no purchase ever involves
   * (the buyer signs, the facilitator pays the fee, we only receive).
   * First live case 2026-08-04: two Jupiter swaps ($24.79 + $27.30)
   * from the keeper's Solflare — the wallet app that holds the
   * store's Solana key — whose swap output lands in the connected
   * wallet's own USDC account. Two days of "$52.09 unbooked" later,
   * the lesson: a transfer we signed can never be somebody else's
   * lost purchase, and paging it as one sends the keeper hunting a
   * buyer who is himself. Currently detected on the Solana walk only,
   * where the signer list rides the transaction read we already make;
   * the Base walk would need an extra RPC per orphan for the same
   * answer, deferred until the case exists there.
   */
  classification: "possible_sale" | "dust" | "self_initiated";
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

/**
 * THE INFLOW METER (the net-by-chain statement's chain side), and why
 * it rides these walks instead of getting a walk of its own.
 *
 * The statement wants "USDC that actually arrived on this chain this
 * month" — and both reconciliation passes already read every incoming
 * transfer, hourly, behind cursors that move only on a clean pass.
 * That cursor discipline is exactly the idempotency an accumulator
 * needs: a failed pass writes nothing and is re-read whole, so no
 * transfer is ever added twice and none is skipped. A second walk
 * would double the RPC bill to learn the same numbers with none of
 * that already-proven machinery.
 *
 * The sums are staged locally and written ONLY beside the cursor
 * write, never mid-loop — the Solana pass can fail halfway through
 * its signature list, and an accumulator that had already banked half
 * a pass would double-count the retry.
 *
 * HONEST LIMITS, carried in the method note the statement publishes:
 * a transfer is booked to the month the WALK saw it, which trails the
 * chain by up to an hour at month boundaries; a Base pass that fell
 * more than RECONCILE_MAX_SPAN behind skips blocks and their inflow
 * with it — since ledger #22 that skip is RECORDED and alerted
 * (reconcileSkippedRanges) instead of silent; and the meter
 * starts counting at first deploy, so months before it exist on the
 * chain and not here. Dust is accumulated separately so the statement
 * can name it instead of blending a poisoning lure into revenue.
 */
async function bankInflow(
  env: Env,
  chain: "base" | "solana",
  totals: { microUsdc: number; dustMicroUsdc: number },
): Promise<void> {
  if (totals.microUsdc <= 0) {
    return;
  }
  const month = metricsMonth();
  const add = async (kind: string, amount: number): Promise<void> => {
    if (amount <= 0) return;
    const key = KV_KEYS.metric(month, kind, chain);
    const current = await env.COUNTERS.get(key);
    await env.COUNTERS.put(
      key,
      String((current ? parseInt(current, 10) : 0) + amount),
    );
  };
  await add("inflow", totals.microUsdc);
  await add("inflowdust", totals.dustMicroUsdc);
  if (!(await env.COUNTERS.get(KV_KEYS.inflowMeterStart(chain)))) {
    await env.COUNTERS.put(
      KV_KEYS.inflowMeterStart(chain),
      new Date().toISOString(),
    );
  }
}

/** USDC stored as integer millionths, same convention as the till. */
const INFLOW_MICRO = 1_000_000;

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
  /**
   * Blocks this pass moved past WITHOUT reading (problem ledger #22):
   * the cursor had fallen more than RECONCILE_MAX_SPAN behind and the
   * clamp discarded the gap. Present on the result AND recorded in KV,
   * because the walk only goes forward — this is the last moment the
   * hole is knowable at all.
   */
  skipped?: SkippedBlockRange;
}

/**
 * A window of Base nothing ever swept for incoming transfers. An
 * orphan in it — money taken, no certificate — is invisible to every
 * instrument the store has, forever, unless the range is back-filled
 * by hand. The record is what makes the hole a fact with a date and
 * bounds instead of a silence.
 */
export interface SkippedBlockRange {
  from_block: number;
  to_block: number;
  blocks: number;
  recorded_at: string;
}

/**
 * The stored ledger of holes. Ranges beyond the cap fall off the
 * front, but the TOTALS never lose a block — a coverage claim built
 * on this can always say exactly how much was never read, even if it
 * can no longer name every early range. (If the cap ever binds, the
 * cron has been down often enough that the ranges are not the story.)
 */
export interface SkippedRangesRecord {
  ranges: SkippedBlockRange[];
  total_ranges: number;
  total_blocks: number;
}

export const SKIPPED_RANGES_CAP = 100;

export async function readSkippedRanges(
  env: Env,
): Promise<SkippedRangesRecord> {
  return (
    (await env.COUNTERS.get<SkippedRangesRecord>(
      KV_KEYS.reconcileSkippedRanges,
      "json",
    )) ?? { ranges: [], total_ranges: 0, total_blocks: 0 }
  );
}

async function recordSkippedRange(
  env: Env,
  skipped: SkippedBlockRange,
): Promise<void> {
  const record = await readSkippedRanges(env);
  record.ranges.push(skipped);
  if (record.ranges.length > SKIPPED_RANGES_CAP) {
    record.ranges = record.ranges.slice(-SKIPPED_RANGES_CAP);
  }
  record.total_ranges += 1;
  record.total_blocks += skipped.blocks;
  await env.COUNTERS.put(
    KV_KEYS.reconcileSkippedRanges,
    JSON.stringify(record),
  );
}

/**
 * THE PENNY SHELF'S COUNTERPART OF THE CERTIFICATE (the reconciliation
 * false positive, fixed 2026-08-10). The penny pages — Almanac,
 * Gazette issues, the Zodiac archive — deliver markdown and mint
 * nothing, so the walk's "is there an artifact for this money" found
 * none and paged every penny sale as possibly-undelivered. The next
 * Almanac sale would have been an undelivered_sale alarm about a page
 * that was served.
 *
 * WRITTEN AT DELIVERY, NEVER AT SETTLE — this is the whole design.
 * The gate calls this only after a 2xx went out with the goods in it,
 * the same seam that closes the delivery intent. A row written at
 * settle time would blind the walk to exactly the case it exists for:
 * money taken, delivery died. Written this way, a penny sale whose
 * response never made it out still pages, which is correct.
 *
 * Never fails the sale: a paid customer does not get an error because
 * a bookkeeping row would not write. The cost of a lost write is one
 * false alarm the keeper can dismiss — the noisy direction, which is
 * the safe one.
 *
 * TTL-bounded: the walk reads each block once, at most RECONCILE_MAX_SPAN
 * (~11h on Base) after it was mined — and the Solana walk, cursorless
 * on a signature, can reach further back after a long outage. Ninety
 * days covers any plausible catch-up with two orders of margin, and
 * keeps the scan from growing with the store's lifetime.
 */
export const SETTLED_DELIVERY_TTL_SECONDS = 90 * 86400;

/** Ceiling on the settled-delivery scan; truncation flags, like the certs'. */
export const SETTLED_DELIVERY_SCAN_CAP = 2000;

export async function recordDeliveredSettlement(
  env: Env,
  transaction: string | undefined,
): Promise<void> {
  const tx = transaction?.trim().toLowerCase();
  if (!tx) return;
  await env.COUNTERS.put(
    KV_KEYS.settledDelivery(tx),
    new Date().toISOString(),
    { expirationTtl: SETTLED_DELIVERY_TTL_SECONDS },
  ).catch(() => undefined);
}

/**
 * Every settlement hash the store has an artifact for.
 *
 * Reads certificates rather than the delivery rows on purpose: a
 * delivery row is cleared on success, so it is evidence of a PROBLEM,
 * not of a sale. The certificate is the thing a buyer walks away with,
 * which makes "is there a certificate for this money" the question
 * that matters — UNIONED with the settled-delivery rows above, which
 * are the same claim for the shelves that mint no certificate. (The
 * union also cushions the certificate scan's own cap: a sale whose
 * cert fell past CERT_SCAN_CAP still matches on its delivery row
 * while the TTL holds.)
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
  // The certificate-less sales: the hash rides in the key, so the
  // list IS the read — no bulk get to pay for.
  const delivered = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.settledDeliveryPrefix,
    cap: SETTLED_DELIVERY_SCAN_CAP,
  });
  for (const name of delivered.names) {
    hashes.add(name.slice(KV_KEYS.settledDeliveryPrefix.length));
  }
  return {
    hashes,
    truncated:
      listed.names.length >= CERT_SCAN_CAP ||
      delivered.names.length >= SETTLED_DELIVERY_SCAN_CAP,
  };
}

/**
 * The certificate (if any) that names a settlement — the paid
 * retry's second question. An open delivery intent plus an EXISTING
 * certificate means the crash landed between mint and response: the
 * goods are real, the buyer just never saw them, and re-running the
 * handler would mint a second artifact against one payment (the
 * double-count rule 13 exists to make impossible). Same bulk scan as
 * knownSettlementHashes; the exceptional lane can afford it.
 */
export async function certIdForSettlement(
  env: Env,
  transaction: string,
): Promise<string | null> {
  const listed = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.certPrefix,
    cap: CERT_SCAN_CAP,
  });
  const values = await bulkGetJson<CertificateRecord>(
    env.PATRONS,
    listed.names,
  );
  const wanted = transaction.toLowerCase();
  for (const record of values.values()) {
    if (!record) continue;
    const tx = record.certificate?.settlement_tx;
    if (typeof tx === "string" && tx.toLowerCase() === wanted) {
      return record.certificate.cert_id;
    }
  }
  return null;
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
  options: {
    now?: Date;
    /**
     * Preloaded settlement set, so a catch-up run pays the KV scan
     * once instead of once per pass. Safe to share across passes: the
     * certificates that could name a transfer in an OLD block already
     * exist by the time the run starts.
     */
    known?: Awaited<ReturnType<typeof knownSettlementHashes>>;
  } = {},
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

  /**
   * THE HOLE THE CLAMP TEARS (problem ledger #22). When the cursor is
   * more than RECONCILE_MAX_SPAN behind the head, the Math.max above
   * discards every block between cursor+1 and the floor — and this
   * walk is the only instrument that reads incoming transfers, and it
   * only ever walks forward. Bounding the pass is right (a walk that
   * re-read all of Base would stop running, which is #4); what was
   * wrong is that the clamp wrote NOTHING when it fired: the pass
   * returned ran:true and every surface downstream reported a clean
   * sweep over a range that was never read. Rule 5 — a zero from a
   * probe that could not observe the range is not evidence the range
   * is clean. So the skip is computed here, and recorded and alerted
   * BELOW, beside the cursor write, under the same clean-read rule:
   * a failed pass writes neither, and the next pass recomputes the
   * (by then slightly larger) hole rather than double-recording it.
   */
  const skipped: SkippedBlockRange | null =
    Number.isFinite(cursor) && cursor + 1 < fromBlock
      ? {
          from_block: cursor + 1,
          to_block: fromBlock - 1,
          blocks: fromBlock - cursor - 1,
          recorded_at: new Date().toISOString(),
        }
      : null;

  let transfers: Awaited<ReturnType<typeof usdcTransfersTo>>;
  try {
    transfers = await usdcTransfersTo(env, payTo, fromBlock, toBlock);
  } catch (error) {
    return { ran: false, reason: `chain query failed: ${String(error)}` };
  }

  const { hashes, truncated } =
    options.known ?? (await knownSettlementHashes(env));
  const orphans: OrphanTransfer[] = [];
  const floor = cheapestListingUsdc();
  let counterparties: string[] | null = null;
  const inflow = { microUsdc: 0, dustMicroUsdc: 0 };
  for (const transfer of transfers) {
    const transferUsdc = usdcFromUnits(transfer.amount);
    inflow.microUsdc += Math.round(transferUsdc * INFLOW_MICRO);
    if (transferUsdc < floor) {
      inflow.dustMicroUsdc += Math.round(transferUsdc * INFLOW_MICRO);
    }
    if (hashes.has(transfer.txHash)) continue;
    const usdc = transferUsdc;
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
   * actually read would be worse than one that fell behind. The inflow
   * meter banks at the same moment and under the same rule: the sum
   * and the cursor describe the same window, or neither is written.
   * The hole record rides the same seam: written before the cursor
   * moves past the range, so a hole always has a date and bounds by
   * the time nothing can ever look there again.
   */
  if (skipped) {
    await recordSkippedRange(env, skipped);
    await sendAlert(env, {
      condition: "worker_health",
      detail: `THE BANK WALK SKIPPED BLOCKS: the Base reconciliation cursor had fallen more than ${RECONCILE_MAX_SPAN} blocks behind the head, so blocks ${skipped.from_block}\u2013${skipped.to_block} (${skipped.blocks} blocks, roughly ${Math.round((skipped.blocks * 2) / 3600 * 10) / 10}h of chain) were NEVER read for incoming transfers and never will be by this walk — it only goes forward. Any payment that arrived in that window with no certificate is invisible to every instrument the store has. The range is on the books check and in KV (${KV_KEYS.reconcileSkippedRanges}); back-fill it by hand with a bounded eth_getLogs over the range if the window matters. This run keeps walking after recording the hole — up to ${RECONCILE_CATCHUP_PASSES * RECONCILE_BLOCK_SPAN} blocks per hourly run — so the cursor should be back at the head within the hour; a SECOND one of these means the cron itself stalled past the clamp again.`,
      key: `${skipped.from_block}-${skipped.to_block}`,
    }).catch(() => {
      // The alert is the courtesy; the KV record above is the fact.
    });
  }
  await bankInflow(env, "base", inflow);
  await env.COUNTERS.put(KV_KEYS.reconcileCursor, String(toBlock));

  return {
    ran: true,
    from_block: fromBlock,
    to_block: toBlock,
    transfers_seen: transfers.length,
    orphans,
    cert_scan_truncated: truncated,
    ...(skipped ? { skipped } : {}),
  };
}

/**
 * Alerts per orphan, keyed by hash so a standing problem pages once
 * per window rather than hourly, and a SECOND orphan is its own news.
 * Shared by both rails' passes — the wording does not care which
 * chain the money arrived on, only whether a certificate names it.
 */
async function alertOrphans(
  env: Env,
  orphans: OrphanTransfer[],
  chainLabel: string,
  certScanTruncated: boolean,
): Promise<void> {
  for (const orphan of orphans) {
    const detail =
      orphan.classification === "dust"
        ? `${orphan.usdc} USDC of DUST arrived on ${chainLabel} from ${orphan.from} in transaction ${orphan.tx_hash} (block ${orphan.block}). Below every price on the shelf, so it cannot be a purchase that lost its certificate — no 402 settles under the cheapest listing. ${
            orphan.lookalike_of
              ? `The sender MIMICS ${orphan.lookalike_of} (same leading and trailing characters, different address): the address-poisoning profile. Its goal is to sit in transaction history and be copied later. `
              : ""
          }DO NOT refund it and DO NOT copy the sender's address for anything — addresses come from the register and the payer rows, never from transaction history. No action needed; this is recorded.`
        : orphan.classification === "self_initiated"
          ? `${orphan.usdc} USDC arrived on ${chainLabel} in transaction ${orphan.tx_hash} (block ${orphan.block}) — and the store's own wallet SIGNED that transaction. No purchase involves our signature (the buyer signs, the facilitator pays the fee), so this is the house's own hand: a swap output, a consolidation, the keeper funding something from the wallet app. Recorded as house money; nobody outside is owed anything. IF THE KEEPER DOES NOT RECOGNIZE THIS TRANSACTION, that is a different and much worse story — a signature nobody remembers making means the key has left the paper. Check the wallet app's activity; unrecognized means rotate the wallet now.`
          : `${orphan.usdc} USDC arrived on ${chainLabel} from ${orphan.from} in transaction ${orphan.tx_hash} (block ${orphan.block}) and NO certificate names it. The chain says we were paid; our own records do not. Check whether an artifact was minted under a different hash, then fulfil or refund by hand.${
              certScanTruncated
                ? " NOTE: the certificate scan hit its cap, so this may be a false alarm from a partial read."
                : ""
            }`;
    await sendAlert(env, {
      condition:
        orphan.classification === "dust"
          ? "chain_dust"
          : orphan.classification === "self_initiated"
            ? "chain_self_transfer"
            : "undelivered_sale",
      detail,
      key: orphan.tx_hash,
    }).catch(() => {
      // The alert is the courtesy; the finding is recomputed next pass.
    });
  }
}

/** A pass that read its full span may have more chain waiting. */
function readFullSpan(result: ChainReconciliation): boolean {
  return (
    result.from_block !== undefined &&
    result.to_block !== undefined &&
    result.to_block - result.from_block + 1 === RECONCILE_BLOCK_SPAN
  );
}

export async function runChainReconciliation(
  env: Env,
  options: { now?: Date } = {},
): Promise<ChainReconciliation> {
  /**
   * THE CATCH-UP LOOP (problem ledger #24). Passes repeat until the
   * read stops filling its span — the head, reached — or the pass
   * budget runs out. Each pass commits its own cursor, inflow and
   * hole record atomically, so a failure anywhere in the loop keeps
   * everything already read; the merged report below is only a
   * summary of what the committed passes saw.
   */
  const known = env.PAY_TO_ADDRESS
    ? await knownSettlementHashes(env)
    : undefined;
  let merged = await reconcileAgainstChain(env, { ...options, known });
  if (!merged.ran) {
    return merged;
  }
  await alertOrphans(
    env,
    merged.orphans ?? [],
    "Base",
    merged.cert_scan_truncated ?? false,
  );
  let last = merged;
  for (
    let pass = 1;
    pass < RECONCILE_CATCHUP_PASSES && readFullSpan(last);
    pass += 1
  ) {
    const result = await reconcileAgainstChain(env, { ...options, known });
    if (!result.ran) {
      // A later pass failing ends the catch-up without erasing what
      // the earlier passes committed; next hour resumes right here.
      break;
    }
    await alertOrphans(
      env,
      result.orphans ?? [],
      "Base",
      result.cert_scan_truncated ?? false,
    );
    merged = {
      ...result,
      from_block: merged.from_block,
      transfers_seen:
        (merged.transfers_seen ?? 0) + (result.transfers_seen ?? 0),
      orphans: [...(merged.orphans ?? []), ...(result.orphans ?? [])],
      cert_scan_truncated: Boolean(
        merged.cert_scan_truncated || result.cert_scan_truncated,
      ),
      // Only the first pass can tear a hole: after it, the cursor is
      // within RECONCILE_MAX_SPAN of the head by construction.
      ...(merged.skipped ? { skipped: merged.skipped } : {}),
    };
    last = result;
  }
  return merged;
}

/**
 * THE SOLANA SIDE OF THE BOOKS (2026-08-04, the walk that retires the
 * second rail's unreconciled cap). Same question as the Base pass —
 * is there an artifact for this money — asked of the other chain.
 *
 * The cursor is a transaction SIGNATURE, not a slot: Solana's
 * getSignaturesForAddress takes `until` and stops exactly where the
 * last pass ended, no block-boundary fencepost to get wrong. It moves
 * only on a clean pass, same as the Base cursor, so a failed read is
 * retried rather than skipped. Certificates store a Solana settle's
 * signature in settlement_tx, so knownSettlementHashes covers both
 * rails already (lowercased on both sides; base58 loses its case
 * there, which cannot collide in practice and keeps one code path).
 */
export const SOLANA_RECONCILE_CURSOR_KEY = "solana_reconcile_cursor";
/** Stamped on every clean pass; recordSolanaSettle's cap reads it. */
export const SOLANA_RECONCILE_OK_KEY = "solana_reconcile_last_ok";

export async function reconcileSolanaAgainstChain(
  env: Env,
): Promise<ChainReconciliation> {
  const { solanaPayTo } = await import("@/lib/payments");
  const owner = solanaPayTo(env);
  if (!owner) {
    return { ran: false, reason: "no SOLANA_PAY_TO configured — the rail is closed" };
  }
  const { usdcTokenAccountsOf, signaturesForAddress, usdcIncomingIn } =
    await import("@/lib/solana-rpc");
  const { usdcFromUnits } = await import("@/lib/base-rpc");

  let accounts: string[];
  try {
    accounts = await usdcTokenAccountsOf(env, owner);
  } catch (error) {
    return { ran: false, reason: `could not read token accounts: ${String(error)}` };
  }
  if (accounts.length === 0) {
    // No USDC has ever arrived; there is genuinely nothing to walk.
    await env.COUNTERS.put(SOLANA_RECONCILE_OK_KEY, new Date().toISOString());
    return { ran: true, transfers_seen: 0, orphans: [] };
  }

  const cursor =
    (await env.COUNTERS.get(SOLANA_RECONCILE_CURSOR_KEY)) ?? undefined;
  const { hashes, truncated } = await knownSettlementHashes(env);
  const orphans: OrphanTransfer[] = [];
  const floor = cheapestListingUsdc();
  let counterparties: string[] | null = null;
  let seen = 0;
  let newestSignature: string | undefined;
  const inflow = { microUsdc: 0, dustMicroUsdc: 0 };

  for (const account of accounts) {
    let infos;
    try {
      infos = await signaturesForAddress(env, account, cursor);
    } catch (error) {
      return { ran: false, reason: `signature walk failed: ${String(error)}` };
    }
    if (!newestSignature && infos.length > 0) {
      newestSignature = infos[0]!.signature;
    }
    for (const info of infos) {
      if (info.err) continue; // Failed transactions moved no money.
      let incoming;
      try {
        incoming = await usdcIncomingIn(env, info.signature, owner);
      } catch (error) {
        return { ran: false, reason: `transaction read failed: ${String(error)}` };
      }
      if (!incoming) continue;
      seen += 1;
      const incomingUsdc = usdcFromUnits(incoming.amount);
      inflow.microUsdc += Math.round(incomingUsdc * INFLOW_MICRO);
      if (incomingUsdc < floor) {
        inflow.dustMicroUsdc += Math.round(incomingUsdc * INFLOW_MICRO);
      }
      if (hashes.has(info.signature.toLowerCase())) continue;
      const usdc = incomingUsdc;
      const orphan: OrphanTransfer = {
        tx_hash: info.signature,
        from: incoming.from,
        usdc,
        block: info.slot,
        // Self-signed outranks the price test: a transfer our own key
        // authorized is our own hand whatever its size.
        classification: incoming.self_signed
          ? "self_initiated"
          : usdc < floor
            ? "dust"
            : "possible_sale",
      };
      if (orphan.classification === "dust") {
        counterparties ??= await knownCounterparties(env);
        const mimicked = findLookalike(incoming.from, counterparties);
        if (mimicked) {
          orphan.lookalike_of = mimicked;
        }
      }
      orphans.push(orphan);
    }
  }

  // Banked only on a clean pass, same rule as the cursor: an error
  // return above discarded the staged sum, so a retried pass cannot
  // double-count what a failed one already read.
  await bankInflow(env, "solana", inflow);
  if (newestSignature) {
    await env.COUNTERS.put(SOLANA_RECONCILE_CURSOR_KEY, newestSignature);
  }
  await env.COUNTERS.put(SOLANA_RECONCILE_OK_KEY, new Date().toISOString());
  return {
    ran: true,
    transfers_seen: seen,
    orphans,
    cert_scan_truncated: truncated,
  };
}

/**
 * The walk's last word, stored so its quiet failures are not
 * invisible: a ran:false return does not throw, so the cron's
 * failure alert never fires for it — all afternoon of rate-limited
 * passes left no trace anywhere until the cap paged with no WHY.
 * The cap alert now quotes this.
 */
export const SOLANA_RECONCILE_LAST_RESULT_KEY = "solana_reconcile_last_result";

export async function runSolanaReconciliation(
  env: Env,
): Promise<ChainReconciliation> {
  const result = await reconcileSolanaAgainstChain(env);
  await env.COUNTERS.put(
    SOLANA_RECONCILE_LAST_RESULT_KEY,
    JSON.stringify({
      ran: result.ran,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.ran ? { transfers_seen: result.transfers_seen ?? 0 } : {}),
      at: new Date().toISOString(),
    }),
  ).catch(() => undefined);
  await alertOrphans(
    env,
    result.orphans ?? [],
    "Solana",
    result.cert_scan_truncated ?? false,
  );
  return result;
}
