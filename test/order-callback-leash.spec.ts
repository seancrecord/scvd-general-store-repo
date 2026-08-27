import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeOrder } from "@/services/orders";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, OrderRecord } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE CALLBACK LEASH (the keeper's worldwide-latency audit, Part 2,
 * 2026-08-27 — the one unbounded outbound await the sweep found on a
 * buyer's paid path).
 *
 * completeOrder fires the buyer's own callback_url once, best-effort.
 * Two callers reach it: the keeper's admin press, and — the one that
 * matters — the stocked-shelf purchase path, where the order completes
 * itself INSIDE the buyer's paid request, after settlement. The fetch
 * had no deadline, so a callback pointed at a hung endpoint (the
 * buyer's own bug, or somebody else's URL pasted on purpose) held a
 * settled purchase open until the runtime killed the subrequest —
 * money moved, goods made, and the response pinned under an origin we
 * do not control.
 *
 * The leash: one attempt on an explicit budget. An abort lands in the
 * catch that already exists, books the miss on the order ("your
 * endpoint was unreachable"), and the deliverable stays at the order
 * URL forever — exactly what a dead callback already got, now on a
 * clock. No retry, no new behavior on the money.
 */
describe("the order callback runs on a leash", () => {
  const ORDER_ID = "ord_callback_leash";

  function seedOrder(overrides: Partial<OrderRecord> = {}): Promise<void> {
    const order: OrderRecord = {
      order_id: ORDER_ID,
      item_id: "the_collab",
      item_name: "A Test Collaboration",
      status: "queued",
      created_at: new Date().toISOString(),
      sla_hours: 168,
      paid_usdc: 1,
      tip_usdc: 0,
      callback_url: "https://buyer.example/hook",
      patron_number: 1,
      cert_id: "cert_leash_test",
      ...overrides,
    };
    return testEnv.ORDERS.put(KV_KEYS.order(ORDER_ID), JSON.stringify(order));
  }

  beforeEach(() => seedOrder());
  afterEach(() => vi.unstubAllGlobals());

  it("a hung callback books the miss within the budget, never past it", async () => {
    // The hang honors the abort signal, as real fetch does — the leash
    // works by AbortSignal, so a stub that ignores it proves nothing.
    vi.stubGlobal(
      "fetch",
      ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(
              Object.assign(new Error("The operation was aborted"), {
                name: "AbortError",
              }),
            ),
          );
        })) as unknown as typeof fetch,
    );
    const outcome = await Promise.race([
      completeOrder(testEnv, ORDER_ID, "the goods", 150),
      new Promise<"still-hanging">((resolve) =>
        setTimeout(() => resolve("still-hanging"), 3000),
      ),
    ]);
    expect(outcome).not.toBe("still-hanging");
    const order = outcome as OrderRecord;
    // The purchase is whole: completed, goods attached, miss on record.
    expect(order.status).toBe("completed");
    expect(order.deliverable).toBe("the goods");
    expect(order.webhook).toMatch(/unreachable/);
  });

  it("an answered callback is recorded exactly as before — the leash changes no verdicts", async () => {
    vi.stubGlobal(
      "fetch",
      (async () =>
        new Response("got it", { status: 500 })) as unknown as typeof fetch,
    );
    const order = await completeOrder(testEnv, ORDER_ID, "the goods");
    expect(order?.webhook).toMatch(/answered HTTP 500/);
  });

  it("no callback asked for, no wire touched", async () => {
    await seedOrder({ callback_url: undefined });
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      (async () => {
        calls += 1;
        return new Response("ok");
      }) as unknown as typeof fetch,
    );
    const order = await completeOrder(testEnv, ORDER_ID, "the goods");
    expect(order?.status).toBe("completed");
    expect(calls).toBe(0);
  });
});
