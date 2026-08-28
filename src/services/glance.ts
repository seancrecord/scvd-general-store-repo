import { listAlerts } from "@/lib/alerts";
import { kvGet, kvPut } from "@/lib/kv-retry";
import type { Env } from "@/types";

/**
 * THE FIVE NUMBERS, COMPUTED ONCE AND READ ONCE.
 *
 * The keeper's ask (2026-08-28): a desk that is fast, scannable, and
 * works on a phone. What makes /admin slow is not decoration — it is
 * seventeen parallel loads on every open, three of them heavy walks:
 * computeStats over every month the store has been open,
 * reconcileSettles, and the rail refresh whose own comment admits it
 * is riding along on the certificate walk because the desk is paying
 * for one anyway. Opening the office costs all of that before a
 * single figure appears.
 *
 * So the numbers he opens the desk FOR are computed on the hourly
 * cron and stored as one blob. The desk reads one key and paints.
 * Everything else stays exactly where it is, a tap away.
 *
 * THE FIVE ARE HIS, chosen 2026-08-28: orders waiting on a human,
 * things needing his review, open alerts, this month's organic
 * settlements, and the month's take. They are named in the interface
 * and in admin-glance.spec.ts so a later edit cannot quietly drop one.
 *
 * WHY A CACHE IS ALLOWED TO BE HONEST HERE. This store's whole
 * argument is that a dated observation beats a fresh-looking score,
 * and the same rule applies to its own back room: the blob carries
 * `computed_at`, the desk shows it, and a MISSING blob renders as
 * "not computed yet" rather than as zeros. A zero is a claim — "I
 * looked, there were none" — and an unwritten blob has not looked.
 * Rendering the second as the first is how a keeper concludes the
 * queue is empty on the morning the cron stopped running.
 */

export const GLANCE_KEY = "glance:latest";

export interface Glance {
  /** When these numbers were read. Shown on the desk, never hidden. */
  computed_at: string;
  /** Orders a human still owes work on — the only figure with a promise attached. */
  pending_orders: number;
  /** Tips, confessions and refund requests waiting on the keeper's eye. */
  pending_reviews: number;
  /** Alert rows currently standing. */
  open_alerts: number;
  /** Settles this month from wallets the house does not control. */
  organic_settlements: number;
  /** The month's take, organic, in USDC. */
  take_usdc: number;
  /**
   * True when a source walk hit its own cap. The desk says so rather
   * than presenting a partial count as a complete one — the same rule
   * the corpus and the take already live under.
   */
  truncated: boolean;
}

/**
 * ONE READ. If this ever fans out again the desk is back to
 * recomputing the world, which is the thing the glance exists to
 * stop, and admin-glance.spec.ts counts the reads to make sure.
 *
 * Through kvGet, not a bare `.get` — the house guards caught the
 * bare version, and fittingly so: that retry policy exists because of
 * the same transient KV 429s that fill the keeper's alarm list. A
 * blob read that throws on a blip would make the desk claim nothing
 * had been computed on the one morning something had.
 */
export async function readGlance(env: Env): Promise<Glance | null> {
  const raw = await kvGet(env.COUNTERS, GLANCE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Glance;
  } catch {
    /*
     * A blob that will not parse is treated as absent rather than as
     * an error page: the desk still has every deep shelf below, and
     * the next cron rewrites it. Absent is the honest reading of
     * "I cannot tell you", which is exactly the state.
     */
    return null;
  }
}

/**
 * Computes the five and stores them. Runs on the hourly cron, where
 * the walks it needs are being paid for anyway.
 */
export async function writeGlance(env: Env): Promise<Glance> {
  const [orders, tips, confessions, refunds, alerts, take] = await Promise.all([
    import("@/services/orders").then(({ listOrders }) => listOrders(env)),
    import("@/services/tips").then(({ listTips }) => listTips(env)),
    import("@/services/confessions").then(({ listConfessions }) =>
      listConfessions(env),
    ),
    import("@/services/refunds").then(({ listRefunds }) => listRefunds(env)),
    listAlerts(env, 50),
    import("@/services/books-summary").then(({ takeSummary }) =>
      takeSummary(env),
    ),
  ]);

  const glance: Glance = {
    computed_at: new Date().toISOString(),
    pending_orders: orders.filter((order) => order.status === "queued").length,
    pending_reviews:
      tips.filter((tip) => tip.record.status === "pending_review").length +
      confessions.filter((entry) => entry.record.status === "pending_review")
        .length +
      refunds.filter((refund) => refund.status === "refund_pending").length,
    open_alerts: alerts.length,
    organic_settlements: take.total.organic_sales,
    take_usdc: take.total.organic_usdc,
    truncated: take.truncated,
  };
  await kvPut(env.COUNTERS, GLANCE_KEY, JSON.stringify(glance));
  return glance;
}
