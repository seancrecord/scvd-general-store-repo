import { KV_KEYS } from "@/lib/kv-keys";
import { listGuestbook } from "@/services/guestbook";
import { unreadLetterCount } from "@/services/letters";
import { listOrders } from "@/services/orders";
import {
  listCommissions,
  listFailedItems,
  listWaitlist,
} from "@/services/requests";
import { DEFAULT_WEEK_NOTE } from "@/store";
import type { Env, OrderRecord, WeeklyDigest } from "@/types";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";
import { computeStats } from "@/services/stats";
import { metricsMonth } from "@/lib/metrics";
import { storeMonthFigures } from "@/services/store-figures";
import type { StoreBuyersDigest } from "@/types";

/**
 * The weekly digest, compiled Sundays 7am ET by the cron trigger.
 * v0.1 stores it at /admin/digest; email hookup is v0.2.
 */

function isOverdue(order: OrderRecord, now: Date): boolean {
  if (order.status !== "queued") {
    return false;
  }
  const due =
    new Date(order.created_at).getTime() + order.sla_hours * 3600 * 1000;
  return now.getTime() > due;
}

export async function compileDigest(env: Env): Promise<WeeklyDigest> {
  const now = new Date();
  const [
    orders,
    commissions,
    waitlist,
    failedItems,
    guestbook,
    note,
    bell,
    unreadLetters,
  ] = await Promise.all([
    listOrders(env),
    listCommissions(env),
    listWaitlist(env),
    listFailedItems(env),
    listGuestbook(env, 1000),
    kvGet(env.COUNTERS, KV_KEYS.weekNote),
    kvGet(env.COUNTERS, KV_KEYS.bellCount),
    unreadLetterCount(env),
  ]);

  const digest: WeeklyDigest = {
    generated_at: now.toISOString(),
    week_note: note || DEFAULT_WEEK_NOTE,
    orders_total: orders.length,
    orders_queued: orders.filter((o) => o.status === "queued").length,
    orders_completed: orders.filter((o) => o.status === "completed").length,
    orders_overdue: orders.filter((o) => isOverdue(o, now)).length,
    revenue_usdc: round2(orders.reduce((sum, o) => sum + o.paid_usdc, 0)),
    tips_usdc: round2(orders.reduce((sum, o) => sum + o.tip_usdc, 0)),
    bell_count: bell ? parseInt(bell, 10) : 0,
    guestbook_entries: guestbook.length,
    waitlist_entries: waitlist.length,
    commission_requests: commissions,
    failed_item_requests: failedItems,
    unread_letters: unreadLetters,
  };

  const storeBuyers = await storeBuyersDigest(env).catch(() => undefined);
  if (storeBuyers) digest.store_buyers = storeBuyers;

  await kvPut(env.COUNTERS, KV_KEYS.latestDigest, JSON.stringify(digest));
  return digest;
}

/**
 * The store-buyers section (2026-09-21): the same counters /pulse,
 * /stats and /observatory serve, month to date, gathered for the
 * Sunday read with their windows and exclusions beside them. Nothing
 * here is a new measurement; the register on those routes holds the
 * denominators (store/published-counts.ts).
 */
/**
 * The digest's store-buyers section (2026-09-21, phase D1).
 *
 * The figures moved to services/store-figures.ts on 2026-09-22 so the
 * signed public monthly record reads the same derivation rather than
 * a second copy of it. This shape is unchanged: the section keeps the
 * fields the digest has always printed, and the per-item till the
 * record also carries is not added to a keeper's page that did not
 * ask for it.
 */
export async function storeBuyersDigest(env: Env): Promise<StoreBuyersDigest> {
  const figures = await storeMonthFigures(env, metricsMonth());
  return {
    window: figures.window,
    instrument: figures.instrument,
    organic_challenges: figures.organic_challenges,
    organic_payments_presented: figures.organic_payments_presented,
    organic_settled: figures.organic_settled,
    organic_declines: figures.organic_declines,
    conversion_rate: figures.conversion_rate,
    by_rail: figures.by_rail,
    host_pages: figures.host_pages,
    exclusions: figures.exclusions,
    note: figures.note,
  };
}

export async function getLatestDigest(env: Env): Promise<WeeklyDigest | null> {
  return kvGetJson<WeeklyDigest>(env.COUNTERS, KV_KEYS.latestDigest, "json");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
