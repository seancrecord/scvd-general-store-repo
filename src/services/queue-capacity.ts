import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sendAlert } from "@/lib/alerts";
import { MENU_ITEMS } from "@/store";
import type { Env, MenuItem, OrderRecord } from "@/types";
import { kvPut } from "@/lib/kv-retry";

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
 *
 * HOW IT COUNTS, and the first version got this wrong in a way that
 * would have killed the gate quietly. It derived the count by walking
 * the `order:` prefix under a 500-key cap — but orders are NEVER
 * deleted and EVERY sale writes one, instant items included. Past 500
 * lifetime sales the list truncates, `listKeys` says so with
 * `truncated`, and the caller ignored it. The ceiling would have
 * undercounted and then stopped binding, on success, with no symptom:
 * exactly the instrument-stops-working failure this store keeps
 * catching in other people's code.
 *
 * Raising the cap only moves the date. So the bench now walks an INDEX
 * of open labor — one key per unfinished human order, deleted on
 * completion — whose size is bounded by the ceiling rather than by the
 * store's lifetime. The orders stay the truth; the index is only how
 * we find them, it is verified against them on every read, and it is
 * rebuilt from them on the cron.
 *
 * AND IT FAILS CLOSED. If the index scan ever truncates anyway, or the
 * index has not been built yet and the fallback walk truncates, the
 * bench refuses labor and pages the keeper. "We cannot tell how much
 * is promised" must never resolve to "so promise more."
 */

/**
 * Open labor orders the house will carry at once, across every human
 * item.
 *
 * SEVEN, RULED BY THE KEEPER 2026-08-10, AND NOW CANON. It shipped as
 * a drafted 8 with a flag on it saying so — nobody but the keeper can
 * know his own throughput, and a number invented by the person who
 * does not do the work is a guess wearing a constant's clothes. He
 * lowered it by one, which is the direction that matters: a cap set by
 * the hand that has to honour it.
 *
 * Do not raise this to make a refusal go away. A full bench is the
 * instrument working — the store declining labor nobody is there to
 * do, which is the shutter's law with a level behind it instead of
 * only a presence check.
 */
export const OPEN_LABOR_CAP = 7;

/**
 * Ceiling on the FALLBACK walk over every order, used only until the
 * index has been built once. Generous, and truncation here fails
 * closed rather than silently undercounting.
 */
export const QUEUE_SCAN_CAP = 2000;

export interface QueueLoad {
  /** Open (uncompleted) orders on human_queue items, right now. */
  open_total: number;
  /** Open orders per item id, for the ones that have any. */
  open_by_item: Record<string, number>;
  /** The house ceiling, published rather than implied. */
  cap: number;
  /**
   * The count could not be completed. NOTHING may be sold on a true
   * value here — an unknown load is not a low one.
   */
  scan_capped: boolean;
  /** True while still walking every order, before the first rebuild. */
  from_fallback_scan: boolean;
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
interface OpenLaborIndex {
  ids: string[];
  /** Set only by a COMPLETE rebuild. Absent means fall back to the walk. */
  built_at?: string;
}

async function readIndex(env: Env): Promise<OpenLaborIndex> {
  return (
    (await env.ORDERS.get<OpenLaborIndex>(KV_KEYS.openLaborIndex, "json")) ?? {
      ids: [],
    }
  );
}

export async function queueLoad(
  env: Env,
  now: Date = new Date(),
): Promise<QueueLoad> {
  const index = await readIndex(env);
  return index.built_at
    ? countFromIndex(env, index, now)
    : countByWalkingEveryOrder(env, now);
}

/** Shared tallying, so both paths agree on what "open labor" means. */
function tally(
  orders: Iterable<OrderRecord | null | undefined>,
  now: Date,
): Pick<QueueLoad, "open_total" | "open_by_item" | "oldest_open_hours"> & {
  openIds: string[];
} {
  const byItem: Record<string, number> = {};
  const openIds: string[] = [];
  let total = 0;
  let oldest: number | null = null;
  for (const order of orders) {
    if (!order || order.status === "completed") continue;
    if (!LABOR_ITEM_IDS.has(order.item_id)) continue;
    total += 1;
    openIds.push(order.order_id);
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
    oldest_open_hours: oldest === null ? null : Math.round(oldest * 10) / 10,
    openIds,
  };
}

/**
 * THE NORMAL PATH: one small read for the index, then READ THE ORDERS
 * IT NAMES and count from those. The index says where to look; the
 * orders say what is true. An id whose order has finished is pruned as
 * we go, so drift toward over-refusing heals itself on the next read.
 */
async function countFromIndex(
  env: Env,
  index: OpenLaborIndex,
  now: Date,
): Promise<QueueLoad> {
  const orders = await bulkGetJson<OrderRecord>(
    env.ORDERS,
    index.ids.map((id) => KV_KEYS.order(id)),
  );
  const counted = tally(orders.values(), now);
  if (counted.openIds.length !== index.ids.length) {
    await kvPut(env.ORDERS, 
      KV_KEYS.openLaborIndex,
      JSON.stringify({ ...index, ids: counted.openIds } satisfies OpenLaborIndex),
    ).catch(() => undefined);
  }
  return {
    open_total: counted.open_total,
    open_by_item: counted.open_by_item,
    oldest_open_hours: counted.oldest_open_hours,
    cap: OPEN_LABOR_CAP,
    // A single key cannot truncate. This path is structurally complete.
    scan_capped: false,
    from_fallback_scan: false,
  };
}

/** Used only before the first rebuild has run. Truncation fails closed. */
async function countByWalkingEveryOrder(
  env: Env,
  now: Date,
): Promise<QueueLoad> {
  const keys = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.orderPrefix,
    cap: QUEUE_SCAN_CAP,
  });
  const orders = await bulkGetJson<OrderRecord>(env.ORDERS, keys.names);
  const counted = tally(orders.values(), now);
  return {
    open_total: counted.open_total,
    open_by_item: counted.open_by_item,
    oldest_open_hours: counted.oldest_open_hours,
    cap: OPEN_LABOR_CAP,
    scan_capped: keys.truncated,
    from_fallback_scan: true,
  };
}

