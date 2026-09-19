import { BASE_NETWORK } from "@/lib/payment-networks";
import { BASE_USDC } from "@/lib/base-rpc";
import { LEGACY_NATIVE_ITEM } from "@/lib/mpp-checkout-capability";
import { getMenuItem } from "@/store";
import { publicationFamilyForPath, PUBLICATION_FAMILIES } from "@/lib/payments";
import type { Env } from "@/types";
import { purchaseProtocol, type PurchaseIntent } from "@/services/purchase-intent";
import { monthsSinceOpening } from "@/lib/metrics";
import { kvGet } from "@/lib/kv-retry";

export const MPP_SALES_PREFIX = "mpp:sales:";
export const MPP_PAYER_PREFIX = "mpp:payer:";
/** One shelf item's native counts; the same shape as the month's own. */
export interface MppItemSummary {
  organic: number;
  house: number;
  organic_amount_atomic: string;
  house_amount_atomic: string;
  /** Append-only adjustments; original sale evidence and raw totals remain intact. */
  reclassified_house?: number;
  reclassified_amount_atomic?: string;
}
export interface MppSalesSummary extends MppItemSummary {
  /**
   * PER ITEM, SINCE THE WHOLE STORE (2026-09-18). The month's totals
   * above are the truth the public rollup reads; this is the same money
   * split by shelf item, for the till. A month from the pilot has no
   * split, and a month can hold sales booked before the split existed:
   * whatever the totals hold beyond the sum of these rows is the pilot's
   * one product (LEGACY_NATIVE_ITEM), and readMppSales says so.
   */
  by_item?: Record<string, MppItemSummary>;
}
export interface MppHouseCorrection {
  id: string;
  month: string;
  payer: string;
  amount: string;
  at: string;
  reason: string;
}
export interface MppSaleEvidence {
  id: string;
  month: string;
  payer: string;
  transaction: string;
  amount: string;
  house: boolean;
  /** The shelf item; absent on rows booked during the one-product pilot. */
  item?: string;
}

/**
 * THE SALE'S SPELLING IN THE SPLIT. A shelf sale is its item id; a
 * publication sale (native publications, 2026-09-19) is its family,
 * derived from the record's path the way the till prices it, so one
 * row per family stands beside the per-item rows. Shared by the writer,
 * the inspection and the read-only comparison.
 */
export function mppSaleItemKey(record: Pick<PurchaseIntent, "item" | "publication" | "path">): string | undefined {
  if (record.item) return record.item.id;
  return record.publication ? publicationFamilyForPath(record.path) : undefined;
}

/** Shared by the writer and the read-only comparison; one definition of a sale. */
export function mppSaleEvidence(record: PurchaseIntent): MppSaleEvidence {
  const item = mppSaleItemKey(record);
  const known = item !== undefined && (record.item ? !!getMenuItem(item) : (PUBLICATION_FAMILIES as readonly string[]).includes(item));
  if (purchaseProtocol(record) !== "mpp" || record.state !== "settled" || !record.payment || !record.mpp ||
    record.terms.network !== BASE_NETWORK || record.terms.asset.toLowerCase() !== BASE_USDC.toLowerCase() || !item || !known) {
    throw new Error("MPP sale is not confirmed");
  }
  const month = record.created_at.slice(0, 7);
  return {
    id: record.id, month, payer: record.payer, transaction: record.payment.transaction,
    amount: record.terms.amount, house: record.mpp.house, item,
  };
}

/**
 * THE SAME SALE, WITH OR WITHOUT ITS ITEM. A row booked during the pilot
 * has no item; the retained purchase it came from does. The ledger must
 * not read a retry of that purchase as changed evidence, and the house
 * correction must not refuse it: a stored row without an item is the
 * pilot's product, and equal to the same sale that names it.
 */
export function sameMppSaleEvidence(stored: unknown, sale: MppSaleEvidence): boolean {
  if (typeof stored !== "object" || stored === null) return false;
  const row = stored as Record<string, unknown>;
  if (JSON.stringify(row) === JSON.stringify(sale)) return true;
  if (row.item !== undefined) return false;
  const { item, ...legacy } = sale;
  return item === LEGACY_NATIVE_ITEM && JSON.stringify(row) === JSON.stringify(legacy);
}

/** The durable receipt, not the HTTP response, owns this idempotent write. */
export async function recordMppSale(env: Env, record: PurchaseIntent): Promise<void> {
  const sale = mppSaleEvidence(record);
  if (!env.COUNTER_LEDGER) throw new Error("MPP sales ledger unavailable");
  await env.COUNTER_LEDGER.get(env.COUNTER_LEDGER.idFromName(`${sale.month}/mpp-sales`)).recordMppSale(sale);
}

function validateCounts(row: MppItemSummary): void {
  if (![row.organic, row.house].every(n => Number.isSafeInteger(n) && n >= 0) ||
    ![row.organic_amount_atomic, row.house_amount_atomic].every(n => typeof n === "string" && /^\d+$/.test(n))) throw new Error("MPP sales unreadable");
  const corrected = row.reclassified_house ?? 0;
  const amount = row.reclassified_amount_atomic ?? "0";
  if (!Number.isSafeInteger(corrected) || corrected < 0 || corrected > row.organic ||
    typeof amount !== "string" || !/^\d+$/.test(amount) || BigInt(amount) > BigInt(row.organic_amount_atomic) ||
    (corrected === 0) !== (BigInt(amount) === 0n)) throw new Error("MPP correction unreadable");
}

