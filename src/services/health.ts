import { sendAlert } from "@/lib/alerts";
import {
  catalogLastUpdated,
  daysSinceUpdate,
  STALE_AFTER_DAYS,
} from "@/lib/freshness";
import { signMessage } from "@/lib/signing";
import { listOrders } from "@/services/orders";
import type { Env } from "@/types";

/**
 * The hourly rounds. Two of the four P1 conditions live here: the
 * Worker self-check (KV + signing round trip) and the human-queue SLA
 * guard (a queued order nobody has acknowledged in 24 hours).
 */

const SLA_GUARD_HOURS = 24;

async function selfCheck(env: Env): Promise<void> {
  try {
    const probe = `health:${Date.now()}`;
    await env.COUNTERS.put("health_probe", probe, { expirationTtl: 3600 });
    const readback = await env.COUNTERS.get("health_probe");
    if (readback !== probe) {
      throw new Error("KV readback mismatch");
    }
    await signMessage("health-probe", env.SIGNING_KEY);
  } catch (error) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `Hourly self-check failed: ${String(error)}`,
    });
  }
}

async function slaGuard(env: Env): Promise<void> {
  try {
    const orders = await listOrders(env);
    const now = Date.now();
    for (const order of orders) {
      if (order.status !== "queued" || order.acknowledged_at) {
        continue;
      }
      const ageHours = (now - Date.parse(order.created_at)) / 3600000;
      if (ageHours > SLA_GUARD_HOURS) {
        await sendAlert(env, {
          condition: "order_sla",
          detail: `Order ${order.order_id} (${order.item_id}) has sat unacknowledged for ${Math.floor(ageHours)}h. The promise is ${order.sla_hours}h. The back room: /admin.`,
          key: order.order_id,
        });
      }
    }
  } catch (error) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `SLA guard itself failed: ${String(error)}`,
    });
  }
}

/**
 * THE SHELF-READER'S ROUND (EMPLOYEES.md job file):
 *
 *   Role.        Notice when the machine-facing surfaces have gone
 *                quiet, because nothing else will.
 *   Tools.       The catalog's own dates, via lib/freshness.
 *   Boundaries.  Reports. It never edits a surface, never touches a
 *                date, never publishes anything. A cron that bumped a
 *                freshness date to look current would be forging the
 *                exact claim the date exists to make.
 *   Escalation.  Nothing in the catalog written or re-checked by hand
 *                in STALE_AFTER_DAYS.
 *
 * Why it matters here specifically: the surfaces agents read —
 * llms.txt, menu.json, the well-known document, the directory — are
 * the ones NOBODY VISITS. A storefront going stale is visible the
 * moment the keeper opens it. A discovery document going stale is
 * invisible until an agent acts on something that stopped being true.
 */
async function freshnessGuard(env: Env): Promise<void> {
  try {
    const days = daysSinceUpdate();
    if (days < STALE_AFTER_DAYS) {
      return;
    }
    await sendAlert(env, {
      condition: "catalog_stale",
      detail: `The machine-facing surfaces say as_of ${catalogLastUpdated()}, which is ${days} days ago. llms.txt, menu.json, /.well-known/x402.json, the sitemap and the directory all publish that date, so it is what an agent sees. Nothing is broken — this is the round telling you the shelves have gone quiet. AEO_GEO.md has the walk.`,
      // One key, so a stale month nags once every six hours rather
      // than every tick, and stops the day something gets a new date.
      key: `stale:${catalogLastUpdated()}`,
    });
  } catch (error) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `Freshness guard itself failed: ${String(error)}`,
    });
  }
}

/** Run on every scheduled tick. Quiet when all is well. */
export async function runHealthChecks(env: Env): Promise<void> {
  await selfCheck(env);
  await slaGuard(env);
  await freshnessGuard(env);
}
