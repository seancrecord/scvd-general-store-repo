import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "@/index";
import { HANDED_HEADER, doors } from "@/lib/doors-app";
import { KV_KEYS } from "@/lib/kv-keys";
import { markKeeperSeen } from "@/services/shutter";
import { writeManagedOrder } from "@/services/managed-orders";
import { LABOR_ITEM_IDS } from "@/services/queue-capacity";
import type { Env, OrderRecord } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * THE DOORS WORKER COUNTS THE BENCH WITHOUT THE COORDINATOR (2026-10-02).
 *
 * The outage: GET /api/buy/aura_walk and /api/buy/the_collab answered
 * 500 for eight hours while every other door and the MCP door quoted
 * their 402. Both are labor, so their unpaid knock runs the bench
 * (services/queue-capacity), which reads every open labor order
 * through services/managed-orders. An order written since the order
 * coordinator landed carries `managed_order: true`, and reading one of
 * those asked the PAID_RECOVERIES Durable Object — a binding the doors
 * Worker does not have and, by its own config test, must not host. The
 * first open labor order of that shape (ord_nfx2bbzdz4, bought 20:22
 * UTC the day before) made every count throw "Order coordinator
 * unavailable", and the global onError served it as a 500.
 *
 * test/doors-parity.spec.ts never saw it: its doors env is the store's
 * env with STORE added, Durable Object bindings included. This spec
 * takes the binding AWAY, which is the shape doors/wrangler.jsonc
 * actually deploys, and puts a coordinated labor order on the bench.
 */

const testEnv = env as unknown as Env;
const PARITY_KEY = "parity-challenge-key-0123456789abcdef";
const storeEnv: Env = { ...testEnv, MPP_CHALLENGE_KEY: PARITY_KEY };
const BASE = "https://scvd.store";

function ctx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil: (p: Promise<unknown>) => { pending.push(p); },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext,
    settle: () => Promise.allSettled(pending),
  };
}

/** The store, as the doors' service binding; every hand-over is counted. */
function storeBinding(): { binding: Fetcher; calls: Request[] } {
  const calls: Request[] = [];
  const binding = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push(request.clone());
      const { ctx: executionCtx, settle } = ctx();
      const answer = await app.fetch(request, storeEnv, executionCtx);
      await settle();
      return answer;
    },
  } as unknown as Fetcher;
  return { binding, calls };
}

async function knock(worker: { fetch: (r: Request, e: Env, c: ExecutionContext) => Response | Promise<Response> }, environment: Env, path: string) {
  const { ctx: executionCtx, settle } = ctx();
  const response = await worker.fetch(new Request(`${BASE}${path}`, { headers: { Accept: "application/json" } }), environment, executionCtx);
  const body = await response.text();
  await settle();
  return { status: response.status, body, handed: response.headers.get(HANDED_HEADER) };
}

async function clearOrders(): Promise<void> {
  const listed = await testEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix });
  for (const key of listed.keys) await testEnv.ORDERS.delete(key.name);
  await testEnv.ORDERS.delete(KV_KEYS.openLaborIndex);
}

/** The coordinator's own KV publication of an open labor order. */
async function seedCoordinatedLaborOrder(orderId: string, itemId: string): Promise<void> {
  const order: OrderRecord = {
    managed_order: true,
    order_id: orderId,
    item_id: itemId,
    item_name: itemId,
    status: "queued",
    created_at: new Date().toISOString(),
    sla_hours: 168,
    paid_usdc: 150,
    tip_usdc: 0,
    patron_number: 495,
    cert_id: "cert_doors_bench",
  };
  // Through the coordinator, as a real sale writes it: the object holds
  // the state and publishes the KV row the doors will read.
  await writeManagedOrder(testEnv, order);
  const index = (await testEnv.ORDERS.get(KV_KEYS.openLaborIndex, "json")) as { ids: string[] } | null;
  await testEnv.ORDERS.put(
    KV_KEYS.openLaborIndex,
    JSON.stringify({ ids: [...(index?.ids ?? []), orderId], built_at: new Date().toISOString() }),
  );
}

let doorsEnv: Env;
let handedCalls: Request[];

beforeAll(async () => {
  installFacilitatorMock();
  await markKeeperSeen(testEnv);
  const bound = storeBinding();
  handedCalls = bound.calls;
  // What doors/wrangler.jsonc provides, and nothing it does not: no
  // Durable Object namespaces of any kind.
  doorsEnv = { ...storeEnv, STORE: bound.binding, PAID_RECOVERIES: undefined };
});

beforeEach(async () => {
  await clearOrders();
  await seedCoordinatedLaborOrder("ord_doorsbench1", "aura_walk");
});

describe("a coordinated order on the bench, read by a Worker with no coordinator", () => {
  it("the spec's own premise holds: both doors are labor, and the seeded order is counted as it", () => {
    expect(LABOR_ITEM_IDS.has("aura_walk")).toBe(true);
    expect(LABOR_ITEM_IDS.has("the_collab")).toBe(true);
  });

  for (const door of ["aura_walk", "the_collab"]) {
    it(`GET /api/buy/${door} unpaid is quoted by the doors themselves, not a 500`, async () => {
      const before = handedCalls.length;
      const fromDoors = await knock(doors, doorsEnv, `/api/buy/${door}`);
      expect(fromDoors.status, fromDoors.body.slice(0, 200)).toBe(402);
      // Answered here: the cold store isolate is the cost the split removes.
      expect(fromDoors.handed).toBeNull();
      expect(handedCalls.length).toBe(before);
      // And the store, which holds the coordinator, says the same thing.
      const fromStore = await knock(app, storeEnv, `/api/buy/${door}`);
      expect(fromStore.status).toBe(402);
    });
  }

  it("the bench still counts the coordinated order: the doors refuse when it fills the shelf", async () => {
    // the_collab holds two a week; two open coordinated orders fill it.
    await seedCoordinatedLaborOrder("ord_doorsbench2", "the_collab");
    await seedCoordinatedLaborOrder("ord_doorsbench3", "the_collab");
    const fromDoors = await knock(doors, doorsEnv, "/api/buy/the_collab");
    expect(fromDoors.status, fromDoors.body.slice(0, 200)).toBe(503);
    expect(JSON.parse(fromDoors.body).code).toBe("capacity_unavailable");
    expect(JSON.parse(fromDoors.body).open_orders).toBe(2);
  });
});