/**
 * Rebuild the index from the orders. Idempotent, one write, meant for
 * the cron: it is the only thing that reconciles drift in the direction
 * that matters — an order that never made it into the index, which
 * would otherwise make the bench UNDERCOUNT and oversell.
 */
export async function rebuildOpenLaborIndex(env: Env): Promise<number> {
  const keys = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.orderPrefix,
    cap: QUEUE_SCAN_CAP,
  });
  const orders = await bulkGetJson<OrderRecord>(env.ORDERS, keys.names);
  const open = tally(orders.values(), new Date()).openIds;
  /*
   * built_at is set ONLY when the walk was complete. Marking a
   * truncated rebuild authoritative would bake the undercount in
   * permanently — the original bug wearing a new hat.
   */
  const index: OpenLaborIndex = keys.truncated
    ? { ids: open }
    : { ids: open, built_at: new Date().toISOString() };
  await kvPut(env.ORDERS, KV_KEYS.openLaborIndex, JSON.stringify(index));
  return open.length;
}

/** Called when a labor order is created, and when one is finished. */
export async function markLaborOpen(
  env: Env,
  order: OrderRecord,
): Promise<void> {
  if (!LABOR_ITEM_IDS.has(order.item_id)) return;
  const index = await readIndex(env);
  if (index.ids.includes(order.order_id)) return;
  await kvPut(env.ORDERS, 
    KV_KEYS.openLaborIndex,
    JSON.stringify({
      ...index,
      ids: [...index.ids, order.order_id],
    } satisfies OpenLaborIndex),
  );
}

export async function markLaborClosed(
  env: Env,
  orderId: string,
): Promise<void> {
  const index = await readIndex(env);
  if (!index.ids.includes(orderId)) return;
  await kvPut(env.ORDERS, 
    KV_KEYS.openLaborIndex,
    JSON.stringify({
      ...index,
      ids: index.ids.filter((id) => id !== orderId),
    } satisfies OpenLaborIndex),
  );
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

  /*
   * FAIL CLOSED. kv-list's own contract says the caller decides what to
   * do about truncation and "the one thing it can no longer do is not
   * know" — the first version of this gate knew and did nothing, which
   * is how a ceiling stops binding without anybody noticing. An
   * unknown load is not a low one.
   */
  if (load.scan_capped) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `The bench could not finish counting open labor (${load.from_fallback_scan ? "walking every order" : "walking the open-labor index"}), so the labor shelf is refusing sales until it can. Nobody is being charged. Run the open-labor index rebuild and check the order count against QUEUE_SCAN_CAP.`,
      key: "bench_scan_capped",
    }).catch(() => undefined);
    return {
      ok: false,
      open: load.open_total,
      cap: load.cap,
      reason:
        "We cannot presently count how much work is already promised, and we will not promise more while that is true — an unknown load is not a low one. Nothing charged, and the keeper has been paged. The machine shelves are all still open and instant.",
    };
  }

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
