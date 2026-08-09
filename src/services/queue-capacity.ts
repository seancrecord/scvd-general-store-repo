import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { MENU_ITEMS } from "@/store";
import type { Env, MenuItem, OrderRecord } from "@/types";

/**
 * HOW MUCH LABOR IS ALREADY PROMISED — the gate the shutter was
 * missing.
 *
 * The shutter's stated law is "the store never promises labor nobody
 * is there to do", and it enforces that by PRESENCE: the human shelf
 * opens only within 48 hours of the keeper being seen. That answers
 * "is somebody there." It has never answered "how much have we already
 * promised them", and those are different questions — a keeper seen an
 * hour ago can still be sold ten weeks of work in an afternoon.
 *
 * WEEKLY INVENTORY DOES NOT CLOSE THIS, and the reason is the whole
 * point of this file: `weekly_inventory` is a RATE and a backlog is a
 * LEVEL. The counter lives at `inventory:<item>:<week>` and resets
 * every Monday. Five judgments bought this week and five more next
 * week, with none of the first five finished, is ten open orders that
 * passed every check the store had. A rate limit cannot bound a queue;
 * it only bounds how fast the queue fills.
 *
 * THE LIVE EXPOSURE THAT PROMPTED THIS, named so the numbers below are
 * not mistaken for caution in the abstract:
 *
 *   the_collab — $25, a 168-hour promised window, and NO cap of any
 *   kind. Ten of those bought in one afternoon is ten weeks of work
 *   owed inside one week, every one of them breaching, and the
 *   refund-window detector would find them all a week later.
 *
 *   the_drawer — labor with no cap either, though no promised window,
 *   so it costs the keeper time rather than a broken promise.
 *
 * WHAT THIS IS NOT. Not the Commission Desk. That retires buy-now for
 * per-order labor entirely — request, quote, agreed price, one-off
 * link — and it is a product decision with a spec in front of the
 * keeper. This is the interim floor under the same exposure, it
 * changes nothing about how anything is sold, and whatever the desk
 * turns out to be, refusing to promise an eleventh week of work in an
 * afternoon survives it.
 *
 * IT REFUSES BEFORE THE PAYMENT GATE. A capacity refusal after
 * settlement would be money taken to be told no, which is the failure
 * this exists to prevent, not a smaller version of it.
 */

/**
 * Open labor orders the house will carry at once, across every human
 * item.
 *
 * ⚑ KEEPER REVIEW: this number is drafted, not canon. It is the
 * keeper's actual throughput and nobody else can set it. Eight is one
 * week of judgments plus a little, which is deliberately generous —
 * the argument here is that SOME ceiling beats none, not that this is
 * the right one. If it is wrong it should be wrong in this direction:
 * a cap that never binds still turns an unbounded promise into a
 * bounded one the day the keeper picks a real number.
 */
export const OPEN_LABOR_CAP = 8;

/** Bounded scan, and the verdict says when it hit the cap. */
export const QUEUE_SCAN_CAP = 500;

export interface QueueLoad {
  /** Open (uncompleted) orders on human_queue items, right now. */
  open_total: number;
  /** Open orders per item id, for the ones that have any. */
  open_by_item: Record<string, number>;
  /** The house ceiling, published rather than implied. */
  cap: number;
  scan_capped: boolean;
  /** The oldest open order's age in hours — the queue's real shape. */
  oldest_open_hours: number | null;
}

export type CapacityVerdict =
  | { ok: true }
  | { ok: false; reason: string; open: number; cap: number };

function isLaborItem(item: MenuItem): boolean {
  return item.fulfillment === "human_queue";
}

/** Every shelf that costs the keeper's own hours. Derived, not typed. */
export const LABOR_ITEM_IDS: ReadonlySet<string> = new Set(
  MENU_ITEMS.filter(isLaborItem).map((item) => item.id),
);

/**
 * What is actually outstanding. Derived at read from the orders
 * themselves rather than kept as a counter, for the same reason the
 * sweep gaps are: a stored number can drift from the truth it claims
 * to summarise, and this one would drift toward looking emptier.
 */
export async function queueLoad(
  env: Env,
  now: Date = new Date(),
): Promise<QueueLoad> {
  const keys = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.orderPrefix,
    cap: QUEUE_SCAN_CAP,
  });
  const orders = await bulkGetJson<OrderRecord>(env.ORDERS, keys.names);
  const byItem: Record<string, number> = {};
  let total = 0;
  let oldest: number | null = null;
  for (const order of orders.values()) {
    if (!order || order.status === "completed") continue;
    if (!LABOR_ITEM_IDS.has(order.item_id)) continue;
    total += 1;
    byItem[order.item_id] = (byItem[order.item_id] ?? 0) + 1;
    const created = Date.parse(order.created_at);
    if (!Number.isNaN(created)) {
      const hours = (now.getTime() - created) / 3_600_000;
      if (oldest === null || hours > oldest) oldest = hours;
    }
  }
  return {
    open_total: total,
    open_by_item: byItem,
    cap: OPEN_LABOR_CAP,
    scan_capped: keys.truncated,
    oldest_open_hours: oldest === null ? null : Math.round(oldest * 10) / 10,
  };
}

/**
 * May this labor item be sold right now?
 *
 * TWO CEILINGS, and the per-item one is not invented here: where an
 * item declares `weekly_inventory` the keeper has already stated the
 * rate he can sustain, and with a 168-hour window that same number is
 * the most of it that should ever be open at once. Reusing his figure
 * beats inventing a second one beside it.
 */
export async function capacityVerdict(
  env: Env,
  item: MenuItem,
  now: Date = new Date(),
): Promise<CapacityVerdict> {
  if (!isLaborItem(item)) return { ok: true };
  const load = await queueLoad(env, now);

  const perItemCap = item.weekly_inventory;
  const openForItem = load.open_by_item[item.id] ?? 0;
  if (perItemCap !== undefined && openForItem >= perItemCap) {
    return {
      ok: false,
      open: openForItem,
      cap: perItemCap,
      reason: `There are already ${openForItem} of these in the queue, unfinished, and ${perItemCap} at a time is the most the keeper works through in the week this promises. Taking your money now would be promising a window we can already see we would miss. Nothing charged. The queue drains by hand; try again in a few days, or write to the mailbox — that is free and a human reads it.`,
    };
  }
  if (load.open_total >= load.cap) {
    return {
      ok: false,
      open: load.open_total,
      cap: load.cap,
      reason: `The bench is full: ${load.open_total} pieces of work are already promised and unfinished, which is the house limit. This is a fact about our capacity, not about you, and it is better said now than discovered by you a week from now when the window passes. Nothing charged. The machine shelves are all still open and instant.`,
    };
  }
  return { ok: true };
}