/**
 * A split key is a shelf item's spelling. The item is written as a bracket
 * key on the month's split, so an object's own reserved names, which spell
 * like an item, are refused before they can reach Object.prototype.
 */
export function validMppItemKey(item: unknown): item is string {
  if (typeof item !== "string" || !/^[a-z0-9_-]{1,64}$/.test(item)) return false;
  if (item === "__proto__" || item === "constructor" || item === "prototype") return false;
  return true;
}

/** Validate raw totals and their separate corrections before reading or changing them. */
export function validateMppSalesSummary(row: MppSalesSummary): void {
  validateCounts(row);
  if (row.by_item === undefined) return;
  if (typeof row.by_item !== "object" || row.by_item === null || Array.isArray(row.by_item)) throw new Error("MPP sales unreadable");
  const sum = { organic: 0, house: 0, organic_amount_atomic: 0n, house_amount_atomic: 0n, reclassified_house: 0, reclassified_amount_atomic: 0n };
  for (const [item, counts] of Object.entries(row.by_item)) {
    if (!validMppItemKey(item)) throw new Error("MPP sales unreadable");
    validateCounts(counts);
    sum.organic += counts.organic; sum.house += counts.house;
    sum.organic_amount_atomic += BigInt(counts.organic_amount_atomic); sum.house_amount_atomic += BigInt(counts.house_amount_atomic);
    sum.reclassified_house += counts.reclassified_house ?? 0; sum.reclassified_amount_atomic += BigInt(counts.reclassified_amount_atomic ?? "0");
  }
  // The split never claims more than the month holds: what remains is the pilot's.
  if (sum.organic > row.organic || sum.house > row.house || sum.organic_amount_atomic > BigInt(row.organic_amount_atomic) ||
    sum.house_amount_atomic > BigInt(row.house_amount_atomic) || sum.reclassified_house > (row.reclassified_house ?? 0) ||
    sum.reclassified_amount_atomic > BigInt(row.reclassified_amount_atomic ?? "0")) throw new Error("MPP sales unreadable");
}

const emptyCounts = (): MppItemSummary => ({ organic: 0, house: 0, organic_amount_atomic: "0", house_amount_atomic: "0" });

/** Add one item's raw counts, with its corrections applied, into a running total. */
function foldCounts(total: MppItemSummary, row: MppItemSummary): void {
  const corrected = row.reclassified_house ?? 0;
  const amount = row.reclassified_amount_atomic ?? "0";
  total.organic += row.organic - corrected;
  total.house += row.house + corrected;
  total.organic_amount_atomic = String(BigInt(total.organic_amount_atomic) + BigInt(row.organic_amount_atomic) - BigInt(amount));
  total.house_amount_atomic = String(BigInt(total.house_amount_atomic) + BigInt(row.house_amount_atomic) + BigInt(amount));
  if (corrected) {
    total.reclassified_house = (total.reclassified_house ?? 0) + corrected;
    total.reclassified_amount_atomic = String(BigInt(total.reclassified_amount_atomic ?? "0") + BigInt(amount));
  }
}

/** The month's counts not claimed by any item row: the pilot's product. */
function legacyRemainder(row: MppSalesSummary): MppItemSummary {
  const rest: MppItemSummary = { ...row };
  delete (rest as MppSalesSummary).by_item;
  for (const counts of Object.values(row.by_item ?? {})) {
    rest.organic -= counts.organic; rest.house -= counts.house;
    rest.organic_amount_atomic = String(BigInt(rest.organic_amount_atomic) - BigInt(counts.organic_amount_atomic));
    rest.house_amount_atomic = String(BigInt(rest.house_amount_atomic) - BigInt(counts.house_amount_atomic));
    if (counts.reclassified_house) {
      rest.reclassified_house = (rest.reclassified_house ?? 0) - counts.reclassified_house;
      rest.reclassified_amount_atomic = String(BigInt(rest.reclassified_amount_atomic ?? "0") - BigInt(counts.reclassified_amount_atomic ?? "0"));
    }
  }
  return rest;
}

export interface MppSalesTotals extends MppItemSummary {
  /** Corrected counts per shelf item, the pilot's rows folded under LEGACY_NATIVE_ITEM. */
  by_item: Record<string, MppItemSummary>;
}

/** Calendar-bounded mirrors, like the legacy till; no scan over all purchases. */
export async function readMppSales(env: Env): Promise<MppSalesTotals> {
  const rows = await Promise.all(monthsSinceOpening().map(month => kvGet(env.COUNTERS, `${MPP_SALES_PREFIX}${month}`)));
  const total: MppSalesTotals = { ...emptyCounts(), by_item: {} };
  for (const raw of rows) {
    if (raw === null) continue;
    const row = JSON.parse(raw) as MppSalesSummary;
    validateMppSalesSummary(row);
    foldCounts(total, row);
    for (const [item, counts] of Object.entries(row.by_item ?? {})) {
      foldCounts(total.by_item[item] ??= emptyCounts(), counts);
    }
    const legacy = legacyRemainder(row);
    if (legacy.organic + legacy.house > 0) foldCounts(total.by_item[LEGACY_NATIVE_ITEM] ??= emptyCounts(), legacy);
  }
  return total;
}
