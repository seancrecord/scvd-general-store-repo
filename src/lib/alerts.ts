import { invertedTimestamp } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * P1 alerting. Exactly four conditions page the keeper; everything
 * else belongs in the Sunday digest. Email rides Resend's plain HTTPS
 * API (simplest reliable send from a Worker: one fetch, one secret,
 * no bindings to configure), when RESEND_API_KEY/ALERT_EMAIL are
 * unset, alerts still log to console and to KV, so a mute store never
 * becomes a silent one. Per-key dedupe keeps a repeating failure from
 * paging more than once every six hours.
 */

export type AlertCondition =
  | "settlement_failure"
  | "signing_failure"
  | "worker_health"
  | "order_sla";

const DEDUPE_TTL_SECONDS = 6 * 60 * 60;
const ALERT_LOG_TTL_SECONDS = 30 * 86400;

export interface AlertInput {
  condition: AlertCondition;
  detail: string;
  /** Extra dedupe discriminator (e.g. an order id). */
  key?: string;
}

export async function sendAlert(env: Env, input: AlertInput): Promise<void> {
  const dedupeKey = `alert_sent:${input.condition}:${input.key ?? "-"}`;
  try {
    if (await env.COUNTERS.get(dedupeKey)) {
      return;
    }
    await env.COUNTERS.put(dedupeKey, "1", {
      expirationTtl: DEDUPE_TTL_SECONDS,
    });
    const record = {
      condition: input.condition,
      detail: input.detail.slice(0, 1000),
      at: new Date().toISOString(),
    };
    console.error(`[P1 ${input.condition}] ${record.detail}`);
    await env.COUNTERS.put(
      `alert_log:${invertedTimestamp(Date.now())}`,
      JSON.stringify(record),
      { expirationTtl: ALERT_LOG_TTL_SECONDS },
    );
    await emailKeeper(env, record.condition, record.detail, record.at);
  } catch (error) {
    // The alarm must never take down the till it watches.
    console.error("Alert plumbing failed:", error);
  }
}

async function emailKeeper(
  env: Env,
  condition: string,
  detail: string,
  at: string,
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) {
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "The Store <alerts@scvd.store>",
      to: [env.ALERT_EMAIL],
      subject: `[P1] ${condition} at the store`,
      text: `${at}\n\n${detail}\n\nFour conditions page; this was one of them. The back room: https://scvd.store/admin`,
    }),
  });
}

/** Recent alerts, for the back room. */
export async function listAlerts(
  env: Env,
  limit = 20,
): Promise<Array<{ condition: string; detail: string; at: string }>> {
  const listed = await env.COUNTERS.list({ prefix: "alert_log:", limit });
  const alerts: Array<{ condition: string; detail: string; at: string }> = [];
  for (const key of listed.keys) {
    const record = await env.COUNTERS.get<{
      condition: string;
      detail: string;
      at: string;
    }>(key.name, "json");
    if (record) {
      alerts.push(record);
    }
  }
  return alerts;
}
