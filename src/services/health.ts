import { sendAlert } from "@/lib/alerts";
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

/** Run on every scheduled tick. Quiet when all is well. */
export async function runHealthChecks(env: Env): Promise<void> {
  await selfCheck(env);
  await slaGuard(env);
}
