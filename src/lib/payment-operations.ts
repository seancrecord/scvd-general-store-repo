import type { Context } from "hono";
import type { Env, HonoEnv } from "@/types";
import { counterLedger } from "@/lib/counter-ledger";
import { kvGet } from "@/lib/kv-retry";
import { mppPaymentHeader } from "@/lib/mpp-checkout-capability";

const protocols = ["x402", "mpp", "mixed"] as const;
const outcomes = ["success", "redirect", "client_error", "server_error", "threw"] as const;
type Protocol = typeof protocols[number];
type Outcome = typeof outcomes[number];
export interface PaymentOperations {
  month: string;
  read_at: string;
  rows: ({ protocol: Protocol; observed: boolean } & Record<Outcome, number>)[];
}
const key = (month: string, protocol: Protocol, outcome: Outcome) => `metric:${month}:payment-http:${protocol}:${outcome}`;

/** Only bounded labels leave the request; no credential, URL, payer or error text. */
export function recordPaymentOperation(c: Context<HonoEnv>, result: number | "threw"): void {
  const mpp = !!mppPaymentHeader(c.req.header("Authorization"));
  const x402 = c.req.header("PAYMENT-SIGNATURE") !== undefined || c.req.header("X-PAYMENT") !== undefined || c.req.query("payment_payload") !== undefined;
  if (!mpp && !x402) return;
  const protocol: Protocol = mpp ? x402 ? "mixed" : "mpp" : "x402";
  const outcome: Outcome = result === "threw" ? "threw" : result >= 500 ? "server_error" : result >= 400 ? "client_error" : result >= 300 ? "redirect" : "success";
  const counterKey = key(new Date().toISOString().slice(0, 7), protocol, outcome);
  try {
    const ledger = counterLedger(c.env, counterKey);
    if (ledger) c.executionCtx.waitUntil(ledger.add(counterKey, 1).catch(() => undefined));
  } catch { /* Operational decoration cannot fail a payment response. */ }
}

/** Fifteen current-month cells, never a walk over purchases or credentials. */
export async function readPaymentOperations(env: Env): Promise<PaymentOperations> {
  const read_at = new Date().toISOString();
  const month = read_at.slice(0, 7);
  const rows = await Promise.all(protocols.map(async protocol => {
    const cells = await Promise.all(outcomes.map(async outcome => {
      const raw = await kvGet(env.COUNTERS, key(month, protocol, outcome));
      if (raw !== null && !/^\d+$/.test(raw)) throw new Error("Payment operations unreadable");
      const count = raw === null ? 0 : Number(raw);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Payment operations unreadable");
      return { outcome, count, observed: raw !== null };
    }));
    return { protocol, observed: cells.some(cell => cell.observed),
      ...Object.fromEntries(cells.map(cell => [cell.outcome, cell.count])) as Record<Outcome, number> };
  }));
  return { month, read_at, rows };
}
