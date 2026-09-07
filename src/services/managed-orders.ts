import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, OrderRecord } from "@/types";

export interface ManagedOrderState { order: OrderRecord; completion: number }
export type OrderMutation =
  | { kind: "acknowledge"; at: string }
  | { kind: "complete"; at: string; deliverable: string }
  | { kind: "webhook"; completion: number; result: string };

function coordinator(env: Env, orderId: string) {
  const namespace = env.PAID_RECOVERIES;
  if (!namespace) throw new Error("Order coordinator unavailable");
  return namespace.get(namespace.idFromName(`order:${orderId}`));
}

export async function writeManagedOrder(env: Env, order: OrderRecord, mutation?: OrderMutation): Promise<ManagedOrderState> {
  const result = await coordinator(env, order.order_id).writeOrder(order, mutation);
  if (!result) throw new Error("Order publication incomplete");
  return result;
}

export async function currentOrder(env: Env, orderId: string, listed: OrderRecord | null): Promise<OrderRecord | null> {
  if (listed && !listed.managed_order) return listed;
  if (!env.PAID_RECOVERIES && !listed) return null;
  const state = await coordinator(env, orderId).readOrder();
  if (!state && listed?.managed_order) throw new Error("Coordinated order missing");
  return state?.order ?? listed;
}

export async function hydrateOrders(env: Env, orders: Map<string, OrderRecord | null>): Promise<Map<string, OrderRecord | null>> {
  return new Map(await Promise.all([...orders].map(async ([key, order]) =>
    [key, await currentOrder(env, key.slice(KV_KEYS.orderPrefix.length), order)] as const)));
}
