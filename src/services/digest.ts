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
import { computePulse } from "@/services/pulse";
import { computeStats } from "@/services/stats";
import { readBuyerSignals } from "@/services/buyer-signals";
import { metricsMonth } from "@/lib/metrics";
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
export async function storeBuyersDigest(env: Env): Promise<StoreBuyersDigest> {
  const month = metricsMonth();
  const [pulse, stats, signals] = await Promise.all([computePulse(env), computeStats(env), readBuyerSignals(env, month)]);
  const window = pulse.months.find((entry) => entry.month === month) ?? pulse.months[0];
  const { computed_at: _at, ...rail } = stats.organic_by_rail ?? { computed_at: "" };
  return {
    window: `${month}, month to date, read at ${pulse.computed_at}`,
    instrument: "the pulse's monthly window (services/pulse.ts), the books' rail split (services/stats.ts) and the signal store's per-subject rows (services/buyer-signals.ts); every figure's population is on /pulse, /stats and /observatory under published_counts",
    organic_challenges: window?.organic_challenges ?? 0,
    organic_payments_presented: window?.organic_payments_presented ?? 0,
    organic_settled: window?.organic_settled ?? 0,
    organic_declines: window?.organic_declines ?? 0,
    conversion_rate: window?.conversion_rate ?? null,
    by_rail: stats.organic_by_rail ? (rail as Record<string, number>) : null,
    host_pages: signals.histogram,
    exclusions: ["house traffic, flagged at the till", "infrastructure and crawlers by name", "family settles reclassified after the fact"],
    note: "Counts, not visitors; floors, not censuses; the rail split is all time and the rest is this month so far. No host is named and no wallet is here.",
  };
}

export async function getLatestDigest(env: Env): Promise<WeeklyDigest | null> {
  return kvGetJson<WeeklyDigest>(env.COUNTERS, KV_KEYS.latestDigest, "json");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
