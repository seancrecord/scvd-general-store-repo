import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, OrderRecord } from "@/types";

export interface ManagedOrderState { order: OrderRecord; completion: number }
export type OrderMutation =
  | { kind: "acknowledge"; at: string }
  | { kind: "complete"; at: string; deliverable: string; proof?: import("@/services/human-order-proof").HumanOrderProof }
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
  /*
   * NO COORDINATOR TO ASK (2026-10-02). The doors Worker has no Durable
   * Object bindings, by design (doors/wrangler.jsonc), and its unpaid
   * knock on a labor door counts the bench through here. The first
   * coordinated labor order to sit open on that bench made every count
   * throw "Order coordinator unavailable", and /api/buy/aura_walk and
   * /api/buy/the_collab answered 500 for eight hours while the MCP
   * door, which runs in the store, quoted them fine.
   *
   * The KV row IS the coordinator's publication — writeOrder puts it
   * inside the object's own gate on every state change — so a reader
   * with no binding reads what the coordinator last published rather
   * than guessing or throwing. Only a quote is minted on this reading;
   * a knock that pays is handed to the store, whose admission runs
   * against the coordinator itself. "Coordinated order missing" below
   * stays what it was: a binding that answers with nothing is a real
   * inconsistency, and this is not that.
   */
  if (!env.PAID_RECOVERIES) return listed;
  const state = await coordinator(env, orderId).readOrder();
  if (!state && listed?.managed_order) throw new Error("Coordinated order missing");
  return state?.order ?? listed;
}

export async function hydrateOrders(env: Env, orders: Map<string, OrderRecord | null>): Promise<Map<string, OrderRecord | null>> {
  return new Map(await Promise.all([...orders].map(async ([key, order]) =>
    [key, await currentOrder(env, key.slice(KV_KEYS.orderPrefix.length), order)] as const)));
}
