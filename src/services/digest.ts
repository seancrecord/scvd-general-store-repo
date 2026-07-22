import { KV_KEYS } from "@/lib/kv-keys";
import { listGuestbook } from "@/services/guestbook";
import { listOrders } from "@/services/orders";
import {
  listCommissions,
  listFailedItems,
  listWaitlist,
} from "@/services/requests";
import { DEFAULT_WEEK_NOTE } from "@/store";
import type { Env, OrderRecord, WeeklyDigest } from "@/types";

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
  const [orders, commissions, waitlist, failedItems, guestbook, note, bell] =
    await Promise.all([
      listOrders(env),
      listCommissions(env),
      listWaitlist(env),
      listFailedItems(env),
      listGuestbook(env, 1000),
      env.COUNTERS.get(KV_KEYS.weekNote),
      env.COUNTERS.get(KV_KEYS.bellCount),
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
  };

  await env.COUNTERS.put(KV_KEYS.latestDigest, JSON.stringify(digest));
  return digest;
}

export async function getLatestDigest(env: Env): Promise<WeeklyDigest | null> {
  return env.COUNTERS.get<WeeklyDigest>(KV_KEYS.latestDigest, "json");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
